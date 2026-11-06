import "server-only";
import { createHash } from "node:crypto";
import type { Account } from "../config";
import { t3q, type T3qResult } from "../t3q/client";
import { audit, db, ensureSchema } from "./db";
import { kvGet, kvPut } from "./kvStore";

/**
 * 시연 모드 (R52) — 개발서버 IDemoMode·DemoModeCache·DemoModeController(kjw)를 복제.
 * - 평소에는 응답을 들고 있지 않는다 — T3Q 가 RAG 검증하며 응답을 바꾸면 곧바로 보여야 한다(사용자 지시 2026-11-06 「RAG 검증을 위해 저장 답을 주면 안되는데」).
 * - 켜 둔 동안만 Data API 응답(SUCCESS·NO_RESULT, HTTP 2xx)을 들고 있는다. 켤 때와 끌 때 모두 비운다 — 다시 켜면 처음 한 번은 새로 받는다.
 * - 켠 뒤 48시간(DemoHours)이 지나면 저절로 꺼진다. 상태는 서비스 하나에 하나이고 모든 사용자가 함께 본다.
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
}
export const DEMO_OFF: DemoModeState = { on: false, since: null, until: null, by: null };

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

/** 켜기 · 끄기 — 어느 쪽이든 들고 있던 응답을 모두 비운다 */
export async function demoSet(by: Account, on: boolean, now = Date.now()): Promise<DemoModeState> {
  const next: DemoModeState = on
    ? { on: true, since: new Date(now).toISOString(), until: new Date(now + DEMO_HOURS * 3_600_000).toISOString(), by: by.name }
    : { ...DEMO_OFF, by: by.name };
  await kvPut(SCOPE, KEY, next, by);
  cache = { at: Date.now(), v: next };
  await ensureTable();
  await db().query("delete from sa_demo_cache");
  await audit(null, by.id, on ? "시연 모드 켬" : "시연 모드 끔", { until: next.until }).catch(() => {});
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
 * T3Q Data API 호출 — 시연 모드가 켜져 있으면 들고 있던 응답을 쓰고, 없으면 받아서 들고 있는다(성공·결과 없음만).
 * 꺼져 있으면 늘 T3Q 에 묻는다(개발서버 T3qRelayService). 응답 봉투는 그대로(R0)
 */
export async function t3qData<T = unknown>(method: "GET" | "POST", path: string, body?: unknown, opt: { timeoutMs?: number } = {}): Promise<T3qResult<T> & { demoHit?: boolean }> {
  const st = await demoGet();
  if (!demoLive(st)) return t3q<T>(method, path, body, opt);
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
