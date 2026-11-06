import { sessionInfo } from "@/lib/server/auth";
import { hasDb } from "@/lib/server/db";
import { fail, json } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/** GET /api/auth/me — 현재 세션 계정과 끝나는 시각(사용자 메뉴 「로그아웃까지 남은 시간」 — R57). 세션 만료면 401 */
export async function GET(req: Request) {
  const s = hasDb() ? await sessionInfo(req) : null;
  if (!s) return fail(401, "로그인이 필요합니다.");
  return json({ account: s.account, expiresAt: s.expiresAt });
}
