import { AdminLookupError, adminAreas, type AdminLevel } from "@/lib/server/vworldAdmin";
import { fail, json, whoami } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/**
 * GET /api/regions?level=sido|sigungu|emd&parent=코드 — 기준지역 선택지(브이월드 행정구역 이름·코드, 좌표 없음).
 * 지자체·중앙 구분 없이 전국 조회(데이터 조회 제한 없음 — 사용자 지시 2026-10-28).
 */
export async function GET(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  const sp = new URL(req.url).searchParams;
  const level = sp.get("level") as AdminLevel | null;
  if (level !== "sido" && level !== "sigungu" && level !== "emd") return fail(400, "지역 단계(시·도, 시·군·구, 읍·면·동)를 고르세요.");
  try {
    return json({ level, parent: sp.get("parent") ?? "", items: await adminAreas(level, sp.get("parent") ?? "") });
  } catch (e) {
    if (e instanceof AdminLookupError) return fail(502, e.message);
    return fail(502, "행정구역 목록을 받지 못했습니다.");
  }
}
