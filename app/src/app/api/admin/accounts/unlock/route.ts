import { z } from "zod";
import { unlock } from "@/lib/server/auth";
import { errText, requireOperator } from "@/lib/server/admin";
import { audit, db, ensureSchema } from "@/lib/server/db";
import { fail, json } from "@/lib/server/who";

export const dynamic = "force-dynamic";

const Body = z.object({ id: z.string().trim().min(1).max(64) });

/** POST /api/admin/accounts/unlock {id} — 잠금 해제(연속 실패 0·잠금 시각 해제, 운영자 전용) */
export async function POST(req: Request) {
  const g = await requireOperator(req);
  if (g.res) return g.res;
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return fail(400, "계정 ID가 필요합니다.");
  const id = b.data.id;
  try {
    await ensureSchema();
    const [row] = (await db().query("select id from sa_accounts where id = $1", [id])) as { id: string }[];
    if (!row) return fail(404, "발급되지 않은 계정입니다.");
    await unlock(id);
    await audit(null, g.who.id, "account.unlock", { id });
    return json({ ok: true, id });
  } catch (e) {
    return fail(500, "잠금을 해제하지 못했습니다. " + errText(e));
  }
}
