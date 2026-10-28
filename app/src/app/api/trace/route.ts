import { hasDb } from "@/lib/server/db";
import { traceList } from "@/lib/server/kvStore";
import { fail, json, whoami } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/** GET /api/trace — 연계 추적로그 (시스템 운영자 전용) */
export async function GET(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (who.role !== "운영자") return fail(403, "연계 추적로그는 시스템 운영자만 볼 수 있습니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  return json(await traceList());
}
