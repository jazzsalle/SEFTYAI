import { z } from "zod";
import { errText, requireOperator } from "@/lib/server/admin";
import { demoEntries, demoLive, demoRead, demoSet, type DemoModeState } from "@/lib/server/demoMode";
import { fail, json } from "@/lib/server/who";

export const dynamic = "force-dynamic";

const Body = z.object({ on: z.boolean() });

const out = async (state: DemoModeState) => {
  const live = demoLive(state);
  return json({
    state, live, now: new Date().toISOString(),
    remainingSeconds: live && state.until ? Math.max(0, Math.floor((Date.parse(state.until) - Date.now()) / 1000)) : 0,
    entries: await demoEntries(state).catch(() => 0),
  });
};

/** GET /api/admin/demo-mode — 시연 모드 상태(R52, 운영자 전용 — 개발서버 GET /api/demo-mode) */
export async function GET(req: Request) {
  const g = await requireOperator(req);
  if (g.res) return g.res;
  try {
    return await out(await demoRead());
  } catch (e) {
    return fail(500, "시연 모드 상태를 읽지 못했습니다. " + errText(e));
  }
}

/** POST /api/admin/demo-mode {on} — 켜기(48시간 뒤 저절로 꺼짐)·끄기. 어느 쪽이든 들고 있던 응답을 비운다. 관리로그에 남긴다 */
export async function POST(req: Request) {
  const g = await requireOperator(req);
  if (g.res) return g.res;
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return fail(400, "요청 형식이 맞지 않습니다.");
  try {
    return await out(await demoSet(g.who, b.data.on));
  } catch (e) {
    return fail(500, "시연 모드를 바꾸지 못했습니다. " + errText(e));
  }
}
