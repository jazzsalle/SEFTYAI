import { AccountError, unlockAccount } from "@/lib/server/accounts";
import { errText, requireIssuer } from "@/lib/server/admin";
import { audit } from "@/lib/server/db";
import { fail } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/** POST /api/accounts/{id}/unlock — 잠긴 계정 풀기(개발서버 POST /accounts/{userSn}/unlock, 계정 발급자 전용 · R55) */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireIssuer(req);
  if (g.res) return g.res;
  const { id } = await ctx.params;
  try {
    await unlockAccount(decodeURIComponent(id));
    await audit(null, g.who.id, "account.unlock", { id });
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof AccountError) return fail(e.status, e.message, { code: e.code });
    return fail(500, "잠금을 풀지 못했습니다. " + errText(e));
  }
}
