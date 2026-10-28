/**
 * 기준지역(R32) — 질문·자료 조회에 함께 보내는 지역 조건. 전국 → 시·도 → 시·군·구 → 읍·면·동.
 * 선택지는 브이월드 행정구역(/api/regions — 이름·코드만, 법정동 코드: 시·도 2·시·군·구 5·읍·면·동 8자리 = T3Q admin_code 체계)에서만 온다.
 * 지자체·중앙 모두 바꿀 수 있다(데이터 조회 제한 없음). 기본값: 지자체 = 자기 지역, 그 밖의 계정 = 전국.
 * 화면·서버가 함께 쓴다(브라우저 전용 코드 없음).
 */
import type { Account } from "./config";
import type { RegionId } from "./contract/agent";
import { joinName, type T3qRegion } from "./t3q/region";
import type { WxTarget } from "./wxMatch";

/** 기준지역의 한 단계 — 브이월드 행정구역 코드·이름 그대로 */
export interface AreaPick {
  code: string;
  name: string;
}
/** 기준지역 — null 이면 전국 */
export interface BaseRegion {
  sido: AreaPick;
  sigungu?: AreaPick | null;
  emd?: AreaPick | null;
}
export type BaseLevel = "SIDO" | "SIGUNGU" | "EMD";
/** 화면 → 서버(condition.base): 가장 아래 단계 하나. name = 시·도부터 이은 이름(T3Q region.name) */
export interface BaseWire {
  code: string;
  name: string;
  level: BaseLevel;
}

/** 지자체 계정의 기본 기준지역(사용자 결정 2026-10-28) — 이름은 브이월드가 주는 그대로 */
const LOCAL_DEFAULT: Partial<Record<RegionId, BaseRegion>> = {
  busan: { sido: { code: "26", name: "부산광역시" } },
  yeongcheon: { sido: { code: "47", name: "경상북도" }, sigungu: { code: "47230", name: "영천시" } },
  inje: { sido: { code: "51", name: "강원특별자치도" }, sigungu: { code: "51810", name: "인제군" } },
};

/** 로그인·세션 복원 때의 기준지역 — 지자체 = 자기 지역, 그 밖(중앙정부·운영자) = 전국 */
export function defaultBase(acc: Pick<Account, "role" | "region">): BaseRegion | null {
  return acc.role === "지자체" ? LOCAL_DEFAULT[acc.region] ?? null : null;
}

/** 가장 아래 단계 */
const leaf = (b: BaseRegion) => b.emd ?? b.sigungu ?? b.sido;

/** 화면에 쓰는 이름(질문의 {지역} 포함) — 시·도부터 이어서, 전국이면 「전국」 */
export const baseName = (b: BaseRegion | null | undefined) => (b ? joinName(b.sido.name, b.sigungu?.name, b.emd?.name) : "전국");

/** 기준지역을 가리는 키(바뀌었는지 볼 때) — 가장 아래 단계 코드, 전국은 빈 글자 */
export const baseKey = (b: BaseRegion | null | undefined) => (b ? leaf(b).code : "");

/**
 * 시범 지역 id — 기준지역에서 끌어낸 값(질문 모음·시작 화면·지도 첫 화면·대화 이력이 쓴다).
 * 26(부산광역시) 아래면 busan, 47230(영천시) 아래면 yeongcheon, 51810(인제군) 아래면 inje, 그 밖은 national
 */
export function basePilot(b: BaseRegion | null | undefined): RegionId {
  const c = baseKey(b);
  if (c.startsWith("26")) return "busan";
  if (c.startsWith("47230")) return "yeongcheon";
  if (c.startsWith("51810")) return "inje";
  return "national";
}

/** 기상특보를 맞출 기준지역(lib/wxMatch) — 읍·면·동이면 그 시·군·구로 */
export const baseTarget = (b: BaseRegion | null | undefined): WxTarget | null => (b ? { sido: b.sido.name, sigungu: b.sigungu?.name ?? null } : null);

/** 서버로 보낼 기준지역(condition.base) — 전국이면 null */
export function baseWire(b: BaseRegion | null | undefined): BaseWire | null {
  if (!b) return null;
  return { code: leaf(b).code, name: baseName(b), level: b.emd ? "EMD" : b.sigungu ? "SIGUNGU" : "SIDO" };
}

const CODE_LEN: Record<BaseLevel, number> = { SIDO: 2, SIGUNGU: 5, EMD: 8 };
export const BASE_NAME_MAX = 80;

/** 서버 — 받은 기준지역 검사: 코드는 숫자만·2/5/8자리·단계와 자릿수 일치, 이름 1~80자. 틀리면 null */
export function parseBaseWire(v: unknown): BaseWire | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const { code, name, level } = v as Record<string, unknown>;
  if (level !== "SIDO" && level !== "SIGUNGU" && level !== "EMD") return null;
  if (typeof code !== "string" || !/^\d+$/.test(code) || code.length !== CODE_LEN[level]) return null;
  if (typeof name !== "string") return null;
  const n = name.trim().replace(/\s+/g, " ");
  if (!n || n.length > BASE_NAME_MAX) return null;
  return { code, name: n, level };
}

/** 기준지역 → T3Q region(계약 common.py:79-96) — 코드를 10자리로 채운다 */
export const baseToT3q = (w: BaseWire): T3qRegion => ({ admin_code: w.code.padEnd(10, "0"), level: w.level, name: w.name });
