"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
// 읽기(마크다운 → 나무)만 쓴다 — 같은 꾸러미의 읽기 전용 입구(쓰기 확장은 번들에 넣지 않음)
import remarkCjkFriendly from "remark-cjk-friendly/parseOnly";
import type { T3qRef } from "@/lib/jobTypes";
import "./answer.css";

/**
 * T3Q 답변 마크다운 무가공 렌더러 (R0·R5, 설계 §6 · 시각 설계 08 C — 적용 범위 R25)
 * - 글자는 한 자도 바꾸지 않는다. 마크다운 뜻대로만 그린다(GFM 표·목록·인용·코드).
 * - 굵게·기울임은 CJK 친화 구분자 규칙(remark-cjk-friendly, G5) — 「…저지대)**입니다」처럼 한글 옆 별표도 글쓴이 뜻대로 굵게. 글자는 그대로.
 * - raw HTML 가운데 <br>·<br/>·<br /> 만 줄바꿈으로 그린다. 그 밖의 HTML 은 태그로 실행하지 않고 글자 그대로 보인다(rehype-raw 없음).
 * - `[이름](#ref:rN)` 은 refs 에 rN 이 있을 때만 대상 링크(파랑 글자 + 1px 점선 밑줄, 기호 없음, 고르면 옅은 바탕). 없으면 링크 아닌 글자(설명서 7.3 — 서버도 미리 벗김).
 * - http(s) 링크만 새 창. 그 밖의 링크·이미지는 글자로.
 * - 물결 한 개(~)는 취소선으로 바꾸지 않는다(0~20점 같은 범위 표기 보존) — 취소선은 ~~ 두 개만.
 * - 번호 목록은 T3Q 가 쓴 번호를 그대로(공동 순위 "6. … 9." 가 브라우저 번호로 바뀌지 않게).
 * - 표(C11): 가로 스크롤 상자 + 오른쪽 그림자, 첫 열 고정, 정렬이 적히지 않은 열만 숫자처럼 보이면 오른쪽 정렬(글자 그대로),
 *   표마다 「표 복사」(탭 구분), 20행이 넘으면 「표 끝으로」. 표 도구는 data-ui — 답 글이 아니다(무가공 비교·답변 복사에서 뺀다).
 */
export const REMARK_PLUGINS = [[remarkGfm, { singleTilde: false }], remarkCjkFriendly] as const;

/** 대상 종류 → 한국어(목록·툴팁). 모르는 종류는 받은 값 그대로 */
const ENTITY_LABEL: Record<string, string> = {
  EVENT: "재난사건", RISK_AREA: "위험·취약지역", FACILITY: "시설", RISK_FACTOR: "잠재 위험요소", RISK_FACTOR_FACILITY: "잠재 위험요소·취약시설", RIVER: "하천",
  FLOOD_TRACE: "침수흔적", REGION: "행정구역", POINT: "지점", FLOOD_MAP: "침수지도 구역", PARCEL: "필지",
};
export const entityLabel = (t: string | null) => (t ? ENTITY_LABEL[t] ?? t : "대상");

// ── rehype 단계(hast) — 작은 나무 다루기 ──
interface HNode {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HNode[];
}

const BR_SPLIT = /(<br\s*\/?>)/i;
/**
 * 답 속 raw HTML 가운데 <br>·<br/>·<br /> 만 줄바꿈 요소로 바꾼다. 나머지 raw 는 그대로 두면
 * react-markdown 이 글자로 보인다(skipHtml=false · rehype-raw 없음). 다른 글자는 건드리지 않는다.
 */
function rehypeBrOnly() {
  const visit = (p: HNode) => {
    if (!p.children) return;
    const out: HNode[] = [];
    for (const c of p.children) {
      if (c.type === "raw" && typeof c.value === "string" && BR_SPLIT.test(c.value)) {
        c.value.split(BR_SPLIT).forEach((part, i) => {
          if (i % 2) out.push({ type: "element", tagName: "br", properties: {}, children: [] });
          else if (part) out.push({ type: "raw", value: part });
        });
      } else {
        visit(c);
        out.push(c);
      }
    }
    p.children = out;
  };
  return (tree: HNode) => visit(tree);
}

