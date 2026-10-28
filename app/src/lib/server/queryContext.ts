import "server-only";
import type { Account } from "../config";
import { RegionId } from "../contract/agent";
import { baseToT3q, parseBaseWire } from "../baseRegion";
import { toT3qRegion, type T3qRegion } from "../t3q/region";

/**
 * 화면 조건 → T3Q query_context (계약 common.py:54-60)
 * 값은 사용자가 고르거나 입력한 것만 넣는다. 빈 값은 보내지 않는다(R6 — 꾸민 조건 없음).
 */
export interface ClientCondition {
  /**
   * 기준지역(R32) — 가장 아래 단계 하나 {code, name, level}(lib/baseRegion BaseWire). null = 전국.
   * 이 칸이 있으면 region·sub 는 보지 않는다. 틀린 값은 쓰지 않는다(라우트는 400 으로 거절)
   */
  base?: unknown;
  /** (예전 호출) 시범 지역 id + 고른 시·군·구 — base 칸이 없을 때만 */
  region?: RegionId;
  sub?: { code?: string; name?: string } | null;
  disasterTypes?: string[];
  referenceTime?: string | null;
  period?: { from?: string | null; to?: string | null } | null;
  warningKind?: string | null;
  warningLevel?: string | null;
  keywords?: string[];
  conditions?: { item: string; label?: string; value: number; unit?: string }[];
}

/**
 * 기준지역 → T3Q region. 지자체·중앙 구분 없이 고른 지역 그대로(지자체를 관할로 묶던 규칙은 없앰 — R32).
 * base 칸이 있으면 그것(null = 전국), 없거나 틀리면 예전 region·sub, 그것도 없으면 계정 기본(지자체 = 관할 시범 지역, 그 밖 = 전국)
 */
export function regionOfCondition(acc: Account, c?: ClientCondition | null): T3qRegion | null {
  if (c && c.base !== undefined) {
    if (c.base === null) return null;
    const w = parseBaseWire(c.base);
    if (w) return baseToT3q(w);
  }
  const picked = RegionId.safeParse(c?.region);
  return toT3qRegion(picked.success ? picked.data : acc.region, c?.sub) ?? null;
}

/**
 * R33 — 임시 규칙(사용자 결정 2026-10-28). 지울 때: R33_SEOUL·R33_OUR_REGION·r33Seoul 과 buildQueryContext 의 「R33」 줄,
 * harness/region/region.test.ts 의 「R33」 묶음, 00_decisions.md R33 을 함께 지운다.
 * 기본 기준지역이 전국인 계정(지자체가 아닌 계정)이 기준지역을 전국으로 둔 채 「우리 지역…」으로 시작하는 질문을 보내면
 * query_context.region 을 서울특별시로 보낸다. 질문 글은 바꾸지 않는다(모든 경로 — 입력창·질문 모음·브리핑·AI 모드).
 */
export const R33_SEOUL: T3qRegion = { admin_code: "1100000000", level: "SIDO", name: "서울특별시" };
export const R33_OUR_REGION = /^\s*우리\s*지역/;
export const r33Seoul = (acc: Account, question?: string | null) => acc.role !== "지자체" && !!question && R33_OUR_REGION.test(question);

/**
 * defaultTypes = 정의된 질문(라이브러리)의 재난유형 — 사용자가 재난유형을 고르지 않았을 때만 쓴다.
 * question = 사용자가 보낸 질문 글(R33 임시 규칙 판단에만 쓴다, 고치지 않는다)
 */
export function buildQueryContext(acc: Account, c?: ClientCondition | null, defaultTypes?: string[], question?: string | null) {
  let t3qRegion = regionOfCondition(acc, c);
  if (!t3qRegion && r33Seoul(acc, question)) t3qRegion = { ...R33_SEOUL }; // R33 임시
  const qc: Record<string, unknown> = {};
  if (c?.referenceTime) qc.reference_time = c.referenceTime;
  if (t3qRegion) qc.region = t3qRegion;
  const picked = (c?.disasterTypes ?? []).filter((t) => t && t !== "전체");
  const dt = picked.length ? picked : defaultTypes ?? [];
  if (dt.length) qc.disaster_types = dt;
  if (c?.period?.from || c?.period?.to) qc.period = { from: c.period.from ?? null, to: c.period.to ?? null };
  const detail: Record<string, unknown> = {};
  if (c?.warningKind) detail.warning_kind = c.warningKind;
  if (c?.warningLevel) detail.warning_level = c.warningLevel;
  if (c?.keywords?.length) detail.keywords = c.keywords;
  if (c?.conditions?.length) detail.conditions = c.conditions.map((x) => ({ ...x, source_type: "MANUAL" }));
  if (Object.keys(detail).length) qc.detail = detail;
  return qc;
}
