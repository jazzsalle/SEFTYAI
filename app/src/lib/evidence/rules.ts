/**
 * 근거 쪽 글 그리기 규칙 — 개발서버 features/evidence/lib(descList · looseLines · tableCells · headingLevels · evidenceDocs) 이식(FUN-UFR-801002, 2026-11-23).
 * 글자는 T3Q 가 준 그대로이고 모양만 정한다 — 바꾸거나 지어내거나 빼지 않는다.
 */
import type { Block, Span } from "./parse";

const plain = (spans: Span[]) =>
  spans
    .map((s) => (s.br ? " " : s.text))
    .join("")
    .trim();

// ── 설명 목록(「- 항목: 값」) ──
export type DescRow = { kind: "group"; spans: Span[]; depth: number } | { kind: "pair"; label: Span[]; value: Span[]; depth: number };

const COLON = /[:：]/;

/** 조각들을 첫 쌍점에서 둘로 가른다(쌍점은 버린다). 쌍점이 없으면 null */
export function splitAtColon(spans: Span[]): { before: Span[]; after: Span[] } | null {
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    if (s.br || s.href || s.ref || s.doc !== undefined) continue;
    const m = COLON.exec(s.text);
    if (!m) continue;
    const head = s.text.slice(0, m.index);
    const tail = s.text.slice(m.index + 1);
    return { before: [...spans.slice(0, i), ...(head ? [{ ...s, text: head }] : [])], after: [...(tail ? [{ ...s, text: tail }] : []), ...spans.slice(i + 1)] };
  }
  return null;
}

function trimSpans(spans: Span[]): Span[] {
  const out = spans.map((s) => ({ ...s }));
  while (out.length && !out[0].br && out[0].text.trim() === "") out.shift();
  while (out.length && !out[out.length - 1].br && out[out.length - 1].text.trim() === "") out.pop();
  if (out.length) {
    out[0] = { ...out[0], text: out[0].text.trimStart() };
    const last = out.length - 1;
    out[last] = { ...out[last], text: out[last].text.trimEnd() };
  }
  return out;
}

/** 목록 항목 → 설명 목록 줄. 「항목: 값」도 묶음 제목도 아닌 줄이 하나라도 있으면 null(목록 그대로) */
export function toDescList(items: Span[][], depths: readonly number[] = []): DescRow[] | null {
  if (items.length === 0) return null;
  const rows: DescRow[] = [];
  for (let i = 0; i < items.length; i++) {
    const depth = depths[i] ?? 0;
    const hasChild = (depths[i + 1] ?? 0) > depth && i + 1 < items.length;
    const split = splitAtColon(items[i]);
    if (split) {
      const label = trimSpans(split.before);
      const value = trimSpans(split.after);
      if (plain(label) === "") return null;
      if (plain(value) === "" && hasChild) rows.push({ kind: "group", spans: label, depth });
      else rows.push({ kind: "pair", label, value, depth });
      continue;
    }
    if (hasChild && plain(items[i]) !== "") {
      rows.push({ kind: "group", spans: trimSpans(items[i]), depth });
      continue;
    }
    return null;
  }
  return rows;
}

/** 「항목: 값」 이 한 줄뿐 — 설명 목록 대신 목록 한 줄(항목만 굵게) */
export function isLonePair(rows: DescRow[]): rows is [Extract<DescRow, { kind: "pair" }>] {
  return rows.length === 1 && rows[0].kind === "pair";
}

// ── 표가 글줄로 풀려 온 덩어리(짧은 글줄 묶음 상자) ──
/** 짧은 글줄 — 이 글자 수 이하인 문단 */
export const SHORT_LINE = 30;
/** 이만큼 이어지면 한 덩어리로 묶는다 */
export const MIN_RUN = 3;
/** 이만큼 넘게 풀린 덩어리가 있으면 쪽 위에 「원본 쪽 보기」 안내 */
export const NOTICE_RUN = 6;

export type LooseItem = { kind: "block"; block: Block } | { kind: "lines"; title: Span[] | null; lines: Span[][] };

const isShort = (b: Block): b is Extract<Block, { kind: "paragraph" }> =>
  b.kind === "paragraph" && !b.spans.some((s) => s.br) && plain(b.spans).length > 0 && plain(b.spans).length <= SHORT_LINE;

