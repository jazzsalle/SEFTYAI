// @vitest-environment jsdom
// 하네스 — 시연 자료(인포그래픽) 패널: 시연 탭 항목의 답에만 붙고(library_id 또는 질문 글 일치), 그림의 값은 고정 답 본문 값 그대로 글자로 보인다.
// 빨강 없음·영어 없음(화면 글자) · 답 글은 손대지 않는다. npx vitest run harness/render/demoInfographic
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import DemoInfoPanel, { demoItemOf, hasDemoInfographic } from "@/components/answer/DemoInfographic";
import { DEMO_SHOW } from "@/lib/library";

afterEach(cleanup);

const job = (library_id: string | null, question_user = "질문") => ({ library_id, question_user });

describe("시연 자료 패널 — 어느 답에 붙는가", () => {
  it("library_id 가 시연 항목(SH-)이면 그 항목, 아니면 질문 글이 시연 항목 글과 같을 때만", () => {
    expect(demoItemOf(job("SH-1-3"))?.id).toBe("SH-1-3");
    expect(demoItemOf(job(null, DEMO_SHOW[0].text))?.id).toBe("SH-1-1");
    expect(demoItemOf(job(null, "온천천 어디가 위험해?"))).toBeUndefined();
    expect(demoItemOf(job("BR-01", DEMO_SHOW[0].text))?.id).toBe("SH-1-1"); // 브리핑 세트 항목으로 보냈어도 글이 같으면
  });

  it("그림이 없는 항목(1-4 하천기본계획 · 2-7 대응절차 · 2-9 캠핑장)은 패널이 없다", () => {
    for (const id of ["SH-1-4", "SH-2-8", "SH-2-10"]) {
      expect(hasDemoInfographic(job(id))).toBe(false);
      const { container } = render(<DemoInfoPanel job={job(id)} />);
      expect(container.querySelector(".demo-info")).toBeNull();
      cleanup();
    }
    expect(render(<DemoInfoPanel job={job(null)} />).container.innerHTML).toBe("");
  });

  it("패널은 처음에 펼쳐져 있고, 머리에 「시연 자료」와 「아래 답은 에이전트 응답 그대로」", () => {
    const { container } = render(<DemoInfoPanel job={job("SH-1-3")} />);
    const d = container.querySelector("details.demo-info") as HTMLDetailsElement;
    expect(d.open).toBe(true);
    expect(d.querySelector("summary")!.textContent).toContain("시연 자료");
    expect(d.querySelector("summary")!.textContent).toContain("아래 답은 에이전트 응답 그대로");
    expect(d.querySelector("summary")!.textContent).toContain("1-3 과거 침수·범람 피해 사례");
  });
});

