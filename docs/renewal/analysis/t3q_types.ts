/**
 * T3Q 시범서비스 API v0.3.0 — TypeScript 타입 (소스 기준)
 * 근거: T3Q 리포 api/app/*.py · api/app/routers/*.py. 줄 번호는 주석에. 상세 설명은 t3q_contract.md.
 * 원칙: 서버가 null 을 줄 수 있는 칸은 `| null`, 조건부로만 붙는 칸은 `?`.
 * 서버 모델이 extra="allow" 라 응답에도 칸이 더해질 수 있다 → 런타임 검증은 t3q_schemas.ts(looseObject).
 */

// ─── 공통 봉투 (envelope.py) ───────────────────────────────────────────────

/** envelope.py:27 — 7종 + PROCESSING(T3Q 확장) */
export type T3qStatus =
  | "SUCCESS"
  | "NO_RESULT"
  | "DATA_NOT_AVAILABLE"
  | "PARTIAL_SUCCESS"
  | "FORBIDDEN" // 정의만, 사용처 없음
  | "TIMEOUT" // 504
  | "UPSTREAM_ERROR" // 502
  | "PROCESSING"; // 202

/** envelope.py:28 */
export type GapReason =
  | "NOT_IN_SOURCE"
  | "NOT_YET_BUILT"
  | "SOURCE_NOT_COLLECTED"
  | "CONNECTION_FAILED"
  | "INPUT_NOT_PROVIDED";

/** component 는 자유 문자열 경로("time_profile.ended_at", "items[].paragraphs" …) */
export interface DataGap {
  component: string;
  reason: GapReason;
}

/** envelope.py:78-79 — code 는 열린 문자열(목록은 t3q_contract.md §2.2) */
export interface Warning {
  code: string;
  message: string;
  retryable: boolean;
}

export interface Meta {
  source: "T3Q";
  /** Data API = 고정 데이터 기준 시각, Agent·대화 API = 응답 시각 */
  base_time: string;
  quality_status: "VERIFIED" | "UNDER_REVIEW" | (string & {});
  /** 늘 "공개" */
  disclosure_level: string;
  elapsed_ms: number;
}

/** envelope.py:82-98 */
export interface Envelope<R> {
  schema_version: "2.0";
  request_id: string;
  correlation_id: string;
  status: T3qStatus;
  /** Agent 질의(대화 있을 때)만 — agent.py:153-158 */
  conversation_id?: string;
  turn_no?: number;
  result: R | null;
  data_gaps: DataGap[];
  warnings: Warning[];
  meta: Meta;
}

/** 봉투가 아닌 응답: 401(deps.py:11)·422(FastAPI 검증) */
export interface FastApiError {
  detail: string | { loc: (string | number)[]; msg: string; type: string }[];
}

// ─── 공통 요청 (common.py) ─────────────────────────────────────────────────

export type CallerRole = "LOCAL_GOV_OFFICER" | "CENTRAL_GOV_OFFICER" | "SYSTEM_OPERATOR" | (string & {});

/** common.py:17-21 */
export interface Caller {
  user_id?: string | null;
  role?: CallerRole | null;
  org_admin_code?: string | null;
}

/** common.py:24-28 */
export interface Region {
  /** 법정동코드 10자리 (시도 2600000000 · 시군구 2617000000) */
  admin_code?: string | null;
  name?: string | null;
  level?: "SIDO" | "SIGUNGU" | "EMD" | null;
}

/** common.py:31-34 — JSON 키 "from" */
export interface Period {
  from?: string | null;
  to?: string | null;
}

/** common.py:108-109 */
export type ConditionItem =
  | "RAIN_1H" | "RAIN_3H" | "RAIN_6H" | "RAIN_12H" | "RAIN_24H"
  | "WATER_LEVEL" | "FLOW" | "WIND_SPEED" | "HUMIDITY";

/** common.py:37-43 */
export interface Condition {
  item?: ConditionItem | (string & {}) | null;
  label?: string | null;
  value?: number | null;
  unit?: string | null;
  source_type?: "MANUAL" | (string & {}) | null;
}

