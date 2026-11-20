// @vitest-environment jsdom
// 근거 문서 · 문서 속 그림 · 개인정보 가림(사용자 지시 2026-11-20 — T3Q 11/18 메일: 쪽 본문 API v0.4.6 · figures v0.4.8 · 마스킹 시연).
// 화면 설계: 디자인 캔버스 「근거 문서·문서 그림·개인정보 가림 화면 설계」. npx vitest run harness/render/evidence
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnswerMarkdown } from "@/components/answer/Markdown";
import DocRefs from "@/components/answer/DocRefs";
import { MaskedText, PrivacyNote } from "@/components/answer/PiiMask";
import EvidencePane, { evidenceError, highlightRe, withheldText } from "@/components/explore/EvidencePane";
import { docMarks, docRows, docTitleOnly } from "@/lib/docRefs";
import { MASK_CHAR, countMasks, markMasks } from "@/lib/piiMask";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// 2026-11-20 운영 T3Q 실측 응답 꼴(범천2지구 · 중랑천 위치도)
const REFS = [
  { doc: "d1", document_id: "DOC-7d731fbbf9b9", title: "제2장 기초조사 p.32", page: 32, highlight: ["범천 2지구"], source: "우수유출저감대책", url: "/v1/agent/query/REQ/doc-refs/d1", figures: [] },
  { doc: "d2", document_id: "DOC-e6c497d7e45f", title: "홍수취약지구 위치도 - 중랑천 p.114", page: 114, highlight: [], source: "홍수취약지구", url: "/v1/agent/query/REQ/doc-refs/d2", figures: [{ figure: "f1", title: "홍수취약지구 위치도 - 중랑천", kind: "지도", page: 114, url: "/v1/x" }, { figure: "../x", title: "나쁜 번호" }] },
];

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
});

describe("답 글 — 근거 표지 단추", () => {
  it("doc_refs 에 짝이 있는 #doc 표지만 단추, 누르면 그 번호", () => {
    const onDoc = vi.fn();
    render(<AnswerMarkdown text={"침수 이력이 있습니다[제2장 기초조사 p.32](#doc:d1). 짝 없는 것[없는 문서](#doc:d9)."} refs={[]} docs={["d1"]} onDoc={onDoc} activeDoc="d1" />);
    const b = screen.getByRole("button", { name: "제2장 기초조사 p.32" });
    expect(b.className).toContain("doc-cite on");
    fireEvent.click(b);
    expect(onDoc).toHaveBeenCalledWith("d1");
    expect(screen.queryByRole("button", { name: "없는 문서" })).toBeNull();
    expect(screen.getByText(/없는 문서/)).toBeTruthy();
  });
});

describe("개인정보 가림(lib/piiMask)", () => {
  it("*** 는 가림 표지로, 줄 전체가 *** 인 가로줄과 굵게(**)는 그대로", () => {
    const t = "발생장소: 성장로166번길 *** 단독주택\n***\n사고발생자: ***(***) ***\n**굵게**";
    expect(countMasks(t)).toBe(4);
    const m = markMasks(t).split("\n");
    expect(m[0]).toBe(`발생장소: 성장로166번길 ${MASK_CHAR} 단독주택`);
    expect(m[1]).toBe("***");
    expect(m[2]).toBe(`사고발생자: ${MASK_CHAR}(${MASK_CHAR}) ${MASK_CHAR}`);
    expect(m[3]).toBe("**굵게**");
    expect(countMasks("가림 없음")).toBe(0);
    // 굵게 뒤 각주 별표(「**2025년***」)는 가림이 아니다 — 글자에 바로 붙은 세 별표
    expect(countMasks("| **2025년*** | 7.16~20 호우 |")).toBe(0);
    expect(markMasks("| **2025년*** |")).toBe("| **2025년*** |");
    expect(countMasks("vo.la/*** /☎112 (***)[평택시]")).toBe(2);
  });
  it("답 글·보통 글 모두 같은 「가림」 표시, 답 위에 가린 곳 수 안내", () => {
    const text = "사고발생자: ***(***) *** 입니다.";
    const { container } = render(<><PrivacyNote text={text} /><AnswerMarkdown text={text} refs={[]} /><p id="tl"><MaskedText text={"문의 (***)[평택시]"} /></p></>);
    expect(screen.getByText("개인정보 3곳을 가리고 보여 드립니다")).toBeTruthy();
    expect(container.querySelectorAll(".md .pii-mask").length).toBe(3);
    expect(container.querySelector(".md")?.textContent).not.toContain("***");
    expect(container.querySelectorAll("#tl .pii-mask").length).toBe(1);
    expect(container.querySelector("#tl")?.textContent).toBe("문의 (가림)[평택시]");
  });
  it("가린 곳이 없으면 안내를 그리지 않는다", () => {
    const { container } = render(<PrivacyNote text="**굵게**만 있는 답" />);
    expect(container.innerHTML).toBe("");
  });
});

