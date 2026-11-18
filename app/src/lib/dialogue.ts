"use client";
/**
 * 대화 흐름의 규칙 — 개발서버 search/lib/dialogue.ts(kjw 352a97c·1390a0f) 이식(R62).
 * 정의서 v1.75 UFR-001-001-01 · UFR-006-001-04 · UFR-006-001-06 · UFR-006-001-10, 기능분해도 V1.78 FUN-UFR-101002 · 306004 · 306005 · 307004 · 301010.
 *  · 기준지역: 같은 시·도 안에서만 바꾸면 대화 유지 + 구분선, 시·도가 바뀌면 새 대화(중지 안내창 뒤)
 *  · 대화 전환 중지 안내창 문구(상황별 셋)
 *  · 새 대화 기본 제목 = 첫 질문 앞 30자
 *  · 질문 현황 최근 20개
 *  · 예전 대화를 열면 상단 기준지역·재난유형·발생기간을 그 대화 조건으로
 * 화면 코드에서 떼어 낸 순수 함수 + 지금 보는 대화의 진행 상황을 머리줄(BasePicker)과 나누는 작은 저장소.
 */
import { useSyncExternalStore } from "react";
import { baseKey, type BaseRegion } from "./baseRegion";
import type { Cond } from "./session";

/** 질문 현황에 올리는 질문의 최대 수(정의서 UFR-006-001-10 「최근 20개」) */
export const ASK_LIST_MAX = 20;

/** 질문 현황에 보일 끝난 질문 — 최근 것만(돌고 있는 질문은 따로 늘 보인다). newestFirst = 최근 것이 앞에 있는 목록 */
export function recentDone<T>(done: readonly T[], runningCount: number, max = ASK_LIST_MAX, newestFirst = true): T[] {
  const room = Math.max(0, max - runningCount);
  if (done.length <= room) return [...done];
  return newestFirst ? done.slice(0, room) : done.slice(done.length - room);
}

/**
 * 기준지역을 바꿀 때 같은 시·도 안인지(FUN-UFR-101002) — 개발서버 isSameProvince.
 * 전국(null)과 시·도 사이, 전국끼리, 서로 다른 시·도 사이는 모두 「다른 시·도」다.
 */
export function isSameProvince(a: BaseRegion | null | undefined, b: BaseRegion | null | undefined): boolean {
  if (!a || !b) return false;
  return a.sido.code === b.sido.code;
}

/** 새 대화 기본 제목에 쓸 첫 질문 앞부분의 길이(정의서 UFR-006-001-04 E — 개발서버 DefaultTitleLength) */
export const DEFAULT_TITLE_LENGTH = 30;

/** 새 대화의 기본 제목(FUN-UFR-306005) — 첫 질문의 앞부분. 첫 답에 T3Q 대화 제목이 오면 그것으로, 사람이 고친 제목은 그대로 */
export function defaultTitleOf(firstQuestion: string | undefined): string {
  const text = (firstQuestion ?? "").replace(/\s+/g, " ").trim();
  if (text === "") return "";
  return text.length > DEFAULT_TITLE_LENGTH ? `${text.slice(0, DEFAULT_TITLE_LENGTH)}…` : text;
}

/** 대화를 옮길 때 띄우는 중지 안내창의 본문(FUN-UFR-306004 · 개발서버 leaveMessage 글자 그대로). 둘 다 0이면 빈 글 */
export function leaveMessage(running: number, waiting: number): string {
  if (running > 0 && waiting > 0) return `답변 생성 중인 질문 ${running}개는 중단되고, 대기 중인 질문 ${waiting}개는 보내지 않습니다.`;
  if (running > 0) return `답변 생성 중인 질문 ${running}개는 중단됩니다.`;
  if (waiting > 0) return `대기 중인 질문 ${waiting}개는 보내지 않습니다.`;
  return "";
}

/** 중지 안내창 제목·단추(개발서버 SearchSessionProvider 글자 그대로) */
export const LEAVE_TITLE = { new: "새 대화를 시작하시겠습니까?", open: "다른 대화를 여시겠습니까?" } as const;
export const LEAVE_OK = { new: "새 대화 시작", open: "대화 열기" } as const;

/** 같은 시·도 안에서 기준지역이 바뀐 자리의 구분선 글(정의서 UFR-001-001-01 G) */
export function regionBreakText(from: string, to: string, at: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `기준지역이 변경되었습니다 · ${from} → ${to} · ${p(at.getHours())}:${p(at.getMinutes())}`;
}

/** 같은 시·도 안 기준지역 변경 구분선 — afterTurnId 턴 뒤에 선다(null = 첫 턴 앞) */
export interface RegionBreak {
  afterTurnId: string | null;
  from: string;
  to: string;
  at: string;
}

/** 같은 시·도 안 기준지역 변경을 통합 탐색에 알리는 이벤트(머리줄 BasePicker → explore) */
export const REGION_BREAK_EVENT = "sa:region-break";

/* ── 지금 보는 대화의 진행 상황(중지 안내창이 센다) ── */

const ACTIVE_RUNNING = ["SUBMITTED", "RUNNING"];

interface TurnLike {
  jobId?: string;
  pending?: boolean;
  error?: string;
}

