import { login } from "@/lib/server/auth";
import { hasDb } from "@/lib/server/db";
import { fail, json } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/** POST /api/auth/login {id, password} → 세션 쿠키 (R7) */
export async function POST(req: Request) {
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  const body = (await req.json().catch(() => null)) as { id?: string; password?: string } | null;
  if (!body?.id || !body.password) return fail(400, "아이디와 비밀번호를 입력하세요.");
  const r = await login(body.id.trim(), body.password, req.headers.get("user-agent") ?? "");
  if (!r.ok) return fail(r.status, r.error);
  const res = json({ account: r.account });
  res.headers.append("set-cookie", r.cookie);
  return res;
}
