import type { RegionId } from "./contract/agent";

export interface RegionConf {
  id: RegionId;
  name: string;
  short: string;
  sido: string;
  center: [number, number];
  zoom: number;
}

export const REGIONS: Record<RegionId, RegionConf> = {
  national: { id: "national", name: "전국 (시범 3개 지역)", short: "전국", sido: "", center: [128.6, 36.4], zoom: 7.2 },
  busan: { id: "busan", name: "부산광역시", short: "부산", sido: "부산광역시", center: [129.06, 35.17], zoom: 11 },
  yeongcheon: { id: "yeongcheon", name: "경상북도 영천시", short: "영천", sido: "경상북도", center: [128.94, 35.99], zoom: 10.6 },
  inje: { id: "inje", name: "강원특별자치도 인제군", short: "인제", sido: "강원특별자치도", center: [128.23, 38.07], zoom: 10.2 },
};

export const PILOT_REGIONS: RegionId[] = ["busan", "yeongcheon", "inje"];

export interface Account {
  id: string;
  name: string;
  org: string;
  dept: string;
  role: "중앙정부" | "지자체" | "운영자";
  roleLabel: string;
  region: RegionId;
  color: string;
  initial: string;
}

export const ACCOUNTS: Account[] = [
  { id: "mois_dsd01", name: "중앙정부 담당자", org: "중앙정부(행정안전부·NIA)", dept: "재난안전 AI 시범서비스 담당", role: "중앙정부", roleLabel: "정부기관 공무원 · 행정안전부·NIA 공용 · 전국 기본", region: "national", color: "#063a74", initial: "중앙" },
  { id: "bs_safety01", name: "부산광역시 담당자", org: "부산광역시", dept: "시민안전실 자연재난과", role: "지자체", roleLabel: "지자체 · 부산광역시", region: "busan", color: "#256ef4", initial: "부산" },
  { id: "yc_safety02", name: "영천시 담당자", org: "경상북도 영천시", dept: "안전재난하천과", role: "지자체", roleLabel: "지자체 · 영천시", region: "yeongcheon", color: "#0f9d8a", initial: "영천" },
  { id: "ij_safety01", name: "인제군 담당자", org: "강원특별자치도 인제군", dept: "안전교통과", role: "지자체", roleLabel: "지자체 · 인제군", region: "inje", color: "#6f4bd8", initial: "인제" },
  { id: "admin01", name: "시스템 운영자", org: "유엔이 운영지원", dept: "시범서비스 운영", role: "운영자", roleLabel: "시스템 운영자 · 운영관리", region: "national", color: "#575d66", initial: "운영" },
];

export const DISASTER_TYPES = ["전체", "호우", "태풍", "홍수", "침수", "산사태"] as const;

/** 위험·취약 객체 범주별 표시 색 (지도·목록 공통) */
export const CATEGORY_STYLE: Record<string, { color: string; icon: string }> = {
  급경사지: { color: "#bd2c0f", icon: "⛰" },
  붕괴위험지역: { color: "#de3412", icon: "⛰" },
  산사태취약지역: { color: "#8a5a00", icon: "⛰" },
  위험저수지: { color: "#0b78cb", icon: "◉" },
  풍수해개선지구: { color: "#6f4bd8", icon: "◆" },
  상습침수지역: { color: "#0a6e9e", icon: "≋" },
  홍수취약지구: { color: "#1d4f9c", icon: "≋" },
  지하차도: { color: "#e5590b", icon: "▼" },
  야영장: { color: "#228738", icon: "▲" },
  소하천: { color: "#0f9d8a", icon: "~" },
  하천위험요소: { color: "#0f9d8a", icon: "!" },
  건축물지하공간: { color: "#575d66", icon: "▣" },
  "119신고": { color: "#de3412", icon: "☎" },
  재난사건: { color: "#6b2fb3", icon: "◷" },
};
export const catStyle = (c?: string) => CATEGORY_STYLE[c ?? ""] ?? { color: "#256ef4", icon: "●" };