/** common.py:46-51 */
export interface Detail {
  warning_kind?: string | null;
  warning_level?: string | null;
  keywords?: string[];
  conditions?: Condition[];
}

/** common.py:54-60 — weather_warnings 는 여기 없음(AgentQueryReq 최상위) */
export interface QueryContext {
  reference_time?: string | null;
  region?: Region | null;
  /** 한글 재난유형 이름(호우·태풍 …). 유사도는 첫 항목만 사용 */
  disaster_types?: string[];
  period?: Period | null;
  detail?: Detail | null;
}

/** common.py:63-65 */
export interface Page {
  page?: number; // ≥1, 기본 1
  size?: number; // 1..100, 기본 20 (엔드포인트 기본값은 다름)
}

/** common.py:68-74 */
export interface BaseReq {
  request_id?: string | null;
  caller?: Caller | null;
  conversation_id?: string | null;
  turn_no?: number | null;
}

// ─── Agent (routers/agent.py) ─────────────────────────────────────────────

/** agent.py:26 — 그 밖 값은 서버가 USER 로 바꿈 */
export type QuestionSource = "USER" | "SUGGEST" | "FOLLOW_UP" | "QUICK" | "BRIEFING" | "AI_MODE";

export interface BriefingInput {
  preset_id?: string;
  briefing_item_id?: string;
  item_no?: number;
  item_total?: number;
}

export interface AiModeInput {
  check_id?: string;
  trigger?: string; // 예: FIRST · WARNING_CHANGED
  interval_min?: number;
  prompt_id?: string;
}

/** 서버는 dict 로만 받음(agent.py:38). 아래 꼴은 명세 v0.9 예시(spec:4476-4500) — 참고용 */
export interface WeatherWarnings {
  collect_status?: string;
  collected_at?: string | null;
  source?: string;
  items?: {
    warning_key?: string;
    kind?: string;
    level?: string;
    area?: string;
    announced_at?: string | null;
    effective_at?: string | null;
    change?: string | null;
  }[];
  [k: string]: unknown;
}

/** agent.py:29-38 — T3Q-01·02·28·29 공용 */
export interface AgentQueryReq extends BaseReq {
  /** 1..4000자 (화면 2,000자) */
  question: string;
  question_source?: QuestionSource;
  query_context?: QueryContext | null;
  reference?: Record<string, unknown> | null;
  /** 기본 SYNC. 60초 프록시 상한 때문에 늘 ASYNC 사용 */
  response_mode?: "SYNC" | "ASYNC";
  briefing?: BriefingInput | null;
  /** "QQ-03" = 행동매뉴얼 대응절차(T3Q-28) */
  quick_query_id?: string | null;
  ai_mode?: AiModeInput | null;
  weather_warnings?: WeatherWarnings | null;
}

/** agent.py:54-66 · 설명서 §7.3 */
export type MapKey =
  | "spatial_object_id" | "latlon" | "legal_dong_code" | "sigungu_code" | "slope_no" | "trace_code"
  | "flood_map_id" | "landslide_area_id" | "geoai_area_id" | "river_code" | "pnu" | "bdst_ldgr_unq_no" | "underpass_id";

export interface AgentRef {
  /** r1, r2 … 응답 한 건 안에서만 유일. answer 의 #ref:rN 과 같다 */
  ref: string;
  /** EVENT·RISK_AREA·FACILITY·RISK_FACTOR·RIVER·FLOOD_TRACE·REGION·POINT·FLOOD_MAP·PARCEL … */
  entity_type: string | null;
  display_name: string | null;
  map: {
    key: MapKey | (string & {}) | null;
    /** 서버가 str() 로 변환 */
    value: string;
    draw: "pin" | "line" | "layer" | "auto" | (string & {});
  };
}

export interface BriefingItemResult {
  briefing_item_id: string | null;
  item_name: null;
  item_status: T3qStatus;
  summary: null;
  count: null;
  unit: null;
  objects: never[];
  evidence_refs: never[];
}