/** 줄바꿈(br)으로 나뉜 문단이 짧은 줄 MIN_RUN 개 이상이면 그 줄들(splitShortLineRuns 가 만든 덩어리) */
function lineRun(b: Block): Span[][] | null {
  if (b.kind !== "paragraph" || !b.spans.some((s) => s.br)) return null;
  const lines: Span[][] = [[]];
  for (const s of b.spans) {
    if (s.br) lines.push([]);
    else lines[lines.length - 1].push(s);
  }
  const kept = lines.filter((l) => plain(l) !== "");
  return kept.length >= MIN_RUN && kept.every((l) => plain(l).length <= SHORT_LINE) ? kept : null;
}

/** 값 없는 한 항목짜리 목록(「- 조사팀」) — 뒤따르는 덩어리의 제목감 */
const loneLabel = (b: Block): Span[] | null => (b.kind === "list" && !b.ordered && b.items.length === 1 && !/[:：]/.test(plain(b.items[0])) ? b.items[0] : null);

const TITLE_WORDS = /^(범례|legend)$/i;
const HAS_DIGIT = /\d/;

/** 덩어리 첫 줄이 소제목인가 — 첫 줄에 숫자가 없고 아래 줄에 숫자가 있으면, 또는 첫 줄이 「범례」 면. 떼어도 둘 이상 남을 때만 */
export function leadTitle(lines: Span[][]): Span[] | null {
  if (lines.length < 3) return null;
  const first = plain(lines[0]);
  const rest = lines.slice(1).map(plain);
  if (TITLE_WORDS.test(first) || (!HAS_DIGIT.test(first) && rest.some((l) => HAS_DIGIT.test(l)))) return lines[0];
  return null;
}

function linesItem(title: Span[] | null, lines: Span[][]): LooseItem {
  if (title) return { kind: "lines", title, lines };
  const lead = leadTitle(lines);
  return lead ? { kind: "lines", title: lead, lines: lines.slice(1) } : { kind: "lines", title: null, lines };
}

/** 덩어리를 차례대로 보되, 짧은 문단이 MIN_RUN 개 이상 이어진 곳은 한 묶음으로 */
export function groupLoose(blocks: Block[]): LooseItem[] {
  const out: LooseItem[] = [];
  for (let i = 0; i < blocks.length; ) {
    const own = lineRun(blocks[i]);
    if (own) {
      const prev = out[out.length - 1];
      const title = prev && prev.kind === "block" ? loneLabel(prev.block) : null;
      if (title) out.pop();
      out.push(linesItem(title, own));
      i++;
      continue;
    }
    let j = i;
    while (j < blocks.length && isShort(blocks[j])) j++;
    if (j - i >= MIN_RUN) {
      const lines = blocks.slice(i, j).map((b) => (b.kind === "paragraph" ? b.spans : []));
      const prev = out[out.length - 1];
      const title = prev && prev.kind === "block" ? loneLabel(prev.block) : null;
      if (title) out.pop();
      out.push(linesItem(title, lines));
      i = j;
      continue;
    }
    out.push({ kind: "block", block: blocks[i] });
    i++;
  }
  return out;
}

/** 많이 풀린 덩어리(NOTICE_RUN 줄 이상)가 있나 */
export function hasLooseRun(items: LooseItem[]): boolean {
  return items.some((it) => it.kind === "lines" && it.lines.length >= NOTICE_RUN);
}

/** 마크다운 꾸밈이 없는 보통 글줄인가(목록 표지·표·제목·인용·구분선으로 시작하지 않음) */
const MARKED_LINE = /^\s*(?:[-*+•·]\s|\d+[.)]\s|\||#|>|(?:[-*_]\s*){3,}$)/;

/** 빈 줄 없이 줄만 바꿔 온 짧은 글줄(모두 SHORT_LINE 자 이하, MIN_RUN 줄 이상)을 <br> 로 이어 줄 구분을 지킨다. 글자는 그대로 */
export function splitShortLineRuns(text: string): string {
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= MIN_RUN && run.every((l) => l.trim().length <= SHORT_LINE)) out.push(run.map((l) => l.trim()).join("<br>"));
    else out.push(...run);
    run = [];
  };
  for (const line of text.split("\n")) {
    if (line.trim() !== "" && !MARKED_LINE.test(line)) {
      run.push(line);
      continue;
    }
    flush();
    out.push(line);
  }
  flush();
  return out.join("\n");
}

