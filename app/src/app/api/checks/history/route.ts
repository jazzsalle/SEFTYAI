import { hasDb } from "@/lib/server/db";
import { checkScope, checksHistory } from "@/lib/server/kvStore";
import { fail, json, whoami } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/** GET /api/checks/history?prefix= — 지난 상황 (소속 기관, 운영자는 개인) 최근 50건 */
export async function GET(req: Request) {
  const who = whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  const prefix = new URL(req.url).searchParams.get("prefix");
  return json(await checksHistory(checkScope(who), prefix ? prefix.slice(0, 200) : undefined));
}
