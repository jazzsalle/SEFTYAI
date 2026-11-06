// 하네스 — 시연 시나리오 특보(R43 — R6 의 시연용 예외, lib/scenario · lib/wxref) · 켠 동안 시연 계정은 기상청 실시간 특보 끊음(R45)
//  · 시연 계정 셋에만 · 꺼짐·끝나는 시각 지남·그 지역을 켜지 않음이면 빈 목록(다른 계정에는 절대 넣지 않는다)
//  · 끊김 판정(scenarioCuts) = 시나리오 특보를 붙이는 조건과 같다 · 끊긴 응답(scenarioWeather) = 시나리오 특보만 · 예비특보 없음 · 켠 시각 · realtimeCut
//  · 정의 = 대본 「시연 시나리오 특보 정의」·녹화 demo_v3/AIM-*(특보 번호·종류·단계·구역 — 재사용 열쇠에 들어감)
//  · weather_warnings: 끊긴 응답은 녹화 꼴 그대로(COLLECTED · 수집 시각 = 발표 시각 = 켠 시각 · source 「시연 시나리오(가상 특보)」 · 항목에 source 없음), 기상청과 섞이지 않음
//  · 구역이 시연 계정 기준지역(BS-07 동구 포함)을 덮는다 · 대응절차 단계 추천이 따라간다 · 「답변을 받은 뒤 특보」에는 들지 않는다
// npx vitest run harness/region/scenario.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCOUNTS } from "@/lib/config";
import type { Advisory, WeatherResponse } from "@/lib/contract/agent";
import { baseTarget, defaultBase } from "@/lib/baseRegion";
import {
  SCN_ACCOUNT, SCN_CUT_MESSAGE, SCN_DEFS, SCN_OFF, SCN_REGIONS, SCN_SOURCE, scenarioAdvisories, scenarioCuts, scenarioLive, scenarioWeather, type ScenarioState,
} from "@/lib/scenario";
import { activeAdvisories, advName, warningsPayload } from "@/lib/wxref";
import { wxCovers } from "@/lib/wxMatch";
import { recommendStep, stepLabel } from "@/lib/sop";
import { SOP_MANUALS } from "@/lib/server/sop";
import { advisoriesAfter } from "@/components/answer/AnswerCard";

const REC = join(__dirname, "..", "recordings");
type WW = { collect_status: string; collected_at: string; source: string; items: Record<string, string>[] };
const aim = (r: string) => (JSON.parse(readFileSync(join(REC, "demo_v3", `AIM-${r}.json`), "utf8")) as { request: { weather_warnings: WW } }).request.weather_warnings;
const AIM_OF = { busan: "BS", inje: "IJ", yeongcheon: "YC" } as const;

const T0 = Date.parse("2026-11-05T08:00:00+09:00");
const ON: ScenarioState = { on: true, regions: SCN_REGIONS, startedAt: new Date(T0).toISOString(), until: new Date(T0 + 4 * 3_600_000).toISOString(), by: "시스템 운영자" };
const NOW = T0 + 30 * 60_000;
const live = (advisories: Advisory[] = [], ok = true): WeatherResponse => ({ mode: "live", status: { ok, fetchedAt: new Date(NOW).toISOString(), message: ok ? "기상청 08:00 발표" : "기상청 API 연결 실패" }, advisories, preliminary: [] });
const KMA_BUSAN: Advisory = { id: "KMA-강풍주의보-부산", type: "강풍", level: "주의보", area: "부산", regionId: "busan", issuedAt: "2026-11-05T07:00:00+09:00", status: "발효" };
const acc = (id: string) => ACCOUNTS.find((a) => a.id === id)!;
const cutOf = (id: string) => scenarioWeather(ON, id, NOW)!;

