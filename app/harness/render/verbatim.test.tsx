// @vitest-environment jsdom
// 하네스 ③ 무가공 테스트 — 렌더된 글자 = 원문 마크다운의 글자(공백 정규화), 대상 링크 수 = refs 에 있는 고유 표지 수.
// 굵게(G5, remark-cjk-friendly): 별표가 글자로 남지 않음(가림 이름 「여**」 제외) · remark-gfm 단독과는 별표만 다름.
// <br> 만 줄바꿈, 그 밖의 HTML 은 글자. 표 도구(data-ui)는 답 글이 아니므로 비교에서 뺀다.
// npx vitest run harness/render
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import { AnswerMarkdown, mdPlainText, REMARK_PLUGINS, tableTsv } from "@/components/answer/Markdown";

const REC = join(__dirname, "..", "recordings");
type Ref = { ref: string; entity_type: string | null; display_name: string | null; map: { key: string | null; value: string; draw: string | null } };
const answers: { name: string; text: string; refs: Ref[] }[] = [];
for (const f of readdirSync(REC, { recursive: true }) as string[]) {
  if (!f.endsWith(".json")) continue;
  const j = JSON.parse(readFileSync(join(REC, f), "utf8"));
  const finals = [...(j.runs ?? []).map((r: { final: unknown }) => r.final), ...(j.final ? [j.final] : [])];
  finals.forEach((fin: { result?: { answer?: string; refs?: Ref[] } }, i: number) => {
    if (fin?.result?.answer) answers.push({ name: `${f}#${i}`, text: fin.result.answer, refs: fin.result.refs ?? [] });
  });
}
// 경계 사례 — raw HTML·refs 에 없는 표지·외부 링크·<br>
answers.push({
  name: "edge",
  text: "## 제목\n\n<b>태그</b> 와 [없는 대상](#ref:r99) · [있는 대상](#ref:r1) · [외부](https://example.com) · ![그림](x.png)\n\n| a | b |\n|---|---|\n| 1<br>2 | `code` |",
  refs: [{ ref: "r1", entity_type: "RISK_AREA", display_name: "있는 대상", map: { key: "slope_no", value: "1", draw: "line" } }],
});
// 경계 사례 — 한글 옆 굵게(CommonMark 규칙으로는 별표가 남던 꼴)
answers.push({ name: "cjk", text: "부산 **도심 저지대)**입니다. 결과는 **'불안전'**으로 바뀌었고 소유자(여\\*\\*)는 그대로.", refs: [] });

const norm = (s: string) => s.replace(/\s+/g, "");
const BR = /<br\s*\/?>/gi;

/**
 * 원문 마크다운의 글자(마크업 제외). html 노드는 글자 그대로 보이므로 value 를 포함(<br> 은 줄바꿈이라 뺌), 이미지는 alt.
 * cjk = 앱과 같은 플러그인 목록(REMARK_PLUGINS: remark-gfm + remark-cjk-friendly), 아니면 remark-gfm 단독
 */
type MdNode = { type: string; value?: string; children?: MdNode[] };
const plainOf = (md: string, cjk: boolean) => {
  const p = cjk ? unified().use(remarkParse).use(REMARK_PLUGINS as never) : unified().use(remarkParse).use(remarkGfm, { singleTilde: false });
  const tree = p.runSync(p.parse(md)) as MdNode;
  const strip = (n: MdNode) => {
    if (n.type === "html" && n.value) n.value = n.value.replace(BR, "");
    n.children?.forEach(strip);
  };
  strip(tree);
  return toString(tree as Parameters<typeof toString>[0], { includeHtml: true, includeImageAlt: true });
};

/** 그려진 HTML → DOM. 표 도구(data-ui)는 뺀다 */
const domOf = (html: string) => {
  const d = document.createElement("div");
  d.innerHTML = html;
  d.querySelectorAll("[data-ui]").forEach((e) => e.remove());
  return d;
};
const render = (text: string, refs: Ref[] = []) => renderToStaticMarkup(<AnswerMarkdown text={text} refs={refs} />);
const visible = (text: string, refs: Ref[] = []) => domOf(render(text, refs)).textContent ?? "";

/** 가림 이름(여** 등) — 원문이 별표를 이스케이프(\*)해 글자로 쓴 것 */
const MASKED = /[가-힣]\*{2,}/g;