/** 숫자처럼 보이는 칸 — 5.0cm · 1,220m · 83.0점 · 13건 · 46.6667 (글자는 바꾸지 않고 정렬만) */
const NUMERIC = /^[+\-−±]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s?(?:%|[A-Za-z㎡㎢㎥㎞㎝㎜㎏℃°]{1,4}|[가-힣]{1,2})?$/;
/** 빈 칸 표시(— · -)는 숫자 판정에서 뺀다 */
const PLACEHOLDER = /^[-—–]?$/;
const textOf = (n: HNode): string => (n.type === "text" || n.type === "raw" ? n.value ?? "" : (n.children ?? []).map(textOf).join(""));
const isEl = (n: HNode, ...tags: string[]) => n.type === "element" && tags.includes(n.tagName ?? "");

/**
 * 답 속 표 표시 정보 — 표 번호·본문 행 수(표 끝으로), 숫자 열(정렬이 적히지 않은 열에서 본문 칸 80% 이상이 숫자처럼 보이면 class="num").
 * 마크다운이 정렬을 적은 열(:--- · :---: · ---:)은 적힌 대로 둔다. 칸 글자는 건드리지 않는다.
 */
function rehypeAnswerTables() {
  return (tree: HNode) => {
    let no = 0;
    const visit = (n: HNode) => {
      if (isEl(n, "table")) annotateTable(n, ++no);
      n.children?.forEach(visit);
    };
    visit(tree);
  };
}
function annotateTable(table: HNode, no: number) {
  const rows: HNode[] = [];
  const collect = (n: HNode) => {
    for (const c of n.children ?? []) {
      if (isEl(c, "tr")) rows.push(c);
      else if (isEl(c, "thead", "tbody", "tfoot")) collect(c);
    }
  };
  collect(table);
  const cellsOf = (tr: HNode) => (tr.children ?? []).filter((c) => isEl(c, "td", "th"));
  const body = rows.filter((r) => !cellsOf(r).some((c) => c.tagName === "th"));
  const width = rows.reduce((w, r) => Math.max(w, cellsOf(r).length), 0);
  for (let col = 0; col < width; col++) {
    const cells = rows.map((r) => cellsOf(r)[col]).filter(Boolean);
    if (cells.some((c) => c.properties?.align)) continue;
    const vals = body
      .map((r) => cellsOf(r)[col])
      .filter(Boolean)
      .map((c) => textOf(c).trim())
      .filter((t) => !PLACEHOLDER.test(t));
    if (!vals.length || vals.filter((t) => NUMERIC.test(t)).length / vals.length < 0.8) continue;
    for (const c of cells) {
      const p = (c.properties ??= {});
      p.className = [...(Array.isArray(p.className) ? p.className : []), "num"];
    }
  }
  const p = (table.properties ??= {});
  p.dataTableNo = no;
  p.dataBodyRows = body.length;
}

const REHYPE_PLUGINS = [rehypeBrOnly, rehypeAnswerTables];
/** 각주(답에 오면) — 화면 읽기 프로그램 문구도 한국어로 */
const REMARK_REHYPE = { footnoteLabel: "각주", footnoteBackLabel: (i: number) => `본문 ${i + 1}번 자리로` };

// ── 복사(C10) — 그려진 답에서 글자만. 표 도구(data-ui)는 뺀다 ──
const skipUi = (el: Element) => el.hasAttribute("data-ui");
/** 글 조각 — <br> 은 br 글자(문단은 줄바꿈, 표 칸은 빈칸) */
function inlineText(n: Node, br: string): string {
  if (n.nodeType === 3) return n.nodeValue ?? "";
  if (n.nodeType !== 1) return "";
  const el = n as Element;
  if (skipUi(el) || el.tagName === "INPUT") return "";
  if (el.tagName === "BR") return br;
  let s = "";
  el.childNodes.forEach((c) => (s += inlineText(c, br)));
  return s;
}

/** 표 → 탭 구분 글(행은 줄바꿈). 칸 안 줄바꿈·탭은 빈칸 하나로 — 한글·엑셀에 붙여넣기 */
export function tableTsv(table: HTMLTableElement): string {
  return Array.from(table.rows)
    .map((tr) => Array.from(tr.cells).map((c) => inlineText(c, " ").replace(/[\t\r\n]+/g, " ").trim()).join("\t"))
    .join("\n");
}

