import { describe, expect, it } from "vitest";
import { AutoScript, DemoRegions, FOCUS, UI, scenesFrom, scriptPinIds } from "@/components/autodemo/autoScript";
import { sentences } from "@/components/autodemo/speech";
import { parseMapSel } from "@/lib/autoDemoMap";
import { AIM_DEMO, aimDemoAdvisory, aimDemoAsOf, aimDemoRequest, aimDemoView } from "@/lib/autoDemoAim";
import { AIM_PROMPT_ID, AIM_Q } from "@/lib/aiMode";
import { COND_ITEMS, DAY_ITEMS } from "@/lib/library";
import { SCN_SOURCE } from "@/lib/scenario";
import { warningsPayload } from "@/lib/wxref";
import { baseKey } from "@/lib/baseRegion";

/** R54 — 자동 시연(개발서버 kjw 998facb features/demoMode) */
describe("자동 시연 대본", () => {
  it("장면은 개발서버와 같은 13개, 차례·이름 그대로", () => {
    expect(AutoScript.map((s) => s.label)).toEqual([
      "프롤로그 · AI 모드 소개",
      "11:00 · 호우 예비특보, AI 모드 시작",
      "11:30 · 온천천 주변 위험지역",
      "11:40 · 동래·연제·금정 위험지구 전체",
      "15:00 · 호우주의보, AI 모드 자동 감지",
      "15:05 · 현재 상황 브리핑",
      "15:10 · 점검 우선순위",
      "15:20 · 강우 조건으로 묻고 대응절차까지",
      "15:50 · 온천천 대응수위",
      "15:55 · 과거 침수 사례와 당시 대응",
      "전환 · 인제군",
      "인제 · 진동리 계곡 숙박·야영장 주변",
      "마무리",
    ]);
  });

  it("대본의 질문 id 는 우리 질문 모음(한눈 요약 질의)·AI 모드 시연에 모두 있다", () => {
    const { answers, aiMode } = scriptPinIds();
    const day = new Set(DAY_ITEMS.map((d) => d.id));
    expect(answers.filter((id) => !day.has(id))).toEqual([]);
    expect(answers.sort()).toEqual(["CQ-BS-01", "CQ-BS-02", "IG-BS-01", "IG-BS-02", "IG-BS-08", "IG-BS-11", "IG-IJ-01", "SIM-SH-1-3"]);
    expect(aiMode.sort()).toEqual(AIM_DEMO.map((a) => a.id).sort());
  });

  it("장면 지역은 부산·인제 기준지역(인제 = 강원 인제군)", () => {
    expect(baseKey(DemoRegions.busan)).toBe(baseKey({ sido: { code: "26", name: "부산광역시" } }));
    expect(DemoRegions.inje.sigungu?.code).toBe("51810");
    for (const s of AutoScript) expect(s.region === undefined || s.region in DemoRegions).toBe(true);
  });

  it("받아 둔 답이 없으면 pin 의 received_at 이 비어 장면을 건너뛸 수 있다", () => {
    const plan = scenesFrom([{ pin_id: "IG-BS-01", question: "q", received_at: "2026-11-06T00:00:00Z" }]);
    expect(plan[2].pin?.received_at).toBeTruthy();
    expect(plan[3].pin).toBeNull();
    expect(plan[0].pin).toBeNull();
  });

  it("개발서버 선택자는 남아 있지 않다(우리 화면 요소로)", () => {
    const text = JSON.stringify(AutoScript) + JSON.stringify(FOCUS) + JSON.stringify(UI);
    for (const dev of [".answer-turns", ".side-panel", ".query-box", ".aim-modal", ".header-menu-btn", ".alert-banner", ".answer-md", ".map-pin", ".map-cluster", ".leaflet"]) {
      expect(text).not.toContain(dev);
    }
  });

  it("지도 대상 선택자(@map:…)", () => {
    expect(parseMapSel("@map:cluster")).toEqual({ kind: "cluster" });
    expect(parseMapSel("@map:pin-exact")).toEqual({ kind: "pin", exact: true });
    expect(parseMapSel("@map:area")).toEqual({ kind: "area" });
    expect(parseMapSel(".rpanel .rtab-b")).toBeNull();
  });

  it("음성은 문장 단위로 쪼갠다(개발서버 speech.sentences)", () => {
    expect(sentences("가나다. 라마바? 사아\n자차")).toEqual(["가나다.", "라마바?", "사아", "자차"]);
  });
});

