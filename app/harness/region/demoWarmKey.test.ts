// 하네스 — 질문 모음 「재난담당자의 하루」 묶음 정의 · 질문별 조건 프리셋 · 「시연 세트 예열」(/api/admin/warm/demo)
//  · 묶음 정의: 지역 코드 · id 중복 · 프리셋 칸 이름(조건 편집 창과 같은 칸) · 실시간 항목 · 대본·녹화와 같은 질문 글·조건
//  · 예열 요청 = 화면 요청: 재사용 열쇠(lib/server/jobs.ts)에 드는 질문 글 · 질문 출처 · query_context · 특보가 같아야 예열한 답이 화면에 즉시 나온다
//    화면 = explore askDemo · startBriefing → session.submitBody → (JSON) → 질의 접수 라우트(api/agent/jobs → lib/server/jobInput jobInputOf) → jobs.ts cacheKeyOf
//    예열 = lib/server/warmPlan(같은 jobInputOf) → cacheKeyOf — 열쇠 문자열을 그대로 견준다
//  · 프리셋은 그 질문 요청에만 실리고 세션 조건(조건 편집 창 값)은 바꾸지 않는다
// npx vitest run harness/region/demoWarmKey.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DISASTER_TYPES, type Account } from "@/lib/config";
import { basePilot, baseTarget, baseWire, defaultBase, type BaseRegion } from "@/lib/baseRegion";
import type { WeatherResponse } from "@/lib/contract/agent";
import { SCN_ACCOUNT, SCN_REGIONS, SCN_SOURCE, scenarioWeather, sentWithScenario, type ScenarioState, type ScnRegion } from "@/lib/scenario";
import { KMA_SOURCE, activeAdvisories, warningsPayload } from "@/lib/wxref";
import {
  COND_ITEMS, DEFAULT_BRIEFING, DEMO_DAY, DEMO_DAY_BRIEFING, LIBRARY, briefRequest, demoAsk, demoFor, libById, libraryFor, presetCondition, presetLines, presetManual, wireCondition,
  type DemoItem,
} from "@/lib/library";
import { submitBody, type Cond, type SubmitArgs } from "@/lib/session";
import { jobInputOf, type JobBody } from "@/lib/server/jobInput";
import { cacheKeyOf, type JobSource, type SubmitInput } from "@/lib/server/jobs";
import { briefWarningsOf, demoAccountOf, demoBriefPlan, demoChainPlan, warnNosOf } from "@/lib/server/warmPlan";

const REC = join(__dirname, "..", "recordings");
const rec = (p: string) => JSON.parse(readFileSync(join(REC, `${p}.json`), "utf8")) as { question: string; request: { question_source: string; query_context: unknown; briefing?: unknown; weather_warnings?: { items: Record<string, string>[] } } };
/** 예열 계정 = 시연 계정(route → warmPlan demoAccountOf) */
const accOf = (r: string) => demoAccountOf(r as ScnRegion)!;
/** 로그인 직후 세션 조건(lib/session condFor) — 기준지역만, 나머지 비움 */
const condOf = (base: BaseRegion | null): Cond => ({ base, region: basePilot(base) });
/** 재사용 열쇠에 드는 특보 칸(jobs.ts warnKeys) */
const warnKeys = (w?: Record<string, unknown> | null) => ((w?.items as Record<string, string>[]) ?? []).map((i) => [i.warning_key, i.kind, i.level, i.area]);
/** 화면이 보낸 본문(JSON 으로 오간 그대로)을 라우트가 받아 만드는 submitJob 입력 */
function screenInput(acc: Account, cond: Cond, a: SubmitArgs): SubmitInput {
  const body = JSON.parse(JSON.stringify(submitBody(cond, a))) as JobBody & { question: string; source: JobSource };
  return jobInputOf(acc, body, body.question.trim(), body.source);
}
/** 화면 요청의 재사용 열쇠(jobs.ts 와 같은 함수) */
const screenKey = (acc: Account, cond: Cond, a: SubmitArgs) => cacheKeyOf(screenInput(acc, cond, a));

