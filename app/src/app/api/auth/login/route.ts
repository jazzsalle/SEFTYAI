import { currentSid, login } from "@/lib/server/auth";
import { hasDb } from "@/lib/server/db";
import { fail, json } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login {id, password, force?} → 세션 쿠키 (R7)
 * 다른 곳에서 접속 중이면 409 {code: AUTH_SESSION_EXISTS} — 화면이 「기존 접속을 끊고 로그인하시겠습니까?」로 되묻고 force: true 로 다시 보낸다(R53)
 */
export async function POST(req: Request) {
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  const body = (await req.json().catch(() => null)) as { id?: string; password?: string; force?: boolean } | null;
  if (!body?.id || !body.password) return fail(400, "아이디와 비밀번호를 입력하세요.");
  const r = await login(body.id.trim(), body.password, req.headers.get("user-agent") ?? "", { force: body.force === true, currentSid: currentSid(req) });
  if (!r.ok) return fail(r.status, r.error, r.code ? { code: r.code } : undefined);
  const res = json({ account: r.account });
  res.headers.append("set-cookie", r.cookie);
  return res;
}
