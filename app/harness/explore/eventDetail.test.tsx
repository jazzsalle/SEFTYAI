// @vitest-environment jsdom
// 사건 상세 패널(EventDetail) — 녹화한 T3Q 응답으로 그려 본다.
// 순서 요약 → 피해·복구 → 사건 타임라인 → 유사도 근거(접힘) → 사건 개요, 보고 단계 = 받은 값 표,
// 받은 값 그대로(같은 값도 합치지 않음, 건수·명·기준 시각도 받은 글자 그대로), 섹션마다 원본 항목 전체 보기,
// 부연 설명·유엔이가 센 수 없음(R25). npx vitest run harness/explore
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EventDetail from "@/components/explore/EventDetail";
import { fieldKo } from "@/lib/labels";

type Req = { api: string; id?: string; body?: unknown };
const h = vi.hoisted(() => ({ env: new Map<string, { http: number; envelope: unknown }>(), calls: [] as { api: string; id?: string; body?: unknown }[] }));

vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, message: string, body: unknown) {
      super(message);
      this.status = status;
      this.body = body;
    }
  }
  return {
    ApiError,
    api: async (_path: string, init: { json?: Req } = {}) => {
      const req = init.json ?? { api: "" };
      h.calls.push(req);
      const hit = h.env.get(`${req.api}:${req.id ?? ""}`);
      if (!hit) throw new ApiError(502, "정보를 불러오지 못했습니다.", null);
      return { api: req.api, http: hit.http, ms: 1, envelope: hit.envelope };
    },
  };
});

const REC = join(__dirname, "..", "recordings");
type Rec = { id: string; http: number; body: unknown; response: Record<string, unknown> };
const data = JSON.parse(readFileSync(join(REC, "data_2026-10-27T15-53-38-514Z.json"), "utf8")) as Rec[];
const rec = (k: string) => {
  const r = data.find((x) => x.id === k);
  if (!r) throw new Error(`녹화 없음: ${k}`);
  return r;
};
const a10 = JSON.parse(readFileSync(join(REC, "a10_similar_details_2026-10-27T22-21-15-740Z.json"), "utf8")) as Record<string, { path: string; response: unknown }>;

const EV = "T10107-20200728-0001"; // 2020년 7.28.~8.11. 호우 — 네 조회 모두 녹화
const SAME = "T10107-20210825-0001"; // 시작 = 종료(2021-08-25)
const NONE = "T00000-00000000-0000"; // 없는 사건(NO_RESULT · 404)
h.env.set(`T3Q-10:${EV}`, { http: 200, envelope: rec("T3Q-10").response });
h.env.set(`T3Q-11:${EV}`, { http: 200, envelope: rec("T3Q-11").response });
h.env.set(`T3Q-12:${EV}`, { http: 200, envelope: rec("T3Q-12").response });
h.env.set(`T3Q-13:${EV}`, { http: 200, envelope: rec("T3Q-13").response });
const same = Object.values(a10).find((x) => x.path === `/events/${SAME}`);
if (!same) throw new Error("A10 녹화에 시작=종료 사건이 없음");
h.env.set(`T3Q-10:${SAME}`, { http: 200, envelope: same.response });
h.env.set(`T3Q-10:${NONE}`, { http: 404, envelope: rec("NEG-unknown-event").response });
const ctx = (rec("T3Q-11").body as { query_context: Record<string, unknown> }).query_context;

type Tl = { total_count: number; items: (Record<string, unknown> & { category: string; occurred_at: string })[] };
const tl = rec("T3Q-12").response.result as Tl;
const rowsOf = (el: Element | null | undefined) => [...(el?.querySelectorAll("tbody tr") ?? [])].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent));
/** 글자로 단추 찾기(접힌 유사도 근거 안의 단추도) */
const btn = (c: Element, name: string) => {
  const b = [...c.querySelectorAll("button")].find((x) => x.textContent === name);
  if (!b) throw new Error(`단추 없음: ${name}`);
  return b;
};

afterEach(() => cleanup());

/** 네 조회가 모두 그려질 때까지 */
async function full() {
  const v = render(<EventDetail id={EV} label="목록에서 받은 이름" ctx={ctx} />);
  await screen.findByText("보고 단계별 피해액·복구비");
  await screen.findByText("특보·재난문자 기록");
  await screen.findByText("요인군 기여");
  return v.container;
}

