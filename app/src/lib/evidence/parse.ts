/**
 * 근거 쪽 글(쪽 본문 API 의 markdown·passage)을 허용한 것만 덩어리로 — 개발서버 features/search/lib/answerMarkdown.ts parseAnswer 이식(FUN-UFR-801002, 2026-11-23).
 * 개발서버는 근거 쪽 글을 답 글과 같은 파서로 읽고, 덩어리(제목·문단·목록·표) 단위로 그리기 규칙(lib/evidence/rules)을 건다.
 * 우리 답 글은 react-markdown 그대로 두고, 근거 쪽만 이 파서를 쓴다(그리기 규칙이 덩어리 꼴에 기대므로).
 * HTML 을 만들지 않는다 — 조각으로 쪼개 React 가 글자로 그린다. 읽지 못한 줄은 버리지 않고 문단으로 남긴다.
 */
import { hideDbNames } from "@/lib/answerText";

/** 글 한 줄 안의 조각 */
export interface Span {
  text: string;
  strong: boolean;
  /** 대상 링크 [이름](#ref:rN) 의 번호 — 근거 쪽에서는 글자로만 그린다 */
  ref?: string;
  /** http(s) 문서 링크 — 근거 쪽에서는 글자로만 그린다 */
  href?: string;
  /** 근거 표지 [라벨](#doc:dN) — 근거 쪽에서는 글자로만 */
  doc?: string;
  /** 줄바꿈 자리(<br>) — text 는 비어 있다 */
  br?: boolean;
  /** 기울임(「*글*」) */
  em?: boolean;
}

export type Align = "left" | "center" | "right";

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3 | 4; spans: Span[] }
  | { kind: "paragraph"; spans: Span[] }
  /** depths — 항목마다 들여쓰기 단계(앞 공백 두 칸 = 한 단계) */
  | { kind: "list"; ordered: boolean; start: number; items: Span[][]; depths: number[] }
  | { kind: "rule" }
  | { kind: "table"; head: Span[][]; rows: Span[][][]; align: (Align | null)[] };

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const TABLE_ROW = /\|/;
/** 표의 구분줄 — 이 줄이 있어야 표로 읽는다 */
const TABLE_DIVIDER = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
const ENTITY_LINK = /(\[?)\[((?:[^[\]]|\[[^[\]]*\])+)\]\(#ref:([A-Za-z0-9_-]+)\)(\]?)/g;
const DOC_LINK = /\[([^\]]+)\]\(<?(https?:\/\/[^)\s>]+)>?\)/g;
const DOC_REF_LINK = /\[([^\]]+)\]\(#doc:([A-Za-z0-9_-]+)\)/g;
const BR = /<br\s*\/?>/gi;
const ITALIC = /(?<![*\w])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![*\w])/g;

const plainName = (raw: string) => raw.replace(/\[([^[\]]*)\]/g, "$1").replace(/\s{2,}/g, " ").trim();

/** 한 줄 → 조각. 굵게 → 대상 링크 → 근거 표지 → 문서 링크 → 줄바꿈 → 기울임 순서 */
export function toSpans(line: string): Span[] {
  return bold(line).flatMap(links).flatMap(docRefs).flatMap(docs).flatMap(breaks).flatMap(italic);
}

function italic(span: Span): Span[] {
  if (span.br || span.ref !== undefined || span.doc !== undefined || span.href || !span.text.includes("*")) return [span];
  const out: Span[] = [];
  let at = 0;
  ITALIC.lastIndex = 0;
  for (let m = ITALIC.exec(span.text); m !== null; m = ITALIC.exec(span.text)) {
    if (m.index > at) out.push({ ...span, text: span.text.slice(at, m.index) });
    out.push({ ...span, text: m[1], em: true });
    at = m.index + m[0].length;
  }
  if (at === 0) return [span];
  if (at < span.text.length) out.push({ ...span, text: span.text.slice(at) });
  return out;
}

function splitBy(span: Span, re: RegExp, make: (m: RegExpExecArray) => Span[]): Span[] {
  const out: Span[] = [];
  let at = 0;
  re.lastIndex = 0;
  for (let m = re.exec(span.text); m !== null; m = re.exec(span.text)) {
    if (m.index > at) out.push({ text: span.text.slice(at, m.index), strong: span.strong });
    out.push(...make(m));
    at = m.index + m[0].length;
  }
  if (at === 0) return [span];
  if (at < span.text.length) out.push({ text: span.text.slice(at), strong: span.strong });
  return out;
}

function docRefs(span: Span): Span[] {
  if (span.ref !== undefined) return [span];
  return splitBy(span, DOC_REF_LINK, (m) => [{ text: m[1], strong: span.strong, doc: m[2] }]);
}

function docs(span: Span): Span[] {
  if (span.ref !== undefined || span.doc !== undefined) return [span];
  return splitBy(span, DOC_LINK, (m) => [{ text: m[1], strong: span.strong, href: m[2] }]);
}

