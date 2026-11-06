import { parseBaseWire } from "@/lib/baseRegion";
import { aimLatest } from "@/lib/server/aiMode";
import { hasDb } from "@/lib/server/db";
import { fail, json, whoami } from "@/lib/server/who";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/ai-mode?code=&name=&level= — 기준지역의 가장 최근 AI 모드 점검(R52, 개발서버 GET /api/ai-mode).
 * 배경 점검 지역이면 이때 그 지역의 회차를 판단·진행한다(Vercel 에는 상시 작업이 없다 — lib/server/aiMode). 그 밖의 지역은 그 사람의 점검만 진행
 */
export async function GET(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  const u = new URL(req.url).searchParams;
  const base = u.get("code") ? parseBaseWire({ code: u.get("code"), name: u.get("name"), level: u.get("level") }) : null;
  if (u.get("code") && !base) return fail(400, "기준지역 값이 올바르지 않습니다.");
  return json(await aimLatest(who, base));
}
