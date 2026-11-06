import { beat } from "@/lib/server/auth";
import { hasDb } from "@/lib/server/db";
import { fail, json } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/ping — 「아직 보고 있습니다」(개발서버 /auth/ping, R53). 화면이 주기적으로 두드려 접속 자취를 남긴다.
 * 끊겼으면 401 + code: AUTH_SESSION_TAKEN_OVER(다른 곳에서 로그인) · AUTH_SESSION_EXPIRED(만료·로그아웃)
 */
export async function POST(req: Request) {
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  const code = await beat(req);
  if (code) return fail(401, "로그인이 필요합니다.", { code });
  return json({ ok: true });
}
