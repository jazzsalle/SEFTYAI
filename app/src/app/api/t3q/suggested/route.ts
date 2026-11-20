import { fail, json, whoami } from "@/lib/server/who";
import { t3q } from "@/lib/t3q/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/t3q/suggested?region=&disaster_types= — T3Q-03 추천 질문(T3Q 질문 모음, 그대로).
 * region = 기준지역 법정동 코드(시·도 2·시·군·구 5·읍·면·동 8자리). T3Q v0.4.9(11/20)부터 region_admin_code 를 주면 질문 글의 지역을 시·도 단위로 맞춰 준다
 * (시·군·구 코드면 warnings REGION_APPLIED_SIDO). 없으면 전국 — 답이 확인된 예시 질문
 */
export async function GET(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  const sp = new URL(req.url).searchParams;
  const dt = sp.get("disaster_types");
  const region = sp.get("region") ?? "";
  if (region && !/^(\d{2}|\d{5}|\d{8})$/.test(region)) return fail(400, "지역 코드가 올바르지 않습니다.");
  const r = await t3q("GET", `/suggested-questions?per_group=3${region ? `&region_admin_code=${region}` : ""}${dt ? `&disaster_types=${encodeURIComponent(dt)}` : ""}`);
  if (!r.envelope) return fail(502, r.error ?? "추천 질문을 불러오지 못했습니다.");
  return json({ envelope: r.body });
}