describe("보이는 계정 · 켜짐 · 끝나는 시각", () => {
  it("시연 계정 셋에만 그 지역 정의 하나 — 중앙정부·운영자·모르는 계정은 빈 목록", () => {
    for (const r of SCN_REGIONS) {
      const a = scenarioAdvisories(ON, SCN_ACCOUNT[r], NOW);
      expect(a).toHaveLength(1);
      expect(a[0]).toMatchObject({ id: SCN_DEFS[r].key, type: "호우", level: SCN_DEFS[r].level, area: SCN_DEFS[r].area, regionId: r, status: "발효", scenario: true, issuedAt: ON.startedAt });
    }
    expect(SCN_ACCOUNT).toEqual({ busan: "busan", inje: "inje", yeongcheon: "01000" });
    for (const id of ["hang", "unes", "busan2", "bs_safety02", "", null, undefined]) expect(scenarioAdvisories(ON, id, NOW)).toEqual([]);
    // 설정의 계정 가운데 시연 계정이 아닌 것 모두
    for (const a of ACCOUNTS.filter((x) => !Object.values(SCN_ACCOUNT).includes(x.id))) expect(scenarioAdvisories(ON, a.id, NOW)).toEqual([]);
  });

  it("꺼짐 · 끝나는 시각 지남(그 시각 포함) · 켠 시각·끝나는 시각 없음 · 그 지역을 켜지 않음 → 빈 목록", () => {
    expect(scenarioAdvisories(SCN_OFF, "busan", NOW)).toEqual([]);
    expect(scenarioAdvisories({ ...ON, on: false }, "busan", NOW)).toEqual([]);
    expect(scenarioAdvisories(ON, "busan", Date.parse(ON.until!))).toEqual([]);
    expect(scenarioAdvisories(ON, "busan", Date.parse(ON.until!) + 1)).toEqual([]);
    expect(scenarioAdvisories(ON, "busan", Date.parse(ON.until!) - 1)).toHaveLength(1);
    expect(scenarioAdvisories({ ...ON, until: null }, "busan", NOW)).toEqual([]);
    expect(scenarioAdvisories({ ...ON, until: "모름" }, "busan", NOW)).toEqual([]);
    expect(scenarioAdvisories({ ...ON, startedAt: null }, "busan", NOW)).toEqual([]);
    expect(scenarioAdvisories({ ...ON, regions: ["inje"] }, "busan", NOW)).toEqual([]);
    expect(scenarioAdvisories({ ...ON, regions: ["inje"] }, "inje", NOW)).toHaveLength(1);
    expect(scenarioAdvisories(null, "busan", NOW)).toEqual([]);
    expect(scenarioLive(ON, NOW)).toBe(true);
    expect(scenarioLive(ON, Date.parse(ON.until!) + 1)).toBe(false);
  });
});

describe("기상청 실시간 특보 끊음(R45) — 판정 · 끊긴 응답", () => {
  it("끊는 계정 = 시연 계정 · 켬 · 끝나는 시각 전 · 그 지역 켬 — 시나리오 특보를 붙이는 조건과 정확히 같다", () => {
    for (const r of SCN_REGIONS) expect(scenarioCuts(ON, SCN_ACCOUNT[r], NOW)).toBe(true);
    // 다른 계정(운영자·행안부)·모르는 계정
    for (const id of ["unes", "hang", "busan2", "bs_safety02", "", null, undefined]) expect(scenarioCuts(ON, id, NOW)).toBe(false);
    // 꺼짐 · 만료(그 시각 포함) · 시각 없음 · 그 지역 안 켬 · 상태 없음
    expect(scenarioCuts(SCN_OFF, "busan", NOW)).toBe(false);
    expect(scenarioCuts({ ...ON, on: false }, "busan", NOW)).toBe(false);
    expect(scenarioCuts(ON, "busan", Date.parse(ON.until!))).toBe(false);
    expect(scenarioCuts(ON, "busan", Date.parse(ON.until!) - 1)).toBe(true);
    expect(scenarioCuts({ ...ON, startedAt: null }, "busan", NOW)).toBe(false);
    expect(scenarioCuts({ ...ON, regions: ["inje"] }, "busan", NOW)).toBe(false);
    expect(scenarioCuts({ ...ON, regions: ["inje"] }, "inje", NOW)).toBe(true);
    expect(scenarioCuts(null, "busan", NOW)).toBe(false);
    // 같은 조건 — 상태·계정·시각을 엮은 모든 경우
    const states: (ScenarioState | null)[] = [ON, SCN_OFF, { ...ON, on: false }, { ...ON, regions: ["busan"] }, { ...ON, regions: ["yeongcheon", "inje"] }, { ...ON, until: null }, null];
    for (const st of states)
      for (const id of [...ACCOUNTS.map((a) => a.id), "x"])
        for (const t of [NOW, Date.parse(ON.until!), Date.parse(ON.until!) + 1]) expect(scenarioCuts(st, id, t), `${id} ${JSON.stringify(st)} ${t}`).toBe(scenarioAdvisories(st, id, t).length > 0);
  });

  it("끊긴 응답 — 시나리오 특보만 · 예비특보 없음 · 상태 ok · 조회 시각 = 응답을 만든 때(특보 발표 시각 = 켠 시각) · 끊김 글 · realtimeCut. 끊지 않으면 null(기상청 그대로)", () => {
    for (const r of SCN_REGIONS) {
      expect(cutOf(SCN_ACCOUNT[r]).advisories[0].issuedAt).toBe(ON.startedAt);
      expect(cutOf(SCN_ACCOUNT[r])).toEqual({
        mode: "live", status: { ok: true, fetchedAt: new Date(NOW).toISOString(), message: SCN_CUT_MESSAGE }, advisories: scenarioAdvisories(ON, SCN_ACCOUNT[r], NOW), preliminary: [], realtimeCut: true,
      });
    }
    expect(SCN_CUT_MESSAGE).toBe("시연 시나리오를 켠 동안 기상청 실시간 특보를 받지 않습니다");
    for (const id of ["unes", "hang"]) expect(scenarioWeather(ON, id, NOW)).toBeNull();
    expect(scenarioWeather(SCN_OFF, "busan", NOW)).toBeNull();
    expect(scenarioWeather({ ...ON, regions: ["inje"] }, "busan", NOW)).toBeNull();
    expect(scenarioWeather(ON, "busan", Date.parse(ON.until!) + 1)).toBeNull();
  });
});