/** agent.py:137-152 */
export interface AgentQueryResult {
  response_id: string;
  question: string;
  question_source: QuestionSource;
  /** MARKDOWN. Agent 미구축(DATA_NOT_AVAILABLE)이면 null */
  answer: string | null;
  answer_format: "MARKDOWN";
  /** Agent 출력 통과 — 실질적으로 빈 배열 예상(⚠ 실측 확인) */
  entities: unknown[];
  result_groups: unknown[];
  evidence_refs: unknown[];
  follow_up_questions: unknown[];
  refs: AgentRef[];
  conversation_title: null;
  limitations: string[];
  context_used: { used_conditions: never[]; unused_conditions: never[]; reference_used: false };
  /** source=BRIEFING 이고 briefing 요청 시 */
  briefing_item?: BriefingItemResult;
  /** 행동매뉴얼 요청 시(QQ-03 또는 질문에 «대응절차»/«행동매뉴얼») — 늘 비어 있음 */
  manual?: null;
  action_items?: never[];
  action_item_total?: null;
  /** source=AI_MODE 시 */
  check_id?: string | null;
  checked_at?: string;
  region?: { admin_code: string | null; name: string | null } | null;
  priority_review?: null;
  warning_guides?: never[];
  no_warning_message?: null;
  info_gaps?: never[];
}

/** agent.py:102-103 — ASYNC 접수(202) */
export interface AgentAcceptedResult {
  request_id: string;
  /** "/v1/agent/query/{request_id}" (base 앞에 붙일 것) */
  poll: string;
}

/** agent.py:110-116 — EXT-02 진행·취소·미발견 */
export interface AgentJobResult {
  request_id: string;
  job_status: "RUNNING" | "CANCELLED" | "NOT_FOUND";
  started_at?: string;
}

/** EXT-02 응답 = 진행/취소/미발견 봉투 또는 완료된 T3Q-01 봉투 */
export type AgentPollResponse = Envelope<AgentJobResult> | Envelope<AgentQueryResult>;

/** agent.py:161-173 */
export interface CancelReq extends BaseReq {
  reason?: string; // 기본 USER_CANCELLED
}
export interface CancelResult {
  request_id: string;
  cancel_result: "CANCELLED" | "ALREADY_COMPLETED" | "NOT_FOUND";
  cancelled_at: string | null;
}

/** agent.py:178-207 — T3Q-03 */
export interface SuggestedQuestionsQuery {
  region_admin_code?: string; // 무시됨
  disaster_types?: string; // 쉼표 목록
  per_group?: 1 | 2 | 3;
}
export interface SuggestedQuestionsResult {
  capability_set_version: string; // "CQS-152-v0.1"
  items: {
    question_id: string;
    group: "SIMILAR_EVENT" | "RISK_AREA" | "RISK_FACTOR_FACILITY" | "PLAN" | "FLOOD_TRACE" | "RIVER";
    group_label: string;
    text: string;
    data_api: string; // "T3Q-04" …
  }[];
}

/** agent.py:212-225 — T3Q-25 */
export interface ConversationStateResult {
  conversation_id: string;
  context_mode: "STATEFUL";
  context_status: "ACTIVE" | "EXPIRED" | "NOT_FOUND";
  last_turn_no?: number;
  last_activity_at?: string;
  expires_at?: string;
  context_idle_timeout_hours?: number;
  expired_at?: string;
  resume_requirement?: "NEW_CONVERSATION_OR_SEND_HISTORY";
}

/** agent.py:232-253 — T3Q-27 */
export interface DeleteConversationResult {
  conversation_id: string;
  delete_result: "DELETED" | "NOT_FOUND";
  deleted_at: string | null;
  deleted_items?: ("context" | "turn_cache")[];
}
export interface PurgeReq extends BaseReq {
  conversation_ids: string[]; // 1..200
  reason?: "USER_REQUEST" | "RETENTION_EXPIRED";
}
export interface PurgeResult {
  items: { conversation_id: string; delete_result: "DELETED" | "NOT_FOUND"; deleted_at: string | null }[];
}

