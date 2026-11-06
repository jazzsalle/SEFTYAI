import { parseBaseWire } from "@/lib/baseRegion";
import { aimCheck } from "@/lib/server/aiMode";
import { hasDb } from "@/lib/server/db";
import { fail, json, whoami } from "@/lib/server/who";
import { t3qConfigured } from "@/lib/t3q/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/ai-mode/check {base} — 점검 한 번(R52, 개발서버 POST /api/ai-mode/check). 켜 둔 화면이 켤 때·10분마다 부른다.
 * 특보 서명이 그대로이고 답이 60분보다 젊으면 상류를 부르지 않는다. 배경 점검 지역이면 읽기만. 기준 시각은 서버가 정한다
 */
export async function POST(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  if (who.mustChangePw) return fail(403, "초기 비밀번호를 먼저 바꿔 주세요.");
  if (!t3qConfigured() && process.env.T3Q_MODE !== "replay") return fail(503, "에이전트 서버 연결 설정이 없습니다.");
  const b = (await req.json().catch(() => null)) as { base?: unknown } | null;
  const base = b?.base == null ? null : parseBaseWire(b.base);
  if (b?.base != null && !base) return fail(400, "기준지역 값이 올바르지 않습니다.");
  return json(await aimCheck(who, base));
}
