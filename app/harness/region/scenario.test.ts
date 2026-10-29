// 하네스 — 시연 시나리오 특보(R43 — R6 의 시연용 예외, lib/scenario · lib/wxref)
//  · 시연 계정 셋에만 · 꺼짐·끝나는 시각 지남·그 지역을 켜지 않음이면 빈 목록(다른 계정에는 절대 넣지 않는다)
//  · 정의 = 대본 「시연 시나리오 특보 정의」·녹화 demo_v3/AIM-*(특보 번호·종류·단계·구역 — 재사용 열쇠에 들어감)
//  · weather_warnings: 시나리오만이면 source 「시연 시나리오(가상 특보)」, 기상청 특보와 섞이면 두 출처 + 항목마다 source. 기상청만이면 지금 그대로
//  · 구역이 시연 계정 기준지역(BS-07 동구 포함)을 덮는다 · 대응절차 단계 추천이 따라간다 · 「답변을 받은 뒤 특보」에는 들지 않는다
// npx vitest run harness/region/scenario.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCOUNTS } from "@/lib/config";
import type { Advisory, WeatherResponse } from "@/lib/contract/agent";
import { baseTarget, defaultBase } from "@/lib/baseRegion";
import { SCN_ACCOUNT, SCN_DEFS, SCN_OFF, SCN_REGIONS, SCN_SOURCE, scenarioAdvisories, scenarioLive, withScenario, type ScenarioState } from "@/lib/scenario";
import { activeAdvisories, advName, KMA_SOURCE, warningsPayload } from "@/lib/wxref";
import { wxCovers } from "@/lib/wxMatch";
import { recommendStep, stepLabel } from "@/lib/sop";
import { SOP_MANUALS } from "@/lib/server/sop";
import { advisoriesAfter } from "@/components/answer/AnswerCard";

const REC = join(__dirname, "..", "recordings");
type WW = { collect_status: string; source: string; items: Record<string, string>[] };
const aim = (r: string) => (JSON.parse(readFileSync(join(REC, "demo_v3", `AIM-${r}.json`), "utf8")) as { request: { weather_warnings: WW } }).request.weather_warnings;
const AIM_OF = { busan: "BS", inje: "IJ", yeongcheon: "YC" } as const;

const T0 = Date.parse("2026-11-05T08:00:00+09:00");
const ON: ScenarioState = { on: true, regions: SCN_REGIONS, startedAt: new Date(T0).toISOString(), until: new Date(T0 + 4 * 3_600_000).toISOString(), by: "시스템 운영자" };
const NOW = T0 + 30 * 60_000;
const live = (advisories: Advisory[] = [], ok = true): WeatherResponse => ({ mode: "live", status: { ok, fetchedAt: new Date(NOW).toISOString(), message: ok ? "기상청 08:00 발표" : "기상청 API 연결 실패" }, advisories, preliminary: [] });
const KMA_BUSAN: Advisory = { id: "KMA-강풍주의보-부산", type: "강풍", level: "주의보", area: "부산", regionId: "busan", issuedAt: "2026-11-05T07:00:00+09:00", status: "발효" };
const acc = (id: string) => ACCOUNTS.find((a) => a.id === id)!;

