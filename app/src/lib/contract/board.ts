import { z } from "zod";
import { Advisory, Citation, EntityRef, RegionId, WeatherMode } from "./agent";

/** 시작 화면 상황판 — GET /api/board?region=&mode= */
export const BoardResponse = z.object({
  region: RegionId,
  mode: WeatherMode,
  baseTime: z.string(),
  scenarioLabel: z.string().optional(),
  advisory: Advisory.nullable(),
  stage: z
    .object({ name: z.string(), level: z.string(), step: z.number(), steps: z.array(z.string()), trigger: z.string(), manualId: z.string(), manualTitle: z.string() })
    .nullable(),
  todo: z.array(z.object({ seq: z.number(), task: z.string(), owner: z.string().optional(), due: z.string().optional() })),
  topRisks: z.array(EntityRef),
  feed119: z.array(z.object({ t: z.string(), text: z.string(), entity: EntityRef })),
  rain: z.object({ label: z.string(), series: z.array(z.object({ t: z.string(), mm: z.number() })), thresholds: z.array(z.object({ mm: z.number(), label: z.string(), basis: z.enum(["1h", "total"]) })) }),
  event: EntityRef.nullable(),
  counts: z.object({ risk: z.number(), events: z.number(), reports119: z.number(), damages: z.number() }),
  suggestions: z.array(z.object({ kicker: z.string(), q: z.string(), preset: z.string().optional() })),
  citations: z.array(Citation),
});
export type BoardResponse = z.infer<typeof BoardResponse>;