describe("사건 상세 패널 — 배치(R25)", () => {
  it("섹션 순서 요약 → 피해·복구 → 사건 타임라인 → 유사도 근거 → 사건 개요, 유사도 근거는 처음에 접힘", async () => {
    const c = await full();
    expect([...c.querySelectorAll("h3")].map((x) => x.textContent)).toEqual(["요약", "피해·복구", "사건 타임라인", "유사도 근거", "사건 개요"]);
    const fold = c.querySelector("details.ev-fold");
    expect(fold?.querySelector("summary h3")?.textContent).toBe("유사도 근거");
    expect(fold?.hasAttribute("open")).toBe(false);
    // V2 그림·요인 비교표는 접힌 안에 그대로
    expect(fold?.querySelector(".viz-stack")).not.toBeNull();
  });

  it("보고 단계 — 묶음 막대 없이 받은 값 표, 값이 같아도 행마다", async () => {
    const c = await full();
    expect(c.querySelector(".viz-group")).toBeNull();
    const fig = screen.getByText("보고 단계별 피해액·복구비").closest("figure");
    expect(fig?.getAttribute("role")).toBeNull(); // 그림(img)이 아니라 표
    expect([...(fig?.querySelectorAll("thead th") ?? [])].map((x) => x.textContent)).toEqual(["보고 단계", "항목 수", "피해액(원)", "복구비(원)"]);
    // 숫자는 천 단위 쉼표로 통일(사용자 결정 2026-10-28) — 항목 수·금액 모두
    expect(rowsOf(fig)).toEqual([
      ["중앙", "15,506", "950,141,668,000", "3,263,503,307,000"],
      ["시군구", "15,506", "950,173,767,000", "3,279,393,548,000"],
    ]);
  });
});

describe("사건 상세 패널 — 받은 값 그대로", () => {
  it("사건 요약·인명 칸·제공처 알림은 받은 그대로, 같은 「—」도 키마다", async () => {
    const c = await full();
    const ev = rec("T3Q-10").response.result as { event_summary: string };
    expect(screen.getByText(ev.event_summary).tagName).toBe("P");
    const text = c.textContent ?? "";
    expect(text).toContain("사망 — · 실종 — · 부상 — · 이재민 16,767");
    expect(text).toContain("재산피해1,037,156,500,000원");
    // 건수·인원도 천 단위 쉼표(통일)
    expect(text).toContain("공공시설913건 · 95,965,587,000원");
    expect(text).toContain("사유시설228,298건 · 406,065,397,000원");
    // 데이터 기준 시각은 받은 글자 그대로(날짜만 자르지 않음)
    expect(text).toContain(`데이터 기준 ${(rec("T3Q-10").response.meta as { base_time: string }).base_time}`);
    // 제공처 알림(warnings·data_gaps)은 각 섹션 끝에 그대로
    expect(text).toContain("사건과 명시적으로 연결된 기록이 아니라 사건 기간 × 관련 시도가 겹치는 특보·재난문자입니다.");
    expect(text).toContain("유사도는 현재 위험도·발생확률·피해규모의 예측 결과가 아님");
    // 기록 목록의 시각은 받은 글자 그대로(T 포함)
    expect(text).toContain(tl.items[0].occurred_at);
  });

  it("시작 = 종료여도 둘 다 보인다", async () => {
    render(<EventDetail id={SAME} label="" ctx={null} />);
    expect(await screen.findByText(/^2021-08-25 ~ 2021-08-25 · 주관 /)).toBeTruthy();
  });

  it("없는 사건 — 제공처 알림 원문", async () => {
    render(<EventDetail id={NONE} label="없는 사건" ctx={null} />);
    expect(await screen.findByText(`· 사건 «${NONE}» 이 없습니다.`)).toBeTruthy();
  });

  it("비교 조건이 없으면 유사도 근거를 조회하지 않는다 — 설명 문구 없이 빈 값(—)", async () => {
    h.calls.length = 0;
    const { container } = render(<EventDetail id={SAME} label="" ctx={null} />);
    await screen.findByText(/^2021-08-25 ~ 2021-08-25/);
    expect(h.calls.some((x) => x.api === "T3Q-11")).toBe(false);
    expect(container.querySelector("details.ev-fold")!.textContent).toBe("유사도 근거—");
    expect(container.textContent).not.toContain("조회하지 않았습니다");
  });

  it("제공처가 주지 않는 섹션(타임라인 없음)은 빈 값(—)만 — 「제공하지 않습니다」 같은 문장 없음, 받은 사실은 제공 항목 줄에", async () => {
    const { container } = render(<EventDetail id={SAME} label="" ctx={null} />);
    await screen.findByText(/^2021-08-25 ~ 2021-08-25/);
    const sec = [...container.querySelectorAll("section.ev-sec")].find((s) => s.querySelector("h3")?.textContent === "사건 타임라인");
    expect(sec?.textContent).toBe("사건 타임라인—");
    expect(container.textContent).not.toContain("제공하지 않습니다");
    expect(container.textContent).toContain("타임라인 없음");
  });

  it("시설유형 막대 — 이름 옆에 받은 건수(툴팁에만 두지 않음)", async () => {
    const c = await full();
    const labels = [...c.querySelectorAll(".viz-bars .lb")].map((x) => x.textContent);
    expect(labels[0]).toBe("하수도 · 69건");
    expect(labels[3]).toBe("수리시설 · 125건");
  });

  it("재해대장 — 받은 행마다 받은 값 그대로(연도·번호에 쉼표 없음)", async () => {
    const c = await full();
    const fig = screen.getByText("재해대장").closest("figure");
    expect([...(fig?.querySelectorAll("thead th") ?? [])].map((x) => x.textContent)).toEqual(["재해 번호", "연도", "이름"]);
    expect(rowsOf(fig)).toEqual([
      ["227", "2020", "7.28~8.11 호우"],
      ["228", "2020", "7.28~8.11 호우(12차 전환)"],
    ]);
    expect(c.textContent).not.toContain("2,020");
  });

  it("기록 목록 — 받은 항목 전부(순번·경과·시각 단위·기록 종류·연결 근거 포함), 코드는 사전의 한국어 이름", async () => {
    const c = await full();
    const table = [...c.querySelectorAll("details.xs table")].find((t) => t.querySelector("th")?.textContent === "순번");
    expect([...(table?.querySelectorAll("thead th") ?? [])].map((x) => x.textContent)).toEqual(Object.keys(tl.items[0]).map(fieldKo));
    expect(rowsOf(table)[0]).toEqual(["1", "2020-07-30T04:00:00", "52", "분", "특보", "홍수주의보 발령 — 여주시(원부교) (청미천)", "한강홍수통제소", "실제 기록", "—", "홍수특보 제2020-1호", "기간·지역 겹침"]);
  });

  it("유사도 근거 — 유사도 받은 키 전부(산식 판·비교에 쓴 요인 비율 포함), 요인 표에 가중치", async () => {
    const c = await full();
    const fold = c.querySelector("details.ev-fold")!;
    expect(fold.querySelector(".viz-title")!.textContent).toBe("요인군 기여점수 68.24 · 순위 43 · 척도 0~100 · 산식 판 sim-0.1.0 · 비교에 쓴 요인 비율 0.75");
    expect([...fold.querySelectorAll("thead th")].map((x) => x.textContent)).toEqual(["요인군", "요인", "현재 조건", "과거 사례", "일치도", "가중치", "기여도"]);
    expect(rowsOf(fold)[0]).toEqual(["재난유형", "재난유형", "T10107 호우", "T10107 호우", "1", "0.4667", "46.6667"]);
  });

  it("섹션마다 원본 항목 전체 보기 — 화면에 고르지 않은 받은 값도 전부(가중치·제공되지 않은 요인군·대응·근거·시간 기준)", async () => {
    const c = await full();
    const before = c.textContent ?? "";
    for (const s of ["프로파일 default(sim.profile)", "EV-DMG-T10107-20200728-0001", "ABSOLUTE"]) expect(before, s).not.toContain(s);
    for (const name of ["피해·대응", "사건 타임라인", "유사도 근거"]) fireEvent.click(btn(c, `${name} 원본 항목 전체 보기`));
    const text = c.textContent ?? "";
    expect(text).toContain("프로파일 default(sim.profile)"); // weights.weight_stage
    expect(text).toContain("제공되지 않은 요인군피해, 대응"); // factor_groups_not_provided
    expect(text).toContain("EV-DMG-T10107-20200728-0001"); // T3Q-13 evidence_refs
    expect(text).toContain("도로 통제"); // T3Q-13 response
    expect(text).toContain("ABSOLUTE"); // T3Q-12 time_origin.type
    expect(btn(c, "유사도 근거 원본 항목 닫기").getAttribute("aria-expanded")).toBe("true");
  });
});

