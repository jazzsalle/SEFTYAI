import { z } from "zod";
import { errText, requireOperator } from "@/lib/server/admin";
import { demoEntries, demoLive, demoRead, demoAccountsOf, demoSet, demoSetAccounts, type DemoModeState } from "@/lib/server/demoMode";
import { fail, json } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/** on 만 — 켜기(대상 accounts, 없으면 기본 busan2)·끄기 · on 없이 accounts 만 — 켜 둔 채 대상 계정 바꾸기(R52-1) */
const Body = z.object({ on: z.boolean().optional(), accounts: z.array(z.string().max(40)).min(1).max(20).optional() }).refine((b) => b.on !== undefined || b.accounts);

const out = async (state: DemoModeState) => {
  const live = demoLive(state);
  return json({
    state, live, now: new Date().toISOString(),
    remainingSeconds: live && state.until ? Math.max(0, Math.floor((Date.parse(state.until) - Date.now()) / 1000)) : 0,
    entries: await demoEntries(state).catch(() => 0),
  });
};

/** GET /api/admin/demo-mode — 시연 모드 상태(R52, 운영자 전용 — 개발서버 GET /api/demo-mode) */
export async function GET(req: Request) {
  const g = await requireOperator(req);
  if (g.res) return g.res;
  try {
    return await out(await demoRead());
  } catch (e) {
    return fail(500, "시연 모드 상태를 읽지 못했습니다. " + errText(e));
  }
}

/**
 * POST /api/admin/demo-mode {on, accounts?} — 켜기(48시간 뒤 저절로 꺼짐, 대상 계정 accounts)·끄기(대상 비움). 어느 쪽이든 들고 있던 응답을 비운다.
 * {accounts} — 켜 둔 채 대상 계정만 바꾼다(꺼져 있으면 409). 운영자만(requireOperator). 관리로그에 남긴다
 */
export async function POST(req: Request) {
  const g = await requireOperator(req);
  if (g.res) return g.res;
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return fail(400, "요청 형식이 맞지 않습니다.");
  if (b.data.accounts && !demoAccountsOf(b.data.accounts).length) return fail(400, "시연 대상 계정을 하나 이상 고르세요.");
  try {
    if (b.data.on === undefined) {
      const next = await demoSetAccounts(g.who, b.data.accounts!);
      if (!next) return fail(409, "시연 모드가 꺼져 있습니다. 켤 때 대상 계정을 고르세요.");
      return await out(next);
    }
    return await out(await demoSet(g.who, b.data.on, Date.now(), b.data.accounts));
  } catch (e) {
    return fail(500, "시연 모드를 바꾸지 못했습니다. " + errText(e));
  }
}
