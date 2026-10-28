import { getJob, jobSummary } from "@/lib/server/jobs";
import { hasDb } from "@/lib/server/db";
import { fail, json, whoami } from "@/lib/server/who";
import { maskSensitive } from "@/lib/server/convStore";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET /api/agent/jobs/{id}?full=1 — 상태(필요하면 T3Q 한 번 폴링). 완료면 full=1 로 원응답(raw·preview·geo)까지 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  const { id } = await ctx.params;
  const job = await getJob(who, id);
  if (!job) return fail(404, "질의를 찾을 수 없습니다.");
  const full = new URL(req.url).searchParams.get("full") === "1";
  // 운영자가 다른 계정의 작업을 볼 때는 질문 속 개인정보를 가린다(보낸 요청 원문 포함)
  const other = job.account_id !== who.id;
  const shown = other
    ? { ...job, question_user: maskSensitive(job.question_user), question_sent: maskSensitive(job.question_sent), request: { ...job.request, question: maskSensitive(String(job.request?.question ?? "")) } }
    : job;
  return json({ job: full ? shown : { ...jobSummary(shown), hasPreview: job.preview != null } });
}
