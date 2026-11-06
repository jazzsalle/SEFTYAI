import { markLeft } from "@/lib/server/auth";
import { hasDb } from "@/lib/server/db";
import { json } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/** POST /api/auth/leaving — 창이 닫힌다(sendBeacon). 접속은 두고 자취만 늙힌다(개발서버 /auth/leaving, R53) */
export async function POST(req: Request) {
  if (hasDb()) await markLeft(req).catch(() => {});
  return json({ ok: true });
}
