import type { Advisory, WeatherResponse } from "./contract/agent";
import { AIM_INTERVAL_MIN, AIM_GUIDE_MAX, AIM_PROMPT_ID, AIM_Q, type AimView } from "./aiMode";

/**
 * 자동 시연의 AI 모드 장면(R54) — 개발서버 DemoPinSeed AiModeItems(묶음 6)·DemoPinService.FetchAiModeAsync 와 같은 것.
 * 가상 특보 하나를 실어 실제 AI 모드 점검과 같은 질의(AIM_Q · AI_MODE)를 보내 받아 두고, 자동 시연이 그 답으로 특보 줄과 AI 모드 창을 띄운다.
 * 실제 기상특보·AI 모드 점검 기록(sa_aim_checks)에는 넣지 않는다. 받아 둔 답은 질문 모음 받아 둔 답과 같은 표(sa_demo_pins · 항목 id = 아래 id)
 *  · 날짜·시각 = 개발서버 그대로(시연일 2026-11-05 고정 — 언제 받아도 화면 날짜가 시연일로), 기준 시각 = 발표 5분 뒤
 *  · 개발서버의 AIM-BS-02(특보 두 건 확인용 — 장면에 쓰지 않음)는 옮기지 않았다(우리는 특보마다 따로 묻는 작업 두 개라 받아 둔 답 한 칸에 담기지 않음)
 */
export interface AimDemoItem {
  id: string;
  title: string;
  /** 시연일(한국 날짜) */
  date: string;
  /** 발표 시각(HH:mm, 한국) */
  at: string;
  adminCode: string;
  regionName: string;
  warning: { key: string; kind: string; level: "예비특보" | "주의보" | "경보"; changeType: string };
}

export const AIM_DEMO: AimDemoItem[] = [
  { id: "AIM-BS-01", title: "AI 모드 상황 감지 — 부산 호우 예비특보(가상)", date: "2026-11-05", at: "11:00", adminCode: "2600000000", regionName: "부산광역시", warning: { key: "DEMO-BS-RAIN-PRE", kind: "호우", level: "예비특보", changeType: "신규" } },
  { id: "AIM-BS-03", title: "AI 모드 상황 감지 — 부산 호우주의보(가상)", date: "2026-11-05", at: "15:00", adminCode: "2600000000", regionName: "부산광역시", warning: { key: "DEMO-BS-RAIN-ADV", kind: "호우", level: "주의보", changeType: "신규" } },
];
export const aimDemoById = (id: string) => AIM_DEMO.find((x) => x.id === id);

/** 가상 특보 발표 시각(+09:00) */
export const aimDemoIssued = (it: AimDemoItem) => `${it.date}T${it.at}:00+09:00`;
/** 점검 기준 시각 — 발표 5분 뒤(개발서버 asOf) */
export const aimDemoAsOf = (it: AimDemoItem) => new Date(Date.parse(aimDemoIssued(it)) + 5 * 60_000).toISOString();

/** 특보 줄에 얹는 가상 특보 — 「시연 시나리오」 표지를 단다(기상청 특보로 읽히지 않게, R43 과 같은 표지) */
export function aimDemoAdvisory(it: AimDemoItem): Advisory {
  return { id: it.warning.key, type: it.warning.kind, level: it.warning.level, area: it.regionName, issuedAt: aimDemoIssued(it), status: "발효", isNew: true, scenario: true };
}

/** 받을 때 보내는 질의 — 실제 AI 모드 점검(lib/server/aiMode startCheck)과 같은 꼴, 특보는 그 하나만 */
export function aimDemoRequest(it: AimDemoItem, warningsPayload: (w: WeatherResponse, a: Advisory[]) => Record<string, unknown>) {
  const asOf = aimDemoAsOf(it);
  const weather: WeatherResponse = { mode: "live", status: { ok: true, fetchedAt: asOf, message: "시연" }, advisories: [], preliminary: [], realtimeCut: true };
  return {
    question: AIM_Q,
    source: "AI_MODE" as const,
    queryContext: { reference_time: asOf, region: { admin_code: it.adminCode, level: "SIDO", name: it.regionName } },
    aiMode: { check_id: `DEMO-${it.id}`, trigger: "WARNING_CHANGED", interval_min: AIM_INTERVAL_MIN, prompt_id: AIM_PROMPT_ID },
    weatherWarnings: warningsPayload(weather, [aimDemoAdvisory(it)]),
  };
}

/** 받아 둔 답 → AI 모드 창이 그리는 점검(개발서버 AiModeView). 답 글이 비었으면 안내 없이(창이 「별도 안내가 없습니다」) */
export function aimDemoView(it: AimDemoItem, answer: unknown, noWarning?: unknown): AimView {
  const asOf = aimDemoAsOf(it);
  const msg = typeof answer === "string" ? answer.trim().slice(0, AIM_GUIDE_MAX) : "";
  return {
    checkId: `DEMO-${it.id}`, adminCode: it.adminCode, regionName: it.regionName, triggerType: "WARNING_CHANGED", status: "DONE",
    noWarningMessage: typeof noWarning === "string" && noWarning ? noWarning : null,
    guides: msg ? [{ sortNo: 0, warningKey: it.warning.key, kind: it.warning.kind, level: it.warning.level, areaName: it.regionName, message: msg }] : [],
    warnings: [{ warningKey: it.warning.key, kind: it.warning.kind, level: it.warning.level, areaName: it.regionName, effectiveDe: aimDemoIssued(it), changeType: it.warning.changeType, scenario: true }],
    collectStatus: "SUCCESS", checkedDe: asOf, lastCheckDe: asOf,
    nextCheckDe: new Date(Date.parse(asOf) + AIM_INTERVAL_MIN * 60_000).toISOString(),
  };
}