/** 묶음 항목 ↔ 녹화(대본 질문 글·조건의 원본). YC-01 은 새 질문 글 실측(demo_v3/YC-01-v3 — 재난유형 없이 보냄)과 조건까지 같게, BS-02 는 「·CCTV」 뺀 글 실측(demo_v3/BS-02-v4 — 사용자 지시 2026-10-30) */
const RECORDING: Record<string, string> = {
  "DD-BS-02": "demo_v3/BS-02-v4", "DD-BS-04": "demo_chain_busan/BS-04", "DD-BS-05": "demo_chain_busan/BS-05", "DD-BS-06": "demo_chain_busan/BS-06", "DD-BS-07": "demo_v3/BS-07-v3",
  "DD-IJ-01": "demo_chain_inje/IJ-01", "DD-IJ-02": "demo_chain_inje/IJ-02", "DD-IJ-04": "demo_chain_inje/IJ-04", "DD-IJ-05": "demo_chain_inje/IJ-05", "DD-IJ-05-R": "demo_chain_inje/IJ-05-R", "DD-IJ-07-R": "demo_chain_inje/IJ-07-R",
  "DD-YC-01": "demo_v3/YC-01-v3", "DD-YC-02": "demo_chain_yeongcheon/YC-02", "DD-YC-04": "demo_chain_yeongcheon/YC-04", "DD-YC-05": "demo_chain_yeongcheon/YC-05", "DD-YC-06": "demo_chain_yeongcheon/YC-06", "DD-YC-09": "demo_v3/YC-09",
};
const PREFIX = { busan: "DD-BS-", inje: "DD-IJ-", yeongcheon: "DD-YC-" } as const;
const PRESET_KEYS = ["disasterType", "periodFrom", "periodTo", "warningKind", "warningLevel", "keywords", "conditions"];

describe("묶음 「재난담당자의 하루」 정의", () => {
  it("지역 코드 · id 중복 · 장면 순서", () => {
    const ids = DEMO_DAY.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of DEMO_DAY) {
      expect(d.regions).toHaveLength(1);
      expect(Object.keys(PREFIX)).toContain(d.regions[0]);
      expect(d.id.startsWith(PREFIX[d.regions[0]])).toBe(true);
      expect(LIBRARY.some((q) => q.id === d.id)).toBe(false); // 질문 모음 문항 id 와 겹치지 않음
      expect(libById(d.id)).toBe(d); // 접수 라우트·자동 조회가 찾는다
      expect(d.text).not.toContain("{지역}");
      expect(d.title.trim()).not.toBe("");
    }
    for (const r of Object.keys(PREFIX)) {
      expect(demoFor(r).length).toBeGreaterThan(0);
      expect(libraryFor(r).some((q) => q.id.startsWith("DD-"))).toBe(false); // 지역 질문 탭·시작 화면에는 안 나옴
    }
    expect(demoFor("national")).toEqual([]);
    for (const r of DEMO_DAY_BRIEFING) expect(Object.keys(PREFIX)).toContain(r);
    // 브리핑 4번 「하천 옆 지하차도」는 질문 모음 문항으로 등록하지 않는다(대본 §8 #6 — 설정 화면 「+ 항목 추가」로 넣음, 자동 조회 없음)
    expect(LIBRARY.some((q) => q.text === rec("demo_v3/BRF-BS-4").question)).toBe(false);
  });

  it("질문 글에 CCTV 없음(사용자 지시 2026-10-30 — 실시간 영상은 시연·질문에서 뺀다)", () => {
    for (const q of [...LIBRARY, ...DEMO_DAY]) expect(q.text, q.id).not.toMatch(/CCTV|씨씨티비/i);
  });

  it("실시간 항목 = 부산 BS-02 · 인제 IJ-05-R · 영천 YC-02 (사용자 결정 2026-10-30 — YC-01 새 질문 136초), 정비계획·공사 질문 없음", () => {
    expect(DEMO_DAY.filter((d) => d.live).map((d) => d.id)).toEqual(["DD-BS-02", "DD-IJ-05-R", "DD-YC-02"]);
    for (const d of DEMO_DAY) expect(d.text).not.toMatch(/정비계획|정비사업|정비 상태|공사/);
  });

  it("프리셋 칸 이름 — 조건 편집 창과 같은 칸만, 값 모양", () => {
    for (const d of DEMO_DAY) {
      for (const k of Object.keys(d.cond)) expect(PRESET_KEYS).toContain(k);
      if (d.cond.disasterType) expect(DISASTER_TYPES as readonly string[]).toContain(d.cond.disasterType);
      if (d.cond.warningLevel) expect(["주의보", "경보"]).toContain(d.cond.warningLevel);
      for (const k of ["periodFrom", "periodTo"] as const) if (d.cond[k]) expect(d.cond[k]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const c of d.cond.conditions ?? []) {
        expect(COND_ITEMS.map((x) => x.item)).toContain(c.item);
        expect(Number.isFinite(c.value)).toBe(true);
      }
    }
    // 보내는 수치 칸은 조건 편집 창 글자 그대로
    expect(presetCondition(null, { conditions: [{ item: "RAIN_3H", value: 60 }] }).conditions).toEqual([{ item: "RAIN_3H", label: "3시간 누적 강우", value: 60, unit: "mm" }]);
    expect(presetLines(libById("DD-BS-02") ? (libById("DD-BS-02") as DemoItem).cond : {})).toEqual(["재난유형 호우", "특보 종류 호우", "특보 단계 경보", "1시간 강우 50mm"]);
    // 가정 조건(특보 종류·단계·수치)이 붙은 항목에만 「사용자 입력 조건」 표지
    expect(DEMO_DAY.filter((d) => presetManual(d.cond)).map((d) => d.id)).toEqual(["DD-BS-02", "DD-IJ-02", "DD-YC-02"]);
  });

  it("질문 글·조건 = 대본 녹화(화면에서 누른 요청의 query_context)", () => {
    for (const d of DEMO_DAY) {
      const p = RECORDING[d.id];
      expect(p, d.id).toBeTruthy();
      const r = rec(p);
      const acc = accOf(d.regions[0]);
      const k = screenInput(acc, condOf(d.base ?? defaultBase(acc)), demoAsk(d));
      expect(k.question, d.id).toBe(r.question);
      expect(k.queryContext, d.id).toEqual(r.request.query_context);
      expect(warnKeys(k.weatherWarnings), d.id).toEqual([]); // 사슬 질문에는 특보를 붙이지 않는다(가정 조건만)
    }
  });
});