const BLOCK = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "TABLE", "HR", "DIV", "SECTION"]);
const isBlock = (n: Node) => n.nodeType === 1 && BLOCK.has((n as Element).tagName);

function blockLines(el: Element, indent: string): string[] {
  if (skipUi(el)) return [];
  switch (el.tagName) {
    case "HR":
      return [];
    case "UL":
    case "OL":
      return Array.from(el.children).flatMap((li) => (li.tagName === "LI" ? itemLines(li, indent) : []));
    case "TABLE":
      return tableTsv(el as HTMLTableElement).split("\n").map((l) => indent + l);
    case "PRE":
      return (el.textContent ?? "").replace(/\n$/, "").split("\n").map((l) => indent + l);
    case "P":
    case "H1":
    case "H2":
    case "H3":
    case "H4":
    case "H5":
    case "H6":
      return inlineText(el, "\n").split("\n").map((l) => indent + l);
    default:
      return childLines(el, indent, true);
  }
}
/** 묶음(답 전체·인용·표 감싸개·목록 항목) 안 — 블록끼리는 빈 줄(gap), 블록 사이 글 조각은 한 덩이 */
function childLines(el: Element, indent: string, gap: boolean): string[] {
  const groups: string[][] = [];
  let run = "";
  const flush = () => {
    if (run.trim()) groups.push(run.replace(/^\n+|\n+$/g, "").split("\n").map((l) => indent + l));
    run = "";
  };
  el.childNodes.forEach((c) => {
    if (isBlock(c)) {
      flush();
      const ls = blockLines(c as Element, indent);
      if (ls.length) groups.push(ls);
    } else run += inlineText(c, "\n");
  });
  flush();
  return groups.flatMap((g, i) => (gap && i > 0 ? ["", ...g] : g));
}
/** 목록 항목 — 글쓴이가 쓴 표지(6. · - · *) 그대로, 안쪽 목록은 두 칸 들여 씀 */
function itemLines(li: Element, indent: string): string[] {
  const marker = li.getAttribute("data-marker") ?? (li.parentElement?.tagName === "OL" ? `${(li as HTMLLIElement).value}.` : "-");
  const inner = childLines(li, indent + "  ", false);
  if (!inner.length) return [indent + marker];
  return [`${indent}${marker} ${inner[0].slice(indent.length + 2)}`, ...inner.slice(1)];
}

/**
 * 답변 복사(서식 없는 글) — 그려진 답(.md)에서 마크다운 기호(# · ** · | · 링크 주소 · 백틱 등)를 뺀 글.
 * 글자와 순서는 그대로, 링크는 글자만, 목록은 글쓴이가 쓴 표지 그대로, 표는 탭 구분, <br> 은 줄바꿈.
 */
export function mdPlainText(root: Element): string {
  return childLines(root, "", true).join("\n");
}

// ── 그리기 ──
interface MdCtxValue {
  byRef: Map<string, T3qRef>;
  activeRef: string | null;
  onRef: (r: T3qRef) => void;
  text: string;
}
const MdCtx = createContext<MdCtxValue | null>(null);

const refTitle = (r: T3qRef) => [r.display_name, r.entity_type ? ENTITY_LABEL[r.entity_type] : null].filter(Boolean).join(" · ") || undefined;

