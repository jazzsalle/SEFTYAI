import { fail, json, whoami } from "@/lib/server/who";
import { t3q } from "@/lib/t3q/client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** POST /api/t3q/geometry {items:[{ref,key,value}]} — EXT-01 공간객체 도형 (T3Q 가 준 키·값 그대로, 300건 상한) */
export async function POST(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (who.mustChangePw) return fail(403, "초기 비밀번호를 먼저 바꿔 주세요.");
  const b = (await req.json().catch(() => null)) as { items?: { ref?: string; key?: string; value?: string }[] } | null;
  const items = (b?.items ?? []).filter((i) => i?.value).slice(0, 300).map((i) => ({ ref: i.ref ?? null, key: i.key, value: String(i.value) }));
  if (!items.length) return fail(400, "조회할 대상이 없습니다.");
  const r = await t3q("POST", "/spatial-objects/geometry", { items });
  if (!r.envelope) return fail(502, r.error ?? "위치를 불러오지 못했습니다.");
  return json({ envelope: r.body });
}