describe("사건 상세 패널 — 두지 않는 것(R25)", () => {
  it("읽는 법·부연 설명 문구가 없다", async () => {
    const text = (await full()).textContent ?? "";
    for (const s of ["받은 순서 그대로", "합 = 유사도 점수", "요인군마다 색이", "같은 단위", "유엔이가 센 값", "제공처 한계", "(원문)", "유사사례 목록에서 열면", "겹치는 특보·재난문자 기록 없음", "제공하지 않습니다", "조회하지 않았습니다"]) {
      expect(text, s).not.toContain(s);
    }
  });

  it("유엔이가 센 수 없음 — 부분 목록 주의는 제공처 전체 건수로만", async () => {
    const c = await full();
    const text = c.textContent ?? "";
    expect(tl.total_count).toBeGreaterThan(tl.items.length);
    expect(text).toContain(`⚠ 전체 ${tl.total_count}건 중 일부만 받았습니다.`);
    expect(text).not.toContain(`${tl.items.length}건`);
    // 타임라인 줄 이름 = 받은 분류 이름만(옆에 센 수 없음)
    const lanes = [...c.querySelectorAll(".viz-tl .lane-lb")].map((x) => x.textContent);
    expect(lanes).toEqual([...new Set(tl.items.map((i) => i.category))]);
    expect(c.querySelector(".viz-tl")?.getAttribute("aria-label")).not.toMatch(/\d/);
  });
});
