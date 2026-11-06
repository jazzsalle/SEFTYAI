import "server-only";
import { createHash } from "node:crypto";
import { DEMO_DEFAULT_ACCOUNTS } from "../adminTypes";
import { ACCOUNTS, type Account } from "../config";
import { t3q, type T3qResult } from "../t3q/client";
import { audit, db, ensureSchema } from "./db";
import { kvGet, kvPut } from "./kvStore";

/**
 * 시연 모드 (R52) — 개발서버 IDemoMode·DemoModeCache·DemoModeController(kjw)를 복제.
 * - 평소에는 응답을 들고 있지 않는다 — T3Q 가 RAG 검증하며 응답을 바꾸면 곧바로 보여야 한다(사용자 지시 2026-11-06 「RAG 검증을 위해 저장 답을 주면 안되는데」).
 * - 켜 둔 동안만 Data API 응답(SUCCESS·NO_RESULT, HTTP 2xx)을 들고 있는다. 켤 때와 끌 때 모두 비운다 — 다시 켜면 처음 한 번은 새로 받는다.
 * - 켠 뒤 48시간(DemoHours)이 지나면 저절로 꺼진다. 상태는 서비스 하나에 하나다.
 * - 대상 계정(R52-1, 사용자 결정 2026-11-06): 켜져 있어도 저장 답(조회 응답·첫 턴 답·브리핑 받아 둔 답)은 운영자가 켤 때 고른 계정만 쓴다(demoFor).
 *   기본은 busan2 하나(DEMO_DEFAULT_ACCOUNTS). 고르지 않은 계정은 켜져 있어도 일상 서비스 — 늘 새로 받고, 조회 응답 저장소를 읽지도 쓰지도 않는다.
 *   켜 둔 채 목록을 바꿀 수 있고(demoSetAccounts — 저장소는 그대로), 끌 때 비운다. 개발서버는 전체 하나·누구나 켬(ours-better).
 * 저장: 상태 = kv 전역 범위 system · demo_mode(화면 /api/kv 로는 못 읽음), 응답 = sa_demo_cache(첫 사용 때 만든다).
 * Vercel 은 서버가 여럿이라 개발서버처럼 메모리에 들 수 없어 DB 에 둔다 — 켠 시각보다 먼저 받은 줄은 읽지 않으므로 지우다 끊겨도 섞이지 않는다.
 */
export const DEMO_HOURS = 48;
export const DEMO_MAX_ENTRIES = 2000;
const SCOPE = "system";
const KEY = "demo_mode";
const CACHE_MS = 10_000;

export interface DemoModeState {
  on: boolean;
  /** 켠 시각(ISO) — 이보다 먼저 받은 응답·답은 쓰지 않는다 */
  since: string | null;
  /** 저절로 꺼질 시각(ISO) */
  until: string | null;
  by: string | null;
  /** 저장 답을 쓰는 계정(R52-1) — 켤 때 고르고, 끌 때 비운다 */
  accounts: string[];
}
export const DEMO_OFF: DemoModeState = { on: false, since: null, until: null, by: null, accounts: [] };

const IDS = new Set(ACCOUNTS.map((a) => a.id));
/** 있는 계정 아이디만, 겹침 없이 ACCOUNTS 순서로 */
export const demoAccountsOf = (v: unknown): string[] => {
  const want = new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && IDS.has(x)) : []);
  return ACCOUNTS.map((a) => a.id).filter((id) => want.has(id));
};

/** 켜져 있고 끝나는 시각 전인가 */
export const demoLive = (s: DemoModeState | null | undefined, now = Date.now()) =>
  !!s?.on && !!s.until && Date.parse(s.until) > now && !!s.since && Date.parse(s.since) <= now;

function clean(v: unknown): DemoModeState {
  if (!v || typeof v !== "object") return DEMO_OFF;
  const o = v as Partial<DemoModeState>;
  return {
    on: o.on === true,
    since: typeof o.since === "string" ? o.since : null,
    until: typeof o.until === "string" ? o.until : null,
    by: typeof o.by === "string" ? o.by : null,
    accounts: demoAccountsOf(o.accounts),
  };
}

let cache: { at: number; v: DemoModeState } | null = null;

/** 저장된 값 그대로(캐시 없이) — 운영관리 화면용. DB 를 읽지 못하면 오류 */
export async function demoRead(): Promise<DemoModeState> {
  const v = clean((await kvGet(SCOPE))[KEY]?.value);
  cache = { at: Date.now(), v };
  return v;
}

/** 쓸 때 읽는 값 — 10초 캐시, 읽지 못하면 꺼짐(들고 있지 않는 쪽). 끝나는 시각이 지났으면 꺼짐 */
export async function demoGet(now = Date.now()): Promise<DemoModeState> {
  const v = cache && now - cache.at < CACHE_MS ? cache.v : await demoRead().catch(() => DEMO_OFF);
  return demoLive(v, now) ? v : DEMO_OFF;
}

/**
 * 이 계정이 저장 답을 쓰는가(R52-1) — 켜짐 · 끝나는 시각 전 · 대상 계정일 때만 그때의 상태, 아니면 null.
 * 저장 답을 쓰는 곳(t3qData · jobs 첫 턴 재사용·브리핑 받아 둔 답 · 브리핑 예열)은 모두 이것으로 판단한다
 */
