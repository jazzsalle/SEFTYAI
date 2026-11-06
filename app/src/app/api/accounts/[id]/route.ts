import { AccountError, deleteAccount } from "@/lib/server/accounts";
import { errText, requireIssuer } from "@/lib/server/admin";
import { audit } from "@/lib/server/db";
import { fail } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/** DELETE /api/accounts/{id} — 계정 폐기(개발서버 DELETE /accounts/{userSn} · 행 삭제, 계정 발급자 전용 · R55) */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireIssuer(req);
  if (g.res) return g.res;
  const { id } = await ctx.params;
  try {
    await deleteAccount(decodeURIComponent(id), g.who.id);
    await audit(null, g.who.id, "account.delete", { id });
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof AccountError) return fail(e.status, e.message, { code: e.code });
    return fail(500, "지우지 못했습니다. " + errText(e));
  }
}