/** agent.py:258-268 — T3Q-31 */
export interface FeedbackReq extends BaseReq {
  response_id: string; // 1..80
  rating: "GOOD" | "BAD";
  comment?: string | null; // ≤1000
  rated_at?: string | null;
}
export interface FeedbackResult {
  response_id: string;
  feedback_result: "ACCEPTED" | "UPDATED";
}

// ─── 사건 (routers/events.py) ─────────────────────────────────────────────

export interface AdminArea {
  admin_code: string | null;
  name: string | null;
}

export interface Similarity {
  rank: number | null;
  score: number;
  scale: "0~100";
  algorithm_version: string | null;
  coverage?: number | null;
}

/** events.py:75-78 — T3Q-04 */
export interface SimilarSearchReq extends BaseReq {
  /** null=전체, []=NO_RESULT */
  event_master_ids?: string[] | null;
  query_context?: QueryContext | null;
  page?: Page;
}
export interface SimilarEventItem {
  event_master_id: string;
  display_name: string;
  disaster_types: (string | null)[];
  lifecycle_status: "CLOSED" | null;
  started_at: string | null;
  ended_at: string | null;
  time_precision: "DATE";
  similarity: Similarity | null;
  representative_admin_area: AdminArea | null;
  crisis_alert_level: null;
  has_geometry: false;
}
export interface SimilarSearchResult {
  total_count: number;
  items: SimilarEventItem[];
}

/** events.py:146-157 — T3Q-10 */
export interface EventDetailResult {
  event_master_id: string;
  display_name: string;
  disaster_types: (string | null)[];
  disaster_type_code: string;
  source_disaster_type_text: string | null;
  lifecycle_status: "CLOSED" | null;
  time_profile: {
    started_at: string | null;
    ended_at: string | null;
    time_precision: "DATE";
    source_timezone: null;
    source_time_raw: { start: string | null; end: string | null };
  };
  representative_admin_area: AdminArea | null;
  affected_admin_areas: AdminArea[];
  affected_admin_areas_more: boolean;
  crisis_alert_level: null;
  cdb_stage: null;
  lead_agency: string | null;
  event_summary: string;
  available_sections: {
    similarity: boolean; timeline: boolean; damage_response: boolean; report: boolean; evidence: boolean; satellite: boolean;
  };
  evidence_refs: string[];
}

/** events.py:167-169 — T3Q-11 */
export interface SimilarityReq extends BaseReq {
  query_context?: QueryContext | null;
  reference_event_id?: string | null;
}
export type FactorGroup = "재난유형" | "기상·수문" | "공간·취약" | "피해" | "대응" | (string & {});
export interface SimilarityResult {
  event_master_id: string;
  similarity: Similarity | null;
  contributions?: { factor_group: FactorGroup; contribution_points: number; contribution_pct: number }[];
  weights?: { disaster_type: string | null; by_group: { factor_group: FactorGroup; weight: number }[]; weight_stage: string };
  similarity_reasons?: string[];
  factors?: {
    factor_group: FactorGroup;
    factor_key: string;
    factor: string;
    unit: string | null;
    current_value: unknown;
    past_value: unknown;
    match: number | null;
    weight_used: number;
    contribution: number;
    evidence_ref: null;
  }[];
  factor_groups_not_provided?: FactorGroup[];
  disclaimer?: string;
}

/** events.py:328-348 — T3Q-12 */
export interface TimelineItem {
  seq: number;
  occurred_at: string;
  elapsed_hours: number | null;
  time_precision: "MINUTE";
  category: "특보" | "재난문자";
  description: string;
  agency: string | null;
  record_type: "ACTUAL";
  evidence_ref: null;
  source_ref: string;
  relation_basis: "TIME_REGION_OVERLAP";
}
export interface TimelineResult {
  event_master_id: string;
  time_origin?: { type: "ABSOLUTE"; origin_at: string; note: string };
  total_count: number | null;
  items: TimelineItem[];
}

