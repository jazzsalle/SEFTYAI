import { DEMO_DEFAULT_ACCOUNTS } from "@/lib/adminTypes";
import { demoEntries, demoLive, demoRead, demoSet, type DemoModeState } from "@/lib/server/demoMode";
import { fail, json, whoami } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/**
 * 머리줄 「시연 모드」 단추 — 개발서버 DemoModeButton · /api/demo-mode 와 같게(2026-11-19 「개발서버와 동일하게」).
 * 로그인한 누구나 읽고 켜고 끈다. 켜면 48시간 뒤 저절로 꺼진다. 상태는 서비스 하나에 하나.
 * 저장 답을 쓰는 계정 = 기본 대상(busan2) + 켠 사람(우리 R52-1 대상 계정 규칙은 운영관리에서 따로 바꿀 수 있다).
 */
const view = async (s: DemoModeState) => {
  const live = demoLive(s);
  return {
    on: live,
    expiresAt: live ? s.until : null,
    remainingSeconds: live && s.until ? Math.max(0, Math.floor((Date.parse(s.until) - Date.now()) / 1000)) : 0,
    entries: await demoEntries(s).catch(() => 0),
  };
};

export async function GET(req: Request) {
  if (!(await whoami(req))) return fail(401, "로그인이 필요합니다.");
  try {
    return json(await view(await demoRead()));
  } catch {
    return json({ on: false, expiresAt: null, remainingSeconds: 0, entries: 0 });
  }
}

/** POST /api/demo-mode?op=on|off */
export async function POST(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  const op = new URL(req.url).searchParams.get("op");
  if (op !== "on" && op !== "off") return fail(400, "요청 형식이 맞지 않습니다.");
  try {
    const next = op === "on" ? await demoSet(who, true, Date.now(), [...new Set([...DEMO_DEFAULT_ACCOUNTS, who.id])]) : await demoSet(who, false);
    return json(await view(next));
  } catch (e) {
    return fail(500, "시연 모드를 바꾸지 못했습니다. " + (e instanceof Error ? e.message : String(e)).slice(0, 200));
  }
}
