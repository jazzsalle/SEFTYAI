/**
 * T3Q 시범서비스 API v0.3.0 — zod 4 런타임 스키마 (앱 zod ^4.6.5 — app/package.json:20)
 * 타입 정의는 t3q_types.ts, 근거·설명은 t3q_contract.md.
 *
 * 방침
 * - 요청(송신): z.object (strict 아님) — 서버가 extra="allow" 라 오타가 조용히 무시되므로 우리가 먼저 걸러낸다.
 * - 응답(수신): z.looseObject — 서버가 칸을 더해도 깨지지 않게. 우리가 실제로 쓰는 칸만 정의.
 * - 서버가 null 을 줄 수 있는 칸은 .nullable(), 조건부 칸은 .optional().
 */
import { z } from "zod";

// ─── 공통 봉투 (envelope.py:25-98) ────────────────────────────────────────

export const T3qStatus = z.enum([
  "SUCCESS", "NO_RESULT", "DATA_NOT_AVAILABLE", "PARTIAL_SUCCESS", "FORBIDDEN", "TIMEOUT", "UPSTREAM_ERROR", "PROCESSING",
]);
export const GapReason = z.enum(["NOT_IN_SOURCE", "NOT_YET_BUILT", "SOURCE_NOT_COLLECTED", "CONNECTION_FAILED", "INPUT_NOT_PROVIDED"]);

export const DataGap = z.looseObject({ component: z.string(), reason: GapReason });
export const Warning = z.looseObject({ code: z.string(), message: z.string(), retryable: z.boolean() });
export const Meta = z.looseObject({
  source: z.string(),
  base_time: z.string(),
  quality_status: z.string(),
  disclosure_level: z.string(),
  elapsed_ms: z.number(),
});

/** 봉투 팩토리 — result 스키마를 넣는다 */
export const envelope = <R extends z.ZodType>(result: R) =>
  z.looseObject({
    schema_version: z.literal("2.0"),
    request_id: z.string(),
    correlation_id: z.string(),
    status: T3qStatus,
    conversation_id: z.string().optional(),
    turn_no: z.number().int().optional(),
    result: result.nullable(),
    data_gaps: z.array(DataGap),
    warnings: z.array(Warning),
    meta: Meta,
  });

/** 봉투가 아닌 401·422 (deps.py:11, FastAPI 검증) */
export const FastApiError = z.looseObject({ detail: z.union([z.string(), z.array(z.looseObject({ msg: z.string() }))]) });

/** HTTP 코드 기대값 (envelope.py:29) — 404 는 상세 API 의 NO_RESULT */
export const HTTP_OF_STATUS: Partial<Record<z.infer<typeof T3qStatus>, number>> = {
  TIMEOUT: 504, UPSTREAM_ERROR: 502, FORBIDDEN: 403, PROCESSING: 202,
};

// ─── 공통 요청 (common.py:17-74) ──────────────────────────────────────────

export const Caller = z.object({
  user_id: z.string().nullish(),
  role: z.string().nullish(), // LOCAL_GOV_OFFICER · CENTRAL_GOV_OFFICER · SYSTEM_OPERATOR
  org_admin_code: z.string().nullish(),
});
export const Region = z.object({
  admin_code: z.string().regex(/^\d{2}(\d{3})?(\d{3})?(\d{2})?$/).nullish(), // 2·5·8·10자리
  name: z.string().nullish(),
  level: z.enum(["SIDO", "SIGUNGU", "EMD"]).nullish(),
});
export const Period = z.object({ from: z.string().nullish(), to: z.string().nullish() });
export const ConditionItem = z.enum(["RAIN_1H", "RAIN_3H", "RAIN_6H", "RAIN_12H", "RAIN_24H", "WATER_LEVEL", "FLOW", "WIND_SPEED", "HUMIDITY"]);
export const Condition = z.object({
  item: ConditionItem.nullish(),
  label: z.string().nullish(),
  value: z.number().nullish(),
  unit: z.string().nullish(),
  source_type: z.string().nullish(),
});
export const Detail = z.object({
  warning_kind: z.string().nullish(),
  warning_level: z.string().nullish(),
  keywords: z.array(z.string()).optional(),
  conditions: z.array(Condition).optional(),
});
export const QueryContext = z.object({
  reference_time: z.string().nullish(),
  region: Region.nullish(),
  disaster_types: z.array(z.string()).optional(),
  period: Period.nullish(),
  detail: Detail.nullish(),
});
export const Page = z.object({ page: z.number().int().min(1).optional(), size: z.number().int().min(1).max(100).optional() });
export const BaseReq = z.object({
  request_id: z.string().max(80).nullish(),
  caller: Caller.nullish(),
  conversation_id: z.string().nullish(),
  turn_no: z.number().int().nullish(),
});

