import { db, ensureSchema, hasDb } from "@/lib/server/db";
import { getJob } from "@/lib/server/jobs";
import { fail, json, whoami } from "@/lib/server/who";
import { t3q } from "@/lib/t3q/client";

export const dynamic = "force-dynamic";

/** POST /api/t3q/feedback {jobId, rating: GOOD|BAD, comment?} — T3Q-31 + sa_feedback (R12) */
export async function POST(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (who.mustChangePw) return fail(403, "초기 비밀번호를 먼저 바꿔 주세요.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  const b = (await req.json().catch(() => null)) as { jobId?: string; rating?: string; comment?: string } | null;
  if (!b?.jobId || (b.rating !== "GOOD" && b.rating !== "BAD")) return fail(400, "요청 형식이 맞지 않습니다.");
  const job = await getJob(who, b.jobId);
  const raw = job?.raw as { conversation_id?: string; turn_no?: number; result?: { response_id?: string } } | null;
  const responseId = raw?.result?.response_id;
  if (!job || !responseId) return fail(404, "평가할 답변을 찾을 수 없습니다.");
  const comment = b.comment?.slice(0, 1000) || null;
  const r = await t3q("POST", "/agent/feedback", {
    response_id: responseId, conversation_id: raw?.conversation_id ?? null, turn_no: raw?.turn_no ?? null, rating: b.rating, comment, rated_at: new Date().toISOString(),
  });
  await ensureSchema();
  await db().query(
    `insert into sa_feedback (job_id, account_id, response_id, rating, comment, t3q_result, rated_at) values ($1,$2,$3,$4,$5,$6,now())
     on conflict (job_id) do update set rating = excluded.rating, comment = excluded.comment, t3q_result = excluded.t3q_result, rated_at = now()`,
    [job.id, who.id, responseId, b.rating, comment, JSON.stringify(r.body)],
  );
  return json({ ok: true, t3q: (r.body as { result?: unknown } | null)?.result ?? null });
}

/** GET /api/t3q/feedback?jobId= — 내 평가 */
export async function GET(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  const id = new URL(req.url).searchParams.get("jobId");
  await ensureSchema();
  const rows = (await db().query("select rating, comment, rated_at from sa_feedback where job_id = $1 and account_id = $2", [id, who.id])) as unknown[];
  return json({ feedback: rows[0] ?? null });
}
