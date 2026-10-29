/** 질의 작업 — 화면용 타입 (서버 lib/server/jobs.ts 와 같은 모양) */
export type JobState = "QUEUED" | "SUBMITTED" | "RUNNING" | "DONE" | "FAILED" | "CANCELLED" | "LOST" | "TIMEOUT";
export type JobSource = "USER" | "BRIEFING" | "QUICK" | "SUGGEST" | "LIBRARY" | "FOLLOW_UP" | "AI_MODE";

export interface JobSummary {
  id: string;
  account_id: string;
  conv_id: string | null;
  turn_no: number | null;
  source: JobSource;
  library_id: string | null;
  question_user: string;
  question_sent: string;
  state: JobState;
  t3q_status: string | null;
  http_status: number | null;
  cached_from: string | null;
  retry_of: string | null;
  error_code: string | null;
  created_at: string;
  submitted_at: string | null;
  finished_at: string | null;
  elapsed_ms: number | null;
  t3q_conversation_id: string | null;
  /**
   * 재사용(cached_from)이면 원래 답을 받은 시각(원본 작업의 finished_at, D5). 재사용이 아니면 null.
   * 예전 응답에는 없을 수 있다(없음 = 모름). 재사용 작업의 finished_at 은 다시 쓴 시각이다
   */
  source_finished_at?: string | null;
  /**
   * C9·D5 — 이 답을 받은 때(서버가 작업을 끝낸 때) 발효 중이던 기상청 특보(해제 제외). 기상청 조회가 안 됐거나 예전 작업이면 null(모름).
   * 「답변을 받은 뒤 특보」는 기상청 발표 시각(특보 현황 한 장의 tmFc — 특보마다의 시각이 아님)이 아니라 이 목록에 없던 특보로 가린다
   */
  wx_seen?: WxSeen[] | null;
  /** 재사용(cached_from)이면 원래 답을 받은 때의 특보(원본 작업의 wx_seen). 재사용이 아니면 null */
  source_wx_seen?: WxSeen[] | null;
  hasPreview?: boolean;
}

/** 답을 받은 때 발효 중이던 특보 하나 — 기상청 특보 현황에서 받은 값 그대로(서버 kma.ts 의 Advisory 일부) */
export interface WxSeen {
  id: string;
  type: string;
  level: string;
  regionId?: string | null;
}

/**
 * 이 답을 받은 시각(앱 시각) — 재사용이면 원래 답을 받은 시각(서버 source_finished_at), 아니면 이 작업이 끝난 시각.
 * 모르면 null — 다른 값(답의 meta.base_time 등)으로 메우지 않는다(재사용 작업의 finished_at 은 다시 쓴 시각이라 쓰지 않는다)
 */
export function receivedAt(job: JobSummary, full?: JobFull | null): string | null {
  if (job.cached_from) return job.source_finished_at ?? full?.source_finished_at ?? null;
  return job.finished_at ?? full?.finished_at ?? null;
}

export interface T3qRef {
  ref: string;
  entity_type: string | null;
  display_name: string | null;
  map: { key: string | null; value: string; draw: string | null };
}

/** T3Q Agent 최종 봉투 — 원문 그대로 (화면은 이것만 읽는다) */
export interface AgentEnvelope {
  schema_version?: string;
  request_id?: string;
  status?: string;
  conversation_id?: string;
  turn_no?: number;
  result?: {
    response_id?: string;
    question?: string;
    answer?: string | null;
    answer_format?: string;
    refs?: T3qRef[];
    entities?: unknown[];
    result_groups?: unknown[];
    evidence_refs?: unknown[];
    follow_up_questions?: unknown[];
    limitations?: string[];
    context_used?: unknown;
    job_status?: string;
    [k: string]: unknown;
  } | null;
  data_gaps?: { component: string; reason: string }[];
  warnings?: { code: string; message: string; retryable?: boolean }[];
  meta?: { source?: string; base_time?: string; quality_status?: string; disclosure_level?: string; elapsed_ms?: number };
  detail?: unknown;
}

export interface PreviewItem {
  api: string;
  apiId: string;
  label: string;
  path: string;
  request: unknown;
  http: number;
  ms: number;
  response: {
    status?: string;
    result?: { total_count?: number | null; items?: Record<string, unknown>[] } | null;
    data_gaps?: { component: string; reason: string }[];
    warnings?: { code: string; message: string }[];
    meta?: { base_time?: string };
  } | null;
}

export interface GeoEnvelope {
  status?: string;
  result?: {
    type?: string;
    features?: { type: string; geometry: { type: string; coordinates: unknown }; properties: { ref?: string; key?: string; value?: string; precision?: string } }[];
    missing?: { ref?: string; value?: string; reason?: string }[];
  };
}

export interface JobFull extends JobSummary {
  request: Record<string, unknown>;
  raw: AgentEnvelope | null;
  preview: PreviewItem[] | null;
  geo: GeoEnvelope | null;
}

export const ACTIVE_STATES: JobState[] = ["QUEUED", "SUBMITTED", "RUNNING"];
export const isActive = (s: JobState) => ACTIVE_STATES.includes(s);
/** 이 출처의 질의가 기준지역을 잠그는가(R32) — AI 모드 점검(AI_MODE)은 잠그지 않는다(R44: AI 모드 창은 기준지역이 바뀌면 새 지역으로 다시 점검한다) */
export const sourceLocksBase = (src: JobSource) => src !== "AI_MODE";
/** 이 작업이 기준지역을 잠그는가 — 진행 중(대기·제출·답변 생성 중)이고 AI 모드 점검이 아님(R32·R44). lib/session 의 asking·setBase 가 쓴다 */
export const locksBase = (j: Pick<JobSummary, "state" | "source">) => isActive(j.state) && sourceLocksBase(j.source);

export const SOURCE_LABEL: Record<JobSource, string> = {
  USER: "직접 질문", BRIEFING: "브리핑", QUICK: "특보 질문", SUGGEST: "추천 질문", LIBRARY: "지역 질문", FOLLOW_UP: "이어서 묻기", AI_MODE: "AI 모드",
};
export const STATE_LABEL: Record<JobState, string> = {
  QUEUED: "대기 중", SUBMITTED: "보내는 중", RUNNING: "답변 생성 중", DONE: "완료", FAILED: "실패", CANCELLED: "취소됨", LOST: "유실", TIMEOUT: "시간 초과",
};
/** T3Q data_gaps.reason 한글 대역 (설명서 §2 — 의미 그대로) */
export const GAP_LABEL: Record<string, string> = {
  NOT_IN_SOURCE: "원천에 없음", NOT_YET_BUILT: "구축 전", SOURCE_NOT_COLLECTED: "수집 안 됨", CONNECTION_FAILED: "연결 실패", INPUT_NOT_PROVIDED: "입력 없음",
};
