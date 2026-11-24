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
  it("장면은 개발서버와 같은 13개 차례·이름 그대로 + 마무리 앞 대전 4장면(2026-11-19 대전시청 시연 — 연도별 장면 뺌)", () => {
    expect(AutoScript.map((s) => s.label)).toEqual([
      "프롤로그 · AI 모드 소개",
      "11:00 · 호우 예비특보, AI 모드 시작",
      "11:30 · 온천천 주변 위험지역",
      "11:40 · 동래·연제·금정 위험지구 전체",
      "15:00 · 호우주의보, AI 모드",
      "15:05 · 현재 상황 브리핑",
      "15:10 · 점검 우선순위",
      "15:15 · 대응절차 확인",
      "15:20 · 강우 조건으로 묻고 대응절차까지",
      "15:50 · 온천천 대응수위",
      "15:55 · 과거 침수 사례와 당시 대응",
      "전환 · 인제군",
      "인제 · 진동리 계곡 숙박·야영장 주변",
      "전환 · 대전광역시",
      "대전 · 2024년 7월 집중호우 침수흔적",
      "대전 · 2024년 7월 10일 호우 대피·통제",
      "대전 · 3대 하천 산책로·하상도로 주변",
      // 2026-11-25 행안부 실장 보고 장면(부산 + 인제(매뉴얼) · 서울 + 부산 + 인제)
      "부산 · 추천 질문으로 2020년 침수흔적",
      "부산 · 2020년 7월 23일, 그 비가 지금 온다면",
      "부산 · 경보는 20시, 통제는 22시 53분",
      "부산 · 강우·하천 수위·풍속 조건으로 묻기",
      "부산 · 자연재해저감종합계획 위험지구 위치도",
      "부산 · 호우경보 때 매뉴얼상 누가 무엇을",
      "부산 · 119 신고가 가장 많았던 날과 그날 비",
      "인제 · 하천 인접 캠핑장 주변 범람 위험",
      "인제 · 호우경보 때 야영객 대피는 누가 언제",
      "전환 · 서울특별시",
      "서울 · 침수흔적 구역 안 지하차도",
      "서울 · 2022년 8월 노들길이 잠긴 사건 깊이 보기",
      "서울 · 2022년 8월 같은 비, 비슷했던 과거 호우",
      "서울 · 2022년 8월 강남역 침수흔적",
      "서울 · 119 신고가 가장 많았던 날과 그날 비",
      "서울 · 개인정보는 가려서 보여 줍니다",
      "마무리",
    ]);
  });

  it("대본의 질문 id 는 우리 질문 모음(한눈 요약 질의)·AI 모드 시연에 모두 있다", () => {
    const { answers, aiMode } = scriptPinIds();
    const day = new Set(DAY_ITEMS.map((d) => d.id));
    expect(answers.filter((id) => !day.has(id))).toEqual([]);
    expect(answers.sort()).toEqual([
      "CQ-BS-01", "CQ-BS-02", "CQ-BS-03", "IG-BS-01", "IG-BS-02", "IG-BS-08", "IG-BS-11", "IG-BS-14", "IG-BS-15", "IG-BS-16", "IG-BS-17", "IG-BS-19", "IG-BS-20",
      "IG-DJ-01", "IG-DJ-03", "IG-DJ-07", "IG-IJ-01", "IG-IJ-08", "IG-IJ-09", "IG-SE-01", "IG-SE-02", "IG-SE-03", "IG-SE-04", "IG-SE-06", "IG-SE-07", "SIM-SH-1-3",
    ]);
    // AIM-BS-00 = 특보 없음(초록) 첫 화면 — 받아 둔 답이 아니라 화면이 그린다(2026-11-24)
    expect(aiMode.sort()).toEqual(["AIM-BS-00", ...AIM_DEMO.map((a) => a.id)].sort());
  });

  it("장면 지역은 부산·인제 기준지역(인제 = 강원 인제군)", () => {
    expect(baseKey(DemoRegions.busan)).toBe(baseKey({ sido: { code: "26", name: "부산광역시" } }));
    expect(DemoRegions.inje.sigungu?.code).toBe("51810");
    expect(baseKey(DemoRegions.daejeon)).toBe("30");
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

describe("대전 한눈 요약 질의(2026-11-19 대전시청 시연)", () => {
  it("대전 6문이 대전광역시 기준지역에서만 보인다", async () => {
    const { dayItemsFor } = await import("@/lib/library");
    const { baseDayRegion } = await import("@/lib/baseRegion");
    expect(baseDayRegion({ sido: { code: "30", name: "대전광역시" } })).toBe("daejeon");
    expect(baseDayRegion({ sido: { code: "30", name: "대전광역시" }, sigungu: { code: "30170", name: "서구" } })).toBe("daejeon");
    expect(baseDayRegion({ sido: { code: "26", name: "부산광역시" } })).toBe("busan");
    expect(dayItemsFor("daejeon").map((d) => d.id)).toEqual(["IG-DJ-01", "IG-DJ-02", "IG-DJ-03", "IG-DJ-07", "IG-DJ-05", "IG-DJ-08"]);
  });
});

describe("자동 시연 시나리오(2026-11-18 사용자 지시 — 부산+인제 · 부산+대전)", () => {
  it("두 시나리오만, 장면 이름이 모두 대본에 있다", async () => {
    const { DemoScenarios, scenarioScenes } = await import("@/components/autodemo/autoScript");
    expect(DemoScenarios.map((s) => s.id)).toEqual(["busan-inje", "busan-daejeon", "busan-inje-manual", "seoul-busan-inje", "busan-inje-daejeon"]);
    for (const s of DemoScenarios) expect(() => scenarioScenes(s.id)).not.toThrow();
  });

  it("실장 보고(2026-11-25) — 두 시나리오 모두 AI 모드로 시작, 매뉴얼 장면 뒤 대응절차, 마무리는 한 문장 · 119 장면은 사건을 열지 않는다", async () => {
    const { scenarioScenes } = await import("@/components/autodemo/autoScript");
    for (const id of ["busan-inje-manual", "seoul-busan-inje"] as const) {
      const sc = scenarioScenes(id);
      // 예비특보를 빼고 초록에서 바로 호우주의보로(사용자 지시 2026-11-24)
      expect(sc.slice(0, 3).map((s) => s.label)).toEqual(["프롤로그 · AI 모드 소개", "15:00 · 호우주의보, AI 모드", "15:05 · 현재 상황 브리핑"]);
      expect(sc.at(-1)?.intro).toBe("이상으로 시연을 마치겠습니다.");
      const manual = sc.find((s) => s.pinId === "IG-BS-16")!;
      expect(manual.steps?.some((st) => st.click?.sel === ".wxbar .wxsop")).toBe(true);
      for (const s of sc.filter((x) => x.pinId === "IG-BS-17" || x.pinId === "IG-SE-03")) expect(JSON.stringify(s.steps)).not.toContain("click");
    }
    // 서울은 뺐다 — 부산만(사용자 지시 2026-11-24 「부산도 벅차다」)
    expect(scenarioScenes("seoul-busan-inje").every((s) => s.region === "busan")).toBe(true);
    expect(scenarioScenes("busan-inje-manual").some((s) => s.region === "seoul")).toBe(false);
  });

  it("부산+인제 = 대전 장면 없이 부산 하루 + 인제 + 마무리, 마무리에 대전 언급 없음", async () => {
    const { scenarioScenes } = await import("@/components/autodemo/autoScript");
    const sc = scenarioScenes("busan-inje");
    expect(sc.some((s) => s.region === "daejeon")).toBe(false);
    expect(sc.map((s) => s.label)).toContain("인제 · 진동리 계곡 숙박·야영장 주변");
    expect(sc.at(-1)?.label).toBe("마무리");
    expect(sc.at(-1)?.intro).toContain("부산과 인제처럼");
    expect(sc.at(-1)?.intro).not.toContain("대전");
  });

  it("부산+대전 = 대전 질의 전부 + 부산 점검 우선순위·대응절차, 대전과 겹치는 부산 장면·인제는 뺀다", async () => {
    const { scenarioScenes } = await import("@/components/autodemo/autoScript");
    const sc = scenarioScenes("busan-daejeon");
    const pins = sc.map((s) => s.pinId).filter(Boolean);
    expect(pins).toEqual(["IG-BS-11", "IG-DJ-07", "IG-DJ-03", "IG-DJ-01"]);
    expect(sc.map((s) => s.label)).toEqual([
      "프롤로그 · AI 모드 소개",
      "11:00 · 호우 예비특보, AI 모드 시작",
      "15:00 · 호우주의보, AI 모드",
      "15:05 · 현재 상황 브리핑",
      "15:10 · 점검 우선순위",
      "15:15 · 대응절차 확인",
      "전환 · 대전광역시",
      "대전 · 2024년 7월 집중호우 침수흔적",
      "대전 · 2024년 7월 10일 호우 대피·통제",
      "대전 · 3대 하천 산책로·하상도로 주변",
      "마무리",
    ]);
    expect(sc.at(-1)?.intro).toContain("부산과 대전처럼");
    expect(sc.at(-1)?.intro).not.toContain("인제");
    expect(sc.at(-1)?.region).toBe("busan");
  });

  it("시나리오를 주면 scenesFrom 이 그 장면만 — 주지 않으면 대본 전체", () => {
    expect(scenesFrom([], "busan-daejeon")).toHaveLength(11);
    // 부산 + 인제 + 대전(2026-11-19) — 부산 AI 모드 6 · 인제 2 · 대전 4 · 마무리
    const three = scenesFrom([], "busan-inje-daejeon").map((x) => x.scene);
    expect(three).toHaveLength(13);
    expect(three.map((x) => x.region)).toEqual(["busan", "busan", "busan", "busan", "busan", "busan", "inje", "inje", "daejeon", "daejeon", "daejeon", "daejeon", "busan"]);
    expect(three[12].intro.length).toBeLessThan(150);
    expect(scenesFrom([])).toHaveLength(AutoScript.length);
  });
});
