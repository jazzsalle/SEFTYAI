// @vitest-environment jsdom
// 근거 쪽 글 그리기 규칙 — 개발서버 FUN-UFR-801002(afff772 · 0a78378 · ddc6fce · 5ee5870 · 5f26d3a · 7cb7672 · 2f3932f · ad3e021 · f296ed3 · 3e52fe8) 이식(2026-11-24).
// 글자는 T3Q 가 준 그대로, 모양만. npx vitest run harness/render/evidenceText
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PassageText from "@/components/explore/PassageText";
import { parseBlocks, toSpans, type Block } from "@/lib/evidence/parse";
import {
  blankHeadLines, dropBlankColumns, groupLoose, hasLooseRun, headOnlyLine, isLonePair, leadTitle, markWords, singleColumnList, splitFences,
  splitShortLineRuns, stripPageFooter, toDescList, withHeadingRanks,
} from "@/lib/evidence/rules";
import { hideDbNames } from "@/lib/answerText";

afterEach(cleanup);

const table = (md: string) => parseBlocks(md)[0] as Extract<Block, { kind: "table" }>;
const txt = (spans: { text: string; br?: boolean }[]) => spans.map((s) => (s.br ? "|" : s.text)).join("");

describe("표 칸 규칙(tableCells)", () => {
  it("머리 줄만 온 표는 칸 글을 띄어 쓴 한 줄", () => {
    const t = table("| 구포1지구 (IFN-001) | 반여1지구(IFN-011) |\n|---|---|");
    expect(txt(headOnlyLine(t.head, t.rows)!)).toBe("구포1지구 (IFN-001) 반여1지구(IFN-011)");
    expect(headOnlyLine(t.head, [[]])).toBeNull();
  });
  it("머리·모든 칸이 빈 열은 빼고, 머리 줄이 빈 표는 줄마다 한 줄, 열 하나뿐인 표는 목록(머리 칸 글은 제목)", () => {
    const t = dropBlankColumns(table("| 최대 수심 |  |\n|---|---|\n| 2.000 |  |\n| 1.778 |  |"));
    expect(t.head.length).toBe(1);
    const single = singleColumnList(t)!;
    expect(txt(single.title!)).toBe("최대 수심");
    expect(single.items.map(txt)).toEqual(["2.000", "1.778"]);
    const blank = table("|  |  |\n|---|---|\n| 침수 | 구역 |\n|  |  |\n| 범례 |  |");
    expect(blankHeadLines(blank)!.map(txt)).toEqual(["침수 구역", "범례"]);
    expect(blankHeadLines(table("| 가 | 나 |\n|---|---|\n| 1 | 2 |"))).toBeNull();
  });
});

describe("설명 목록 · 짧은 글줄 묶음 · 제목 단계", () => {
  it("「- 항목: 값」 목록은 설명 목록, 값 없이 하위 줄이 딸리면 묶음 제목, 한 줄뿐이면 목록 한 줄", () => {
    const b = parseBlocks("- 조사팀\n  - 팀장: 홍길동\n  - 침수시간 : 총 2시간\n- 비고:")[0] as Extract<Block, { kind: "list" }>;
    const rows = toDescList(b.items, b.depths)!;
    expect(rows.map((r) => (r.kind === "group" ? ["group", txt(r.spans)] : ["pair", txt(r.label), txt(r.value)]))).toEqual([
      ["group", "조사팀"],
      ["pair", "팀장", "홍길동"],
      ["pair", "침수시간", "총 2시간"],
      ["pair", "비고", ""],
    ]);
    const lone = parseBlocks("- 지정면적: 6.8㎢")[0] as Extract<Block, { kind: "list" }>;
    expect(isLonePair(toDescList(lone.items, lone.depths)!)).toBe(true);
    const plainList = parseBlocks("- 첫째 문장\n- 둘째: 값")[0] as Extract<Block, { kind: "list" }>;
    expect(toDescList(plainList.items, plainList.depths)).toBeNull();
  });
  it("빈 줄 없이 줄만 바꾼 짧은 글줄(3줄 이상·모두 30자 이하)은 덩어리마다 한 상자, 첫 줄이 「범례」·숫자 없는 소제목이면 상자 제목", () => {
    expect(splitShortLineRuns("범례\n조사지점\n파쇄위치\n\n긴 문장 하나")).toBe("범례<br>조사지점<br>파쇄위치\n\n긴 문장 하나");
    expect(splitShortLineRuns("짧은 줄\n" + "가".repeat(31) + "\n짧은 줄")).toBe("짧은 줄\n" + "가".repeat(31) + "\n짧은 줄");
    const items = groupLoose(parseBlocks(splitShortLineRuns("침수심별 면적\n0.5m 미만 10409.9\n0.5~1.0m 2210.1")));
    expect(items.length).toBe(1);
    const box = items[0] as Extract<ReturnType<typeof groupLoose>[number], { kind: "lines" }>;
    expect(txt(box.title!)).toBe("침수심별 면적");
    expect(box.lines.map(txt)).toEqual(["0.5m 미만 10409.9", "0.5~1.0m 2210.1"]);
    expect(leadTitle([toSpans("가"), toSpans("나")])).toBeNull();
    const many = groupLoose(parseBlocks(["가", "나", "다", "라", "마", "바"].join("\n\n")));
    expect(hasLooseRun(many)).toBe(true);
  });
  it("제목 단계 — # 개수가 아니라 그 쪽 안에서 상대적으로, □·○ 로 시작하는 짧은 줄은 # 제목 아래 단계", () => {
    const { blocks, rankOf } = withHeadingRanks(parseBlocks("## 1 개요\n\n### 가. 현황\n\n□ 침수흔적\n\n○ 세부\n\n본문"));
    expect(blocks.filter((b) => b.kind === "heading").map(rankOf)).toEqual([0, 1, 2, 2]);
    const one = withHeadingRanks(parseBlocks("##### 나. 침수현황조사"));
    expect(one.rankOf(one.blocks[0])).toBe(0);
  });
});