describe("답 아래 근거 문서 · 문서 속 그림(DocRefs)", () => {
  it("번호 있는 줄은 단추 — 누르면 그 근거, 그림은 우리 서버 주소로 그리고 누르면 그 그림부터", () => {
    const onOpen = vi.fn();
    const { container } = render(<DocRefs refs={REFS} text="" jobId="J1" activeDoc="d1" onOpen={onOpen} />);
    expect(screen.getByText("2건 · 줄을 누르면 오른쪽에 그 쪽이 열립니다")).toBeTruthy();
    const rows = container.querySelectorAll(".ans-docrow");
    expect(rows.length).toBe(2);
    expect(rows[0].className).toContain("on");
    expect(rows[1].textContent).toContain("그림 1");
    fireEvent.click(rows[1]);
    expect(onOpen.mock.calls[0][0].doc).toBe("d2");
    expect(onOpen.mock.calls[0][2]).toBeUndefined();
    const img = container.querySelector<HTMLImageElement>(".ans-fig img");
    expect(img?.getAttribute("src")).toBe("/api/agent/jobs/J1/doc-refs/d2/figures/f1");
    expect(container.querySelector(".ans-fig .fig-kind")?.textContent).toBe("지도");
    fireEvent.click(container.querySelector(".ans-fig")!);
    expect(onOpen.mock.calls[1][2]).toBe("figure:f1");
  });
  it("번호 없는 옛 꼴(http 미리보기)은 새 창 링크 그대로", () => {
    const { container } = render(<DocRefs refs={[{ title: "2020 재해연보", page: 32, url: "https://t3q.example/p" }]} text="" jobId="J1" onOpen={() => {}} />);
    expect(container.querySelector("a.ans-doc")?.getAttribute("href")).toBe("https://t3q.example/p");
    expect(container.querySelector(".ans-docrow")).toBeNull();
  });
});

describe("우측 패널 「근거 문서」(EvidencePane)", () => {
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const rows = docRows(REFS, "");
  it("인용 부분을 먼저 — 낱말은 띄어쓰기를 무시하고 칠하고, 가린 수·공개 등급·쪽 번호를 보인다", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      expect(String(url)).toBe("/api/agent/jobs/J1/doc-refs/d1");
      return reply({ envelope: { status: "SUCCESS", result: {
        document: { title: "제2장 기초조사(상)", publisher: "부산광역시", provider: "행정안전부", source: "우수유출저감대책", disclosure: "비공개" },
        page: 32, printed_page: null, pages_total: 70, markdown: "쪽 전체 글 — 조사자 ***", passage: "| 지구명 | 침수심(m) |\n|---|---|\n| 범천2지구 (2020년) | 0~0.9 |",
        highlight: ["범천 2지구"], page_image: null, page_image_withheld: "PII", masked: 2 }, warnings: [] } });
    });
    const { container } = render(<EvidencePane jobId="J1" row={rows[0]} rows={rows} onPick={() => {}} />);
    expect(await screen.findByText("제2장 기초조사(상)")).toBeTruthy();
    expect(screen.getByText("공개 등급 비공개").className).toContain("evp-badge--lock");
    expect(screen.getByText("가린 개인정보 2곳")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "인용 부분" }).getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector(".evp-md mark")?.textContent).toBe("범천2지구");
    // 가린 쪽은 원본 이미지가 오지 않는다 — 까닭을 글로
    fireEvent.click(screen.getByRole("tab", { name: "원본 쪽" }));
    expect(screen.getByText("원본 쪽 이미지는 제공되지 않습니다")).toBeTruthy();
    expect(screen.getByText(withheldText("PII"))).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "쪽 전체" }));
    expect(container.querySelectorAll(".evp-md .pii-mask").length).toBe(1);
  });
  it("그림을 눌러 열면 그림 탭부터 — 그림은 우리 서버 주소, 종류·제목은 받은 그대로", async () => {
    vi.stubGlobal("fetch", async () => reply({ envelope: { status: "SUCCESS", result: { document: { title: "홍수취약지구 위치도 - 중랑천" }, page: 114, markdown: "", passage: null, page_image: "/v1/x/image", masked: 0 }, warnings: [{ code: "PASSAGE_NOT_FOUND" }] } }));
    const { container } = render(<EvidencePane jobId="J1" row={rows[1]} rows={rows} view="figure:f1" onPick={() => {}} />);
    expect((await screen.findByRole("tab", { name: /그림/ })).getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector<HTMLImageElement>(".evp-fig img")?.getAttribute("src")).toBe("/api/agent/jobs/J1/doc-refs/d2/figures/f1");
    expect(container.querySelector(".evp-fig .fig-kind")?.textContent).toBe("지도");
    expect(screen.queryByRole("tab", { name: "인용 부분" })).toBeNull();
    fireEvent.click(screen.getByText("이 그림이 실린 쪽 보기 (p.114)"));
    expect(container.querySelector<HTMLImageElement>(".evp-img")?.getAttribute("src")).toBe("/api/agent/jobs/J1/doc-refs/d2/image");
  });
  it("못 여는 까닭을 말로 — 문서 갱신(410) · 대화 삭제 · 그 밖", async () => {
    expect(evidenceError(410, "DOC_CHANGED")).toContain("갱신되어");
    expect(evidenceError(404, "DOC_REF_NOT_FOUND")).toContain("대화가 삭제되어");
    vi.stubGlobal("fetch", async () => reply({ error: "x", code: "DOC_CHANGED" }, 410));
    render(<EvidencePane jobId="J1" row={rows[0]} rows={rows} onPick={() => {}} />);
    expect(await screen.findByText(evidenceError(410, "DOC_CHANGED"))).toBeTruthy();
  });
  it("칠할 낱말 정규식 — 띄어쓰기 차이 무시", () => {
    const re = highlightRe(["범천 2지구"])!;
    expect("범천2지구 (우)".match(re)?.[0]).toBe("범천2지구");
    expect("범천 2 지구".match(re)?.[0]).toBe("범천 2 지구");
    expect(highlightRe([])).toBeNull();
  });
});

describe("가림이 아닌 세 별표(녹화 답 실측)", () => {
  it("「83건\***」(별표 글자 + 굵게 닫기)는 가림이 아니다", () => {
    expect(countMasks("| **106건** | **83건\*** | - |")).toBe(0);
  });
});
