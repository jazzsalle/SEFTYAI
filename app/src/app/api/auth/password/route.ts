import { changePw, currentSid } from "@/lib/server/auth";
import { audit } from "@/lib/server/db";
import { fail, json, whoami } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/** POST /api/auth/password {current, next} — 비밀번호 변경 (UFR-007) */
export async function POST(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  const b = (await req.json().catch(() => null)) as { current?: string; next?: string } | null;
  if (!b?.current || !b.next) return fail(400, "현재 비밀번호와 새 비밀번호를 입력하세요.");
  const err = await changePw(who.id, b.current, b.next, currentSid(req));
  if (err) return fail(400, err);
  await audit(null, who.id, "password.change", null);
  return json({ ok: true });
}