describe("답변 무가공 렌더", () => {
  it("녹화 답변이 있다", () => expect(answers.length).toBeGreaterThan(1));
  for (const a of answers) {
    it(`${a.name} — 글자 동일`, () => {
      expect(norm(visible(a.text, a.refs))).toBe(norm(plainOf(a.text, true)));
    });
    it(`${a.name} — remark-gfm 단독과 비교해 별표만 다르다`, () => {
      const strip = (s: string) => norm(s).replace(/\*/g, "");
      expect(strip(visible(a.text, a.refs))).toBe(strip(plainOf(a.text, false)));
    });
    it(`${a.name} — 별표 두 개가 글자로 남지 않는다(가림 이름 제외)`, () => {
      const v = visible(a.text, a.refs);
      expect(v.replace(MASKED, "")).not.toContain("**");
      for (const m of v.match(MASKED) ?? []) expect(a.text).toContain(m[0] + "\\*".repeat(m.length - 1));
    });
    it(`${a.name} — 대상 링크 수 = refs 에 있는 고유 표지`, () => {
      const html = render(a.text, a.refs);
      const links = (html.match(/class="ref-link/g) ?? []).length;
      const have = new Set(a.refs.map((r) => r.ref));
      // 코드(백틱) 안의 표지는 마크다운 규칙상 글자 그대로라 링크가 아니다
      const noCode = a.text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
      const marks = [...noCode.matchAll(/\]\(#ref:(r\d+)\)/g)].map((m) => m[1]).filter((r) => have.has(r));
      expect(links).toBe(marks.length);
    });
  }

  it("녹화 답 전체 — remark-gfm 단독이면 별표가 글자로 남던 답이 있었고, 지금은 가림 이름만 남는다", () => {
    let before = 0;
    let after = 0;
    for (const a of answers) {
      before += (plainOf(a.text, false).match(/\*\*/g) ?? []).length;
      after += (visible(a.text, a.refs).replace(MASKED, "").match(/\*\*/g) ?? []).length;
    }
    expect(before).toBeGreaterThan(0);
    expect(after).toBe(0);
  }, 120_000);

  it("한글 옆 굵게 — 글쓴이 뜻대로 굵게, 글자는 그대로", () => {
    const d = domOf(render("부산 **도심 저지대)**입니다. 결과는 **'불안전'**으로 바뀜"));
    expect([...d.querySelectorAll("strong")].map((e) => e.textContent)).toEqual(["도심 저지대)", "'불안전'"]);
    expect(d.textContent).toBe("부산 도심 저지대)입니다. 결과는 '불안전'으로 바뀜");
  });

  it("<br>·<br/>·<br /> 만 줄바꿈 — 그 밖의 HTML 은 글자 그대로", () => {
    const md = "줄1<br>줄2<br/>줄3<br />줄4 <span>그대로</span> <b>굵게 아님</b> <br class=\"x\"> `<br>`\n\n| 칸 |\n|---|\n| 가<br>나 |";
    const d = domOf(render(md));
    const p = d.querySelector("p")!;
    expect(p.querySelectorAll("br")).toHaveLength(3);
    expect(p.querySelector("span, b")).toBeNull();
    expect(p.textContent).toBe('줄1줄2줄3줄4 <span>그대로</span> <b>굵게 아님</b> <br class="x"> <br>');
    expect(d.querySelectorAll("td br")).toHaveLength(1);
    expect(d.querySelector("td")!.textContent).toBe("가나");
  });

  it("<br> 이 있는 HTML 덩어리 — <br> 만 줄바꿈, 나머지 태그는 글자", () => {
    const d = domOf(render("<div>가<br>나</div>"));
    expect(d.querySelectorAll("br")).toHaveLength(1);
    expect(d.querySelector(".md div")).toBeNull();
    expect(d.textContent).toBe("<div>가나</div>");
  });

  it("물결 한 개(~)는 취소선이 되지 않는다", () => {
    const html = render("A(0~20점), B(21~40점), C(41~60점)");
    expect(html).not.toMatch(/<del>/);
    expect(domOf(html).textContent).toContain("A(0~20점), B(21~40점), C(41~60점)");
  });
  it("물결 두 개(~~)는 취소선", () => {
    expect(render("~~지난 값~~ 새 값")).toMatch(/<del>지난 값<\/del>/);
  });
  it("번호 목록은 원문 번호를 그대로 쓴다(공동 순위)", () => {
    const html = render("6. 서천읍 (각 3개소)\n9. 마서면 (각 2개소)");
    expect(html).toMatch(/<li value="6"/);
    expect(html).toMatch(/<li value="9"/);
  });
  it("raw HTML 은 태그로 그리지 않는다", () => {
    const html = render("<script>x</script><b>y</b>");
    expect(html).not.toMatch(/<script|<b>/);
  });
  it("대상 링크 — 기호 없는 글자 링크, 고른 대상은 aria-pressed", () => {
    const refs: Ref[] = [{ ref: "r1", entity_type: "RISK_AREA", display_name: "초량제1지하차도", map: { key: null, value: "1", draw: null } }];
    const d = domOf(renderToStaticMarkup(<AnswerMarkdown text="[초량제1지하차도](#ref:r1) 확인" refs={refs} activeRef="r1" />));
    const b = d.querySelector("button.ref-link")!;
    expect(b.textContent).toBe("초량제1지하차도");
    expect(b.className).toBe("ref-link on");
    expect(b.getAttribute("aria-pressed")).toBe("true");
    expect(b.getAttribute("title")).toBe("초량제1지하차도 · 위험·취약지역");
  });
});

describe("답 속 표(C11)", () => {
  const table = (rows: number) => `| 번호 | 값 |\n|---|---|\n${Array.from({ length: rows }, (_, i) => `| ${i + 1} | 가 |`).join("\n")}`;

  it("정렬이 적히지 않은 열만 숫자처럼 보이면 오른쪽 정렬 — 적힌 정렬은 그대로, 글자는 그대로", () => {
    const md = "| 이름 | 길이 | 점수 | 비고 |\n|---|---|---:|:---|\n| 가 | 125m | 83.0점 | 1 |\n| 나 | 1,220m | 70점 | 2 |\n| 다 | - | 50점 | 3 |\n| 라 | 5.0cm | 1점 | 4 |";
    const d = domOf(render(md));
    const col = (i: number) => [...d.querySelectorAll("tr")].map((tr) => tr.children[i] as HTMLElement);
    expect(col(1).every((c) => c.classList.contains("num"))).toBe(true);
    expect(col(0).some((c) => c.classList.contains("num"))).toBe(false);
    expect(col(2).some((c) => c.classList.contains("num"))).toBe(false);
    expect(col(2).every((c) => c.style.textAlign === "right")).toBe(true);
    expect(col(3).some((c) => c.classList.contains("num"))).toBe(false);
    expect(col(1).map((c) => c.textContent)).toEqual(["길이", "125m", "1,220m", "-", "5.0cm"]);
  });
  it("숫자처럼 보이는 칸이 80% 미만이면 그대로 둔다", () => {
    const d = domOf(render("| 값 |\n|---|\n| 1 |\n| 2 |\n| 가 |\n| 나 |\n| 3 |"));
    expect(d.querySelector(".num")).toBeNull();
  });
  it("표마다 「표 복사」, 20행이 넘을 때만 「표 끝으로」 — 둘 다 답 글이 아닌 도구(data-ui)", () => {
    for (const [rows, end] of [[20, false], [21, true]] as const) {
      const html = render(table(rows));
      const d = document.createElement("div");
      d.innerHTML = html;
      const tools = d.querySelector(".md-tbl-tools")!;
      expect(tools.hasAttribute("data-ui")).toBe(true);
      expect(tools.textContent).toContain("표 복사");
      expect(tools.textContent?.includes("표 끝으로")).toBe(end);
    }
  });
  it("표 복사 — 탭 구분, 행은 줄바꿈, 칸 안 <br> 은 빈칸, 링크는 글자만", () => {
    const refs: Ref[] = [{ ref: "r3", entity_type: "RISK_AREA", display_name: "N3지구", map: { key: null, value: "3", draw: null } }];
    const d = domOf(render("| 시설명 | 대상 | 거리 |\n|---|---|:---:|\n| **숙박시설** | [N3지구](#ref:r3)<br>(5181000030) | **41.4m** |\n| 여\\*\\* | - | 66.2m |", refs));
    expect(tableTsv(d.querySelector("table")!)).toBe("시설명\t대상\t거리\n숙박시설\tN3지구 (5181000030)\t41.4m\n여**\t-\t66.2m");
  });
});

describe("답변 복사(C10) — 서식 없는 글", () => {
  it("마크다운 기호만 빼고 글자·순서 그대로 — 목록 표지는 글쓴이가 쓴 그대로, 표는 탭 구분, <br> 은 줄바꿈", () => {
    const md = [
      "### 결론",
      "",
      "부산 **저지대)**입니다. [초량제1지하차도](#ref:r1) 확인",
      "",
      "6. 서천읍 (각 3개소)",
      "9. 마서면",
      "   * 하위 `코드`",
      "",
      "> 인용 *기울임*",
      "",
      "---",
      "",
      "| 구분 | 값 |",
      "|---|---:|",
      "| 가<br>나 | 1,220m |",
      "",
      "끝줄<br>다음줄",
    ].join("\n");
    const refs: Ref[] = [{ ref: "r1", entity_type: "RISK_FACTOR", display_name: "초량제1지하차도", map: { key: null, value: "1", draw: null } }];
    const d = document.createElement("div");
    d.innerHTML = render(md, refs);
    expect(mdPlainText(d.querySelector(".md")!)).toBe(
      ["결론", "", "부산 저지대)입니다. 초량제1지하차도 확인", "", "6. 서천읍 (각 3개소)", "9. 마서면", "  * 하위 코드", "", "인용 기울임", "", "구분\t값", "가 나\t1,220m", "", "끝줄", "다음줄"].join("\n"),
    );
  });
  it("녹화 답 전체 — 서식 없는 글의 글자 = 화면 글자 + 글쓴이가 쓴 목록 표지(공백 제외)", () => {
    for (const a of answers) {
      const d = document.createElement("div");
      d.innerHTML = render(a.text, a.refs);
      const md = d.querySelector(".md")!;
      const plain = mdPlainText(md);
      md.querySelectorAll("[data-ui]").forEach((e) => e.remove());
      // 목록 표지(- · * · 6.)는 화면에서 글머리표로 그려진다 — 원문에서 읽은 표지(data-marker)를 항목 앞에 넣어 견준다
      md.querySelectorAll("li[data-marker]").forEach((li) => li.prepend(document.createTextNode(li.getAttribute("data-marker")!)));
      expect(norm(plain), a.name).toBe(norm(md.textContent ?? ""));
    }
  }, 120_000);
});
