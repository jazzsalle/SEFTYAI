import { jobSummary, retryJob } from "@/lib/server/jobs";
import { hasDb } from "@/lib/server/db";
import { fail, json, whoami } from "@/lib/server/who";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** POST /api/agent/jobs/{id}/retry — 같은 요청(문맥 포함)으로 다시 질의. 화면은 그 턴의 작업 ID 를 새 작업으로 바꾼다 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (who.mustChangePw) return fail(403, "초기 비밀번호를 먼저 바꿔 주세요.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  const { id } = await ctx.params;
  const job = await retryJob(who, id);
  if (!job) return fail(404, "질의를 찾을 수 없습니다.");
  return json({ job: jobSummary(job) }, 201);
}
