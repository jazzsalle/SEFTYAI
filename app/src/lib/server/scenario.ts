import "server-only";
import type { Account } from "../config";
import { SCN_MAX_HOURS, SCN_OFF, SCN_REGIONS, scenarioLive, type ScenarioState, type ScnRegion } from "../scenario";
import { audit } from "./db";
import { kvGet, kvPut } from "./kvStore";

/**
 * 시연 시나리오 특보 켜짐 상태 (R43) — kv 전역 범위 system · demo_scenario. 화면용 /api/kv 로는 읽고 쓸 수 없다(scopeAccess 가 막음).
 * 운영관리(/api/admin/scenario)만 바꾸고, /api/weather·시연 세트 예열이 읽는다. 정의(종류·단계·구역·특보 번호)는 lib/scenario 에 고정.
 * 읽기는 10초 캐시(바꾸면 이 서버의 캐시는 바로 비운다 — 다른 서버 인스턴스는 10초 안). 읽지 못하면 꺼짐으로 본다(넣지 않는 쪽)
 */
const SCOPE = "system";
const KEY = "demo_scenario";
const CACHE_MS = 10_000;
let cache: { at: number; v: ScenarioState } | null = null;

function clean(v: unknown): ScenarioState {
  if (!v || typeof v !== "object") return SCN_OFF;
  const o = v as Partial<ScenarioState>;
  return {
    on: o.on === true,
    regions: Array.isArray(o.regions) ? SCN_REGIONS.filter((r) => o.regions!.includes(r)) : [],
    startedAt: typeof o.startedAt === "string" ? o.startedAt : null,
    until: typeof o.until === "string" ? o.until : null,
    by: typeof o.by === "string" ? o.by : null,
  };
}

/** 저장된 값 그대로(캐시 없이) — 운영관리 화면용. DB 를 읽지 못하면 오류 */
export async function scenarioRead(): Promise<ScenarioState> {
  const v = clean((await kvGet(SCOPE))[KEY]?.value);
  cache = { at: Date.now(), v };
  return v;
}

/** 특보에 붙일 때 읽는 값 — 10초 캐시, 읽지 못하면 꺼짐 */
export async function scenarioGet(): Promise<ScenarioState> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.v;
  return scenarioRead().catch(() => SCN_OFF);
}

export class ScenarioInputError extends Error {}

/** 켜기(끝나는 시각·지역) · 끄기 — 이미 켜져 있으면 켠 시각은 그대로 두고 끝나는 시각·지역만 바꾼다 */
export async function scenarioSet(by: Account, input: { on: boolean; until?: string; regions?: ScnRegion[] }, now = Date.now()): Promise<ScenarioState> {
  const prev = await scenarioRead();
  let next: ScenarioState;
  if (!input.on) next = { ...SCN_OFF, by: by.name };
  else {
    const u = Date.parse(input.until ?? "");
    if (!Number.isFinite(u) || u <= now + 60_000) throw new ScenarioInputError("끝나는 시각은 지금부터 1분 뒤 이후로 정하세요.");
    if (u > now + SCN_MAX_HOURS * 3_600_000) throw new ScenarioInputError(`끝나는 시각은 지금부터 ${SCN_MAX_HOURS}시간 안으로 정하세요.`);
    const regions = SCN_REGIONS.filter((r) => (input.regions ?? SCN_REGIONS).includes(r));
    if (!regions.length) throw new ScenarioInputError("켤 지역을 하나 이상 고르세요.");
    next = { on: true, regions, startedAt: scenarioLive(prev, now) ? prev.startedAt : new Date(now).toISOString(), until: new Date(u).toISOString(), by: by.name };
  }
  await kvPut(SCOPE, KEY, next, by);
  cache = { at: Date.now(), v: next };
  await audit(null, by.id, next.on ? "시연 시나리오 특보 켬" : "시연 시나리오 특보 끔", { regions: next.regions, until: next.until }).catch(() => {});
  return next;
}
