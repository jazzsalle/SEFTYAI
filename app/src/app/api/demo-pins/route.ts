import { clearDemoPin, demoPins } from "@/lib/server/jobs";
import { hasDb } from "@/lib/server/db";
import { fail, json, whoami } from "@/lib/server/who";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET /api/demo-pins — 질문 모음 「시연」 항목별 고정 답 상태(받은 시각·받는 중) */
export async function GET(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  const pins = await demoPins();
  return json({
    pins: Object.fromEntries(
      Object.entries(pins).map(([k, v]) => [k, { at: v.job?.finished_at ?? null, jobId: v.job?.id ?? null, pending: v.pending ? { id: v.pending.id, state: v.pending.state } : null }]),
    ),
  });
}

/** DELETE /api/demo-pins?id=… — 받아 둔 답 지우기(질문은 남고 「응답 대기」로). 받아 둔 답은 계정 구분 없이 하나라 개발서버처럼 로그인한 사람이면 지울 수 있다 */
export async function DELETE(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id || id.length > 64) return fail(400, "지울 항목이 없습니다.");
  return (await clearDemoPin(id)) ? json({ ok: true }) : fail(404, "받아 둔 답이 없습니다.");
}
