/**
 * AI 모드 상황점검 — 개발서버(kjw `998facb`)를 복제한 규칙 (R52). 화면·서버가 함께 쓴다(브라우저 전용 코드 없음).
 * 개발서버 원본: Dsai.Portal.Bll/AiMode/AiModeService.cs · AiModeSchedule.cs · Dsai.Portal.Api/AiMode/T3qAiModeAgent.cs ·
 * appsettings.json AiMode · 프런트 features/aiMode/*
 *
 * - 점검 대상(ai_region) = 시·도 + 영천시·인제군. 전국·그 밖의 시·군·구·읍·면·동은 쓸 수 없다(「AI 모드를 실행할 수 없습니다」).
 * - 배경 점검 지역(AiMode:Groups) — 접속자와 무관하게 10분마다 지역 공용으로 점검한다. 그룹 둘이 5분씩 엇갈린다.
 *   그 밖의 점검 대상 지역은 켜 둔 화면이 10분마다 점검을 건다(사용자별).
 * - 회차마다 특보 서명(발효 특보 번호 정렬 해시)이 직전 점검과 같고 답이 60분보다 젊으면 T3Q 를 부르지 않는다.
 * - 발효 특보가 있으면 특보마다 따로 묻고(동시 4), 받은 답 = 그 특보 카드의 「AI 안내」. 특보가 없으면 한 번.
 */
import type { BaseWire } from "./baseRegion";

/** AI 모드 공통 질의(10-29 합의) — 개발서버 AiMode:Question 과 글자까지 같다 */
export const AIM_Q =
  "제공된 기상특보 정보를 기준으로, 해당 지역 담당자가 지금 먼저 확인할 내용을 알려 주십시오. 발효 중인 특보가 있으면 특보마다 2문장 이내(공백 포함 80자 내외)로만 쓰고, 제목·과거 사례·근거 목록은 쓰지 마십시오. 발효 중인 특보가 없으면 대응 검토가 필요한 사유를 확인하지 못했다는 점검 결과만 1문장으로 쓰십시오. 제공되지 않은 관측값이나 피해 발생 여부는 추정하지 마십시오.";
export const AIM_PROMPT_ID = "AIM-PROMPT-01";
/** 정기 점검 간격(분) — AiMode:IntervalMin */
export const AIM_INTERVAL_MIN = 10;
/** 답이 이만큼 묵으면 특보 서명이 그대로여도 다시 묻는다(분) — AiMode:MaxAgeMin */
export const AIM_MAX_AGE_MIN = 60;
/** 특보별 질의 동시 수 — T3qAiModeAgent.MaxParallel */
export const AIM_PARALLEL = 4;
/** 특보 안내 글자 상한 — ai_mode_guide.message 칸 크기 */
export const AIM_GUIDE_MAX = 500;
/** 점검 기록 보존 일수 — AiMode:RetentionDays */
export const AIM_RETENTION_DAYS = 30;
/** 배경 점검 지역에서 화면이 결과를 다시 읽는 간격 — useAiMode ReadEveryMs */
export const AIM_READ_EVERY_MS = 2 * 60_000;
/** 특보 카드 자동 넘김 — AiModeModal SlideMs */
export const AIM_SLIDE_MS = 3000;

/** 배경 점검 그룹(AiMode:Groups) — 행정동코드 10자리 */
export const AIM_GROUPS: { name: string; codes: string[] }[] = [
  { name: "부산·영천·인제·서울", codes: ["2600000000", "4723000000", "5181000000", "1100000000"] },
  { name: "대구·인천·광주·대전·울산", codes: ["2700000000", "2800000000", "2900000000", "3000000000", "3100000000"] },
];
/** 배경 점검 지역의 이름(T3Q region.name — 시·도부터 이은 이름) — 크론이 화면 없이 회차를 걸 때 쓴다 */
export const AIM_NAMES: Record<string, string> = {
  "2600000000": "부산광역시", "4723000000": "경상북도 영천시", "5181000000": "강원특별자치도 인제군", "1100000000": "서울특별시",
  "2700000000": "대구광역시", "2800000000": "인천광역시", "2900000000": "광주광역시", "3000000000": "대전광역시", "3100000000": "울산광역시",
};
/** 시·도가 아니면서 점검 대상인 곳(배경 점검에 적어 둔 시·군) — 영천시·인제군 */
const AIM_SIGUNGU = new Set(["47230", "51810"]);

