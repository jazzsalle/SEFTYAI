import { beat } from "@/lib/server/auth";
import { hasDb } from "@/lib/server/db";
import { fail, json } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/ping — 「아직 보고 있습니다」(개발서버 /auth/ping, R53). 화면이 주기적으로 두드려 접속 자취를 남긴다.
 * 끊겼으면 401 + code: AUTH_SESSION_TAKEN_OVER(다른 곳에서 로그인) · AUTH_SESSION_EXPIRED(만료·로그아웃)
 * 살아 있으면 끝나는 시각(expiresAt) — 다른 창에서 [시간 연장]을 눌렀으면 이 창의 남은 시간도 따라간다(개발서버 shareSession)
 */
export async function POST(req: Request) {
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  const r = await beat(req);
  if ("code" in r) return fail(401, "로그인이 필요합니다.", { code: r.code });
  return json({ ok: true, expiresAt: r.expiresAt });
}