/**
 * 대화의 진행 상황 — 답변 생성 중(보냄·답변 생성 중)과 대기(보내는 중·우리 대기열에서 차례를 기다림 QUEUED).
 * 개발서버는 개별 질문 = 답변 생성 중, 차례가 오지 않은 브리핑 항목 = 대기로 센다 — 우리는 대기열(QUEUED)이 그 자리다
 */
export function activityOf(turns: readonly TurnLike[], stateOf: (jobId: string) => string | undefined): { running: number; waiting: number; jobIds: string[] } {
  let running = 0;
  let waiting = 0;
  const jobIds: string[] = [];
  for (const t of turns) {
    if (t.error) continue;
    if (!t.jobId) {
      if (t.pending) waiting++;
      continue;
    }
    const st = stateOf(t.jobId);
    if (st === "QUEUED") waiting++;
    else if (st !== undefined && ACTIVE_RUNNING.includes(st)) running++;
    else continue;
    jobIds.push(t.jobId);
  }
  return { running, waiting, jobIds };
}

/** 지금(또는 마지막으로) 통합 탐색에서 본 대화 — 다른 화면에 가도 남는다(대화 이력에서 다른 대화를 열 때 묻기 위해) */
export interface OpenConvState {
  convId: string | null;
  turns: readonly TurnLike[];
}
const EMPTY: OpenConvState = { convId: null, turns: [] };
let open: OpenConvState = EMPTY;
const subs = new Set<() => void>();
/** 떠나기로 한 대화 — 아직 접수 응답을 기다리던 질문은 작업 ID 를 받는 즉시 멈춘다 */
const left = new Set<string>();

export const openConvBus = {
  get: () => open,
  set(next: OpenConvState) {
    if (next.convId === open.convId && next.turns === open.turns) return;
    open = next;
    subs.forEach((f) => f());
  },
  reset: () => openConvBus.set(EMPTY),
  subscribe(f: () => void) {
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  },
  markLeft: (convId: string | null) => {
    if (convId) left.add(convId);
  },
  isLeft: (convId: string) => left.has(convId),
};

export function useOpenConv(): OpenConvState {
  return useSyncExternalStore(openConvBus.subscribe, openConvBus.get, () => EMPTY);
}

/* ── 예전 대화를 열 때 상단 조건 되살리기(FUN-UFR-307004) ── */

/**
 * 대화에 남긴 기준지역(코드 2·5·8자리 + 시·도부터 이은 이름)으로 기준지역 선택값을 만든다. 「」 = 전국(null), 모르면 undefined(바꾸지 않음).
 * 단계는 코드 자릿수로 읽는다(개발서버 regionChoiceOf 는 10자리 코드의 0 개수로 — 우리 코드는 2·5·8자리)
 */
export function baseFromSaved(code: string | undefined, name: string | undefined): BaseRegion | null | undefined {
  if (typeof code !== "string") return undefined;
  if (code === "") return null;
  if (!/^\d+$/.test(code) || ![2, 5, 8].includes(code.length)) return undefined;
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const sido = { code: code.slice(0, 2), name: parts[0] ?? code.slice(0, 2) };
  if (code.length === 2) return { sido };
  if (code.length === 5) return { sido, sigungu: { code, name: parts.slice(1).join(" ") || sido.name } };
  const sgName = parts.slice(1, -1).join(" ") || sido.name;
  return { sido, sigungu: { code: code.slice(0, 5), name: sgName }, emd: { code, name: parts[parts.length - 1] ?? code } };
}

/**
 * 그 대화의 마지막 답을 받을 때의 재난유형·발생기간(정의서 UFR-006-001-06 G · 개발서버 restoreConditions).
 * context = 상류에 보낸 query_context. 나머지 조건(기상·수문 값·키워드)은 지금 값을 그대로 둔다
 */
export function restoreCond(context: Record<string, unknown> | null | undefined): Pick<Cond, "disasterType" | "periodFrom" | "periodTo"> {
  const types = context?.disaster_types;
  const disasterType = Array.isArray(types) && typeof types[0] === "string" ? (types[0] as Cond["disasterType"]) : undefined;
  const period = context?.period as { from?: unknown; to?: unknown } | undefined;
  const ok = (v: unknown) => typeof v === "string" && !Number.isNaN(new Date(v).getTime());
  const valid = ok(period?.from) && ok(period?.to);
  return { disasterType, periodFrom: valid ? (period!.from as string) : undefined, periodTo: valid ? (period!.to as string) : undefined };
}

/** 대화 하나의 시·도 — 대화를 시작한 기준지역 코드 앞 두 자리(「」 = 전국). 예전 대화(코드 없음)는 undefined */
export const convProvince = (baseCode: string | undefined) => (typeof baseCode === "string" ? baseCode.slice(0, 2) : undefined);
/** 기준지역의 시·도(전국 「」) */
export const baseProvince = (b: BaseRegion | null | undefined) => baseKey(b).slice(0, 2);

/** 질문 모음은 재난상황 조건 없이 질문 문장 그대로(UFR-006-001-11 · FUN-UFR-301007) — 기준지역·기준시각만 남기고 나머지 조건을 덮어 비운다 */
export const BARE_COND: Partial<Omit<Cond, "base" | "region">> = {
  disasterType: undefined,
  periodFrom: undefined,
  periodTo: undefined,
  warningKind: undefined,
  warningLevel: undefined,
  keywords: undefined,
  conditions: undefined,
};
