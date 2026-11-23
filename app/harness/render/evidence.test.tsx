// @vitest-environment jsdom
// 근거 문서 · 문서 속 그림 · 개인정보 가림 — 개발서버 근거문서 패널(SCR-UNE-208001 · Figma [확정] 208000)·답 아래 근거 표·그림 카드(FUN-UFR-801007)로 맞춤(2026-11-24).
// 처음 설계: 디자인 캔버스 「근거 문서·문서 그림·개인정보 가림 화면 설계」(2026-11-20). npx vitest run harness/render/evidence
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnswerMarkdown } from "@/components/answer/Markdown";
import DocRefs, { figuresOf } from "@/components/answer/DocRefs";
import { MaskedText, PrivacyNote } from "@/components/answer/PiiMask";
import EvidencePane, { MSG, loadState } from "@/components/explore/EvidencePane";
import { docMarks, docRows, docTableRows, docTitleOnly } from "@/lib/docRefs";
import { MASK_CHAR, countMasks, markMasks } from "@/lib/piiMask";
import { cleanT3qText } from "@/lib/t3qText";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// 2026-11-20 운영 T3Q 실측 응답 꼴(범천2지구 · 중랑천 위치도)
const REFS = [
  { doc: "d1", document_id: "DOC-7d731fbbf9b9", title: "제2장 기초조사 p.32", page: 32, highlight: ["범천 2지구"], source: "우수유출저감대책", url: "/v1/agent/query/REQ/doc-refs/d1", figures: [] },
  { doc: "d2", document_id: "DOC-e6c497d7e45f", title: "홍수취약지구 위치도 - 중랑천 p.114", page: 114, highlight: [], source: "홍수취약지구", url: "/v1/agent/query/REQ/doc-refs/d2", figures: [{ figure: "f1", title: "홍수취약지구 위치도 - 중랑천", kind: "지도", page: 114, url: "/v1/x" }, { figure: "../x", title: "나쁜 번호" }] },
];
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("근거 문서 줄(lib/docRefs)", () => {
  it("근거 번호·문서 ID·그림을 읽는다 — 그림 번호 꼴이 아니면 뺀다, 상대 주소는 링크로 쓰지 않는다", () => {
    const rows = docRows(REFS, "");
    expect(rows.map((r) => [r.doc, r.documentId, r.url, r.figures.length])).toEqual([["d1", "DOC-7d731fbbf9b9", null, 0], ["d2", "DOC-e6c497d7e45f", null, 1]]);
    expect(rows[1].figures[0]).toEqual({ figure: "f1", title: "홍수취약지구 위치도 - 중랑천", kind: "지도", page: "114" });
    expect(docTitleOnly(rows[0])).toBe("제2장 기초조사");
  });
  it("답 글의 근거 표지 번호(나온 순서, 한 번씩)", () => {
    expect(docMarks("가[문서 p.1](#doc:d3) 나[또](#doc:d1) 다[또](#doc:d3) [대상](#ref:r1)")).toEqual(["d3", "d1"]);
  });
  it("근거 표 줄(개발서버 EvidenceTable docRowsOf) — 같은 document_id 는 한 줄·쪽 차례, 같은 쪽 다른 번호는 한 단추, 이름은 끝 「p.N」 을 뗀 것", () => {
    const rows = docRows(
      [
        { doc: "d1", document_id: "A", title: "저감계획 p.40", page: 40, source: "저감계획" },
        { doc: "d2", document_id: "B", title: "p.7", page: 7 },
        { doc: "d3", document_id: "A", title: "저감계획 p.12", page: 12 },
        { doc: "d4", document_id: "A", title: "저감계획 p.12 ", page: "12" },
        { doc: "d5", title: "따로 문서", page: null },
        { title: "번호 없는 문서", page: 3 },
      ],
      "",
    );
    // 같은 문서·같은 쪽은 docRows 가 이미 한 줄로 줄인다(d4 빠짐) — 표 단추 합치기는 줄을 직접 넣어 본다
    expect(rows.map((r) => r.doc)).not.toContain("d4");
    const t = docTableRows([...rows.slice(0, 3), { ...rows[2], doc: "d4", key: "d4" }, ...rows.slice(3)]);
    expect(t.map((r) => [r.name, r.source, r.pages.map((p) => [p.label, p.docs])])).toEqual([
      ["저감계획", "저감계획", [["p.12", ["d3", "d4"]], ["p.40", ["d1"]]]],
      [null, null, [["p.7", ["d2"]]]],
      ["따로 문서", null, [["따로 문서", ["d5"]]]],
    ]);
  });
  it("그림 모으기 — 근거 차례, 근거 번호 없는 줄은 뺀다", () => {
    const rows = docRows(REFS, "");
    expect(figuresOf(rows).map((f) => f.key)).toEqual(["d2:f1"]);
  });
});

