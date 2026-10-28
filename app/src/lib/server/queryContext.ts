import "server-only";
import type { Account } from "../config";
import type { RegionId } from "../contract/agent";
import { toT3qRegion } from "../t3q/region";

/**
 * 화면 조건 → T3Q query_context (계약 common.py:54-60)
 * 값은 사용자가 고르거나 입력한 것만 넣는다. 빈 값은 보내지 않는다(R6 — 꾸민 조건 없음).
 */
export interface ClientCondition {
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

/** defaultTypes = 정의된 질문(라이브러리)의 재난유형 — 사용자가 재난유형을 고르지 않았을 때만 쓴다 */
export function buildQueryContext(acc: Account, c?: ClientCondition | null, defaultTypes?: string[]) {
  // 지자체는 자기 지역만 (UFR-001 기준지역 기본값·권한)
  const region = acc.role === "지자체" ? acc.region : c?.region ?? acc.region;
  const t3qRegion = toT3qRegion(region, region === (c?.region ?? acc.region) ? c?.sub : null);
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
