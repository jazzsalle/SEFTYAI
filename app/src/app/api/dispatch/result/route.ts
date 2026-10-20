import { timingSafeEqual } from "crypto";
import { hasDb } from "@/lib/server/db";
import { applyResults } from "@/lib/server/dispatch";
import { fail, json } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/**
 * POST /api/dispatch/result — 문자·이메일 발송 모듈의 결과 알림 (웹훅)
 *  헤더 x-sa-callback-secret = DISPATCH_CALLBACK_SECRET
 *  본문 {results: [{providerMsgId, status: "success" | "fail", reason?, at?}]}
 */
export async function POST(req: Request) {
  const secret = process.env.DISPATCH_CALLBACK_SECRET;
  if (!secret) return fail(503, "결과 알림 비밀값(DISPATCH_CALLBACK_SECRET)이 설정되지 않았습니다.");
  const got = Buffer.from(req.headers.get("x-sa-callback-secret") ?? "");
  const want = Buffer.from(secret);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return fail(401, "인증 실패");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  const body = (await req.json().catch(() => null)) as { results?: { providerMsgId?: string; status?: string; reason?: string; at?: string }[] } | null;
  const list = (body?.results ?? []).filter((r) => r.providerMsgId && (r.status === "success" || r.status === "fail")).slice(0, 5000);
  if (!list.length) return fail(400, "결과가 없습니다.");
  const updated = await applyResults(list.map((r) => ({ providerMsgId: r.providerMsgId!, ok: r.status === "success", reason: r.reason?.slice(0, 200), at: r.at })));
  return json({ received: list.length, updated });
}