export async function demoFor(accountId: string | null | undefined, now = Date.now()): Promise<DemoModeState | null> {
  if (!accountId) return null;
  const st = await demoGet(now);
  return demoLive(st, now) && st.accounts.includes(accountId) ? st : null;
}

/** 시험용 — 이 서버의 10초 캐시를 비운다 */
export const demoForget = () => {
  cache = null;
};

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await ensureSchema();
  await db().query(`create table if not exists sa_demo_cache (key text primary key, http int not null, body jsonb, created_at timestamptz not null default now())`);
  tableReady = true;
}

/** 켜기 · 끄기 — 어느 쪽이든 들고 있던 응답을 모두 비운다. 켤 때 대상 계정(없으면 기본 busan2), 끌 때 대상은 비운다 */
export async function demoSet(by: Account, on: boolean, now = Date.now(), accounts: readonly string[] = DEMO_DEFAULT_ACCOUNTS): Promise<DemoModeState> {
  const list = demoAccountsOf(accounts);
  if (on && !list.length) throw new Error("시연 대상 계정을 하나 이상 고르세요.");
  const next: DemoModeState = on
    ? { on: true, since: new Date(now).toISOString(), until: new Date(now + DEMO_HOURS * 3_600_000).toISOString(), by: by.name, accounts: list }
    : { ...DEMO_OFF, by: by.name };
  await kvPut(SCOPE, KEY, next, by);
  cache = { at: Date.now(), v: next };
  await ensureTable();
  await db().query("delete from sa_demo_cache");
  await audit(null, by.id, on ? "시연 모드 켬" : "시연 모드 끔", { until: next.until, accounts: next.accounts }).catch(() => {});
  return next;
}

/** 켜 둔 채 대상 계정만 바꾼다 — 켠 시각·끝나는 시각·들고 있던 응답은 그대로(대상끼리 함께 쓰는 것이므로). 꺼져 있으면 null */
export async function demoSetAccounts(by: Account, accounts: readonly string[], now = Date.now()): Promise<DemoModeState | null> {
  const list = demoAccountsOf(accounts);
  if (!list.length) throw new Error("시연 대상 계정을 하나 이상 고르세요.");
  const cur = await demoRead();
  if (!demoLive(cur, now)) return null;
  const next: DemoModeState = { ...cur, accounts: list };
  await kvPut(SCOPE, KEY, next, by);
  cache = { at: Date.now(), v: next };
  await audit(null, by.id, "시연 모드 대상 계정 바꿈", { from: cur.accounts, to: list }).catch(() => {});
  return next;
}

/** 지금 들고 있는 응답 수(켜져 있을 때) */
export async function demoEntries(st: DemoModeState): Promise<number> {
  if (!demoLive(st)) return 0;
  await ensureTable();
  const [r] = (await db().query("select count(*)::int as n from sa_demo_cache where created_at >= $1", [st.since])) as { n: number }[];
  return r?.n ?? 0;
}

const canon = (v: unknown): string =>
  JSON.stringify(v ?? null, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));

/** 개발서버 BuildCacheKey — 방법·경로(쿼리 포함)·본문(request_id·caller 제외) */
export function demoKey(method: string, path: string, body?: unknown): string {
  const b = body && typeof body === "object" && !Array.isArray(body) ? Object.fromEntries(Object.entries(body).filter(([k]) => k !== "request_id" && k !== "caller")) : body;
  return createHash("sha256").update(`${method} ${path}|${body === undefined ? "" : canon(b)}`).digest("hex");
}

/**
 * T3Q Data API 호출 — 이 계정이 시연 대상(demoFor)이면 들고 있던 응답을 쓰고, 없으면 받아서 들고 있는다(성공·결과 없음만).
 * 대상 계정끼리만 함께 쓴다. 꺼져 있거나 대상이 아닌 계정은 늘 T3Q 에 묻고 저장소를 읽지도 쓰지도 않는다(개발서버 T3qRelayService). 응답 봉투는 그대로(R0)
 */
export async function t3qData<T = unknown>(accountId: string | null | undefined, method: "GET" | "POST", path: string, body?: unknown, opt: { timeoutMs?: number } = {}): Promise<T3qResult<T> & { demoHit?: boolean }> {
  const st = await demoFor(accountId);
  if (!st) return t3q<T>(method, path, body, opt);
  const key = demoKey(method, path, body);
  try {
    await ensureTable();
    const [hit] = (await db().query("select http, body from sa_demo_cache where key = $1 and created_at >= $2", [key, st.since])) as { http: number; body: T }[];
    if (hit) return { http: hit.http, ms: 0, requestId: "", envelope: true, body: hit.body, demoHit: true };
  } catch (e) {
    console.error("[demoMode] read", e);
  }
  const r = await t3q<T>(method, path, body, opt);
  const status = (r.body as { status?: string } | null)?.status;
  if (r.envelope && r.http >= 200 && r.http < 300 && (status === "SUCCESS" || status === "NO_RESULT")) {
    try {
      const [n] = (await db().query("select count(*)::int as n from sa_demo_cache")) as { n: number }[];
      if ((n?.n ?? 0) < DEMO_MAX_ENTRIES)
        await db().query(
          `insert into sa_demo_cache (key, http, body, created_at) values ($1, $2, $3::jsonb, now())
           on conflict (key) do update set http = excluded.http, body = excluded.body, created_at = now()`,
          [key, r.http, JSON.stringify(r.body)],
        );
    } catch (e) {
      console.error("[demoMode] write", e);
    }
  }
  return r;
}