function links(span: Span): Span[] {
  const out: Span[] = [];
  let at = 0;
  ENTITY_LINK.lastIndex = 0;
  for (let m = ENTITY_LINK.exec(span.text); m !== null; m = ENTITY_LINK.exec(span.text)) {
    const wrapped = m[1] === "[" && m[4] === "]";
    const lead = m[1] === "[" && !wrapped ? "[" : "";
    const tail = m[4] === "]" && !wrapped ? "]" : "";
    const before = span.text.slice(at, m.index) + lead;
    if (before.length > 0) out.push({ text: before, strong: span.strong });
    out.push({ text: plainName(m[2]), strong: span.strong, ref: m[3] });
    if (tail) out.push({ text: tail, strong: span.strong });
    at = m.index + m[0].length;
  }
  if (at === 0) return [span];
  if (at < span.text.length) out.push({ text: span.text.slice(at), strong: span.strong });
  return out;
}

function breaks(span: Span): Span[] {
  if (span.ref !== undefined || span.href !== undefined || span.doc !== undefined) return [span];
  const parts = span.text.split(BR);
  if (parts.length === 1) return [span];
  const out: Span[] = [];
  parts.forEach((text, i) => {
    if (i > 0) out.push({ text: "", strong: span.strong, br: true });
    if (text !== "") out.push({ text, strong: span.strong });
  });
  return out;
}

function bold(line: string): Span[] {
  const spans: Span[] = [];
  let rest = line;
  let guard = 0;
  while (rest.length > 0 && guard++ < 500) {
    const open = rest.indexOf("**");
    if (open < 0) break;
    const close = rest.indexOf("**", open + 2);
    if (close < 0) break;
    if (open > 0) spans.push({ text: rest.slice(0, open), strong: false });
    const inner = rest.slice(open + 2, close);
    if (inner.trim() === "") spans.push({ text: rest.slice(open, close + 2), strong: false });
    else spans.push({ text: inner, strong: true });
    rest = rest.slice(close + 2);
  }
  if (rest.length > 0) spans.push({ text: rest, strong: false });
  return spans.length > 0 ? spans : [{ text: line, strong: false }];
}

/** 표 한 줄 → 칸. 앞뒤 막대는 테두리, \| 는 글자 */
function cells(line: string): Span[][] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\" && line[i + 1] === "|") {
      cur += "|";
      i++;
      continue;
    }
    if (ch === "|") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  if (out.length > 0 && out[0].trim() === "") out.shift();
  if (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
  return out.map((c) => toSpans(c.trim()));
}

function alignments(divider: string, width: number): (Align | null)[] {
  const out: (Align | null)[] = divider
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((m) => m.trim())
    .map((m) => {
      const left = m.startsWith(":");
      const right = m.endsWith(":");
      return left && right ? "center" : right ? "right" : left ? "left" : null;
    });
  while (out.length < width) out.push(null);
  return out.slice(0, width);
}

/** 줄의 칸 수를 머리줄에 맞춘다 — 칸이 밀려 다른 열의 값으로 읽히지 않게 */
function fit(row: Span[][], width: number): Span[][] {
  const out = row.slice(0, width);
  while (out.length < width) out.push([{ text: "", strong: false }]);
  return out;
}

/** 쪽 글 → 덩어리 목록 */
export function parseBlocks(text: string): Block[] {
  const lines = hideDbNames(text).replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length === 0) return;
    blocks.push({ kind: "paragraph", spans: toSpans(para.join(" ")) });
    para = [];
  };
  let list: { ordered: boolean; start: number; items: Span[][]; depths: number[] } | null = null;
  const flushList = () => {
    if (list === null) return;
    blocks.push({ kind: "list", ...list });
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (line.trim() === "") {
      flushPara();
      flushList();
      continue;
    }
    // 표가 먼저 — 구분줄 「|---|」 은 가로선 규칙에도 걸린다
    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1])) {
      flushPara();
      flushList();
      const head = cells(line);
      const align = alignments(lines[i + 1], head.length);
      const rows: Span[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim() !== "" && TABLE_ROW.test(lines[i])) {
        rows.push(fit(cells(lines[i]), head.length));
        i++;
      }
      i--;
      blocks.push({ kind: "table", head, rows, align });
      continue;
    }
    if (RULE.test(line)) {
      flushPara();
      flushList();
      blocks.push({ kind: "rule" });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flushPara();
      flushList();
      blocks.push({ kind: "heading", level: Math.min(heading[1].length, 4) as 1 | 2 | 3 | 4, spans: toSpans(heading[2]) });
      continue;
    }
    const bullet = BULLET.exec(line);
    const ordered = ORDERED.exec(line);
    if (bullet || ordered) {
      flushPara();
      const isOrdered = ordered !== null;
      if (list === null || list.ordered !== isOrdered) {
        flushList();
        list = { ordered: isOrdered, start: isOrdered ? Number(ordered![1]) : 1, items: [], depths: [] };
      }
      list.items.push(toSpans(isOrdered ? ordered![2] : bullet![1]));
      list.depths.push(Math.floor((line.length - line.trimStart().length) / 2));
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return blocks;
}
