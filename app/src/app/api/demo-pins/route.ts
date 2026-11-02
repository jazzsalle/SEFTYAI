import { demoPins } from "@/lib/server/jobs";
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
