import type { Advisory, WeatherResponse } from "./contract/agent";
import { isSeaArea, wxCovers, type WxTarget } from "./wxMatch";
import { SCN_LABEL, SCN_SOURCE } from "./scenario";
import type { WxBulletin, WxBulletinHead, WxInfo } from "./wxBulletin";

/** [특보로 질문] 빠른질의 (목업 QQ-01~03) — 참조 특보와 함께 전송, presetKey 로 의도 고정 */
export const WX_QQ = [
  { k: "qq-risk", nm: "위험·취약지역", q: "현재 특보에서 우선 확인해야 할 위험·취약지역은?" },
  { k: "qq-case", nm: "과거 유사사례", q: "현재 상황과 유사한 과거 재난사례는?" },
  { k: "qq-act", nm: "행동매뉴얼 대응절차", q: "이 상황에서 행동매뉴얼상 확인해야 할 대응절차는?" },
] as const;
/** 시작 화면 4번째 카드 : 특보 자체 (기준·경과) */
export const WX_INFO_Q = { k: "advisory", nm: "특보 기준·경과", q: "이 특보는 어떤 기준이고 언제 격상됐나요?" };

export const advLabel = (a: { type: string; level: string }) => `${a.type}${a.level}`;
/**
 * 특보 띠·상세 창의 특보 이름 — 해상 구역이면 「풍랑주의보(해상)」(개발 서버 WarningCodes.LabelOf, 사용자 결정 2026-11-06 「특보도 개발서버를 따른다」).
 * 바다 특보는 육상 기준지역에 잡히지 않아, 이름이 스스로 바다 것이라고 말하게 한다. sea 를 주면 그것을, 없으면 구역 글로 가린다(lib/wxMatch isSeaArea)
 */
export const wxLabel = (a: { type: string; level: string; area?: string; sea?: boolean }) =>
  `${a.type}${a.level}${(a.sea ?? (a.area ? isSeaArea(a.area) : false)) ? "(해상)" : ""}`;
/** 글로 잇는 곳(특보 줄 나머지·AI 모드 띠·대응절차 추천·상황전파 초안·참조 특보)의 특보 이름 — 시연 시나리오 특보면 「(시연 시나리오)」를 붙인다(R43) */
export const advName = (a: { type: string; level: string; scenario?: boolean }) => `${advLabel(a)}${a.scenario ? ` (${SCN_LABEL})` : ""}`;
export const advTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()}. ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
export const advTone = (a: { level: string }) => (a.level === "경보" ? "w" : a.level === "주의보" ? "a" : "p");

/** 지금 발효 중인 특보(해제 제외) — 특보 구역이 기준지역을 덮는 것만(lib/wxMatch, 서버 재사용 기준과 같은 함수). 기준지역이 전국(null)이면 전체 */
export function activeAdvisories(weather: WeatherResponse | null | undefined, target: WxTarget | null): Advisory[] {
  return (weather?.advisories ?? []).filter((a) => a.status !== "해제" && wxCovers(a.area, target));
}

/**
 * 머리줄 AI 모드 단추 색 — 지금 기준지역을 덮는 발효 특보(mine)로(R32): 경보 빨강 · 주의보 노랑 · 없음 녹색.
 * 조회 실패이거나 기상청 실시간이 끊긴 계정(R45)에 덮는 특보가 없으면 회색(「특보 없음」을 확인한 것이 아니므로). 특보를 아직 받지 않았으면 녹색
 */
export function aimTone(weather: WeatherResponse | null | undefined, mine: { level: string }[]): "gray" | "red" | "yellow" | "green" {
  if (weather && (!weather.status.ok || weather.realtimeCut) && !mine.length) return "gray";
  return mine.some((a) => a.level === "경보") ? "red" : mine.length ? "yellow" : "green";
}

export const KMA_SOURCE = "기상청 기상특보 조회서비스";

/**
 * 기상청 특보 → 에이전트 질의 weather_warnings (원문 항목 그대로).
 * 수집 상태·수집 시각은 실제 조회 결과로(조회 실패면 FAILED) — 꾸미지 않는다(R6).
 * 시연 시나리오를 켠 시연 계정(R45 — 기상청 실시간 특보 끊음, weather.realtimeCut)은 source 「시연 시나리오(가상 특보)」, 수집 시각 = 그 응답을 받은 시각(발표·발효 시각 = 켠 시각)
 * (기준지역이 시나리오 구역 밖이라 항목이 없어도 — 기상청을 조회한 것처럼 보내지 않는다). 끊긴 응답에는 기상청 특보가 없어 두 출처가 섞이지 않는다.
 * warning_key 는 시나리오 고정 번호 SCN-* — 재사용 열쇠 jobs.ts warnKeys 에는 source 가 안 들어간다(항목이 없는 시나리오 출처만 따로 표시)
 */