describe("시연 세트 예열 ↔ 화면 — 같은 재사용 열쇠", () => {
  it("예열 계정 = 시연 계정(시나리오 특보가 붙는 계정)", () => {
    for (const r of SCN_REGIONS) expect(accOf(r).id).toBe(SCN_ACCOUNT[r]);
  });

  for (const r of Object.keys(PREFIX)) {
    it(`${r} 사슬 질문(실시간 제외)`, () => {
      const acc = accOf(r);
      const plan = demoChainPlan(acc, r);
      expect(plan.map((p) => p.itemId)).toEqual(demoFor(r).filter((d) => !d.live).map((d) => d.id));
      for (const p of plan) {
        const d = libById(p.itemId) as DemoItem;
        // 화면: 그 장면의 기준지역(BS-07 은 진행자가 동구로 바꾼 뒤) · 세션 조건 비움
        expect(cacheKeyOf(p.input), p.itemId).toBe(screenKey(acc, condOf(d.base ?? defaultBase(acc)), demoAsk(d)));
        expect(p.input.source).toBe("LIBRARY");
        expect(p.input.weatherWarnings ?? null).toBeNull();
      }
      // 세션 조건이 남아 있어도(입력창에서 고친 뒤) 묶음 항목 열쇠는 그대로 — 프리셋만 싣는다
      const d0 = libById(plan[0].itemId) as DemoItem;
      const dirty: Cond = { ...condOf(d0.base ?? defaultBase(acc)), disasterType: "대설", keywords: ["도로"] };
      expect(screenKey(acc, dirty, demoAsk(d0))).toBe(cacheKeyOf(plan[0].input));
    });
  }

  it("부산 브리핑 세트(BR-01~03 + 4번 「하천 옆 지하차도」) — 출처 · 특보 · briefing 칸", () => {
    const acc = accOf("busan");
    const brf4 = rec("demo_v3/BRF-BS-4");
    // 특보 = 시연 시나리오를 켠 때 그 계정 화면이 받는 특보(서버 weatherFor 와 같은 계산 — 기상청 실시간 끊음, 시나리오만 — R45)
    const on: ScenarioState = { on: true, regions: SCN_REGIONS, startedAt: "2026-11-05T08:00:00+09:00", until: "2026-11-05T12:00:00+09:00", by: "시험" };
    const live: WeatherResponse = { mode: "live", status: { ok: true, fetchedAt: "2026-11-05T08:30:00+09:00", message: "현재 발효 특보 없음" }, advisories: [], preliminary: [] };
    const weather = scenarioWeather(on, acc.id, Date.parse("2026-11-05T08:30:00+09:00"))!;
    expect(weather.realtimeCut).toBe(true);
    // 예열(route → briefWarningsOf) = 끊긴 화면(AI 모드 켜짐 · 기준지역 = 계정 기본 → explore liveWarnings)
    const ww = briefWarningsOf(weather, acc);
    expect(ww).toEqual(warningsPayload(weather, activeAdvisories(weather, baseTarget(condOf(defaultBase(acc)).base))));
    // 녹화(demo_v3/BRF-BS-4)의 weather_warnings 와 시각만 다르다 — 수집 시각 = 특보 응답을 받은 시각, 발표·발효 시각 = 켠 시각
    const rw = brf4.request.weather_warnings as unknown as { collected_at: string; items: Record<string, string>[] };
    const at = (s: string) => (s === rw.collected_at ? on.startedAt : s);
    expect(ww).toEqual({ ...rw, collected_at: new Date(Date.parse("2026-11-05T08:30:00+09:00")).toISOString(), items: rw.items.map((i) => Object.fromEntries(Object.entries(i).map(([k, v]) => [k, at(v)]))) });
    // 녹화(demo_v3/BRF-BS-4 — 대본 실측)와 열쇠 성분·출처가 같다(시각은 열쇠에 안 들어감)
    expect(warnKeys(ww)).toEqual(warnKeys(brf4.request.weather_warnings as unknown as Record<string, unknown>));
    expect(ww.source).toBe((brf4.request.weather_warnings as unknown as { source: string }).source);
    // 4번 = 설정 화면 「+ 항목 추가」로 넣은 항목(질문 모음 문항 아님 — 녹화 briefing_item_id 「c-BS-01」), BR-04 체크 해제
    const items = [
      ...DEFAULT_BRIEFING.map((id) => ({ key: id, preset: id, label: libById(id)!.category, q: libById(id)!.text, on: id !== "BR-04" })),
      { key: "c-BS-01", label: "하천 옆 지하차도", q: brf4.question, on: true },
    ];
    const plan = demoBriefPlan(acc, items, ww);
    expect(plan.map((p) => p.itemId)).toEqual(["BR-01", "BR-02", "BR-03", "c-BS-01"]);
    const use = items.filter((x) => x.on);
    plan.forEach((p, i) => {
      // 화면 startBriefing: 브리핑 출처 · 세션 조건 비움 · AI 모드가 켜져 있어 그때 특보를 함께
      const a: SubmitArgs = { ...briefRequest(use[i], i, use.length, "부산광역시"), source: "BRIEFING", warnings: ww, turnNo: i + 1 };
      expect(cacheKeyOf(p.input)).toBe(screenKey(acc, condOf(defaultBase(acc)), a));
      expect(p.input.briefing).toEqual({ preset_id: "MY-BRIEFING", briefing_item_id: use[i].key, item_no: i + 1, item_total: 4 });
      expect(p.input.turnNo).toBe(i + 1);
      expect(warnKeys(p.input.weatherWarnings)).toEqual([["SCN-BS-1", "호우", "경보", "부산"]]);
      expect(warnNosOf(p.input.weatherWarnings)).toEqual(["SCN-BS-1"]); // 운영관리 표의 브리핑 줄
    });
    // 녹화(demo_v3/BRF-BS-1~4)와 같은 질문 글·query_context·briefing 칸 — 4번은 문항이 아니라 자동 조회 없음(libraryId 없음)
    plan.forEach((p, i) => {
      const r = rec(`demo_v3/BRF-BS-${i + 1}`);
      expect(p.input.question).toBe(r.question);
      expect(p.input.queryContext).toEqual(r.request.query_context);
      expect(p.input.libraryId ?? null).toBe(i < 3 ? use[i].key : null);
    });
    expect(plan[3].input.briefing).toEqual(brf4.request.briefing);
    // 시나리오를 끄면 브리핑 열쇠가 달라진다 — 운영관리 표에 「특보 없음」
    const off = demoBriefPlan(acc, items, briefWarningsOf(live, acc));
    expect(warnNosOf(off[0].input.weatherWarnings)).toEqual([]);
    expect(cacheKeyOf(off[0].input)).not.toBe(cacheKeyOf(plan[0].input));
  });

  it("시연 시나리오 특보와 함께 보낸 요청 판별(답 카드·보고서·브리핑 머리의 회색 한 줄)", () => {
    expect(sentWithScenario(rec("demo_v3/BRF-BS-4").request)).toBe(true);
    expect(sentWithScenario(rec("demo_chain_busan/BS-02").request)).toBe(false);
    expect(sentWithScenario({ weather_warnings: { items: [{ warning_key: "L1010100-호우-경보" }] } })).toBe(false);
    expect(sentWithScenario(null)).toBe(false);
    // R45 — 끊긴 계정이 기준지역을 시나리오 구역 밖으로 두고 보낸 빈 목록(출처 시나리오)도 — 기상청 실시간을 확인한 답이 아니다
    expect(sentWithScenario({ weather_warnings: { collect_status: "COLLECTED", source: SCN_SOURCE, items: [] } })).toBe(true);
    expect(sentWithScenario({ weather_warnings: { collect_status: "COLLECTED", source: KMA_SOURCE, items: [] } })).toBe(false);
  });

  it("재사용 열쇠 — 끊긴 계정의 구역 밖 빈 목록(출처 시나리오)은 기상청 「특보 없음」과 열쇠가 다르고, 항목이 있으면 출처와 무관하게 지금 그대로(R45)", () => {
    const at = "2026-11-05T08:30:00+09:00";
    const base = { question: "점검", source: "AI_MODE" as JobSource, queryContext: { region: { name: "서울특별시" } } };
    const key = (w: Record<string, unknown>) => cacheKeyOf({ ...base, weatherWarnings: w }, { now: Date.parse(at) });
    const empty = (source: string) => ({ collect_status: "COLLECTED", collected_at: at, source, items: [] });
    expect(key(empty(SCN_SOURCE))).not.toBe(key(empty(KMA_SOURCE)));
    // 기상청 빈 목록은 예전 열쇠 그대로(출처·시각 무관)
    expect(key(empty(KMA_SOURCE))).toBe(key({ ...empty(KMA_SOURCE), collected_at: "2026-11-05T09:00:00+09:00" }));
    // 항목이 있으면 출처가 열쇠에 들지 않는다 — 예열한 SCN-* 열쇠·기상청 열쇠가 바뀌지 않음
    const item = { warning_key: "SCN-BS-1", kind: "호우", level: "경보", area: "부산", announced_at: at, effective_at: at, change: "발효" };
    expect(key({ ...empty(SCN_SOURCE), items: [item] })).toBe(key({ ...empty(KMA_SOURCE), items: [item] }));
  });
});