function MdLink({ href, children }: ComponentProps<"a"> & ExtraProps) {
  const c = useContext(MdCtx);
  const m = href?.match(/^#ref:(r\d+)$/);
  if (m) {
    const r = c?.byRef.get(m[1]);
    if (!r) return <>{children}</>;
    const on = c?.activeRef === r.ref;
    return (
      <button type="button" className={`ref-link${on ? " on" : ""}`} data-ref={r.ref} aria-pressed={on} title={refTitle(r)} onClick={() => c?.onRef(r)}>
        {children}
      </button>
    );
  }
  if (href && /^https?:\/\//i.test(href)) return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
  return <>{children}</>;
}

function MdImg({ alt }: ComponentProps<"img"> & ExtraProps) {
  return <>{alt}</>;
}

function MdLi({ node, children, ...rest }: ComponentProps<"li"> & ExtraProps) {
  // 원문에서 이 항목의 표지를 읽어 그대로 쓴다 — 번호면 그 번호(value), 표지는 복사용(data-marker)
  const text = useContext(MdCtx)?.text ?? "";
  const off = node?.position?.start.offset;
  const m = typeof off === "number" ? text.slice(off, off + 14).match(/^\s*(\d{1,9}[.)]|[-*+])(?=\s|$)/) : null;
  const marker = m?.[1];
  const num = marker && /^\d/.test(marker) ? Number(marker.slice(0, -1)) : undefined;
  return (
    <li {...rest} value={num} data-marker={marker}>
      {children}
    </li>
  );
}

function MdTable({ node, children }: ComponentProps<"table"> & ExtraProps) {
  const no = Number(node?.properties?.dataTableNo) || 0;
  const bodyRows = Number(node?.properties?.dataBodyRows) || 0;
  const boxRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ wide: false, more: false, moved: false });
  const [note, setNote] = useState("");

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => {
      const wide = el.scrollWidth > el.clientWidth + 1;
      const more = wide && el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      const moved = el.scrollLeft > 0;
      setEdge((p) => (p.wide === wide && p.more === more && p.moved === moved ? p : { wide, more, moved }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    ro?.observe(el);
    if (tableRef.current) ro?.observe(tableRef.current);
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, []);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(""), 2000);
    return () => clearTimeout(t);
  }, [note]);

  const copy = () => {
    const t = tableRef.current;
    if (!t) return;
    if (!navigator.clipboard) return setNote("복사하지 못했습니다");
    navigator.clipboard.writeText(tableTsv(t)).then(
      () => setNote("표를 복사했습니다"),
      () => setNote("복사하지 못했습니다"),
    );
  };
  const toEnd = () => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  const region = edge.wide ? { role: "region", "aria-label": `표 ${no} — 옆으로 스크롤`, tabIndex: 0 } : {};

  return (
    <div className="md-tbl">
      <div className="md-tbl-tools" data-ui="">
        <span className="xs muted" role="status">{note}</span>
        <button type="button" className="btn xs" onClick={copy}>표 복사</button>
        {bodyRows > 20 && <button type="button" className="lnk xs" onClick={toEnd}>표 끝으로</button>}
      </div>
      <div className={`md-tblbox${edge.more ? " more" : ""}`}>
        <div ref={boxRef} className={`md-table${edge.moved ? " moved" : ""}`} {...region}>
          <table ref={tableRef}>{children}</table>
        </div>
      </div>
      <div ref={endRef} data-ui="" />
    </div>
  );
}

const COMPONENTS: Components = { a: MdLink, img: MdImg, li: MdLi, table: MdTable };
const keepUrl = (u: string) => u;

export function AnswerMarkdown({ text, refs, onRef, activeRef }: { text: string; refs: T3qRef[]; onRef?: (ref: T3qRef) => void; activeRef?: string | null }) {
  // 누를 때 부를 함수는 최신 것으로(부모가 다시 그려져도 답 글을 다시 그리지 않게)
  const onRefNow = useRef(onRef);
  useEffect(() => {
    onRefNow.current = onRef;
  });
  const fire = useCallback((r: T3qRef) => onRefNow.current?.(r), []);
  const byRef = useMemo(() => new Map(refs.map((r) => [r.ref, r])), [refs]);
  const ctx = useMemo<MdCtxValue>(() => ({ byRef, activeRef: activeRef ?? null, onRef: fire, text }), [byRef, activeRef, fire, text]);
  const body = useMemo(
    () => (
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS as never}
        rehypePlugins={REHYPE_PLUGINS as never}
        remarkRehypeOptions={REMARK_REHYPE}
        components={COMPONENTS}
        skipHtml={false}
        disallowedElements={[]}
        urlTransform={keepUrl}
      >
        {text}
      </ReactMarkdown>
    ),
    [text],
  );
  return (
    <div className="md">
      <MdCtx.Provider value={ctx}>{body}</MdCtx.Provider>
    </div>
  );
}