describe("T3Q weather_warnings — 대본 정의·녹화(demo_v3/AIM-*)와 같다", () => {
  // 부산은 호우 예비특보로 바꿨다(사용자 지시 2026-11-02) — 녹화(호우경보) 대신 아래에서 따로 확인
  it("busan — 호우 예비특보 SCN-BS-PRE-1 하나 · 발표·발효 시각 = 켠 시각 · source 「시연 시나리오(가상 특보)」", () => {
    const a = acc("busan");
    const weather = cutOf(a.id);
    const ww = warningsPayload(weather, activeAdvisories(weather, baseTarget(defaultBase(a))));
    expect(ww).toEqual({
      collect_status: "COLLECTED",
      collected_at: new Date(NOW).toISOString(),
      source: SCN_SOURCE,
      items: [{ warning_key: "SCN-BS-PRE-1", kind: "호우", level: "예비특보", area: "부산", announced_at: ON.startedAt, effective_at: ON.startedAt, change: "발효" }],
    });
  });
  for (const r of SCN_REGIONS.filter((x) => x !== "busan")) {
    it(`${r} — 끊긴 응답: 녹화 꼴 그대로(COLLECTED · 수집 시각 = 받은 시각 · 발표·발효 시각 = 켠 시각 · source 「시연 시나리오(가상 특보)」 · 항목 하나 · 항목별 source 없음)`, () => {
      const a = acc(SCN_ACCOUNT[r]);
      const weather = cutOf(a.id);
      // 화면(AI 모드 창 check · explore liveWarnings)과 같은 계산 — 계정 기본 기준지역
      const ww = warningsPayload(weather, activeAdvisories(weather, baseTarget(defaultBase(a))));
      const recd = aim(AIM_OF[r]);
      // 녹화의 시각(그때 보낸 시각 — 세 칸이 같음)만 수집 시각 = 이번에 받은 시각, 발표·발효 시각 = 이번에 켠 시각으로 바꾸면 글자까지 같다
      const at = recd.collected_at;
      expect(recd.items.every((i) => i.announced_at === at && i.effective_at === at)).toBe(true);
      const t = (s: string) => (s === at ? ON.startedAt : s);
      expect(ww).toEqual({ ...recd, collected_at: new Date(NOW).toISOString(), items: recd.items.map((i) => Object.fromEntries(Object.entries(i).map(([k, v]) => [k, t(v)]))) });
      expect(ww.source).toBe(SCN_SOURCE);
      expect(ww.items).toHaveLength(1);
      expect(ww.items[0].warning_key).toBe(`SCN-${AIM_OF[r]}-1`);
      expect(Object.keys(ww.items[0])).not.toContain("source");
    });
  }

  it("끊긴 계정이 기준지역을 시나리오 구역 밖으로 바꿔도 기상청을 조회한 것처럼 보내지 않는다 — source 시나리오 · 항목 없음 · 섞임 없음", () => {
    const weather = cutOf("busan");
    const ww = warningsPayload(weather, activeAdvisories(weather, { sido: "서울특별시" }));
    expect(ww).toEqual({ collect_status: "COLLECTED", collected_at: new Date(NOW).toISOString(), source: SCN_SOURCE, items: [] });
    // 끊긴 응답에는 기상청 특보가 없다 — 「기상청 · 시나리오」 섞인 출처가 생기지 않는다
    for (const r of SCN_REGIONS) expect(cutOf(SCN_ACCOUNT[r]).advisories.every((a) => a.scenario)).toBe(true);
    expect(warningsPayload(weather, weather.advisories).source).toBe(SCN_SOURCE);
  });

  it("기상청 특보만이면 지금 그대로(source 하나 · 항목에 source 칸 없음)", () => {
    const ww = warningsPayload(live([KMA_BUSAN]), [KMA_BUSAN]);
    expect(ww.source).toBe("기상청 기상특보 조회서비스");
    expect(ww.items).toEqual([{ warning_key: "KMA-강풍주의보-부산", kind: "강풍", level: "주의보", area: "부산", announced_at: KMA_BUSAN.issuedAt, effective_at: KMA_BUSAN.issuedAt, change: "발효" }]);
    expect(warningsPayload(live(), []).source).toBe("기상청 기상특보 조회서비스");
    expect(warningsPayload(live([], false), []).collect_status).toBe("FAILED");
  });
});

