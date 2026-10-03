import { NextResponse } from "next/server";
import { GOLD, GOLD_BY_ID, runGold } from "@/lib/server/verify";
import type { GoldItem } from "@/lib/verify";

export const dynamic = "force-dynamic";

/** GET /api/verify — 정답셋 목록 (내부용 응답 정합성 검증) */
export function GET() {
  return NextResponse.json(GOLD);
}

/**
 * POST /api/verify — 정답셋 실행
 *  { ids?: string[] }        : 해당 문항 (없으면 전체) — 요약 결과
 *  { item: GoldItem }        : 화면에서 고친 정답값·로컬 문항으로 한 건 실행
 *  { full: true }            : 한 건일 때 보낸 질의·받은 응답 원문 포함
 */
export async function POST(req: Request) {
  let body: { ids?: string[]; item?: GoldItem; full?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "JSON 형식 오류" } }, { status: 400 });
  }
  const items: GoldItem[] = body.item ? [body.item] : body.ids?.length ? body.ids.map((id) => GOLD_BY_ID.get(id)).filter((x): x is GoldItem => !!x) : GOLD.items;
  if (!items.length) return NextResponse.json({ error: { code: "NOT_FOUND", message: "정답셋 문항이 없습니다" } }, { status: 404 });
  const full = !!body.full && items.length === 1;
  const results = [];
  for (const it of items) results.push(await runGold(it, full));
  return NextResponse.json({ ranAt: new Date().toISOString(), results });
}