// ─── Agent 요청 (agent.py:29-38) ─────────────────────────────────────────

export const QuestionSource = z.enum(["USER", "SUGGEST", "FOLLOW_UP", "QUICK", "BRIEFING", "AI_MODE"]);
export const WeatherWarnings = z.looseObject({
  collect_status: z.string().optional(),
  collected_at: z.string().nullish(),
  source: z.string().optional(),
  items: z.array(z.looseObject({
    warning_key: z.string().optional(),
    kind: z.string().optional(),
    level: z.string().optional(),
    area: z.string().optional(),
    announced_at: z.string().nullish(),
    effective_at: z.string().nullish(),
    change: z.string().nullish(),
  })).optional(),
});
export const AgentQueryReq = BaseReq.extend({
  question: z.string().min(1).max(4000),
  question_source: QuestionSource.optional(),
  query_context: QueryContext.nullish(),
  reference: z.record(z.string(), z.unknown()).nullish(),
  response_mode: z.enum(["SYNC", "ASYNC"]).optional(),
  briefing: z.object({
    preset_id: z.string().optional(),
    briefing_item_id: z.string().optional(),
    item_no: z.number().int().optional(),
    item_total: z.number().int().optional(),
  }).nullish(),
  quick_query_id: z.string().nullish(),
  ai_mode: z.object({
    check_id: z.string().optional(),
    trigger: z.string().optional(),
    interval_min: z.number().optional(),
    prompt_id: z.string().optional(),
  }).nullish(),
  weather_warnings: WeatherWarnings.nullish(),
});

// ─── Agent 응답 (agent.py:54-66, 102-152) ────────────────────────────────

export const AgentRef = z.looseObject({
  ref: z.string(),
  entity_type: z.string().nullable(),
  display_name: z.string().nullable(),
  map: z.looseObject({ key: z.string().nullable(), value: z.string(), draw: z.string() }),
});

export const AgentQueryResult = z.looseObject({
  response_id: z.string(),
  question: z.string(),
  question_source: z.string(),
  answer: z.string().nullable(),
  answer_format: z.literal("MARKDOWN"),
  entities: z.array(z.unknown()),
  result_groups: z.array(z.unknown()),
  evidence_refs: z.array(z.unknown()),
  follow_up_questions: z.array(z.unknown()),
  refs: z.array(AgentRef),
  conversation_title: z.string().nullable(),
  limitations: z.array(z.string()),
  context_used: z.looseObject({}),
  briefing_item: z.looseObject({
    briefing_item_id: z.string().nullable(),
    item_status: z.string(),
    summary: z.string().nullable(),
    count: z.number().nullable(),
  }).optional(),
  manual: z.unknown().optional(),
  action_items: z.array(z.unknown()).optional(),
  action_item_total: z.number().nullable().optional(),
  check_id: z.string().nullable().optional(),
  checked_at: z.string().optional(),
  region: z.looseObject({ admin_code: z.string().nullable(), name: z.string().nullable() }).nullable().optional(),
  priority_review: z.unknown().optional(),
  warning_guides: z.array(z.unknown()).optional(),
  no_warning_message: z.string().nullable().optional(),
  info_gaps: z.array(z.unknown()).optional(),
});

export const AgentAcceptedResult = z.looseObject({ request_id: z.string(), poll: z.string() });
export const AgentJobResult = z.looseObject({
  request_id: z.string(),
  job_status: z.enum(["RUNNING", "CANCELLED", "NOT_FOUND"]),
  started_at: z.string().optional(),
});