/** events.py:402-411 — T3Q-13 (금액 단위 원) */
export interface DamageResponseResult {
  event_master_id: string;
  damage: {
    human: { text: null; dead: number | null; missing: number | null; injured: number | null; displaced: number | null };
    property: { text: null; property_damage_krw: number | null; houses: null };
    facilities: {
      public: { record_count: number; damage_amount_krw: number | null; by_category: { category: string; record_count: number; damage_amount_krw: number | null }[] } | null;
      private: { record_count: number; damage_amount_krw: number | null } | null;
      recovery: { report_level: string; item_count: number; damage_amount_krw: number | null; recovery_cost_krw: number | null }[];
      damage_registers: { disaster_id: unknown; disaster_year: number; name: string }[];
    } | null;
  };
  response: { road_control_count: null; evacuation: { text: null; persons: null }; actions: never[] };
  evidence_refs: string[];
}
export interface ReportsResult {
  event_master_id: string;
  total_count: null;
  reports: never[];
}

/** events.py:427-450 — T3Q-32·33·35 (늘 DATA_NOT_AVAILABLE) */
export interface NoSourceEventResult {
  event_master_id: string;
  total_count: null;
  items: never[];
  page?: number;
  size?: number;
  missing_phases?: { phase: "ALL"; reason: "NOT_IN_SOURCE"; note: string }[];
}

// ─── 위험·취약 (routers/risk.py) ──────────────────────────────────────────

export type DataGroup = "RISK_AREA" | "RISK_FACTOR_FACILITY";
export interface Grade {
  value: string | null;
  status: "PROVIDED" | "NOT_PROVIDED";
}

/** risk.py:60-65 — T3Q-05 (page 기본 size 100) */
export interface RiskSearchReq extends BaseReq {
  data_group?: DataGroup | null;
  object_ids?: string[] | null;
  region?: Region | null;
  categories?: string[] | null;
  page?: Page;
}
export interface RiskItem {
  object_id: string;
  spatial_object_id: string | null;
  data_group: DataGroup;
  category: string;
  type: string | null;
  source_subtype: string | null;
  name: string;
  grade: Grade;
  address: string | null;
  admin_code: string | null;
  admin_name: string | null;
  has_geometry: boolean;
  disclosure_level: string;
}
export interface RiskSearchResult {
  total_count: number;
  category_counts: { category: string; count: number }[];
  items: RiskItem[];
}

export interface Attribute {
  key: string;
  label: string;
  value: unknown;
  evidence_ref: string | null;
}

/** risk.py:147-258 — T3Q-15 */
export interface RiskObjectResult {
  object_id: string;
  spatial_object_id: string | null;
  data_group: DataGroup;
  category: string;
  type: string | null;
  source_subtype: string | null;
  name: string | null;
  admin_area: AdminArea;
  address: string | null;
  risk: {
    designation_reason: null;
    key_risk_condition: null;
    expected_damage: null;
    vulnerability: null;
    grade: Grade;
    risk_score_detail: { score: number | null } | null;
    designated_at: string | null;
    designation_no: string | null;
    area_or_length: string | null;
    attributes: Attribute[];
  };
  management: { agency: string | null; department: string | null; contact: null; contains_pii: false };
  basis: {
    designation_basis: null;
    related_plans: { plan_id: string; name: string | null }[];
    related_documents: { title: string; evidence_ref: string }[];
    past_events: never[];
  };
  source: { name: string | null; table: string | null; row_no: unknown; as_of: string | null };
  disclosure_level: string;
}

/** risk.py:285-298 · flood.py:77-89 — T3Q-34·36 (page/size 가 정수 최상위) */
export interface EvacuationReq extends BaseReq {
  linked_object_ids?: string[] | null;
  region?: Region | null;
  facility_types?: string[] | null;
  page?: number;
  size?: number;
}
export interface FloodMapReq extends BaseReq {
  region?: Region | null;
  map_types?: ("URBAN_FLOOD" | "RIVER_FLOOD")[] | null;
  spatial_object_ids?: string[] | null;
  page?: number;
  size?: number;
}
export interface NoSourceListResult {
  total_count: null;
  page: number;
  size: number;
  items: never[];
}

// ─── 계획·하천 (routers/plans.py) ─────────────────────────────────────────

