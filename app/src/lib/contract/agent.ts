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
  area: z.string(),
  regionId: RegionId.optional(),
  issuedAt: z.string(),
  status: z.enum(["발효", "예비", "해제", "변경"]),
  text: z.string().optional(),
  isNew: z.boolean().optional(),
  scenario: z.boolean().optional(),
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
});
export type WeatherResponse = z.infer<typeof WeatherResponse>;