export const AgentQueryEnvelope = envelope(AgentQueryResult);
export const AgentAcceptedEnvelope = envelope(AgentAcceptedResult);
export const AgentJobEnvelope = envelope(AgentJobResult);

/**
 * EXT-02 폴링 응답 판별 — result 에 job_status 가 있으면 진행/취소/미발견, 아니면 완료(T3Q-01 응답).
 * 502 UPSTREAM_ERROR 완료본은 result=null 이므로 AgentQueryEnvelope 로 통과한다.
 */
export function parsePoll(json: unknown) {
  const job = AgentJobEnvelope.safeParse(json);
  if (job.success && job.data.result && "job_status" in job.data.result) return { kind: "job" as const, data: job.data };
  return { kind: "final" as const, data: AgentQueryEnvelope.parse(json) };
}

export const CancelReq = BaseReq.extend({ reason: z.string().optional() });
export const CancelResult = z.looseObject({
  request_id: z.string(),
  cancel_result: z.enum(["CANCELLED", "ALREADY_COMPLETED", "NOT_FOUND"]),
  cancelled_at: z.string().nullable(),
});

export const SuggestedQuestionsResult = z.looseObject({
  capability_set_version: z.string(),
  items: z.array(z.looseObject({
    question_id: z.string(), group: z.string(), group_label: z.string(), text: z.string(), data_api: z.string(),
  })),
});

export const ConversationStateResult = z.looseObject({
  conversation_id: z.string(),
  context_mode: z.literal("STATEFUL"),
  context_status: z.enum(["ACTIVE", "EXPIRED", "NOT_FOUND"]),
  last_turn_no: z.number().int().optional(),
  last_activity_at: z.string().optional(),
  expires_at: z.string().optional(),
  context_idle_timeout_hours: z.number().optional(),
  expired_at: z.string().optional(),
  resume_requirement: z.string().optional(),
});

export const PurgeReq = BaseReq.extend({
  conversation_ids: z.array(z.string()).min(1).max(200),
  reason: z.enum(["USER_REQUEST", "RETENTION_EXPIRED"]).optional(),
});
export const DeleteResultItem = z.looseObject({
  conversation_id: z.string(),
  delete_result: z.enum(["DELETED", "NOT_FOUND"]),
  deleted_at: z.string().nullable(),
});
export const PurgeResult = z.looseObject({ items: z.array(DeleteResultItem) });

export const FeedbackReq = BaseReq.extend({
  response_id: z.string().min(1).max(80),
  rating: z.enum(["GOOD", "BAD"]),
  comment: z.string().max(1000).nullish(),
  rated_at: z.string().nullish(),
});
export const FeedbackResult = z.looseObject({ response_id: z.string(), feedback_result: z.enum(["ACCEPTED", "UPDATED"]) });

// ─── Data 요청 ───────────────────────────────────────────────────────────

export const SimilarSearchReq = BaseReq.extend({ event_master_ids: z.array(z.string()).nullish(), query_context: QueryContext.nullish(), page: Page.optional() });
export const SimilarityReq = BaseReq.extend({ query_context: QueryContext.nullish(), reference_event_id: z.string().nullish() });
export const RiskSearchReq = BaseReq.extend({
  data_group: z.enum(["RISK_AREA", "RISK_FACTOR_FACILITY"]).nullish(),
  object_ids: z.array(z.string()).nullish(),
  region: Region.nullish(),
  categories: z.array(z.string()).nullish(),
  page: Page.optional(),
});
export const PlanSearchReq = BaseReq.extend({
  plan_ids: z.array(z.string()).nullish(),
  region: Region.nullish(),
  plan_types: z.array(z.enum(["하천기본계획", "위험지구 정비계획"])).nullish(),
  river_code: z.string().nullish(),
  keyword: z.string().nullish(),
  page: Page.optional(),
});
export const KgReq = BaseReq.extend({
  source_ids: z.array(z.string()).min(1).max(20),
  relation_types: z.array(z.string()).nullish(),
  target_entity_types: z.array(z.string()).nullish(),
  depth: z.union([z.literal(1), z.literal(2)]).optional(),
});
export const EvidenceReq = BaseReq.extend({
  evidence_refs: z.array(z.string()).max(50).nullish(),
  object_id: z.string().nullish(),
  include_passage: z.boolean().optional(),
  context_paragraphs: z.number().int().min(0).max(5).optional(),
  page: Page.optional(),
});
export const FloodTraceReq = BaseReq.extend({
  flood_trace_ids: z.array(z.string()).max(200).nullish(),
  event_master_id: z.string().nullish(),
  region: Region.nullish(),
  flood_year: z.number().int().nullish(),
  period: Period.nullish(),
  page: Page.optional(),
});
export const GeoItem = z.object({ ref: z.string().nullish(), key: z.string().optional(), value: z.string() });
export const GeometryReq = BaseReq.extend({ items: z.array(GeoItem).min(1).max(300) });