describe("화면 — 구역 맞추기 · 이름 · 대응절차 추천 · 답을 받은 뒤 특보", () => {
  it("시나리오 구역이 시연 계정 기본 기준지역을 덮고, 부산은 동구(BS-07 장면)도 덮는다 · 다른 지역은 덮지 않는다", () => {
    for (const r of SCN_REGIONS) expect(wxCovers(SCN_DEFS[r].area, baseTarget(defaultBase(acc(SCN_ACCOUNT[r]))))).toBe(true);
    expect(wxCovers("부산", { sido: "부산광역시", sigungu: "동구" })).toBe(true);
    expect(wxCovers("부산", { sido: "서울특별시" })).toBe(false);
    expect(wxCovers("강원도(인제평지, 인제산지)", { sido: "강원특별자치도", sigungu: "춘천시" })).toBe(false);
    expect(wxCovers("경상북도(영천)", { sido: "경상북도", sigungu: "포항시 북구" })).toBe(false);
  });

  it("글로 잇는 곳의 이름에 「(시연 시나리오)」 — 기상청 특보는 그대로", () => {
    expect(advName(scenarioAdvisories(ON, "busan", NOW)[0])).toBe("호우예비특보 (시연 시나리오)");
    expect(advName(KMA_BUSAN)).toBe("강풍주의보");
  });

  it("대응절차 단계 추천이 시나리오를 따른다 — 부산 예비특보 단계 · 인제 2단계 「초기대응」 · 영천 경보 단계", () => {
    const want = { busan: ["예비특보", null], inje: ["주의보", "초기대응"], yeongcheon: ["경보", null] } as const;
    for (const r of SCN_REGIONS) {
      const m = SOP_MANUALS.find((x) => x.region === r)!;
      const rec = recommendStep(m, cutOf(SCN_ACCOUNT[r]).advisories)!;
      expect(rec.level).toBe(want[r][0]);
      expect(rec.step).toBe(m.recommend.find((x) => x.level === want[r][0])!.step);
      if (want[r][1]) expect(stepLabel(m, rec.step)).toBe(want[r][1]);
      expect(rec.advisory?.scenario).toBe(true);
      // 꺼지면(또는 다른 계정) 기상청 실시간 그대로 — 특보가 없으면 평시
      expect(scenarioWeather(SCN_OFF, SCN_ACCOUNT[r], NOW)).toBeNull();
      expect(recommendStep(m, live().advisories)).toBeNull();
    }
  });

  it("「답변을 받은 뒤 특보」에는 시나리오가 들지 않는다 — 끊긴 화면에는 뜨지 않는다(wx_seen 은 기상청 기록 그대로)", () => {
    const weather = cutOf("busan");
    const before = new Date(T0 - 3_600_000).toISOString();
    // 시나리오를 켜기 전에 받은 답(예열한 답) — 그때 특보 없음
    expect(advisoriesAfter(weather, { sido: "부산광역시" }, before, [])).toEqual([]);
    // 그때 기상청 특보가 있었어도(wx_seen) 끊긴 화면에는 「받은 뒤 특보」가 없다
    expect(advisoriesAfter(weather, { sido: "부산광역시" }, before, [{ id: KMA_BUSAN.id, type: "강풍", level: "주의보", regionId: "busan" }])).toEqual([]);
    // 끊지 않은 화면의 기상청 특보는 지금처럼 보인다
    const kmaNew = { ...KMA_BUSAN, issuedAt: new Date(T0).toISOString() };
    expect(advisoriesAfter(live([kmaNew]), { sido: "부산광역시" }, before, []).map((a) => a.id)).toEqual([kmaNew.id]);
  });
});
