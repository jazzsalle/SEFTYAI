import { extendSession } from "@/lib/server/auth";
import { hasDb } from "@/lib/server/db";
import { fail, json } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/extend — 사용자 메뉴 [시간 연장](개발서버 /auth/refresh?extend=true — R57). 수명을 지금부터 240분으로 다시 센다.
 * 이미 끝난 접속은 되살리지 않는다 — 401 AUTH_SESSION_EXPIRED
 */
export async function POST(req: Request) {
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  const r = await extendSession(req);
  if (!r) return fail(401, "로그인이 필요합니다.", { code: "AUTH_SESSION_EXPIRED" });
  const res = json({ ok: true, expiresAt: r.expiresAt });
  res.headers.append("set-cookie", r.cookie);
  return res;
}
