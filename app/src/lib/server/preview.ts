import "server-only";
import { libById, type PreviewApi } from "../library";
import { t3q } from "../t3q/client";

/**
 * 자동 조회 데이터 (R3) — 정의된 질문만, 매핑된 T3Q Data API 를 동시에 부르고 원응답을 그대로 담는다.
 * 여기서 결과를 고르거나 고치지 않는다. 화면은 원응답 항목을 그대로 표로 보여 준다.
 */
export interface PreviewItem {
  api: PreviewApi;
  apiId: string;
  label: string;
  method: "POST";
  path: string;
  request: unknown;
  http: number;
  ms: number;
  response: unknown;
}

const SPEC: Record<PreviewApi, { apiId: string; label: string; path: string; body: (qc: Record<string, unknown>) => unknown }> = {
  RISK_AREA: { apiId: "T3Q-05", label: "위험·취약지역 목록", path: "/risk-knowledge/search", body: (qc) => ({ data_group: "RISK_AREA", region: qc.region ?? null, page: { page: 1, size: 50 } }) },
  RISK_FACILITY: { apiId: "T3Q-05", label: "잠재 위험요소·취약시설 목록", path: "/risk-knowledge/search", body: (qc) => ({ data_group: "RISK_FACTOR_FACILITY", region: qc.region ?? null, page: { page: 1, size: 50 } }) },
  FLOOD_TRACE: { apiId: "T3Q-30", label: "침수흔적 목록", path: "/flood-traces/search", body: (qc) => ({ region: qc.region ?? null, page: { page: 1, size: 50 } }) },
  SIMILAR_EVENT: { apiId: "T3Q-04", label: "유사재난 사례", path: "/similar-events/search", body: (qc) => ({ query_context: qc, page: { page: 1, size: 20 } }) },
  PLAN: { apiId: "T3Q-06", label: "계획문서 목록", path: "/plans/search", body: (qc) => ({ region: qc.region ?? null, page: { page: 1, size: 20 } }) },
};

export async function runPreview(libraryId: string, qc: Record<string, unknown>): Promise<PreviewItem[] | undefined> {
  const q = libById(libraryId);
  if (!q?.preview?.length) return undefined;
  // 지역이 없는(전국) 목록 조회는 범위가 너무 넓어 자동 조회하지 않는다(유사사례는 조건으로 순위를 매기므로 허용)
  const apis = q.preview.filter((a) => a === "SIMILAR_EVENT" || qc.region);
  if (!apis.length) return undefined;
  return Promise.all(
    apis.map(async (api) => {
      const s = SPEC[api];
      const request = s.body(qc);
      const r = await t3q("POST", s.path, request, { timeoutMs: 8000 });
      return { api, apiId: s.apiId, label: s.label, method: "POST" as const, path: s.path, request, http: r.http, ms: r.ms, response: r.body };
    }),
  );
}
