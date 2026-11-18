/**
 * 화면 공용 타입 — 기준지역·재난유형·기상특보(기상청)·매뉴얼 원문 인용.
 * T3Q 계약은 `lib/t3q/schemas.ts` 가 정본이다 (이전 가정 응답 계약 AgentResponse 등은 삭제 — R0·R15).
 */
import { z } from "zod";

export const RegionId = z.enum(["national", "busan", "yeongcheon", "inje"]);
export type RegionId = z.infer<typeof RegionId>;

export const DisasterType = z.enum(["전체", "호우", "태풍", "홍수", "침수", "산사태", "대설", "강풍"]);
export type DisasterType = z.infer<typeof DisasterType>;

/** 행동매뉴얼 원문 뷰어 인용 (대응절차 보존 기능) */
export const Citation = z.object({
  id: z.string(),
  docId: z.string(),
  title: z.string(),
  kind: z.enum(["매뉴얼", "기상특보"]),
  page: z.number().optional(),
  locator: z.string().optional(),
  quote: z.string().optional(),
});
export type Citation = z.infer<typeof Citation>;

/** 기상특보 — 기상청 기상특보 조회서비스 실시간 (R6). scenario = 시연 시나리오 특보(R43 — 운영자가 켠 동안 시연 계정에만, 서버 /api/weather 가 기상청 실시간 대신 준다 — R45) */
export const Advisory = z.object({
  id: z.string(),
  type: z.string(),
  level: z.enum(["경보", "주의보", "예비특보"]),
  /** 기준지역 맞추기 글(lib/wxMatch 가 읽는 「시·도(구역)」 꼴) — 특보코드(getPwnCd) 구역이면 lib/wxPwn zoneArea 로 만든 것 */
  area: z.string(),
  regionId: RegionId.optional(),
  /** 줄 차례·「답을 받은 뒤 특보」에 쓰는 대표 시각 = 발효 시각, 없으면 발표 시각(특보 현황 글로 받았으면 현황 한 장의 발표 시각) */
  issuedAt: z.string(),
  status: z.enum(["발효", "예비", "해제", "변경"]),
  text: z.string().optional(),
  isNew: z.boolean().optional(),
  scenario: z.boolean().optional(),
  // ── 특보코드조회(getPwnCd) 구역 단위 칸(개발 서버 WarningItem) — 특보 현황 글(getPwnStatus)로만 받았으면 없다(화면은 「미제공」) ──
  /** 특보구역 코드(L1022920 · S1131100). 시연 특보는 행정구역 코드(개발서버 가상 특보와 같이) */
  areaCode: z.string().optional(),
  /** 기상청 구역 이름 그대로(「인제군산지」 「부산동부」) — 화면에 적는 이름 */
  areaName: z.string().optional(),
  /** 발효 시각(startTime) */
  effectiveAt: z.string().nullable().optional(),
  /** 발표 시각(tmFc) */
  announcedAt: z.string().nullable().optional(),
  /** 신규 · 변경(같은 구역·종류에 앞의 특보가 있었다 — 격상·격하·연장) */
  changeType: z.string().nullable().optional(),
  /** 해상 특보구역(S…) */
  sea: z.boolean().optional(),
});
export type Advisory = z.infer<typeof Advisory>;

export const WeatherResponse = z.object({
  mode: z.literal("live"),
  status: z.object({ ok: z.boolean(), fetchedAt: z.string(), message: z.string() }),
  advisories: z.array(Advisory),
  preliminary: z.array(z.object({ text: z.string(), at: z.string() })),
  /** 이 응답을 받은 로그인 계정(/api/weather — 화면이 자기 계정과 견준다, R43). 서버 안에서 쓰는 값에는 없다 */
  accountId: z.string().optional(),
  /** 시연 시나리오를 켠 동안의 시연 계정 — 기상청 실시간 특보(예비특보 포함)를 부르지 않고 시나리오 특보만 담았다(R45, lib/scenario scenarioWeather). 끊지 않으면 없다 */
  realtimeCut: z.boolean().optional(),
  /** 특보발효현황 시각(getPwnStatus tmEf) — 현황에 없어 닫은 특보의 해제 시각(상세 상태이력). 받지 못했으면 없다 */
  statusAt: z.string().optional(),
});
export type WeatherResponse = z.infer<typeof WeatherResponse>;