// ─── Data 응답 (자주 쓰는 것) ────────────────────────────────────────────

const AdminArea = z.looseObject({ admin_code: z.string().nullable(), name: z.string().nullable() });
const Similarity = z.looseObject({
  rank: z.number().nullable(), score: z.number(), scale: z.string(), algorithm_version: z.string().nullable(), coverage: z.number().nullish(),
});
const Grade = z.looseObject({ value: z.string().nullable(), status: z.enum(["PROVIDED", "NOT_PROVIDED"]) });

export const SimilarSearchResult = z.looseObject({
  total_count: z.number(),
  items: z.array(z.looseObject({
    event_master_id: z.string(),
    display_name: z.string(),
    disaster_types: z.array(z.string().nullable()),
    lifecycle_status: z.string().nullable(),
    started_at: z.string().nullable(),
    ended_at: z.string().nullable(),
    similarity: Similarity.nullable(),
    representative_admin_area: AdminArea.nullable(),
    has_geometry: z.boolean(),
  })),
});

export const EventDetailResult = z.looseObject({
  event_master_id: z.string(),
  display_name: z.string(),
  disaster_types: z.array(z.string().nullable()),
  disaster_type_code: z.string(),
  lifecycle_status: z.string().nullable(),
  time_profile: z.looseObject({ started_at: z.string().nullable(), ended_at: z.string().nullable() }),
  representative_admin_area: AdminArea.nullable(),
  affected_admin_areas: z.array(AdminArea),
  lead_agency: z.string().nullable(),
  event_summary: z.string(),
  available_sections: z.record(z.string(), z.boolean()),
  evidence_refs: z.array(z.string()),
});

export const SimilarityResult = z.looseObject({
  event_master_id: z.string(),
  similarity: Similarity.nullable(),
  contributions: z.array(z.looseObject({ factor_group: z.string(), contribution_points: z.number(), contribution_pct: z.number() })).optional(),
  similarity_reasons: z.array(z.string()).optional(),
  factors: z.array(z.looseObject({
    factor_group: z.string(), factor_key: z.string(), factor: z.string(), unit: z.string().nullable(),
    current_value: z.unknown(), past_value: z.unknown(), match: z.number().nullable(), weight_used: z.number(), contribution: z.number(),
  })).optional(),
  factor_groups_not_provided: z.array(z.string()).optional(),
  disclaimer: z.string().optional(),
});

export const TimelineResult = z.looseObject({
  event_master_id: z.string(),
  total_count: z.number().nullable(),
  items: z.array(z.looseObject({
    seq: z.number(), occurred_at: z.string(), elapsed_hours: z.number().nullable(), category: z.string(),
    description: z.string(), agency: z.string().nullable(), source_ref: z.string(), relation_basis: z.string(),
  })),
});

export const RiskItem = z.looseObject({
  object_id: z.string(),
  spatial_object_id: z.string().nullable(),
  data_group: z.enum(["RISK_AREA", "RISK_FACTOR_FACILITY"]),
  category: z.string(),
  type: z.string().nullable(),
  name: z.string(),
  grade: Grade,
  address: z.string().nullable(),
  admin_code: z.string().nullable(),
  admin_name: z.string().nullable(),
  has_geometry: z.boolean(),
});
export const RiskSearchResult = z.looseObject({
  total_count: z.number(),
  category_counts: z.array(z.looseObject({ category: z.string(), count: z.number() })),
  items: z.array(RiskItem),
});