describe("강조 낱말 · 쪽 번호 줄 · 코드 울타리 · 표 이름 가림", () => {
  it("띄어쓰기 차이를 무시하고 찾되 칠한 글자는 원문 그대로", () => {
    expect(markWords("범천 2지구와 범천2지구", ["범천2 지구"])).toEqual([
      { text: "범천 2지구", hit: true },
      { text: "와 ", hit: false },
      { text: "범천2지구", hit: true },
    ]);
    expect(markWords("글", [])).toEqual([{ text: "글", hit: false }]);
  });
  it("맨 끝 원본 PDF 쪽 번호 줄 하나만 뺀다", () => {
    expect(stripPageFooter("본문\n1 - 1275 1 - 1276\n")).toBe("본문");
    expect(stripPageFooter("본문\n2 - 30 끝")).toBe("본문\n2 - 30 끝");
    expect(stripPageFooter("2 - 30")).toBe("2 - 30");
  });
  it("코드 울타리는 원문 그대로(닫히지 않으면 끝까지)", () => {
    expect(splitFences("앞\n```mermaid\ngraph TD\n```\n뒤")).toEqual([{ kind: "md", text: "앞" }, { kind: "code", text: "graph TD" }, { kind: "md", text: "뒤" }]);
  });
  it("괄호 속 표 이름은 실제로 본 스키마로만 가린다 — 「(report.pdf)」 는 그대로(개발서버 9d0b0dd)", () => {
    expect(hideDbNames("위험지구(hazard.zone) 기준")).toBe("위험지구 기준");
    expect(hideDbNames("보고서(report.pdf) 참고")).toBe("보고서(report.pdf) 참고");
    expect(hideDbNames("*출처: 재난 DB(hazard.zone, flood.trace)*\n본문")).toBe("본문");
  });
});

describe("그리기(PassageText)", () => {
  it("쪽 전체 표는 가로 표(첫 열 고정 · 빈 칸 「-」), 인용 부분은 「항목 | 값」 세로 묶음", () => {
    const md = "| 지구 | 침수심 |\n|---|---:|\n| 범천2 |  |";
    const page = render(<PassageText text={md} mode="page" />).container;
    expect(page.querySelector("table.edp-table th.edp-sticky")?.textContent).toBe("지구");
    expect([...page.querySelectorAll("tbody td")].map((t) => t.textContent)).toEqual(["범천2", "-"]);
    expect(page.querySelector("td[style], th[style]")).toBeNull(); // 정렬 표시를 따르지 않고 모두 왼쪽
    cleanup();
    const passage = render(<PassageText text={md} mode="passage" />).container;
    expect([...passage.querySelectorAll(".edp-record tr")].map((tr) => tr.textContent)).toEqual(["지구범천2", "침수심-"]);
  });
  it("하위 목록 단계 표지 · 원문 번호 지킴 · 코드 상자 · 가림", () => {
    const { container } = render(<PassageText text={"- 가\n  - 나\n\n3. 셋\n4. 넷\n\n```\n원문 그대로\n```\n\n연락처 ***"} />);
    expect(container.querySelector(".edp-list--disc .edp-list--dash")?.textContent).toBe("나");
    expect([...container.querySelectorAll(".edp-list--none li")].map((l) => l.textContent)).toEqual(["3. 셋", "4. 넷"]);
    expect(container.querySelector("pre.edp-code")?.textContent).toBe("원문 그대로");
    expect(container.querySelector(".pii-mask")?.textContent).toBe("가림");
  });
});