export const code10 = (code: string) => code.padEnd(10, "0");

/** 이 기준지역으로 AI 모드를 쓸 수 있는가 — 시·도, 또는 영천시·인제군(읍·면·동은 아님) */
export function aimSupported(base: BaseWire | null | undefined): boolean {
  if (!base) return false;
  if (base.level === "SIDO") return true;
  return base.level === "SIGUNGU" && AIM_SIGUNGU.has(base.code);
}

/** 배경 점검 그룹 번호 — 없으면 -1(켜 둔 화면이 직접 점검) */
export function aimGroupOf(adminCode10: string): number {
  return AIM_GROUPS.findIndex((g) => g.codes.includes(adminCode10));
}

/**
 * 그룹 회차의 시작 시각(ms) — AiModeSchedule.CronOf 와 같은 셈: 주기 10분, 그룹 수로 나눈 만큼 엇갈림(두 그룹이면 0·10·20… / 5·15·25…분).
 * 매시 정각 기준이라 시간대와 무관하다(한국 시간은 UTC+9 정시)
 */
export function aimSlotStart(group: number, now = Date.now(), interval = AIM_INTERVAL_MIN, groups = AIM_GROUPS.length): number {
  const step = Math.min(60, Math.max(1, interval)) * 60_000;
  const offset = groups <= 1 ? 0 : Math.floor((group * Math.min(60, Math.max(1, interval))) / groups) * 60_000;
  return Math.floor((now - offset) / step) * step + offset;
}

/** 점검이 근거로 삼은 특보 한 건 — 개발서버 AiModeWarningView */
export interface AimWarning {
  warningKey: string;
  kind: string;
  level: string;
  areaName: string;
  effectiveDe: string | null;
  /** 신규 · 변경 · null(유지). 「새 특보」 배지가 이 값을 본다(해제는 보내지 않는다 — WarningChange) */
  changeType: string | null;
  /** 시연 시나리오 특보(R43) */
  scenario?: boolean;
}
/** 특보 한 건에 대한 AI 안내 — 그 특보만 실어 물은 답 글(앞뒤 공백만 걷고 500자까지) */
export interface AimGuide {
  sortNo: number;
  warningKey: string;
  kind: string;
  level: string;
  areaName: string;
  message: string;
}
/** 기준지역의 가장 최근 점검 — 개발서버 AiModeStatus */
export interface AimView {
  checkId: string;
  adminCode: string;
  regionName: string;
  /** FIRST · SCHEDULED · WARNING_CHANGED */
  triggerType: string;
  status: "DONE" | "FAILED";
  noWarningMessage: string | null;
  guides: AimGuide[];
  warnings: AimWarning[];
  /** SUCCESS · FAILED — 특보 0건이 「조용하다」인지 「조회 실패」인지 */
  collectStatus: string | null;
  checkedDe: string | null;
  lastCheckDe: string | null;
  nextCheckDe: string | null;
}
/** /api/ai-mode 응답 */
export interface AimResponse {
  supported: boolean;
  /** 배경 점검 지역(지역 공용) — 화면은 읽기만 */
  managed: boolean;
  /** 점검이 도는 중(서버) */
  running: boolean;
  view: AimView | null;
}

/** 경보 먼저, 같으면 최근 발효 순 — 특보 띠와 같은 차례 */
export function sortAimWarnings(items: AimWarning[]): AimWarning[] {
  return [...items].sort((a, b) => Number(b.level === "경보") - Number(a.level === "경보") || (b.effectiveDe ?? "").localeCompare(a.effectiveDe ?? ""));
}

/** 「마지막 점검 HH:MM · 다음 점검 HH:MM」 — 개발서버 checkLine */
export function aimCheckLine(view: AimView | null, hm: (iso: string | null) => string): string {
  if (view === null) return "점검 기록이 없습니다";
  const last = hm(view.lastCheckDe ?? view.checkedDe);
  return view.nextCheckDe ? `마지막 점검 ${last} · 다음 점검 ${hm(view.nextCheckDe)}` : `마지막 점검 ${last}`;
}
