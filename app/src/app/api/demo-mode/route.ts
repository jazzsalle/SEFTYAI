import { demoLive, demoRead } from "@/lib/server/demoMode";
import { fail, json, whoami } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/**
 * GET /api/demo-mode — 머리줄 「시연 모드」 알약용 상태(개발서버 DemoModeButton 과 같은 표시, 2026-11-19 「개발서버와 동일하게」).
 * 로그인한 누구나 읽는다. 켜고 끄기는 운영자만(/api/admin/demo-mode) — 대상 계정 목록은 내주지 않는다.
 */
export async function GET(req: Request) {
  if (!(await whoami(req))) return fail(401, "로그인이 필요합니다.");
  try {
    const state = await demoRead();
    const live = demoLive(state);
    return json({ on: live, remainingSeconds: live && state.until ? Math.max(0, Math.floor((Date.parse(state.until) - Date.now()) / 1000)) : 0 });
  } catch {
    return json({ on: false, remainingSeconds: 0 });
  }
}
