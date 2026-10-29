/**
 * 운영관리(/admin) — /api/admin/* 응답 모양 (서버 라우트·화면 공용, 타입만)
 * 질의 목록은 큰 열(request·raw·preview·geo)을 빼고 보낸다. 원문은 GET /api/agent/jobs/{id}?full=1 로 따로 받는다.
 */
import type { JobSource, JobState } from "./jobTypes";
import type { ScenarioState } from "./scenario";

export type WarmRegion = "busan" | "inje" | "yeongcheon";
/** 브리핑 예열 대상 — 부산·인제·영천 순 */
export const WARM_REGIONS: WarmRegion[] = ["busan", "inje", "yeongcheon"];

export interface AdminJobRow {
  id: string;
  account_id: string;
  conv_id: string | null;
  turn_no: number | null;
  source: JobSource;
  library_id: string | null;
  /** 사용자가 본 질문(앞 500자) */
  question_user: string;
  /** 실제 전송 질문이 사용자 질문과 다름(이어서 묻기 접두 등) */
  sent_differs: boolean;
  state: JobState;
  t3q_status: string | null;
  http_status: number | null;
  cached_from: string | null;
  retry_of: string | null;
  error_code: string | null;
  t3q_request_id: string | null;
  t3q_conversation_id: string | null;
  created_at: string;
  submitted_at: string | null;
  last_polled_at: string | null;
  finished_at: string | null;
  elapsed_ms: number | null;
  has_raw: boolean;
  has_preview: boolean;
}

export interface T3qHealth {
  ok: boolean;
  mode: "live" | "replay";
  configured: boolean;
  version: string | null;
  checkedAt: string;
  /** 실패 사유(연결 실패·시간 초과·HTTP 상태) */
  detail: string | null;
}

export interface AdminJobsResponse {
  /** 전체 계정 최근 200건 */
  recent: AdminJobRow[];
  /** 진행 중(QUEUED·SUBMITTED·RUNNING) 전체 — 오래된 순 */
  active: AdminJobRow[];
  counts: { state: JobState; total: number; last24h: number }[];
  /** 완료·캐시 제외 응답 시간(접수~완료) */
  timing: { windowDays: number; n: number; avgMs: number | null; p50Ms: number | null; p90Ms: number | null; maxMs: number | null; avgWaitMs: number | null };
  /** 화면 예상 대기(최근 완료 20건 중앙값) */
  expectedMs: number | null;
  /** 동시 슬롯 — running(SUBMITTED·RUNNING) + cooling(취소 후 120초) 이 global 이상이면 새 질의는 QUEUED */
  slots: { running: number; cooling: number; queued: number; perAccount: number; global: number };
  t3q: T3qHealth;
  at: string;
}

export interface WarmJob {
  id: string;
  account_id: string;
  state: JobState;
  t3q_status: string | null;
  http_status: number | null;
  cached_from: string | null;
  error_code: string | null;
  created_at: string;
  finished_at: string | null;
  elapsed_ms: number | null;
}

export interface WarmItem {
  region: WarmRegion;
  regionName: string;
  accountId: string;
  libraryId: string;
  question: string;
  /** CACHED = 24시간 안 같은 답 재사용 · JOINED = 진행 중인 같은 질의에 합류 · NEW = 새로 접수 · SKIPPED = 시간 부족으로 미접수 · ERROR */
  outcome: "CACHED" | "JOINED" | "NEW" | "SKIPPED" | "ERROR";
  job: WarmJob | null;
  error?: string;
}

export interface WarmResponse {
  items: WarmItem[];
  at: string;
}

/** 시연 세트 예열(/api/admin/warm/demo) 한 줄 — 묶음 「재난담당자의 하루」 사슬 질문(실시간 제외) · 브리핑 세트 */
export interface DemoWarmItem {
  region: WarmRegion;
  regionName: string;
  accountId: string;
  kind: "CHAIN" | "BRIEFING";
  /** 묶음 항목 id(DD-…) · 브리핑 항목 key */
  itemId: string;
  /** 대본 단계 */
  scene: string;
  title: string;
  question: string;
  outcome: WarmItem["outcome"];
  job: WarmJob | null;
  /** 재사용(CACHED)이면 원래 답을 받은 시각 — 재사용 기간(24시간)은 이 시각부터 */
  sourceFinishedAt?: string | null;
  /** 브리핑 줄에 실린 특보 번호(warning_key, 보낸 값 그대로 — 열쇠에 들어감). 사슬 질문 줄에는 없음 */
  warnings?: string[];
  error?: string;
}

export interface DemoWarmResponse {
  items: DemoWarmItem[];
  at: string;
}

export interface AdminAccountRow {
  id: string;
  name: string;
  org: string;
  dept: string | null;
  role: string;
  /** sa_accounts 에 발급된 계정인지 */
  issued: boolean;
  /** 설정(ACCOUNTS)에 있는 계정인지 */
  known: boolean;
  status: string | null;
  failed_count: number;
  locked_until: string | null;
  locked: boolean;
  last_login_at: string | null;
  created_at: string | null;
  /** 살아 있는 세션의 마지막 활동(유휴 4시간 안) */
  session_seen_at: string | null;
}

export interface AdminFeedbackRow {
  job_id: string;
  account_id: string;
  response_id: string | null;
  rating: string;
  comment: string | null;
  rated_at: string;
  /** T3Q-31 응답 봉투의 status */
  t3q_feedback_status: string | null;
  question_user: string | null;
  source: JobSource | null;
  asked_at: string | null;
}

export interface AdminFeedbackResponse {
  rows: AdminFeedbackRow[];
  summary: { rating: string; n: number }[];
}

/** GET·POST /api/admin/scenario — 시연 시나리오 특보 켜짐 상태(R43). live = 켬 + 끝나는 시각 전 */
export interface AdminScenarioResponse {
  state: ScenarioState;
  live: boolean;
  now: string;
}
