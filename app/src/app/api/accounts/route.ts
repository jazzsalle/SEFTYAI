import { z } from "zod";
import { ISSUE_MAX } from "@/lib/accountRules";
import { accountMeta, issueAccounts, listAccounts } from "@/lib/server/accounts";
import { errText, requireIssuer } from "@/lib/server/admin";
import { audit } from "@/lib/server/db";
import { fail, json } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/** GET /api/accounts — 등급·소속·규칙과 계정 목록(개발서버 GET /accounts/meta · GET /accounts, 계정 발급자 전용 · R55) */
export async function GET(req: Request) {
  const g = await requireIssuer(req);
  if (g.res) return g.res;
  try {
    return json({ meta: accountMeta(), accounts: await listAccounts() });
  } catch (e) {
    return fail(500, "목록을 읽지 못했습니다. " + errText(e));
  }
}

// 줄 단위 값 검사는 서버가 줄마다 한다(맞는 줄은 발급하고 틀린 줄만 사유) — 여기는 본문이 터무니없이 큰 것만 막는다(개발서버 RequestAccountIssue)
const Body = z.object({
  items: z.array(z.object({ gradSn: z.number().int(), userId: z.string().max(200), teamSn: z.number().int(), memo: z.string().max(2000).nullable().optional() }))
    .min(1, "발급할 줄이 없습니다.").max(ISSUE_MAX, `한 번에 ${ISSUE_MAX}건까지 발급할 수 있습니다.`),
});

/** POST /api/accounts {items} — 계정 발급(여러 건). 비밀번호는 서버가 만들고 평문은 이 응답에서만 나간다(로그·감사 기록에 남기지 않음) */
export async function POST(req: Request) {
  const g = await requireIssuer(req);
  if (g.res) return g.res;
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return fail(400, b.error.issues[0]?.message ?? "요청이 올바르지 않습니다.");
  try {
    const r = await issueAccounts(b.data.items.map((i) => ({ ...i, memo: i.memo ?? null })), g.who.id);
    await audit(null, g.who.id, "account.issue", { ids: r.results.filter((x) => x.ok).map((x) => x.userId), failed: r.failed });
    return json(r);
  } catch (e) {
    return fail(500, "발급하지 못했습니다. " + errText(e));
  }
}