describe("보이는 계정 · 켜짐 · 끝나는 시각", () => {
  it("시연 계정 셋에만 그 지역 정의 하나 — 중앙정부·운영자·모르는 계정은 빈 목록", () => {
    for (const r of SCN_REGIONS) {
      const a = scenarioAdvisories(ON, SCN_ACCOUNT[r], NOW);
      expect(a).toHaveLength(1);
      expect(a[0]).toMatchObject({ id: SCN_DEFS[r].key, type: "호우", level: SCN_DEFS[r].level, area: SCN_DEFS[r].area, regionId: r, status: "발효", scenario: true, issuedAt: ON.startedAt });
    }
    expect(SCN_ACCOUNT).toEqual({ busan: "bs_safety01", inje: "ij_safety01", yeongcheon: "yc_safety02" });
    for (const id of ["mois_dsd01", "admin01", "bs_safety02", "", null, undefined]) expect(scenarioAdvisories(ON, id, NOW)).toEqual([]);
    // 설정의 계정 가운데 시연 계정이 아닌 것 모두
    for (const a of ACCOUNTS.filter((x) => !Object.values(SCN_ACCOUNT).includes(x.id))) expect(scenarioAdvisories(ON, a.id, NOW)).toEqual([]);
  });

  it("꺼짐 · 끝나는 시각 지남(그 시각 포함) · 켠 시각·끝나는 시각 없음 · 그 지역을 켜지 않음 → 빈 목록", () => {
    expect(scenarioAdvisories(SCN_OFF, "bs_safety01", NOW)).toEqual([]);
    expect(scenarioAdvisories({ ...ON, on: false }, "bs_safety01", NOW)).toEqual([]);
    expect(scenarioAdvisories(ON, "bs_safety01", Date.parse(ON.until!))).toEqual([]);
    expect(scenarioAdvisories(ON, "bs_safety01", Date.parse(ON.until!) + 1)).toEqual([]);
    expect(scenarioAdvisories(ON, "bs_safety01", Date.parse(ON.until!) - 1)).toHaveLength(1);
    expect(scenarioAdvisories({ ...ON, until: null }, "bs_safety01", NOW)).toEqual([]);
    expect(scenarioAdvisories({ ...ON, until: "모름" }, "bs_safety01", NOW)).toEqual([]);
    expect(scenarioAdvisories({ ...ON, startedAt: null }, "bs_safety01", NOW)).toEqual([]);
    expect(scenarioAdvisories({ ...ON, regions: ["inje"] }, "bs_safety01", NOW)).toEqual([]);
    expect(scenarioAdvisories({ ...ON, regions: ["inje"] }, "ij_safety01", NOW)).toHaveLength(1);
    expect(scenarioAdvisories(null, "bs_safety01", NOW)).toEqual([]);
    expect(scenarioLive(ON, NOW)).toBe(true);
    expect(scenarioLive(ON, Date.parse(ON.until!) + 1)).toBe(false);
  });

  it("기상청 특보 뒤에 붙이고 받은 상태·시각·예비특보는 그대로 · 붙일 것이 없으면 같은 값", () => {
    const w = live([KMA_BUSAN]);
    const out = withScenario(w, scenarioAdvisories(ON, "bs_safety01", NOW));
    expect(out.advisories.map((a) => a.id)).toEqual(["KMA-강풍주의보-부산", "SCN-BS-1"]);
    expect(out.status).toBe(w.status);
    expect(out.preliminary).toBe(w.preliminary);
    expect(withScenario(w, scenarioAdvisories(ON, "mois_dsd01", NOW))).toBe(w);
  });
});

