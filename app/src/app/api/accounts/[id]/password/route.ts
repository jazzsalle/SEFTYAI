import { AccountError, resetPassword } from "@/lib/server/accounts";
import { errText, requireIssuer } from "@/lib/server/admin";
import { audit } from "@/lib/server/db";
import { fail, json } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/** POST /api/accounts/{id}/password — 비밀번호 재발급(개발서버 POST /accounts/{userSn}/password, 계정 발급자 전용 · R55). 새 비밀번호는 이 응답에서만 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireIssuer(req);
  if (g.res) return g.res;
  const { id } = await ctx.params;
  try {
    const r = await resetPassword(decodeURIComponent(id));
    await audit(null, g.who.id, "account.password_reset", { id: r.userId });
    return json(r);
  } catch (e) {
    if (e instanceof AccountError) return fail(e.status, e.message, { code: e.code });
    return fail(500, "재발급하지 못했습니다. " + errText(e));
  }
}