describe("조건 프리셋은 그 질문에만 — 세션 조건을 바꾸지 않는다", () => {
  const acc = accOf("busan");
  const session: Cond = Object.freeze({
    ...condOf(defaultBase(acc)), disasterType: "태풍", periodFrom: "2024-01-01", warningKind: "강풍", keywords: ["도로"],
    conditions: Object.freeze([Object.freeze({ item: "WIND_SPEED", label: "풍속", value: 20, unit: "m/s" })]) as Cond["conditions"],
  }) as Cond;
  const snapshot = JSON.stringify(session);

  it("프리셋 질문 = 기준지역만 세션 값, 나머지는 프리셋 값만", () => {
    const d = libById("DD-BS-02") as DemoItem;
    const body = submitBody(session, demoAsk(d));
    expect(body.condition).toEqual(presetCondition(baseWire(session.base), d.cond));
    expect(body.condition.keywords).toEqual([]);
    expect(body.condition.disasterTypes).toEqual(["호우"]);
    expect("cond" in body).toBe(false); // 프리셋 원본은 요청 본문에 따로 싣지 않는다
    expect(JSON.stringify(session)).toBe(snapshot);
  });

  it("프리셋이 없는 질문은 세션 조건 그대로(지금까지와 같은 모양)", () => {
    const body = submitBody(session, { question: "질문", source: "USER" });
    expect(body.condition).toEqual({
      base: baseWire(session.base), disasterTypes: ["태풍"], referenceTime: null, period: { from: "2024-01-01", to: null },
      warningKind: "강풍", warningLevel: null, keywords: ["도로"], conditions: session.conditions,
    });
    expect(body.condition).toEqual(wireCondition(baseWire(session.base), session));
    expect(JSON.stringify(session)).toBe(snapshot);
  });
});