describe("답 글 — 근거 표지 단추", () => {
  it("doc_refs 에 짝이 있는 #doc 표지만 단추(적힌 문서명 그대로 · 대상 링크와 같은 모양), 누르면 그 번호", () => {
    const onDoc = vi.fn();
    render(<AnswerMarkdown text={"침수 이력이 있습니다[제2장 기초조사 p.32](#doc:d1). 짝 없는 것[없는 문서](#doc:d9)."} refs={[]} docs={["d1"]} onDoc={onDoc} activeDoc="d1" />);
    const b = screen.getByRole("button", { name: "제2장 기초조사 p.32" });
    expect(b.className).toContain("doc-cite on");
    expect(b.getAttribute("title")).toBe("제2장 기초조사 p.32 근거문서 보기");
    fireEvent.click(b);
    expect(onDoc).toHaveBeenCalledWith("d1");
    expect(screen.queryByRole("button", { name: "없는 문서" })).toBeNull();
    expect(screen.getByText(/없는 문서/)).toBeTruthy();
  });
  it("T3Q 글 공통 정리 — 깨진 글자 표시·아이콘 자리 문자를 걷고 그것만 남은 목록 줄은 지운다(개발서버 cleanT3qText)", () => {
    expect(cleanT3qText("가� 나\n- \n다")).toBe("가 나\n다");
    expect(cleanT3qText("그대로")).toBe("그대로");
    const { container } = render(<AnswerMarkdown text={"강우 �기록\n\n- \n- 남는 줄"} refs={[]} />);
    expect(container.textContent).not.toMatch(/[�-]/);
    expect(container.querySelectorAll("li").length).toBe(1);
  });
});

describe("개인정보 가림(lib/piiMask)", () => {
  it("별표 셋 이상은 가림 표지로, 줄 전체가 별표인 가로줄·굵게(**)·「***글***」 꾸밈은 그대로", () => {
    const t = "발생장소: 성장로166번길 *** 단독주택\n***\n사고발생자: ***(***) ***\n**굵게**\n연락처 051-****-****\n***기울임굵게***";
    expect(countMasks(t)).toBe(6);
    const m = markMasks(t).split("\n");
    expect(m[0]).toBe(`발생장소: 성장로166번길 ${MASK_CHAR} 단독주택`);
    expect(m[1]).toBe("***");
    expect(m[2]).toBe(`사고발생자: ${MASK_CHAR}(${MASK_CHAR}) ${MASK_CHAR}`);
    expect(m[3]).toBe("**굵게**");
    expect(m[4]).toBe(`연락처 051-${MASK_CHAR}-${MASK_CHAR}`);
    expect(m[5]).toBe("***기울임굵게***");
    expect(countMasks("가림 없음")).toBe(0);
    // 굵게 뒤 각주 별표(「**2025년***」)는 가림이 아니다 — 글자에 바로 붙은 세 별표
    expect(countMasks("| **2025년*** | 7.16~20 호우 |")).toBe(0);
    expect(markMasks("| **2025년*** |")).toBe("| **2025년*** |");
    expect(countMasks("vo.la/*** /☎112 (***)[평택시]")).toBe(2);
  });
  it("strict(근거 쪽 masked > 0) — 줄 앞 목록 점·굵게를 뺀 모든 별표를 가림으로(「*(*)」 한 개짜리도)", () => {
    expect(markMasks("* 성명 *(*) **조사자** 010-****", true)).toBe(`* 성명 ${MASK_CHAR}(${MASK_CHAR}) **조사자** 010-${MASK_CHAR}`);
    expect(markMasks("* 성명 *(*)")).toBe("* 성명 *(*)");
  });
  it("답 글·보통 글 모두 같은 「가림」 표시, 답 위에 가린 곳 수 안내", () => {
    const text = "사고발생자: ***(***) *** 입니다.";
    const { container } = render(<><PrivacyNote text={text} /><AnswerMarkdown text={text} refs={[]} /><p id="tl"><MaskedText text={"문의 (***)[평택시] ***-****"} /></p></>);
    expect(screen.getByText("개인정보 3곳을 가리고 보여 드립니다")).toBeTruthy();
    expect(container.querySelectorAll(".md .pii-mask").length).toBe(3);
    expect(container.querySelector(".md")?.textContent).not.toContain("***");
    expect(container.querySelectorAll("#tl .pii-mask").length).toBe(3);
    expect(container.querySelector("#tl")?.textContent).toBe("문의 (가림)[평택시] 가림-가림");
  });
  it("가린 곳이 없으면 안내를 그리지 않는다", () => {
    const { container } = render(<PrivacyNote text="**굵게**만 있는 답" />);
    expect(container.innerHTML).toBe("");
  });
});

