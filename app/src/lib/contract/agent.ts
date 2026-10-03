/**
 * T3Q Agent API 계약 (유엔이 ↔ T3Q) — 시범서비스 기준
 * Mock 서버(/api/agent/*)는 응답을 이 스키마로 자체 검증한다.
 * 실 API 전환 시 base URL만 교체하고 동일 스키마 통과를 확인한다.
 */
import { z } from "zod";

export const RegionId = z.enum(["national", "busan", "yeongcheon", "inje"]);
export type RegionId = z.infer<typeof RegionId>;

export const DisasterType = z.enum(["전체", "호우", "태풍", "홍수", "침수", "산사태", "대설", "강풍"]);
export type DisasterType = z.infer<typeof DisasterType>;

export const WeatherMode = z.enum(["scenario", "live"]);
export type WeatherMode = z.infer<typeof WeatherMode>;

/** 재난상황 조건 (QueryContext) — 모든 질의에 동봉 */
export const QueryContext = z.object({
  region: RegionId,
  sigungu: z.string().optional(),
  emd: z.string().optional(),
  /** 재난유형 — 선택하지 않으면 생략 (조건 없는 일반 질의) */
  disasterType: DisasterType.optional(),
  baseTime: z.string(), // ISO
  /** AI 모드 : 켜져 있으면 현재 발효 특보를 기준으로 상황을 판단 (끄면 사용자 입력 조건만) */
  aiMode: z.boolean().optional(),
  endTime: z.string().optional(),
  mode: WeatherMode,
  advisory: z
    .object({ type: z.string(), level: z.string(), issuedAt: z.string(), area: z.string() })
    .optional(),
  refEntity: z.object({ type: z.string(), id: z.string(), name: z.string() }).optional(),
  hydro: z
    .object({
      rain1h: z.number().optional(),
      rain3h: z.number().optional(),
      rain6h: z.number().optional(),
      rain12h: z.number().optional(),
      rain24h: z.number().optional(),
      flow: z.number().optional(),
      wind: z.number().optional(),
      humidity: z.number().optional(),
      rainTotal: z.number().optional(),
      waterLevel: z.number().optional(),
      waterStation: z.string().optional(),
      tide: z.boolean().optional(),
    })
    .optional(),
  keywords: z.array(z.string()).optional(),
  /** 상황 성격 (조건 변경 · 상황 상세정보) */
  situationKind: z.object({ type: z.string().optional(), level: z.string().optional() }).optional(),
  /** 재난상황 조건 시나리오 (직접 입력 프리셋) */
  scenarioId: z.string().optional(),
  /** AI 모드 상황점검 : 직전 점검 시각 (변화량 비교) */
  prevCheckAt: z.string().optional(),
  /** [특보로 질문] 참조 특보 — 조건이 아닌 참조 정보로 질문과 함께 전달 (UFR-001-001-04) */
  refAdvisory: z
    .object({ id: z.string().optional(), type: z.string(), level: z.string(), area: z.string(), issuedAt: z.string(), regionId: RegionId.optional() })
    .optional(),
});
export type QueryContext = z.infer<typeof QueryContext>;

export const AgentRequest = z.object({
  sessionId: z.string(),
  question: z.string().min(1).max(2000),
  context: QueryContext,
  presetKey: z.string().optional(), // 브리핑·칩 프리셋 질의
});
export type AgentRequest = z.infer<typeof AgentRequest>;

/** 객체 참조 — 지도·상세·칩 연계 키 */
export const EntityType = z.enum([
  "risk", // 위험·취약지역/시설
  "river",
  "event", // 재난마스터 사건
  "report119",
  "damage", // 재해대장/침수피해
  "doc", // 계획지식·매뉴얼 문서
  "advisory",
  "region",
]);
export type EntityType = z.infer<typeof EntityType>;

export const EntityRef = z.object({
  type: EntityType,
  id: z.string(),
  name: z.string(),
  category: z.string().optional(), // 급경사지, 지하차도 …
  lon: z.number().optional(),
  lat: z.number().optional(),
  summary: z.string().optional(),
  metric: z.string().optional(), // 목록 우측 표시값 (등급, 유사도 등)
  level: z.enum(["high", "mid", "low", "info"]).optional(),
});
export type EntityRef = z.infer<typeof EntityRef>;

export const Citation = z.object({
  id: z.string(), // c1, c2 …
  docId: z.string(),
  title: z.string(),
  kind: z.enum(["매뉴얼", "계획문서", "재해대장", "119신고", "상황보고", "기상특보", "데이터셋", "정비계획"]),
  page: z.number().optional(),
  locator: z.string().optional(), // 시트·행, 절 제목 등
  quote: z.string().optional(),
  dataset: z.string().optional(), // ★ 원천 데이터셋 명
});
export type Citation = z.infer<typeof Citation>;

const Fact = z.object({
  label: z.string(),
  value: z.string(),
  unit: z.string().optional(),
  note: z.string().optional(),
  tone: z.enum(["danger", "warn", "ok", "info"]).optional(),
  cite: z.array(z.string()).optional(),
});

const ActionItem = z.object({
  seq: z.number(),
  task: z.string(),
  owner: z.string().optional(),
  due: z.string().optional(),
  cite: z.array(z.string()).optional(),
  entityIds: z.array(z.string()).optional(),
});