export type PlanType = "하천기본계획" | "위험지구 정비계획";
export interface TargetRiver {
  river_code: string;
  spatial_object_id: null;
  river_name: string;
  river_id: string;
}

/** plans.py:60-66 — T3Q-06 */
export interface PlanSearchReq extends BaseReq {
  plan_ids?: string[] | null;
  region?: Region | null;
  plan_types?: PlanType[] | null;
  river_code?: string | null;
  keyword?: string | null;
  page?: Page;
}
export interface PlanItem {
  plan_id: string;
  plan_type: PlanType;
  scope_type: "RIVER" | "ADMIN_AREA";
  name: string;
  agency: null;
  target_area: string;
  target_admin_codes: string[] | null;
  target_rivers: TargetRiver[] | null;
  plan_period: null;
  base_year: unknown;
  approval: null;
  version: string | null;
  other_versions: string[];
  linked_risk_area_count: number | null;
  river_plan_summary: { design_frequency_yr: unknown; design_flood_cms: number | null; reference_station_no: string | null } | null;
  summary: string | null;
}
export interface PlanSearchResult {
  total_count: number;
  items: PlanItem[];
}

/** plans.py:192-234 — T3Q-16 */
export interface Station {
  station_no: string;
  cum_dist_m: number | null;
  design_flood_cms: number | null;
  design_flood_level_elm: number | null;
  levee_left_elm: number | null;
  levee_right_elm: number | null;
  plan_width_m: number | null;
  thalweg_elm: number | null;
  return_period_yr: unknown;
  /** min(좌·우 제방고) − 계획홍수위 (계산값) */
  freeboard_m: number | null;
  freeboard_ok: null;
}
export interface RiverPlanKnowledgeResult {
  river_id: string;
  river_code: string;
  river_name: string;
  river_basic: {
    river_type: string | null;
    passing_admin_areas: null;
    managing_agency: null;
    water_system: string | null;
    basin_code: string | null;
    parent_river: { river_id: string; river_name: string | null } | null;
    tributary_order: unknown;
    river_length_km: number | null;
    catchment_km2: number | null;
    designation: unknown;
  };
  plan: {
    plan_id: string;
    name: string;
    agency: null;
    notice: null;
    plan_period: null;
    base_year: unknown;
    probable_rainfall: { duration: "1시간" | "24시간"; value_mm: number | null; return_period_yr: unknown; site: string; distribution: string }[];
    design_flood: { value_cms: number; station_no: string; return_period_yr: unknown } | null;
    freeboard_required_m: null;
    vertical_datum: "EL.m";
    other_plans: string[];
  } | null;
  stations: Station[];
  station_total: number;
  facilities: string | null;
  facility_items: { facility_type: string; count: number; scope: string }[];
  management_state: null;
  risk_sections: never[];
  mitigation_measures: never[];
  knowledge_type: "PLAN_KNOWLEDGE";
  evidence_refs: string[];
}

/** plans.py:243-311 — T3Q-17 */
export interface PlanDetailResult {
  plan_id: string;
  plan_type: PlanType;
  name: string;
  target_area: string;
  agency: null;
  plan_period: null;
  base_year: unknown;
  version: string | null;
  other_versions: string[];
  content: { plan_summary: null; risk_causes: null; mitigation_measures: null; related_passage: null };
  type_specific_items: { section: string; items: { label: string; value: unknown }[] }[];
  target_rivers: TargetRiver[] | null;
  linked_risk_area_count: number | null;
  linked_risk_area_ids_sample?: string[]; // HZP
  linked_risk_area_ids?: string[]; // RBP (빈 배열)
  document_id: null;
  quality_status: string;
  disclosure_level: string;
  evidence_refs: string[];
}

// ─── 관계 (routers/kg.py) — T3Q-18 ────────────────────────────────────────

