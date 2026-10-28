/**
 * 우리 지역 선택 → T3Q Region{admin_code(10자리), level, name} (계약 common.py:79-96)
 * 시도 2자리·시군구 5자리·읍면동 8자리 코드를 10자리로 채운다. 전국이면 region 을 보내지 않는다.
 */
import type { RegionId } from "../contract/agent";

export interface T3qRegion {
  admin_code: string;
  level: "SIDO" | "SIGUNGU" | "EMD";
  name: string;
}

export const PILOT_T3Q: Record<Exclude<RegionId, "national">, T3qRegion> = {
  busan: { admin_code: "2600000000", level: "SIDO", name: "부산광역시" },
  inje: { admin_code: "5181000000", level: "SIGUNGU", name: "강원특별자치도 인제군" },
  yeongcheon: { admin_code: "4723000000", level: "SIGUNGU", name: "경상북도 영천시" },
};

/** 선택값(시도 id + 선택 시군구·읍면동 코드/이름) → T3Q Region. 전국 = null */
export function toT3qRegion(region: RegionId, sub?: { code?: string; name?: string } | null): T3qRegion | null {
  if (region === "national") return null;
  const base = PILOT_T3Q[region];
  const code = sub?.code?.replace(/\D/g, "");
  if (!code) return base;
  const level = code.length <= 2 ? "SIDO" : code.length <= 5 ? "SIGUNGU" : "EMD";
  return { admin_code: code.padEnd(10, "0"), level, name: sub?.name ? joinName(base.name, sub.name) : base.name };
}

/** 지역 이름 잇기 — 겹치는 낱말은 한 번만(예 "강원특별자치도 인제군" + "인제군 인제읍" → "강원특별자치도 인제군 인제읍") */
export function joinName(...parts: (string | null | undefined)[]) {
  const out: string[] = [];
  for (const w of parts.filter(Boolean).join(" ").split(/\s+/)) if (w && !out.includes(w)) out.push(w);
  return out.join(" ");
}