describe("시연 자료 패널 — 그림마다 값이 글자로 보인다(고정 답 본문 값 그대로)", () => {
  const figs = (id: string) => {
    render(<DemoInfoPanel job={job(id)} />);
    return screen.getAllByRole("img");
  };

  it("1-3: ① 연대기(사건 5건 · 2014년 130mm · 2.63㎢ · 2024년 18.7만㎡) + ③ 왜 잠기나(6단계)", () => {
    const [chron, why] = figs("SH-1-3");
    expect(chron.textContent).toContain("온천천 침수 연대기");
    expect(chron.querySelectorAll(".di-chron > li")).toHaveLength(5);
    expect(chron.textContent).toContain("2014.8.25");
    expect(chron.querySelectorAll(".di-chip")).toHaveLength(5); // 날짜 칩
    expect(chron.querySelector(".di-head")!.textContent).toContain("130"); // 큰 숫자 헤드라인
    expect(chron.querySelector(".di-pill")!.textContent).toContain("온천천 침수 연대기"); // 띠 제목
    expect(chron.textContent).toContain("130mm");
    expect(chron.textContent).toContain("2.63㎢");
    expect(chron.textContent).toContain("2020.7.23~24");
    expect(chron.textContent).toContain("17.2만㎡");
    expect(chron.textContent).toContain("2024.9.20~21");
    expect(chron.textContent).toContain("18.7만㎡");
    expect(chron.textContent).toContain("값 출처: 답 1-3");
    expect(why.textContent).toContain("왜 잠기나");
    expect(within(why).getAllByRole("listitem")).toHaveLength(6);
    expect(why.textContent).toContain("만조");
  });

  it("2-1·1-2·2-4: ② 먼저 볼 곳 네 가지 — 번호 카드 ①~④(지도 형식 아님) · 특보·가정 띠 · 세병교는 글로만", () => {
    const [card] = figs("SH-2-1");
    expect(card.querySelector("svg.im-map")).toBeNull();
    expect(card.textContent).toContain("호우 예비특보");
    expect(card.textContent).toContain("가정 1시간 30mm");
    const li = card.querySelectorAll(".di-spots > li");
    expect(li).toHaveLength(4);
    expect([...li].map((l) => l.querySelector(".di-spot-num")!.textContent)).toEqual(["①", "②", "③", "④"]);
    expect(card.textContent).toContain("연산교 일원");
    expect(card.textContent).toContain("2020년 22,886㎡");
    expect(card.textContent).toContain("5.0cm");
    expect(card.textContent).toContain("세병교");
    cleanup();
    expect(figs("SH-1-2")[0].textContent).toContain("온천천 유역");
    cleanup();
    expect(figs("SH-2-4")[0].textContent).toContain("온천천 유역");
  });

  it("2-3: ④ 2020.7.23 사건 카드(기상·침수 지구·대응·연계 예정) + ⑦ 보유표(5지구 × 7자료 · ●/○)", () => {
    const [ev, mx] = figs("SH-2-6");
    expect(ev.textContent).toContain("2020년 7월 23~24일");
    expect(ev.textContent).toContain("80~86mm");
    expect(ev.textContent).toContain("16,914㎡");
    expect(ev.textContent).toContain("22,887㎡");
    expect(ev.textContent).toContain("연계 예정 자료");
    expect(ev.querySelector("section.pending")!.textContent).toContain("교통 돌발");
    expect(ev.querySelector(".di-head")!.textContent).toContain("22:30");
    expect(ev.querySelectorAll("svg").length).toBeGreaterThan(5); // 아이콘
    expect(mx.querySelectorAll("tbody tr")).toHaveLength(5);
    expect(mx.querySelectorAll("thead th")).toHaveLength(8);
    expect(mx.querySelectorAll("td.on").length).toBeGreaterThan(0);
    expect(mx.querySelectorAll("td.off").length).toBeGreaterThan(0);
    expect(mx.textContent).toContain("연결 예정");
    cleanup();
    expect(figs("SH-2-7")[0].textContent).toContain("2020년 7월 23~24일");
    cleanup();
    expect(figs("SH-2-9")[0].querySelectorAll("tbody tr")).toHaveLength(5);
  });

  it("1-1: ⑤ 눈금자(가정 30 · 2014년 130 · 세병교 1.5~1.8m · 2.45m) + ⑥ 지하차도 6곳(통제 5.0cm)", () => {
    const [g, u] = figs("SH-1-1");
    expect(g.textContent).toContain("지금 가정");
    expect(g.textContent).toContain("130mm");
    expect(g.textContent).toContain("80~86mm");
    expect(g.textContent).toContain("2014년 8월 25일");
    expect(g.textContent).toContain("산책로 차단 약 1.5~1.8m");
    expect(g.textContent).toContain("하상도로 통제 약 2.45m");
    expect(g.querySelector(".di-bar-row.now")).not.toBeNull();
    expect(u.textContent).toContain("5.0cm");
    expect(within(u).getAllByRole("listitem")).toHaveLength(6);
    for (const n of ["구서지하차도", "장전지하차도(1)", "장전지하차도(2)", "내성지하차도", "우장춘지하차도", "안락지하차도"]) expect(u.textContent).toContain(n);
    expect(u.querySelector("svg.im-map")).toBeNull();
    cleanup();
    const [u2] = figs("SH-2-5");
    expect(u2.querySelector("svg.im-map")).toBeNull(); // 지도 형식 그림은 뺐다(2026-11-03) — 카드만
    expect(within(u2).getAllByRole("listitem")).toHaveLength(6);
  });

  it("화면 글자에 영어 낱말이 없다(단위·기호 제외)", () => {
    for (const id of ["SH-1-1", "SH-1-3", "SH-2-1", "SH-2-5", "SH-2-6"]) {
      const { container } = render(<DemoInfoPanel job={job(id)} />);
      const text = container.textContent ?? "";
      expect(text.replace(/mm\/h|mm|cm|km|\bm\b/g, "")).not.toMatch(/[A-Za-z]{2,}/);
      cleanup();
    }
  });
});
