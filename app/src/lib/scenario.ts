import type { Advisory, WeatherResponse } from "./contract/agent";

/**
 * 시연 시나리오 특보 (R43 — R6 「특보 = 기상청 실시간만」의 시연용 예외, 사용자 승인 2026-10-29) · 켠 동안 시연 계정은 기상청 실시간 특보 끊음(R45).
 *  · 운영자가 운영관리 「시연 세트 예열」 탭에서 켜고 끈다. 끝나는 시각이 지나면 저절로 꺼진다(켤 때 기본 SCN_DEFAULT_HOURS 시간, 최대 SCN_MAX_HOURS)
 *  · 시연 계정 셋(SCN_ACCOUNT)에만, 그 계정 지역의 정의 하나만 — 시연 계정 · 켬 · 끝나는 시각 전 · 그 지역을 켬(scenarioCuts)이면
 *    서버 /api/weather 가 기상청 실시간 특보(예비특보 포함)를 부르지 않고 시나리오 특보만 돌려준다(scenarioWeather — realtimeCut). 끄거나 끝나는 시각이
 *    지나면 다시 실시간. 다른 계정(운영자·행안부)·시나리오를 켜지 않은 지역의 시연 계정은 지금처럼 실시간이고 시나리오는 어디에도 넣지 않는다
 *  · 정의(종류·단계·구역·특보 번호)는 대본 `11_demo_day_story.md` 「시연 시나리오 특보 정의」·녹화 demo_v3/AIM-* 그대로, 코드에 고정한다 —
 *    특보 번호(warning_key)·종류·단계·구역이 재사용 열쇠(jobs.ts warnKeys)에 들어가므로 바꾸면 예열한 브리핑이 빗나간다. 시각은 열쇠에 안 들어간다
 *  · 화면은 특보가 보이는 곳마다 「시연 시나리오」를 붙이고(wxref advName · 특보 줄·AI 모드 표지), 기상청 시각이 나오던 자리에 「기상청 실시간 특보 끊음」(회색).
 *    T3Q 로는 source 「시연 시나리오(가상 특보)」(wxref warningsPayload — 끊긴 계정은 기상청 특보와 섞이지 않는다). 구역 밖 빈 목록은 재사용 열쇠에서
 *    기상청 「특보 없음」 질의와 나뉜다(jobs.ts warnKeys)
 *  · 재사용 기준 D5(그 지역 특보 발효 중이면 1시간)는 끊긴 계정이 접수한 질의에는 쓰지 않는다(24시간 — jobs.ts). 다른 계정은 기상청 실시간으로 그대로.
 *    답을 받은 때 특보(wx_seen)는 계정과 무관하게 기상청 실시간 기록 그대로, 「답변을 받은 뒤 특보」는 시나리오를 보지 않는다(끊긴 화면에는 뜨지 않음)
 * 이 파일은 import 가 타입뿐이라 화면·서버·하네스가 함께 쓴다.
 */
export const SCN_SOURCE = "시연 시나리오(가상 특보)";
export const SCN_LABEL = "시연 시나리오";
export const SCN_DEFAULT_HOURS = 4;
export const SCN_MAX_HOURS = 48;

export type ScnRegion = "busan" | "inje" | "yeongcheon";
export const SCN_REGIONS: ScnRegion[] = ["busan", "inje", "yeongcheon"];
/** 시연 계정 — 이 셋에만 보인다(같은 지역의 다른 계정이 생겨도 넣지 않는다) */
export const SCN_ACCOUNT: Record<ScnRegion, string> = { busan: "bs_safety01", inje: "ij_safety01", yeongcheon: "yc_safety02" };

export interface ScnDef {
  /** 특보 번호(warning_key) — 재사용 열쇠에 들어간다 */
  key: string;
  type: string;
  level: "경보" | "주의보";
  /** 기상청 특보 현황의 구역 글 꼴 그대로(lib/wxMatch 가 기준지역과 맞춘다) */
  area: string;
}
export const SCN_DEFS: Record<ScnRegion, ScnDef> = {
  busan: { key: "SCN-BS-1", type: "호우", level: "경보", area: "부산" },
  inje: { key: "SCN-IJ-1", type: "호우", level: "주의보", area: "강원도(인제평지, 인제산지)" },
  yeongcheon: { key: "SCN-YC-1", type: "호우", level: "경보", area: "경상북도(영천)" },
};

/** 서버 저장(kv system · demo_scenario) 값 */
export interface ScenarioState {
  on: boolean;
  /** 켠 지역 */
  regions: ScnRegion[];
  /** 켠 시각 — 시나리오 특보의 발표 시각(issuedAt)으로 쓴다 */
  startedAt: string | null;
  /** 끝나는 시각 — 지나면 꺼진 것과 같다 */
  until: string | null;
  by: string | null;
}
export const SCN_OFF: ScenarioState = { on: false, regions: [], startedAt: null, until: null, by: null };