describe("답 아래 「근거」 표 · 「그림」 카드(DocRefs — 개발서버 EvidenceTable · FigureCards)", () => {
  it("문서 · 자료 묶음 · 쪽 표 — 쪽 단추를 누르면 그 근거, 보는 중인 쪽은 aria-current", () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({})));
    const onOpen = vi.fn();
    const { container } = render(<DocRefs refs={REFS} text="" jobId="J1" activeDoc="d1" onOpen={onOpen} />);
    const table = screen.getByRole("table", { name: "근거 문서 목록" });
    expect([...table.querySelectorAll("th")].map((t) => t.textContent)).toEqual(["문서", "자료 묶음", "쪽"]);
    expect([...table.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent))).toEqual([
      ["제2장 기초조사", "우수유출저감대책", "p.32"],
      ["홍수취약지구 위치도 - 중랑천", "홍수취약지구", "p.114"],
    ]);
    const p32 = screen.getByRole("button", { name: "제2장 기초조사 p.32 근거문서 보기" });
    expect(p32.getAttribute("aria-current")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "홍수취약지구 위치도 - 중랑천 p.114 근거문서 보기" }));
    expect(onOpen.mock.calls[0][0].doc).toBe("d2");
    expect(onOpen.mock.calls[0][2]).toBeUndefined();
    // 그림 카드 — 우리 서버 주소, 종류 표지 · 쪽 · 제목 · 자료 묶음, 누르면 그 그림부터
    const card = screen.getByRole("button", { name: "홍수취약지구 위치도 - 중랑천 p.114 근거문서에서 보기" });
    expect(card.querySelector("img")?.getAttribute("src")).toBe("/api/agent/jobs/J1/doc-refs/d2/figures/f1");
    expect(card.querySelector(".edp-figure-kind")?.textContent).toBe("지도");
    expect(card.querySelector(".edp-fig-src")?.textContent).toBe("홍수취약지구");
    fireEvent.click(card);
    expect(onOpen.mock.calls[1][2]).toBe("figure:f1");
    expect(container.querySelector(".edp-figs .edp-refs-title")?.textContent).toBe("그림");
  });
  it("그림 카드는 한 줄 3장 · 「N건 더보기」 · 펼친 뒤 「접기」", () => {
    const figs = Array.from({ length: 5 }, (_, i) => ({ figure: `f${i + 1}`, title: `그림 ${i + 1}`, kind: null, page: 3 }));
    render(<DocRefs refs={[{ doc: "d1", title: "문서 p.3", page: 3, figures: figs }]} text="" jobId="J1" onOpen={() => {}} />);
    const list = () => document.querySelectorAll(".edp-figs-list li").length;
    expect(list()).toBe(3);
    fireEvent.click(screen.getByRole("button", { name: /2건 더보기/ }));
    expect(list()).toBe(5);
    fireEvent.click(screen.getByRole("button", { name: /접기/ }));
    expect(list()).toBe(3);
  });
  it("그림을 개인정보 때문에 주지 않았으면(403 FIGURE_WITHHELD) 「불러오지 못함」과 따로 알린다", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => (String(u).includes("/figures/") ? reply({ error: "x", code: "FIGURE_WITHHELD" }, 403) : reply({}))));
    const { container } = render(<DocRefs refs={REFS} text="" jobId="J1" onOpen={() => {}} />);
    fireEvent.error(container.querySelector(".edp-fig img")!);
    expect(await screen.findByText("개인정보 보호로 이 그림은 볼 수 없습니다.")).toBeTruthy();
  });
  it("문서 이름이 비어 온 줄(「p.7」 뿐)은 쪽 본문의 문서명을 받는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ envelope: { result: { document: { title: "2018 저감종합계획" } } } })));
    render(<DocRefs refs={[{ doc: "d1", document_id: "B", title: "p.7", page: 7 }]} text="" jobId="J1" onOpen={() => {}} />);
    expect(await screen.findByText("2018 저감종합계획")).toBeTruthy();
  });
  it("번호 없는 옛 꼴(http 미리보기)은 새 창 링크 그대로", () => {
    const { container } = render(<DocRefs refs={[{ title: "2020 재해연보", page: 32, url: "https://t3q.example/p" }]} text="" jobId="J1" onOpen={() => {}} />);
    expect(container.querySelector("a.ans-doc")?.getAttribute("href")).toBe("https://t3q.example/p");
    expect(container.querySelector(".edp-refs")).toBeNull();
  });
});