export const RiskObjectResult = z.looseObject({
  object_id: z.string(),
  spatial_object_id: z.string().nullable(),
  data_group: z.string(),
  category: z.string(),
  name: z.string().nullable(),
  admin_area: AdminArea,
  address: z.string().nullable(),
  risk: z.looseObject({
    grade: Grade,
    attributes: z.array(z.looseObject({ key: z.string(), label: z.string(), value: z.unknown(), evidence_ref: z.string().nullable() })),
  }),
  management: z.looseObject({ agency: z.string().nullable() }),
  basis: z.looseObject({
    related_plans: z.array(z.looseObject({ plan_id: z.string(), name: z.string().nullable() })),
    related_documents: z.array(z.looseObject({ title: z.string(), evidence_ref: z.string() })),
  }),
});

export const FloodTraceResult = z.looseObject({
  total_count: z.number().nullable(),
  items: z.array(z.looseObject({
    flood_trace_id: z.string(),
    spatial_object_id: z.string().nullable(),
    district_name: z.string().nullable(),
    admin_code: z.string().nullable(),
    flood_year: z.number().nullable(),
    has_geometry: z.boolean(),
  })),
});

export const EvidenceResult = z.looseObject({
  items: z.array(z.looseObject({
    evidence_ref: z.string(),
    document_id: z.string().nullable(),
    page: z.string().nullable(),
    title: z.string().nullable(),
    document_type: z.string().nullable(),
    source_availability: z.enum(["TITLE_ONLY", "AGGREGATE_ONLY"]),
    related_object_ids: z.array(z.string()),
  })),
  object_id: z.string().optional(),
  total_count: z.number().optional(),
});

export const KgResult = z.looseObject({
  nodes: z.array(z.looseObject({ id: z.string(), entity_type: z.string(), name: z.string().nullable(), has_geometry: z.boolean() })),
  edges: z.array(z.looseObject({ source_id: z.string(), relation_type: z.string(), target_id: z.string(), relation_basis: z.string() })),
  group_counts: z.array(z.looseObject({ entity_type: z.string(), count: z.number() })),
});

export const GeometryResult = z.looseObject({
  type: z.literal("FeatureCollection"),
  features: z.array(z.looseObject({
    type: z.literal("Feature"),
    geometry: z.looseObject({ type: z.string(), coordinates: z.unknown() }),
    properties: z.looseObject({ ref: z.string().nullable(), key: z.string(), value: z.string(), precision: z.string().nullable() }),
  })),
  missing: z.array(z.looseObject({ ref: z.string().nullable(), value: z.string(), reason: z.enum(["NOT_FOUND", "UNKNOWN_KEY", "BAD_LATLON"]) })),
});

/** 늘 DATA_NOT_AVAILABLE 인 API(T3Q-20·32·33·34·35·36·13 reports) — 형태만 느슨하게 */
export const NoSourceResult = z.looseObject({ total_count: z.null().optional(), items: z.array(z.unknown()).optional() });

// ─── 지도 키 변환 (t3q_contract.md §8.4 — 소스 대조 결과, ⚠ 실측 확인 필요) ──────

/** 목록·상세의 spatial_object_id/object_id → EXT-01 GeoItem */
export function toGeoItem(id: string, ref?: string): z.infer<typeof GeoItem> | null {
  if (id.startsWith("FT-")) return { ref, key: "spatial_object_id", value: id }; // spatial.py:80-81
  if (id.startsWith("SL-")) return { ref, key: "slope_no", value: id.slice(3) };
  if (id.startsWith("LS-")) return { ref, key: "landslide_area_id", value: id.slice(3) };
  if (id.startsWith("UP-")) return { ref, key: "underpass_id", value: id.slice(3) }; // 동 중심 근사
  if (id.startsWith("RV-")) return { ref, key: "river_code", value: id.slice(3) };
  return null; // HZ- 등 도형 키 없음
}
