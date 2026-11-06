import "server-only";
import type { Account } from "../config";
import { libById } from "../library";
import { buildQueryContext, type ClientCondition } from "./queryContext";
import type { JobSource, SubmitInput } from "./jobs";

/** 질의 접수 본문(POST /api/agent/jobs) — 화면 lib/session submitBody 가 만드는 모양 */
export interface JobBody {
  question?: string; source?: JobSource; libraryId?: string | null; convId?: string | null; turnNo?: number | null; condition?: ClientCondition;
  warnings?: Record<string, unknown> | null; briefing?: Record<string, unknown> | null; quickQueryId?: string | null; aiMode?: Record<string, unknown> | null;
  followUp?: { jobId: string; refs?: { display_name?: string; entity_type?: string }[] } | null; noCache?: boolean; stream?: boolean; pinId?: string | null; pinFresh?: boolean;
  /** 지도에서 집어 둔 참조 객체(「객체 참조」) — id = lib/mapRef objectIdOf, name = display_name 그대로 */
  objectRefs?: { id?: string | null; name?: string | null }[] | null;
}

/** 참조 객체 상한 — 집은 것이 이보다 많으면 앞에서부터 */
const MAX_OBJECT_REFS = 50;

/**
 * 지도에서 집어 둔 객체 → T3Q 요청(개발 서버 agentApi·conditions.toQueryContext 그대로).
 * ID 는 reference.object_ids 로(명세에 칸이 없어 Data API 이름 RiskSearchReq.object_ids 를 빌림 — T3Q 규약 미합의),
 * 이름은 query_context.detail.keywords 뒤에 붙인다(사람이 적은 키워드가 앞, 같은 말은 한 번). T3Q 가 reference 를 읽기 전까지 이름이 받쳐 준다.
 */
export function objectRefsOf(refs: JobBody["objectRefs"]): { objectIds: string[]; names: string[] } {
  const list = (Array.isArray(refs) ? refs : []).slice(0, MAX_OBJECT_REFS);
  const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 120) : "");
  return {
    objectIds: [...new Set(list.map((r) => str(r?.id)).filter(Boolean))],
    names: [...new Set(list.map((r) => str(r?.name)).filter(Boolean))],
  };
}

/**
 * 접수 본문 → submitJob 입력 — 라우트가 질문 글·출처·기준지역 검사를 마친 뒤 부른다.
 * 문항 재난유형은 질문 모음 문항일 때만(사용자가 고르지 않았을 때), AI 모드 점검은 기준지역만 싣는다(R39 — 가정 조건은 화면이 무엇을 보내든 넣지 않음).
 */
export function jobInputOf(who: Account, b: JobBody | null | undefined, question: string, source: JobSource): SubmitInput {
  const lib = b?.libraryId ? libById(b.libraryId) : undefined;
  // 특보는 weather_warnings 로 따로
  const c = b?.condition;
  const picked = source === "AI_MODE" ? { objectIds: [], names: [] } : objectRefsOf(b?.objectRefs);
  let cond: ClientCondition | undefined = source === "AI_MODE" ? (c ? { base: c.base, region: c.region, sub: c.sub } : undefined) : c;
  if (picked.names.length) cond = { ...(cond ?? {}), keywords: [...new Set([...(cond?.keywords ?? []), ...picked.names])] } as ClientCondition;
  const queryContext = buildQueryContext(who, cond, source === "AI_MODE" ? undefined : lib?.disasterTypes);
  return {
    question, source, libraryId: b?.libraryId ?? null, convId: b?.convId ?? null, turnNo: b?.turnNo ?? null,
    queryContext, weatherWarnings: b?.warnings ?? null, briefing: b?.briefing ?? null, quickQueryId: b?.quickQueryId ?? null,
    aiMode: b?.aiMode ?? null, followUp: b?.followUp ?? null, noCache: !!b?.noCache,
    ...(picked.objectIds.length ? { reference: { object_ids: picked.objectIds } } : {}),
    stream: !!b?.stream && process.env.T3Q_MODE !== "replay",
    pinId: b?.pinId ?? null, pinFresh: !!b?.pinFresh,
  };
}
