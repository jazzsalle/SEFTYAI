import { cancelJob, jobSummary } from "@/lib/server/jobs";
import { fail, json, whoami } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/** POST /api/agent/jobs/{id}/cancel — 취소 (T3Q Agent 는 서버에서 잠시 더 돈다 — R8) */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  const { id } = await ctx.params;
  const job = await cancelJob(who, id);
  if (!job) return fail(404, "질의를 찾을 수 없습니다.");
  return json({ job: jobSummary(job) });
}
