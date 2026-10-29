import "server-only";
import { ACCOUNTS, type Account } from "../config";
import type { WeatherResponse } from "../contract/agent";
import { baseName, baseTarget, baseWire, defaultBase } from "../baseRegion";
import { briefRequest, demoAsk, demoFor, presetCondition, wireCondition } from "../library";
import { SCN_ACCOUNT, type ScnRegion } from "../scenario";
import { activeAdvisories, warningsPayload } from "../wxref";
import { jobInputOf, type JobBody } from "./jobInput";
import type { SubmitInput } from "./jobs";

/**
 * 「시연 세트 예열」 접수 목록 — 화면이 보내는 것과 같은 재사용 열쇠(질문 글·질문 출처·query_context·특보)가 되게 만든다.
 * 화면과 같은 모양의 접수 본문을 질의 접수 라우트(api/agent/jobs)와 같은 함수 jobInputOf(문항 재난유형 · buildQueryContext)로 바꾼다.
 * 열쇠에 들어가지 않는 칸(briefing·turn_no)도 화면과 같게 둔다. 시험: harness/region/demoWarmKey.test.ts(jobs.ts cacheKeyOf 로 열쇠를 견줌)
 */

/** 예열 계정 = 그 지역 시연 계정(lib/scenario SCN_ACCOUNT — 시나리오 특보가 붙는 계정, 브리핑 항목을 읽는 계정과 같게). 설정에 없으면 undefined */
export const demoAccountOf = (r: ScnRegion): Account | undefined => ACCOUNTS.find((a) => a.id === SCN_ACCOUNT[r]);
export interface DemoWarmEntry {
  kind: "CHAIN" | "BRIEFING";
  /** 묶음 항목 id(DD-…) · 브리핑 항목 key */
  itemId: string;
  /** 대본 단계 */
  scene: string;
  title: string;
  input: SubmitInput;
}
/** 설정 화면 「내 브리핑 항목」 한 줄(lib/briefing BriefItem 과 같은 모양) */
export interface BriefLike { key: string; label?: string; q: string; on?: boolean; preset?: string }

/**
 * 사슬 질문 — 묶음 가운데 실시간이 아닌 항목. 화면 = 질문 모음 「재난담당자의 하루」 한 번 누르기(explore askDemo → session.submitBody):
 * 기준지역 = 그 장면의 기준지역(항목에 정한 것, 없으면 계정 기본) · 조건 = 프리셋만 · 특보 없음
 */
export function demoChainPlan(acc: Account, region: string): DemoWarmEntry[] {
  return demoFor(region)
    .filter((d) => !d.live)
    .map((d) => {
      const a = demoAsk(d);
      const base = d.base ?? defaultBase(acc);
      const body: JobBody = { libraryId: a.libraryId, quickQueryId: a.quickQueryId, condition: presetCondition(baseWire(base), a.cond) };
      return { kind: "CHAIN" as const, itemId: d.id, scene: d.scene, title: d.title, input: jobInputOf(acc, body, a.question, a.source) };
    });
}

/**
 * 브리핑 세트 — 계정에 저장된 「내 브리핑 항목」의 체크 항목 전부, 화면 [브리핑 시작](explore startBriefing)과 같게:
 * 기준지역 = 계정 기본 · 재난상황 조건 비움 · 문항 그대로인 항목만 문항으로 · 특보 = AI 모드가 켜진 화면이 그때 보내는 weather_warnings · turn_no = 항목 번호
 */
export function demoBriefPlan(acc: Account, items: BriefLike[], warnings: Record<string, unknown> | null): DemoWarmEntry[] {
  const base = defaultBase(acc);
  const use = items.filter((x) => x.on && x.q.trim());
  return use.map((it, i) => {
    const r = briefRequest(it, i, use.length, baseName(base));
    const body: JobBody = { libraryId: r.libraryId, quickQueryId: r.quickQueryId, condition: wireCondition(baseWire(base), {}), warnings, briefing: r.briefing, turnNo: i + 1 };
    return {
      kind: "BRIEFING" as const, itemId: it.key, scene: "2", title: `브리핑 ${i + 1}/${use.length} · ${it.label?.trim() || "항목"}`,
      input: jobInputOf(acc, body, r.question, "BRIEFING"),
    };
  });
}

/**
 * 브리핑에 함께 보내는 특보 — AI 모드가 켜진 화면이 [브리핑 시작] 때 보내는 것(explore liveWarnings)과 같은 계산:
 * 그 계정 화면이 받는 특보(lib/server/weather weatherFor — 기상청 실시간 + 시연 시나리오 특보)에서 계정 기본 기준지역을 덮는 발효 특보
 */
/** 실린 특보 번호(warning_key) — 운영관리 예열 표의 브리핑 줄에 받은 값 그대로 보인다 */
export const warnNosOf = (w?: Record<string, unknown> | null): string[] =>
  ((w?.items as { warning_key?: string }[] | undefined) ?? []).flatMap((i) => (i.warning_key ? [i.warning_key] : []));

export const briefWarningsOf =(weather: WeatherResponse, acc: Account) => warningsPayload(weather, activeAdvisories(weather, baseTarget(defaultBase(acc))));
