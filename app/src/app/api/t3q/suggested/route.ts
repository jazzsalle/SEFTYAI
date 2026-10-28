import { fail, json, whoami } from "@/lib/server/who";
import { t3q } from "@/lib/t3q/client";

export const dynamic = "force-dynamic";

/** GET /api/t3q/suggested?disaster_types= — T3Q-03 추천 질문(T3Q 고정 목록, 그대로) */
export async function GET(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  const dt = new URL(req.url).searchParams.get("disaster_types");
  const r = await t3q("GET", `/suggested-questions?per_group=3${dt ? `&disaster_types=${encodeURIComponent(dt)}` : ""}`);
  if (!r.envelope) return fail(502, r.error ?? "추천 질문을 불러오지 못했습니다.");
  return json({ envelope: r.body });
}
