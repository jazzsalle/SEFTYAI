import "server-only";
import type { Account } from "../config";
import { libById } from "../library";
import { buildQueryContext, type ClientCondition } from "./queryContext";
import type { JobSource, SubmitInput } from "./jobs";

/** 질의 접수 본문(POST /api/agent/jobs) — 화면 lib/session submitBody 가 만드는 모양 */
export interface JobBody {
  question?: string; source?: JobSource; libraryId?: string | null; convId?: string | null; turnNo?: number | null; condition?: ClientCondition;
  warnings?: Record<string, unknown> | null; briefing?: Record<string, unknown> | null; quickQueryId?: string | null; aiMode?: Record<string, unknown> | null;
  followUp?: { jobId: string; refs?: { display_name?: string; entity_type?: string }[] } | null; noCache?: boolean;
}

/**
 * 접수 본문 → submitJob 입력 — 라우트가 질문 글·출처·기준지역 검사를 마친 뒤 부른다.
 * 문항 재난유형은 질문 모음 문항일 때만(사용자가 고르지 않았을 때), AI 모드 점검은 기준지역만 싣는다(R39 — 가정 조건은 화면이 무엇을 보내든 넣지 않음).
 * 「시연 세트 예열」 시험(harness/region/demoWarmKey)이 화면 본문을 이 함수로 돌려 예열과 열쇠를 견준다
 */
export function jobInputOf(who: Account, b: JobBody | null | undefined, question: string, source: JobSource): SubmitInput {
  const lib = b?.libraryId ? libById(b.libraryId) : undefined;
  // 질문 글은 R33(임시) 판단에만 넘긴다 — 보내는 질문은 그대로. 특보는 weather_warnings 로 따로
  const c = b?.condition;
  const cond: ClientCondition | undefined = source === "AI_MODE" ? (c ? { base: c.base, region: c.region, sub: c.sub } : undefined) : c;
  const queryContext = buildQueryContext(who, cond, source === "AI_MODE" ? undefined : lib?.disasterTypes, question);
  return {
    question, source, libraryId: b?.libraryId ?? null, convId: b?.convId ?? null, turnNo: b?.turnNo ?? null,
    queryContext, weatherWarnings: b?.warnings ?? null, briefing: b?.briefing ?? null, quickQueryId: b?.quickQueryId ?? null,
    aiMode: b?.aiMode ?? null, followUp: b?.followUp ?? null, noCache: !!b?.noCache,
  };
}