// ── 표 칸 판단 ──
/** 빈 칸 — 칸이 없거나 공백뿐 */
export const isBlankCell = (cell: readonly Span[] | undefined): boolean => !cell || cell.every((s) => !s.br && s.text.trim() === "");

export interface TableParts {
  head: Span[][];
  rows: Span[][][];
  align: Extract<Block, { kind: "table" }>["align"];
}

/** 머리 줄만 온 표(데이터 줄 0) → 칸 글을 띄어 쓴 한 줄. 아니면 null */
export function headOnlyLine(head: readonly Span[][], rows: readonly unknown[]): Span[] | null {
  if (rows.length > 0 || head.length === 0) return null;
  return head.flatMap((cell, j) => (j > 0 ? [{ text: " ", strong: false }, ...cell] : [...cell]));
}

/** 머리 칸과 모든 줄의 같은 칸이 다 빈 열을 뺀다 */
export function dropBlankColumns(t: TableParts): TableParts {
  const width = Math.max(t.head.length, ...t.rows.map((r) => r.length));
  const keep: number[] = [];
  for (let j = 0; j < width; j++) if (!isBlankCell(t.head[j]) || t.rows.some((r) => !isBlankCell(r[j]))) keep.push(j);
  if (keep.length === width) return t;
  return { head: keep.map((j) => t.head[j] ?? []), rows: t.rows.map((r) => keep.map((j) => r[j] ?? [])), align: keep.map((j) => t.align[j] ?? null) };
}

/** 머리 줄이 모두 빈 표(그림 설명) → 줄마다 한 줄(빈 칸은 건너뜀). 아니면 null */
export function blankHeadLines(t: TableParts): Span[][] | null {
  if (t.rows.length === 0 || !t.head.every((h) => isBlankCell(h))) return null;
  return t.rows
    .map((r) => r.filter((cell) => !isBlankCell(cell)).flatMap((cell, j) => (j > 0 ? [{ text: " ", strong: false }, ...cell] : [...cell])))
    .filter((line) => line.length > 0);
}

/** 열이 하나뿐인 표 → 목록(머리 칸 글은 목록 제목). 아니면 null */
export function singleColumnList(t: TableParts): { title: Span[] | null; items: Span[][] } | null {
  if (t.head.length !== 1 || t.rows.length === 0) return null;
  const items = t.rows.map((r) => r[0] ?? []).filter((cell) => !isBlankCell(cell));
  if (items.length === 0) return null;
  return { title: isBlankCell(t.head[0]) ? null : t.head[0], items };
}

// ── 제목 단계(KRDS 콘텐츠 계층 — 그 쪽 안에서 상대적으로 큰·중간·작은) ──
export type HeadingRank = 0 | 1 | 2;

const SYMBOL_KEY: Record<string, number> = { "□": 7, "■": 7, "○": 8, "●": 8, "◎": 8, "◦": 9 };
const SYMBOL_LINE = /^\s*([□■○●◎◦])\s+\S/;
export const SYMBOL_HEADING_MAX = 60;

/** 기호(□·○)로 시작하는 짧은 한 줄 문단이면 그 단계 */
export function symbolHeadingKey(b: Block): number | null {
  if (b.kind !== "paragraph" || b.spans.some((s) => s.br)) return null;
  const text = plain(b.spans);
  const m = SYMBOL_LINE.exec(text);
  return m && text.length <= SYMBOL_HEADING_MAX ? SYMBOL_KEY[m[1]] : null;
}

/** 기호 제목을 제목 덩어리로 바꾸고, 제목마다 크기를 정한다 */
export function withHeadingRanks(blocks: Block[]): { blocks: Block[]; rankOf: (b: Block) => HeadingRank } {
  const keyOf = new Map<Block, number>();
  const out = blocks.map((b) => {
    if (b.kind === "heading") {
      keyOf.set(b, b.level);
      return b;
    }
    const key = symbolHeadingKey(b);
    if (key === null || b.kind !== "paragraph") return b;
    const heading: Block = { kind: "heading", level: 4, spans: b.spans };
    keyOf.set(heading, key);
    return heading;
  });
  const levels = [...new Set(keyOf.values())].sort((x, y) => x - y);
  const rankOf = (b: Block): HeadingRank => {
    const key = keyOf.get(b);
    const at = key === undefined ? 2 : levels.indexOf(key);
    return (at < 0 ? 2 : Math.min(at, 2)) as HeadingRank;
  };
  return { blocks: out, rankOf };
}