describe("자동 시연 AI 모드 장면(가상 특보)", () => {
  const pre = AIM_DEMO.find((a) => a.id === "AIM-BS-01")!;

  it("개발서버 DemoPinSeed 와 같은 가상 특보 — 2026-11-05 11:00 부산 호우 예비특보 · 15:00 호우주의보", () => {
    expect(pre.warning).toMatchObject({ key: "DEMO-BS-RAIN-PRE", kind: "호우", level: "예비특보" });
    expect(AIM_DEMO.find((a) => a.id === "AIM-BS-03")!.warning).toMatchObject({ key: "DEMO-BS-RAIN-ADV", level: "주의보" });
    // 기준 시각 = 발표 5분 뒤(한국 11:05 = UTC 02:05)
    expect(aimDemoAsOf(pre)).toBe("2026-11-05T02:05:00.000Z");
  });

  it("받을 때는 실제 AI 모드 점검과 같은 질의 — 점검 질문·AI_MODE·특보 하나·시연 시나리오 출처", () => {
    const r = aimDemoRequest(pre, warningsPayload);
    expect(r.question).toBe(AIM_Q);
    expect(r.source).toBe("AI_MODE");
    expect(r.aiMode).toMatchObject({ trigger: "WARNING_CHANGED", prompt_id: AIM_PROMPT_ID });
    expect(r.queryContext.region).toEqual({ admin_code: "2600000000", level: "SIDO", name: "부산광역시" });
    expect(r.weatherWarnings.source).toBe(SCN_SOURCE);
    expect((r.weatherWarnings.items as { warning_key: string; level: string }[]).map((i) => [i.warning_key, i.level])).toEqual([["DEMO-BS-RAIN-PRE", "예비특보"]]);
  });

  it("받아 둔 답 → AI 모드 창 점검(답 글 그대로 · 500자까지), 특보 줄 가상 특보는 「시연 시나리오」 표지", () => {
    const v = aimDemoView(pre, "  저지대를 살피세요.  ");
    expect(v.guides).toEqual([{ sortNo: 0, warningKey: "DEMO-BS-RAIN-PRE", kind: "호우", level: "예비특보", areaName: "부산광역시", message: "저지대를 살피세요." }]);
    expect(v.warnings[0]).toMatchObject({ changeType: "신규", scenario: true });
    expect(aimDemoView(pre, null).guides).toEqual([]);
    expect(aimDemoAdvisory(pre)).toMatchObject({ id: "DEMO-BS-RAIN-PRE", status: "발효", scenario: true, issuedAt: "2026-11-05T11:00:00+09:00" });
  });
});

describe("재난상황 조건 측정값(개발서버 ConditionModal MeasureFields)", () => {
  it("9줄 — 이름·단위·묶음·차례가 개발서버와 같다(수위·유량 코드만 T3Q 계약)", () => {
    expect(COND_ITEMS.map((x) => [x.item, x.label, x.unit, x.group])).toEqual([
      ["RAIN_1H", "1시간 강우", "mm", "RAIN"],
      ["RAIN_3H", "3시간 누적", "mm", "RAIN"],
      ["RAIN_6H", "6시간 누적", "mm", "RAIN"],
      ["RAIN_12H", "12시간 누적", "mm", "RAIN"],
      ["RAIN_24H", "24시간 누적", "mm", "RAIN"],
      ["WATER_LEVEL", "하천 수위", "m", "HYDRO"],
      ["FLOW", "하천 유량", "m³/s", "HYDRO"],
      ["WIND_SPEED", "풍속", "m/s", "WEATHER"],
      ["HUMIDITY", "습도", "%", "WEATHER"],
    ]);
  });
});