export interface KgReq extends BaseReq {
  source_ids: string[]; // 1..20
  relation_types?: string[] | null;
  target_entity_types?: string[] | null;
  depth?: 1 | 2;
}
export interface KgResult {
  nodes: { id: string; entity_type: "EVENT" | "DOCUMENT" | "RIVER" | "PLAN" | "RISK_AREA" | "FACILITY"; name: string | null; has_geometry: boolean }[];
  edges: {
    source_id: string;
    relation_type: "HAS_SOURCE_DOCUMENT" | "PLAN_TARGET_RIVER" | "TRIBUTARY_OF" | "PLAN_LISTED_ZONE";
    target_id: string;
    relation_basis: "DATA_LINKED";
    evidence_ref: string | null;
    status: "ACTIVE";
  }[];
  group_counts: { entity_type: string; count: number }[];
}

// ─── 근거 (routers/evidence.py) — T3Q-19·20 ───────────────────────────────

export interface EvidenceReq extends BaseReq {
  evidence_refs?: string[] | null; // ≤50
  object_id?: string | null;
  include_passage?: boolean;
  context_paragraphs?: number; // 0..5 (쓰이지 않음)
  page?: Page;
}
export interface EvidenceItem {
  evidence_ref: string;
  document_id: string | null;
  passage_id: null;
  page: string | null; // "p.N"
  title: string | null;
  short_title: string | null;
  document_type: string | null;
  agency: string | null;
  published_at: null;
  version: null;
  total_pages: null;
  section_path: string | null;
  section_title: null;
  pdf_page: null;
  paragraphs: never[];
  table: {
    caption: string;
    head: string[];
    rows: unknown[][];
    highlighted_row: null;
    totals: Record<string, number | null>;
  } | null;
  quote_type: "TITLE_ONLY" | "SUMMARY" | null;
  ocr_status: null;
  source_availability: "TITLE_ONLY" | "AGGREGATE_ONLY";
  disclosure_level: string;
  download_allowed: false;
  related_object_ids: string[];
  source_row?: { table: string | null; row_no: unknown };
  coverage_note?: string;
}
export interface EvidenceResult {
  object_id?: string;
  total_count?: number;
  items: EvidenceItem[];
}
export interface DocumentFileResult {
  document_id: string;
  file_name: null; content_type: null; size_bytes: null; sha256: null; download_url: null; expires_at: null;
}
export interface DocumentPageResult {
  document_id: string;
  page: number;
  pdf_page: null; total_pages: null; image_url: null; expires_at: null;
}

// ─── 침수 (routers/flood.py) — T3Q-30 ─────────────────────────────────────

export interface FloodTraceReq extends BaseReq {
  flood_trace_ids?: string[] | null; // ≤200
  /** 필터로 쓰이지 않음 */
  event_master_id?: string | null;
  region?: Region | null;
  flood_year?: number | null;
  period?: Period | null;
  page?: Page; // 기본 size 50
}
export interface FloodTraceItem {
  flood_trace_id: string;
  spatial_object_id: string | null;
  district_name: string | null;
  admin_code: string | null;
  event_master_id: null;
  flood_event: { flood_event_id: string; name: string | null } | null;
  flood_grade: null;
  max_depth_m: null;
  avg_flood_depth_raw: number | null;
  avg_flood_depth_unit: string;
  avg_flood_level_m: null;
  area_m2: number | null;
  damage_amount_krw: number | null;
  flood_hours: number | null;
  cause: string | null;
  flood_year: number | null;
  started_on: string | null;
  ended_on: string | null;
  report: null;
  has_geometry: boolean;
}
export interface FloodTraceResult {
  total_count: number | null;
  items: FloodTraceItem[];
  event_master_id?: string;
}

// ─── 공간 (routers/spatial.py) — EXT-01 ───────────────────────────────────

export interface GeoItem {
  ref?: string | null;
  key?: MapKey | (string & {}); // 기본 spatial_object_id
  value: string;
}
export interface GeometryReq extends BaseReq {
  items: GeoItem[]; // 1..300
}
export type GeoPrecision =
  | "exact" | "bbox" | "centroid_only" | "building_center" | "dong_center" | "emd_center" | "sigungu_center" | (string & {});
