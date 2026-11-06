import { z } from "zod";
import { demoPins, getJob, submitJob } from "@/lib/server/jobs";
import { aimAccount } from "@/lib/server/aiMode";
import { hasDb } from "@/lib/server/db";
import { errText, requireOperator } from "@/lib/server/admin";
import { fail, json, whoami } from "@/lib/server/who";
import { warningsPayload } from "@/lib/wxref";
import { AIM_DEMO, aimAnswerOf, aimDemoById, aimDemoRequest, aimDemoView, aimNoWarnOf } from "@/lib/autoDemoAim";

export const dynamic = "force-dynamic";
export const maxDuration = 30;


/**
 * GET /api/autodemo/aim — 자동 시연 AI 모드 장면의 받아 둔 점검(R54 · 개발서버 demoApi.answer(AIM-…)).
 * 항목마다 받은 시각·받는 중·창에 그릴 점검(AimView). 받는 중이면 그 작업을 한 걸음 진행시킨다(질의 작업은 읽힐 때 진행 — R1)
 */
export async function GET(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  try {
    let pins = await demoPins();
    const moving = AIM_DEMO.filter((it) => pins[it.id]?.pending);
    if (moving.length) {
      await Promise.all(moving.map((it) => getJob(aimAccount(it.adminCode), pins[it.id]!.pending!.id).catch(() => null)));
      pins = await demoPins();
    }
    return json({
      items: AIM_DEMO.map((it) => {
        const p = pins[it.id];
        const job = p?.job ?? null;
        return {
          id: it.id, title: it.title,
          at: job?.finished_at ?? null,
          pending: p?.pending ? { id: p.pending.id, state: p.pending.state } : null,
          view: job ? aimDemoView(it, aimAnswerOf(job.raw), aimNoWarnOf(job.raw)) : null,
        };
      }),
    });
  } catch (e) {
    return fail(500, "AI 모드 시연 답을 읽지 못했습니다. " + errText(e));
  }
}

const Body = z.object({ id: z.string().max(64) });

/** POST /api/autodemo/aim {id} — 가상 특보로 AI 모드 점검을 새로 받아 둔다(운영자 전용 · 개발서버 DemoPinService.FetchAiModeAsync). 받은 답이 성공이면 받아 둔 답을 바꾼다 */
export async function POST(req: Request) {
  const g = await requireOperator(req);
  if (g.res) return g.res;
  const b = Body.safeParse(await req.json().catch(() => null));
  const it = b.success ? aimDemoById(b.data.id) : undefined;
  if (!it) return fail(400, "받을 항목이 없습니다.");
  try {
    const job = await submitJob(aimAccount(it.adminCode), { ...aimDemoRequest(it, warningsPayload), noCache: true, pinId: it.id, pinFresh: true });
    return json({ job: { id: job.id, state: job.state } });
  } catch (e) {
    return fail(500, "AI 모드 시연 답을 받지 못했습니다. " + errText(e));
  }
}