describe("T3Q weather_warnings — 대본 정의·녹화(demo_v3/AIM-*)와 같다", () => {
  for (const r of SCN_REGIONS) {
    it(`${r} — 시나리오만: source 「시연 시나리오(가상 특보)」 · 특보 번호 고정 · 녹화와 같은 칸`, () => {
      const a = acc(SCN_ACCOUNT[r]);
      const weather = withScenario(live(), scenarioAdvisories(ON, a.id, NOW));
      // 화면(AI 모드 창 check · explore liveWarnings)과 같은 계산 — 계정 기본 기준지역
      const ww = warningsPayload(weather, activeAdvisories(weather, baseTarget(defaultBase(a))));
      const recd = aim(AIM_OF[r]);
      expect(ww.source).toBe(SCN_SOURCE);
      expect(ww.source).toBe(recd.source);
      expect(ww.collect_status).toBe(recd.collect_status);
      const strip = (i: Record<string, unknown>) => ({ ...i, announced_at: undefined, effective_at: undefined });
      expect(ww.items.map(strip)).toEqual(recd.items.map(strip));
      expect(ww.items[0].warning_key).toBe(`SCN-${AIM_OF[r]}-1`);
      expect(ww.items[0].announced_at).toBe(ON.startedAt);
    });
  }

  it("기상청 특보와 섞이면 두 출처를 함께 적고 항목마다 source", () => {
    const weather = withScenario(live([KMA_BUSAN]), scenarioAdvisories(ON, "bs_safety01", NOW));
    const ww = warningsPayload(weather, activeAdvisories(weather, baseTarget(defaultBase(acc("bs_safety01")))));
    expect(ww.source).toBe(`${KMA_SOURCE} · ${SCN_SOURCE}`);
    expect(ww.items.map((i) => [i.warning_key, (i as { source?: string }).source])).toEqual([["KMA-강풍주의보-부산", KMA_SOURCE], ["SCN-BS-1", SCN_SOURCE]]);
  });

  it("기상청 특보만이면 지금 그대로(source 하나 · 항목에 source 칸 없음)", () => {
    const ww = warningsPayload(live([KMA_BUSAN]), [KMA_BUSAN]);
    expect(ww.source).toBe("기상청 기상특보 조회서비스");
    expect(ww.items).toEqual([{ warning_key: "KMA-강풍주의보-부산", kind: "강풍", level: "주의보", area: "부산", announced_at: KMA_BUSAN.issuedAt, effective_at: KMA_BUSAN.issuedAt, change: "발효" }]);
    expect(warningsPayload(live(), []).source).toBe("기상청 기상특보 조회서비스");
  });

  it("기상청 조회 실패여도 시나리오는 붙고, 수집 상태는 받은 그대로(FAILED)", () => {
    const weather = withScenario(live([], false), scenarioAdvisories(ON, "bs_safety01", NOW));
    const ww = warningsPayload(weather, activeAdvisories(weather, baseTarget(defaultBase(acc("bs_safety01")))));
    expect(ww.collect_status).toBe("FAILED");
    expect(ww.items.map((i) => i.warning_key)).toEqual(["SCN-BS-1"]);
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
    expect(advName(scenarioAdvisories(ON, "bs_safety01", NOW)[0])).toBe("호우경보 (시연 시나리오)");
    expect(advName(KMA_BUSAN)).toBe("강풍주의보");
  });

  it("대응절차 단계 추천이 시나리오를 따른다 — 부산 3단계 「비상대응」 · 인제 2단계 「초기대응」 · 영천 경보 단계", () => {
    const want = { busan: ["경보", "비상대응"], inje: ["주의보", "초기대응"], yeongcheon: ["경보", null] } as const;
    for (const r of SCN_REGIONS) {
      const m = SOP_MANUALS.find((x) => x.region === r)!;
      const weather = withScenario(live(), scenarioAdvisories(ON, SCN_ACCOUNT[r], NOW));
      const rec = recommendStep(m, weather.advisories)!;
      expect(rec.level).toBe(want[r][0]);
      expect(rec.step).toBe(m.recommend.find((x) => x.level === want[r][0])!.step);
      if (want[r][1]) expect(stepLabel(m, rec.step)).toBe(want[r][1]);
      expect(rec.advisory?.scenario).toBe(true);
      // 꺼지면(또는 다른 계정) 평시
      expect(recommendStep(m, withScenario(live(), scenarioAdvisories(SCN_OFF, SCN_ACCOUNT[r], NOW)).advisories)).toBeNull();
    }
  });

  it("「답변을 받은 뒤 특보」에는 시나리오가 들지 않는다(D5·wx_seen 처럼 기상청 실시간만)", () => {
    const weather = withScenario(live(), scenarioAdvisories(ON, "bs_safety01", NOW));
    // 시나리오를 켜기 전에 받은 답(예열한 답) — 그때 특보 없음
    expect(advisoriesAfter(weather, { sido: "부산광역시" }, new Date(T0 - 3_600_000).toISOString(), [])).toEqual([]);
    // 기상청 특보는 지금처럼 보인다
    const kmaNew = { ...KMA_BUSAN, issuedAt: new Date(T0).toISOString() };
    const mixed = withScenario(live([kmaNew]), scenarioAdvisories(ON, "bs_safety01", NOW));
    expect(advisoriesAfter(mixed, { sido: "부산광역시" }, new Date(T0 - 3_600_000).toISOString(), []).map((a) => a.id)).toEqual([kmaNew.id]);
  });
});