export const AnswerBlock = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("headline"), text: z.string() }),
  z.object({ kind: z.literal("facts"), title: z.string().optional(), items: z.array(Fact) }),
  z.object({ kind: z.literal("narrative"), title: z.string().optional(), paragraphs: z.array(z.string()) }),
  z.object({
    kind: z.literal("actions"),
    title: z.string(),
    stage: z.object({ name: z.string(), level: z.string().optional(), trigger: z.string().optional() }),
    items: z.array(ActionItem),
    manualId: z.string().optional(),
  }),
  z.object({
    kind: z.literal("results"),
    groups: z.array(z.object({ key: z.string(), label: z.string(), total: z.number(), items: z.array(EntityRef) })),
  }),
  z.object({
    kind: z.literal("similar"),
    items: z.array(
      z.object({
        eventId: z.string(),
        title: z.string(),
        score: z.number(),
        breakdown: z.object({ weather: z.number(), space: z.number(), damage: z.number(), response: z.number() }),
        summary: z.string(),
        reasons: z.array(z.string()),
      }),
    ),
  }),
  z.object({
    kind: z.literal("timeline"),
    title: z.string(),
    items: z.array(z.object({ at: z.string(), label: z.string(), text: z.string(), kind: z.string(), cite: z.array(z.string()).optional() })),
  }),
  z.object({
    kind: z.literal("rainChart"),
    title: z.string(),
    current: z.object({ label: z.string(), series: z.array(z.object({ t: z.string(), mm: z.number() })) }),
    thresholds: z.array(z.object({ mm: z.number(), label: z.string(), eventId: z.string().optional(), basis: z.enum(["1h", "total"]) })),
  }),
  z.object({ kind: z.literal("notice"), tone: z.enum(["info", "warn", "danger"]), text: z.string() }),
  z.object({
    kind: z.literal("briefing"),
    items: z.array(z.object({ key: z.string(), label: z.string(), summary: z.string(), count: z.string(), status: z.enum(["ok", "fail"]), question: z.string() })),
  }),
]);
export type AnswerBlock = z.infer<typeof AnswerBlock>;

export const AgentResponse = z.object({
  requestId: z.string(),
  answeredAt: z.string(),
  intent: z.string(),
  status: z.enum(["ok", "partial", "clarify", "error"]),
  title: z.string(), // 대화 제목 제안
  blocks: z.array(AnswerBlock),
  entities: z.array(EntityRef), // 본문 {{e:id}} 토큰이 참조
  citations: z.array(Citation),
  followUps: z.array(z.string()),
  mapFocus: z.object({ entityIds: z.array(z.string()) }).optional(),
  /** 이어서 질문하기 기준 객체 (후속 질의 refEntity 로 전달) */
  focusEntity: EntityRef.optional(),
  /** 정합성 검증 ① : Agent가 받은 질의를 그대로 되돌려 줌 (보낸 질의와 필드 단위 대조) */
  requestEcho: z.object({ question: z.string(), presetKey: z.string().optional(), context: QueryContext }).optional(),
  /** 정합성 검증 ① : Agent가 질의를 어떻게 해석했는지 (의도·지역·재난유형·판단 기준) */
  interpretation: z
    .object({
      intent: z.string(),
      region: RegionId,
      disasterType: z.string().optional(),
      /** 판단 기준 : AI 모드(현재 특보) · 참조 특보 · 입력 조건 · 조건 없음 */
      basis: z.enum(["ai-mode", "ref-advisory", "conditions", "none"]),
      refEntityId: z.string().optional(),
      targetTypes: z.array(z.string()),
    })
    .optional(),
  error: z.object({ code: z.enum(["TIMEOUT", "UNAVAILABLE", "BAD_REQUEST", "NO_DATA"]), message: z.string() }).optional(),
  trace: z.object({ apis: z.array(z.string()), datasets: z.array(z.string()), elapsedMs: z.number() }),
});
export type AgentResponse = z.infer<typeof AgentResponse>;

/** 상세정보조회 응답 (객체 유형 공통) */
export const DetailField = z.object({ label: z.string(), value: z.string(), cite: z.array(z.string()).optional() });
export const DetailResponse = z.object({
  type: EntityType,
  id: z.string(),
  title: z.string(),
  category: z.string().optional(),
  badges: z.array(z.object({ text: z.string(), tone: z.enum(["danger", "warn", "ok", "info", "neutral"]) })),
  /** 위험·취약 객체 : 어디/왜/언제/무엇을 */
  w4: z
    .object({
      where: z.string(),
      why: z.string(),
      when: z.string(),
      what: z.array(z.string()),
    })
    .optional(),
  sections: z.array(z.object({ key: z.string(), label: z.string(), fields: z.array(DetailField) })),
  timeline: z.array(z.object({ at: z.string(), label: z.string(), text: z.string(), kind: z.string() })).optional(),
  related: z.array(EntityRef),
  citations: z.array(Citation),
  geometry: z.object({ lon: z.number(), lat: z.number() }).optional(),
  sources: z.array(z.string()),
});
export type DetailResponse = z.infer<typeof DetailResponse>;

export const Advisory = z.object({
  id: z.string(),
  type: z.string(), // 호우, 태풍, 강풍 …
  level: z.enum(["경보", "주의보", "예비특보"]),
  area: z.string(),
  regionId: RegionId.optional(),
  issuedAt: z.string(),
  status: z.enum(["발효", "예비", "해제", "변경"]),
  text: z.string().optional(),
  isNew: z.boolean().optional(),
});
export type Advisory = z.infer<typeof Advisory>;

export const WeatherResponse = z.object({
  mode: WeatherMode,
  scenario: z.object({ id: z.string(), label: z.string(), eventId: z.string(), baseTime: z.string() }).optional(),
  status: z.object({ ok: z.boolean(), fetchedAt: z.string(), message: z.string() }),
  advisories: z.array(Advisory),
  preliminary: z.array(z.object({ text: z.string(), at: z.string() })),
});
export type WeatherResponse = z.infer<typeof WeatherResponse>;