export function warningsPayload(weather: WeatherResponse | null | undefined, advs: Advisory[], extra: WarnExtra = {}) {
  const scn = !!weather?.realtimeCut || advs.some((a) => a.scenario);
  return {
    collect_status: weather?.status.ok ? "COLLECTED" : "FAILED",
    collected_at: weather?.status.fetchedAt ?? null,
    source: scn ? SCN_SOURCE : KMA_SOURCE,
    // 발표(tmFc)·발효(startTime)를 따로(특보코드 구역 — 개발서버 announcedDe·effectiveDe). 특보 현황 글로만 받았으면 둘 다 현황 한 장의 발표 시각
    items: advs.map((a) => ({ warning_key: a.id, kind: a.type, level: a.level, area: a.area, announced_at: a.announcedAt ?? a.issuedAt, effective_at: a.effectiveAt ?? a.issuedAt, change: a.status })),
    // 「이 특보로 질의」만 — 기준지역 관할 통보문 본문 전문·기상정보문(개발서버 oneWarningRef 810fe49·74974d2). 없으면 칸을 싣지 않는다
    ...(extra.bulletins?.length ? { bulletins: extra.bulletins } : {}),
    ...(extra.weatherInfo?.length ? { weather_info: extra.weatherInfo } : {}),
  };
}

/** 질의 참조에 함께 싣는 통보문 한 장 — 기상청 글 그대로(개발서버 WeatherRefBulletin) */
export interface RefBulletin { stn_name: string; announced_at: string; seq: number; title: string; text: string }
/** 질의 참조에 함께 싣는 기상정보문 한 장 — 「기상정보(예보)」, 원문 그대로(개발서버 WeatherRefInfo) */
export interface RefInfo { label: "기상정보(예보)"; stn_name: string; announced_at: string; seq: number; text: string }
export interface WarnExtra { bulletins?: RefBulletin[]; weatherInfo?: RefInfo[] }

/**
 * AI 모드 창에서 보내는 브리핑 세트·개별 질문에 싣는 특보 — 발효 중인 모든 특보를 한 번에(개발서버 aiModeWarnings · allWarningsRef 810fe49, 대장 No.186).
 * 특보가 없으면 null — 칸 자체를 보내지 않는다(빈 목록은 「특보가 없다고 확인했다」로 읽힐 수 있다). 일반 창 질의는 싣지 않는다
 */
export function aimWarningsPayload(weather: WeatherResponse | null | undefined, advs: Advisory[]) {
  return advs.length ? warningsPayload(weather, advs) : null;
}

/** 통보문 본문을 기상청이 적은 대로 칸 이름만 앞에 붙여 잇는다 — 빈 칸은 건너뛰고 자르거나 요약하지 않는다(개발서버 bulletinText) */
export function bulletinText(b: Pick<WxBulletin, "title" | "areas" | "effectiveText" | "body" | "statusAt" | "statusText" | "preliminary" | "note">): string {
  const parts: [string, string | null | undefined][] = [
    ["제목", b.title], ["해당구역", b.areas], ["발효시각", b.effectiveText], ["내용", b.body],
    ["특보발효현황시각", b.statusAt], ["특보발효현황내용", b.statusText], ["예비특보", b.preliminary], ["참고사항", b.note],
  ];
  return parts.filter(([, v]) => v != null && v.trim() !== "").map(([k, v]) => `${k}: ${v}`).join("\n");
}
export const toRefBulletin = (b: WxBulletin): RefBulletin => ({ stn_name: b.stnName, announced_at: b.announcedAt, seq: b.seq, title: b.title, text: bulletinText(b) });
export const toRefInfo = (i: WxInfo): RefInfo => ({ label: "기상정보(예보)", stn_name: i.stnName, announced_at: i.announcedAt, seq: i.seq, text: i.text });

/** 실을 통보문 열쇠 — 발표관서마다 가장 최근 한 장, 최대 max 관서, 최신순(개발서버 latestBulletinKeys) */
export function latestBulletinKeys(list: Pick<WxBulletinHead, "key" | "stnId" | "announcedAt">[], max = 3): string[] {
  const latest = new Map<string, Pick<WxBulletinHead, "key" | "stnId" | "announcedAt">>();
  for (const b of list) {
    const held = latest.get(b.stnId);
    if (!held || Date.parse(b.announcedAt) > Date.parse(held.announcedAt)) latest.set(b.stnId, b);
  }
  return [...latest.values()].sort((a, b) => Date.parse(b.announcedAt) - Date.parse(a.announcedAt)).slice(0, max).map((b) => b.key);
}
