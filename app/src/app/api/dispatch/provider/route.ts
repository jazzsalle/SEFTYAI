import { provider } from "@/lib/server/messaging";
import { fail, json, whoami } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/** GET /api/dispatch/provider — 지금 연결된 발송 모듈 이름(mock = 모의 모듈, 실제로 보내지 않음). 보내기 전 창의 주의 표시용 */
export async function GET(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  return json({ provider: provider().name });
}