describe("우측 패널 「근거 문서」(EvidencePane — 개발서버 208001)", () => {
  const rows = docRows(REFS, "");
  const page1 = {
    title: "제2장 기초조사 p.32",
    document: { title: "제2장 기초조사(상)", publisher: "부산광역시", provider: "행정안전부", source: "우수유출저감대책", disclosure: "비공개" },
    page: 32, printed_page: null, pages_total: 70, markdown: "쪽 전체 글 — 조사자 *(*)\n\n2 - 30", passage: "| 지구명 | 침수심(m) |\n|---|---|\n| 범천2지구 (2020년) | 0~0.9 |",
    highlight: ["범천 2지구"], page_image: null, page_image_withheld: "PII", masked: 2,
  };
  it("제목 줄 · 정보 상자(문서·공개 등급·발행/제공/자료 묶음·쪽) · 인용 부분 먼저(세로 묶음 표, 낱말은 굵게)", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      expect(String(url)).toBe("/api/agent/jobs/J1/doc-refs/d1");
      return reply({ envelope: { status: "SUCCESS", result: page1, warnings: [] } });
    });
    const { container } = render(<EvidencePane jobId="J1" row={rows[0]} rows={rows} onPick={() => {}} />);
    expect(await screen.findByText("제2장 기초조사(상)")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("제2장 기초조사 p.32");
    expect(screen.getByText("비공개").className).toContain("edp-badge--warn");
    expect(container.querySelector(".edp-info-sub")?.textContent).toBe("부산광역시 발행 · 행정안전부 제공 · 우수유출저감대책");
    expect(container.querySelectorAll(".edp-info dd")[1].textContent).toBe("PDF 32쪽 · 전체 70쪽");
    // 가린 수 표지·칠한 낱말 줄·하단 안내 줄은 없다(개발서버 Figma 프레임 — 97104ff)
    expect(container.textContent).not.toContain("가린 개인정보");
    expect(container.textContent).not.toContain("칠한 낱말");
    expect(container.textContent).not.toContain("로그인한 사용자만");
    expect([...container.querySelectorAll("[role=tab]")].map((t) => t.textContent)).toEqual(["인용 부분", "쪽 전체", "원본 쪽"]);
    expect(screen.getByRole("tab", { name: "인용 부분" }).getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector(".edp-record th")?.textContent).toBe("지구명");
    expect(container.querySelector("mark.edp-hit")?.textContent).toBe("범천2지구");
    // 가린 쪽은 원본 이미지가 오지 않는다 — 까닭을 글로
    fireEvent.click(screen.getByRole("tab", { name: "원본 쪽" }));
    expect(screen.getByText(MSG.piiImage)).toBeTruthy();
    // 쪽 전체 — masked > 0 이면 한 개짜리 별표도 가림, 맨 끝 쪽 번호 줄은 뺀다, 복사 단추
    fireEvent.click(screen.getByRole("tab", { name: "쪽 전체" }));
    expect(container.querySelectorAll(".edp-body .pii-mask").length).toBe(2);
    expect(container.querySelector(".edp-body")?.textContent).not.toContain("2 - 30");
    expect(screen.getByRole("button", { name: "쪽 내용 복사" }).textContent).toContain("복사");
  });
  it("근거가 여럿이면 ‹ i / n › — 다음을 누르면 그 근거로", async () => {
    vi.stubGlobal("fetch", async () => reply({ envelope: { result: page1, warnings: [] } }));
    const onPick = vi.fn();
    const { container } = render(<EvidencePane jobId="J1" row={rows[0]} rows={rows} onPick={onPick} />);
    const nav = within(container.querySelector(".edp-nav") as HTMLElement);
    expect(container.querySelector(".edp-count")?.textContent).toBe("1 / 전체 2");
    expect((nav.getByRole("button", { name: "이전 근거" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(nav.getByRole("button", { name: "다음 근거" }));
    expect(onPick.mock.calls[0][0].doc).toBe("d2");
  });
  it("그림을 눌러 열면 그림 탭부터 — 우리 서버 주소, 종류 표지, 제목은 대체 텍스트로만, 쪽 보기 → 원본 쪽", async () => {
    vi.stubGlobal("fetch", async () => reply({ envelope: { status: "SUCCESS", result: { title: "위치도 p.114", document: { title: "홍수취약지구 위치도 - 중랑천" }, page: 114, markdown: "", passage: "있음", page_image: "/v1/x/image", masked: 0 }, warnings: [{ code: "PASSAGE_NOT_FOUND" }] } }));
    const { container } = render(<EvidencePane jobId="J1" row={rows[1]} rows={rows} view="figure:f1" onPick={() => {}} />);
    expect((await screen.findByRole("tab", { name: "그림" })).getAttribute("aria-selected")).toBe("true");
    const img = container.querySelector<HTMLImageElement>(".edp-figure img")!;
    expect(img.getAttribute("src")).toBe("/api/agent/jobs/J1/doc-refs/d2/figures/f1");
    expect(img.getAttribute("alt")).toBe("지도 · 홍수취약지구 위치도 - 중랑천");
    expect(container.querySelector(".edp-figure-kind")?.textContent).toBe("지도");
    // 인용 부분을 못 찾았으면(PASSAGE_NOT_FOUND) 탭이 없다
    expect(screen.queryByRole("tab", { name: "인용 부분" })).toBeNull();
    fireEvent.load(img);
    expect(screen.getByRole("button", { name: "그림 크게 보기(새 창)" })).toBeTruthy();
    fireEvent.click(screen.getByText("이 그림이 실린 쪽 보기(p.114)"));
    expect(container.querySelector<HTMLImageElement>(".edp-image img")?.getAttribute("src")).toBe("/api/agent/jobs/J1/doc-refs/d2/image");
  });
  it("그림·쪽 이미지를 개인정보 때문에 주지 않았으면 따로 알린다(403 *_WITHHELD), 그 밖의 실패는 「불러오지 못함」", async () => {
    vi.stubGlobal("fetch", async (u: string) => {
      if (String(u).endsWith("/figures/f1")) return reply({ error: "x", code: "FIGURE_WITHHELD" }, 403);
      if (String(u).endsWith("/image")) return reply({ error: "x", code: null }, 502);
      return reply({ envelope: { result: { page: 114, markdown: "글", page_image: "/v1/x/image", masked: 0 }, warnings: [] } });
    });
    const { container } = render(<EvidencePane jobId="J1" row={rows[1]} rows={rows} view="figure:f1" onPick={() => {}} />);
    await screen.findByRole("tab", { name: "그림" });
    fireEvent.error(container.querySelector(".edp-figure img")!);
    expect(await screen.findByText(MSG.piiFigure)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "원본 쪽" }));
    fireEvent.error(container.querySelector(".edp-image img")!);
    expect(await screen.findByText(MSG.noImage)).toBeTruthy();
  });
  it("못 여는 까닭 — 410 갱신 · 403 열람 제한 · 404 없음 · 409 경로 없음 · 그 밖", async () => {
    expect([loadState(410, null), loadState(502, "DOC_CHANGED"), loadState(403, null), loadState(404, "NOT_IN_ANSWER"), loadState(409, "NO_REQUEST_ID"), loadState(502, null)]).toEqual(["changed", "changed", "forbidden", "not-found", "no-path", "error"]);
    vi.stubGlobal("fetch", async () => reply({ error: "x", code: null }, 403));
    render(<EvidencePane jobId="J1" row={rows[0]} rows={rows} onPick={() => {}} />);
    expect(await screen.findByText(MSG.restricted)).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
  });
  it("쪽이 지정되지 않았으면 안내 한 줄", async () => {
    vi.stubGlobal("fetch", async () => reply({ envelope: { result: { page: 3, markdown: "글" }, warnings: [{ code: "PAGE_NOT_SPECIFIED" }] } }));
    render(<EvidencePane jobId="J1" row={rows[0]} rows={rows} onPick={() => {}} />);
    expect(await screen.findByText(MSG.pageNotSpecified)).toBeTruthy();
    // 인용 부분이 없으면 쪽 전체부터
    await waitFor(() => expect(screen.getByRole("tab", { name: "쪽 전체" }).getAttribute("aria-selected")).toBe("true"));
  });
});
