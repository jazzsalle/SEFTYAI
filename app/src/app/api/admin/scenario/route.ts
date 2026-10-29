import { z } from "zod";
import { SCN_REGIONS, scenarioLive, type ScenarioState } from "@/lib/scenario";
import { errText, requireOperator } from "@/lib/server/admin";
import { ScenarioInputError, scenarioRead, scenarioSet } from "@/lib/server/scenario";
import { fail, json } from "@/lib/server/who";

export const dynamic = "force-dynamic";

const Body = z.object({
  on: z.boolean(),
  /** 끝나는 시각(ISO) — 켤 때 필요 */
  until: z.string().max(40).optional(),
  regions: z.array(z.enum(SCN_REGIONS as [string, ...string[]])).max(3).optional(),
});

const out = (state: ScenarioState) => json({ state, live: scenarioLive(state), now: new Date().toISOString() });

/** GET /api/admin/scenario — 시연 시나리오 특보 켜짐 상태(R43, 운영자 전용) */
export async function GET(req: Request) {
  const g = await requireOperator(req);
  if (g.res) return g.res;
  try {
    return out(await scenarioRead());
  } catch (e) {
    return fail(500, "시연 시나리오 상태를 읽지 못했습니다. " + errText(e));
  }
}

/** POST /api/admin/scenario {on, until?, regions?} — 켜기(끝나는 시각·지역)·끄기. 관리로그에 남긴다 */
export async function POST(req: Request) {
  const g = await requireOperator(req);
  if (g.res) return g.res;
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return fail(400, "요청 형식이 맞지 않습니다.");
  try {
    return out(await scenarioSet(g.who, { on: b.data.on, until: b.data.until, regions: b.data.regions as ScenarioState["regions"] | undefined }));
  } catch (e) {
    if (e instanceof ScenarioInputError) return fail(400, e.message);
    return fail(500, "시연 시나리오를 바꾸지 못했습니다. " + errText(e));
  }
}