// ── 강조 낱말 · 쪽 번호 줄 · 코드 울타리 ──
export interface MarkPiece {
  text: string;
  hit: boolean;
}

/** 글 안에서 강조 낱말을 찾아 조각으로 — 띄어쓰기 차이는 무시(「범천 2지구」 = 「범천2지구」), 칠한 글자는 원문 그대로 */
export function markWords(text: string, words: readonly string[] | null | undefined): MarkPiece[] {
  const needles = (words ?? [])
    .filter((w): w is string => typeof w === "string")
    .map((w) => w.replace(/\s+/g, ""))
    .filter((w) => w.length > 0);
  if (!text || needles.length === 0) return [{ text, hit: false }];
  let bare = "";
  const at: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i])) continue;
    bare += text[i];
    at.push(i);
  }
  const hit = new Array<boolean>(text.length).fill(false);
  for (const needle of needles) {
    for (let from = bare.indexOf(needle); from >= 0; from = bare.indexOf(needle, from + 1)) {
      for (let i = at[from]; i <= at[from + needle.length - 1]; i++) hit[i] = true;
    }
  }
  const out: MarkPiece[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = out[out.length - 1];
    if (last && last.hit === hit[i]) last.text += text[i];
    else out.push({ text: text[i], hit: hit[i] });
  }
  return out;
}

/** 쪽 글 맨 끝의 원본 PDF 쪽 번호 줄(「2 - 30」 · 「1 - 1275 1 - 1276」) 하나만 뺀다(디자이너 결정 11-23) */
const PAGE_FOOTER = /^\s*\d+\s*-\s*\d+(?:\s+\d+\s*-\s*\d+)*\s*$/;
export function stripPageFooter(text: string): string {
  const lines = text.replace(/\s+$/, "").split("\n");
  if (lines.length > 1 && PAGE_FOOTER.test(lines[lines.length - 1])) lines.pop();
  return lines.join("\n");
}

/** 글을 코드 울타리(```)와 나머지로 가른다. 닫는 울타리가 없으면 끝까지 코드 */
export function splitFences(text: string): ({ kind: "md"; text: string } | { kind: "code"; text: string })[] {
  const out: ({ kind: "md"; text: string } | { kind: "code"; text: string })[] = [];
  let md: string[] = [];
  let code: string[] | null = null;
  for (const line of text.split("\n")) {
    if (/^\s*```/.test(line)) {
      if (code === null) {
        if (md.length) out.push({ kind: "md", text: md.join("\n") });
        md = [];
        code = [];
      } else {
        out.push({ kind: "code", text: code.join("\n") });
        code = null;
      }
      continue;
    }
    if (code !== null) code.push(line);
    else md.push(line);
  }
  if (code !== null) out.push({ kind: "code", text: code.join("\n") });
  if (md.length) out.push({ kind: "md", text: md.join("\n") });
  return out;
}

/** T3Q 가 공개 등급을 비공개라 한 문서인가(access_rights 코드가 먼저, 없으면 disclosure 글). 모르면 거짓 */
export function isNonPublic(doc: { access_rights?: string | null; disclosure?: string | null } | null | undefined): boolean {
  if (!doc) return false;
  const code = typeof doc.access_rights === "string" ? doc.access_rights.trim().toUpperCase() : "";
  if (code) return code === "NON_PUBLIC";
  return (typeof doc.disclosure === "string" ? doc.disclosure.replace(/\s/g, "") : "") === "비공개";
}

/** T3Q 가 개인정보 때문에 이미지를 주지 않았다고 알리는 코드(쪽 이미지 PAGE_IMAGE_WITHHELD · 그림 FIGURE_WITHHELD) — 개발서버 imageWithheld(작업 중) */
export const WITHHELD_CODES = ["PAGE_IMAGE_WITHHELD", "FIGURE_WITHHELD"] as const;
export const isWithheldCode = (c: unknown): boolean => typeof c === "string" && (WITHHELD_CODES as readonly string[]).includes(c);