export interface GeoFeature {
  type: "Feature";
  /** GeoJSON Geometry, EPSG:4326 */
  geometry: { type: string; coordinates: unknown };
  properties: { ref: string | null; key: string; value: string; precision: GeoPrecision | null };
}
export interface GeometryResult {
  type: "FeatureCollection";
  features: GeoFeature[];
  missing: { ref: string | null; value: string; reason: "NOT_FOUND" | "UNKNOWN_KEY" | "BAD_LATLON" }[];
}

// ─── 엔드포인트 맵 (클라이언트 래퍼용) ────────────────────────────────────

export interface T3qEndpoints {
  "POST /v1/agent/query": { req: AgentQueryReq; res: Envelope<AgentQueryResult> | Envelope<AgentAcceptedResult> };
  "GET /v1/agent/query/{request_id}": { req: void; res: AgentPollResponse };
  "POST /v1/agent/query/{request_id}/cancel": { req: CancelReq; res: Envelope<CancelResult> };
  "GET /v1/suggested-questions": { req: SuggestedQuestionsQuery; res: Envelope<SuggestedQuestionsResult> };
  "GET /v1/agent/conversations/{conversation_id}": { req: void; res: Envelope<ConversationStateResult> };
  "DELETE /v1/agent/conversations/{conversation_id}": { req: void; res: Envelope<DeleteConversationResult> };
  "POST /v1/agent/conversations/purge": { req: PurgeReq; res: Envelope<PurgeResult> };
  "POST /v1/agent/feedback": { req: FeedbackReq; res: Envelope<FeedbackResult> };
  "POST /v1/similar-events/search": { req: SimilarSearchReq; res: Envelope<SimilarSearchResult> };
  "GET /v1/events/{event_master_id}": { req: void; res: Envelope<EventDetailResult> };
  "POST /v1/events/{event_master_id}/similarity": { req: SimilarityReq; res: Envelope<SimilarityResult> };
  "GET /v1/events/{event_master_id}/timeline": { req: { page?: number; size?: number }; res: Envelope<TimelineResult> };
  "GET /v1/events/{event_master_id}/damage-response": { req: void; res: Envelope<DamageResponseResult> };
  "GET /v1/events/{event_master_id}/reports": { req: void; res: Envelope<ReportsResult> };
  "GET /v1/events/{event_master_id}/satellite-images": { req: void; res: Envelope<NoSourceEventResult> };
  "GET /v1/events/{event_master_id}/fire-reports": { req: { page?: number; size?: number }; res: Envelope<NoSourceEventResult> };
  "GET /v1/events/{event_master_id}/complaints": { req: { page?: number; size?: number }; res: Envelope<NoSourceEventResult> };
  "POST /v1/risk-knowledge/search": { req: RiskSearchReq; res: Envelope<RiskSearchResult> };
  "GET /v1/risk-objects/{object_id}": { req: void; res: Envelope<RiskObjectResult> };
  "POST /v1/evacuation-facilities/search": { req: EvacuationReq; res: Envelope<NoSourceListResult> };
  "POST /v1/plans/search": { req: PlanSearchReq; res: Envelope<PlanSearchResult> };
  "GET /v1/rivers/{river_id}/plan-knowledge": { req: { station_limit?: number }; res: Envelope<RiverPlanKnowledgeResult> };
  "GET /v1/plans/{plan_id}": { req: void; res: Envelope<PlanDetailResult> };
  "POST /v1/kg/query": { req: KgReq; res: Envelope<KgResult> };
  "POST /v1/evidence/search": { req: EvidenceReq; res: Envelope<EvidenceResult> };
  "GET /v1/documents/{document_id}/file": { req: void; res: Envelope<DocumentFileResult> };
  "GET /v1/documents/{document_id}/pages/{page}": { req: void; res: Envelope<DocumentPageResult> };
  "POST /v1/flood-traces/search": { req: FloodTraceReq; res: Envelope<FloodTraceResult> };
  "POST /v1/flood-maps/search": { req: FloodMapReq; res: Envelope<NoSourceListResult> };
  "POST /v1/spatial-objects/geometry": { req: GeometryReq; res: Envelope<GeometryResult> };
}