/** 지금 켜져 있는가 — 켬 + 끝나는 시각이 남음 */
export function scenarioLive(st: ScenarioState | null | undefined, now = Date.now()): boolean {
  if (!st?.on || !st.startedAt || !st.until) return false;
  const u = Date.parse(st.until);
  return Number.isFinite(u) && u > now;
}

/** 이 계정의 시연 지역 — 시연 계정이 아니면 null */
export function scenarioRegionOf(accountId: string | null | undefined): ScnRegion | null {
  return SCN_REGIONS.find((r) => SCN_ACCOUNT[r] === accountId) ?? null;
}

/**
 * 이 계정은 지금 기상청 실시간 특보를 끊는가(R45) — 시연 계정 · 켜짐 · 끝나는 시각 전 · 그 지역을 켬. 시나리오 특보를 붙이는 조건(scenarioAdvisories)과 같다.
 * 서버 /api/weather(weatherFor)·재사용 기준 D5(jobs.ts)가 쓴다
 */
export function scenarioCuts(st: ScenarioState | null | undefined, accountId: string | null | undefined, now = Date.now()): boolean {
  const r = scenarioRegionOf(accountId);
  return !!r && !!st && scenarioLive(st, now) && st.regions.includes(r);
}

/** 이 계정에 보일 시나리오 특보 — 시연 계정 · 켜짐 · 끝나는 시각 전 · 그 지역을 켰을 때만 하나(scenarioCuts), 아니면 빈 목록 */
export function scenarioAdvisories(st: ScenarioState | null | undefined, accountId: string | null | undefined, now = Date.now()): Advisory[] {
  const r = scenarioRegionOf(accountId);
  if (!r || !scenarioCuts(st, accountId, now)) return [];
  const d = SCN_DEFS[r];
  return [{ id: d.key, type: d.type, level: d.level, area: d.area, regionId: r, issuedAt: st!.startedAt!, status: "발효", scenario: true }];
}

/** 끊긴 화면에서 기상청 시각·상태가 나오던 자리의 글(회색 주의) — 실제 특보가 없다고 오해하지 않게 */
export const SCN_CUT_LABEL = "기상청 실시간 특보 끊음";
/** 끊긴 응답의 상태 글(status.message) */
export const SCN_CUT_MESSAGE = "시연 시나리오를 켠 동안 기상청 실시간 특보를 받지 않습니다";

/**
 * 끊긴 계정이 받는 특보 응답(R45) — 기상청을 부르지 않고 시나리오 특보만, 예비특보 없음, 상태 ok, realtimeCut.
 * 조회 시각(fetchedAt — T3Q collected_at) = 이 응답을 만든 때(시나리오 상태를 읽은 때), 특보의 발표 시각(issuedAt) = 켠 시각.
 * 끊지 않는 계정이면 null(기상청 실시간 그대로 — 서버 weatherFor)
 */
export function scenarioWeather(st: ScenarioState | null | undefined, accountId: string | null | undefined, now = Date.now()): WeatherResponse | null {
  if (!scenarioCuts(st, accountId, now)) return null;
  return {
    mode: "live",
    status: { ok: true, fetchedAt: new Date(now).toISOString(), message: SCN_CUT_MESSAGE },
    advisories: scenarioAdvisories(st, accountId, now),
    preliminary: [],
    realtimeCut: true,
  };
}

/** 시나리오 특보 번호 머리 — SCN_DEFS key 가 모두 이것으로 시작한다 */
export const SCN_KEY_PREFIX = "SCN-";
/** 답 카드·대화 보고서·브리핑 현황판 머리의 회색 한 줄 — 시나리오를 끈 뒤에 이력을 열어도 가상 특보 답이 실제 특보 답처럼 읽히지 않게(sentWithScenario) */
export const SCN_SENT_LABEL = "시연 시나리오 특보와 함께 보낸 질문";

/**
 * 이 요청(T3Q 로 보낸 본문)에 시연 시나리오 특보를 함께 보냈는가 — weather_warnings.items 의 특보 번호가 SCN- 로 시작하는 항목이 있거나,
 * source 가 「시연 시나리오(가상 특보)」일 때(R45 — 끊긴 계정이 기준지역을 시나리오 구역 밖으로 두고 보낸 빈 목록도: 기상청 실시간을 확인한 답이 아니다)
 */
export function sentWithScenario(request: unknown): boolean {
  const ww = (request as { weather_warnings?: { items?: unknown; source?: unknown } | null } | null | undefined)?.weather_warnings;
  if (ww?.source === SCN_SOURCE) return true;
  const items = ww?.items;
  return Array.isArray(items) && items.some((i) => typeof (i as { warning_key?: unknown })?.warning_key === "string" && (i as { warning_key: string }).warning_key.startsWith(SCN_KEY_PREFIX));
}
