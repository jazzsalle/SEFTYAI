"use client";
import { Fragment, useMemo, type ReactNode } from "react";
import { parseBlocks, type Block, type Span } from "@/lib/evidence/parse";
import {
  blankHeadLines, dropBlankColumns, groupLoose, headOnlyLine, isBlankCell, isLonePair, markWords, singleColumnList, splitFences, splitShortLineRuns,
  stripPageFooter, toDescList, withHeadingRanks, type DescRow, type HeadingRank,
} from "@/lib/evidence/rules";
import { MASK_CHAR, MASK_LABEL, MASK_TIP, markMasks } from "@/lib/piiMask";
import { cleanT3qText } from "@/lib/t3qText";
import "../answer/answer.css";

/**
 * 근거 쪽의 글(markdown)과 인용 문단(passage) — 개발서버 features/evidence/components/PassageText 이식(FUN-UFR-801002, 2026-11-23).
 * 덩어리(소제목·문단·목록·표) 순서 그대로 그리고 모양만 정한다. 글자는 T3Q 가 준 그대로, HTML 을 만들지 않는다.
 *  · 표 — 인용 부분은 원문 한 줄마다 「항목 | 값」 세로 묶음, 쪽 전체는 가로 표(가로 스크롤 · 첫 열 고정 · 모든 칸 왼쪽 · 빈 칸 「-」)
 *  · 빈 열은 빼고, 머리 줄만 온 표는 한 줄 문단, 머리 줄이 빈 표는 줄마다 회색 묶음 상자, 열 하나뿐인 표는 목록
 *  · 「- 항목: 값」 목록은 설명 목록(한 줄뿐이면 목록 한 줄), 짧은 글줄 덩어리는 회색 묶음 상자, 제목은 쪽 안에서 상대 단계 셋
 *  · 맨 끝 원본 PDF 쪽 번호 줄은 뺀다. 코드 울타리(```)는 원문 그대로 회색 상자
 *  · 찾은 낱말은 굵게(<mark>), 가림 자리는 「가림」 표시
 */
export default function PassageText({ text, highlight, mode = "passage", strictMask = false }: {
  text: string;
  highlight?: string[] | null;
  mode?: "passage" | "page";
  /** T3Q 가 이 쪽에서 개인정보를 가렸다고 알렸다(masked > 0) — 목록 점·굵게를 뺀 별표를 모두 가림으로 */
  strictMask?: boolean;
}) {
  const parts = useMemo(
    () =>
      splitFences(stripPageFooter(cleanT3qText(text))).map((p) =>
        p.kind === "code" ? p : { kind: "md" as const, ...withHeadingRanks(parseBlocks(markMasks(splitShortLineRuns(p.text), strictMask))) },
      ),
    [text, strictMask],
  );
  return (
    <>
      {parts.map((part, i) =>
        part.kind === "code" ? (
          <pre key={i} className="edp-code">{part.text}</pre>
        ) : (
          groupLoose(part.blocks).map((item, j) =>
            item.kind === "block" ? (
              <BlockView key={`${i}-${j}`} block={item.block} highlight={highlight} mode={mode} rank={part.rankOf(item.block)} />
            ) : (
              <div key={`${i}-${j}`} className="edp-lines">
                {item.title && <p className="edp-lines-title"><Spans spans={item.title} highlight={highlight} /></p>}
                <div className="edp-lines-box">
                  {item.lines.map((line, k) => <p key={k}><Spans spans={line} highlight={highlight} /></p>)}
                </div>
              </div>
            ),
          )
        ),
      )}
    </>
  );
}

/** 쪽 글을 덩어리로(풀린 글줄 묶음 포함) — 쪽 전체 위 「원본 쪽 보기」 안내를 띄울지 가릴 때 */
export function looseBlocks(text: string, strictMask: boolean) {
  return groupLoose(withHeadingRanks(parseBlocks(markMasks(splitShortLineRuns(stripPageFooter(cleanT3qText(text))), strictMask))).blocks);
}

interface ListNode {
  spans: Span[];
  children: ListNode[];
}

function toTree(items: Span[][], depths: readonly number[]): ListNode[] {
  const root: ListNode[] = [];
  const stack: { depth: number; node: ListNode }[] = [];
  items.forEach((spans, i) => {
    const depth = depths[i] ?? 0;
    const node: ListNode = { spans, children: [] };
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    if (stack.length) stack[stack.length - 1].node.children.push(node);
    else root.push(node);
    stack.push({ depth, node });
  });
  return root;
}

/** 하위 단계 표지 — 1단계 •, 2단계 –, 3단계부터 · */
const NESTED = ["disc", "dash", "dot"] as const;

function TextList({ marker = "disc", items }: { marker?: "disc" | "dash" | "dot" | "num" | "none"; items: ReactNode[] }) {
  const Tag = marker === "num" ? "ol" : "ul";
  return (
    <Tag className={`edp-list edp-list--${marker}`}>
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </Tag>
  );
}

function BlockView({ block, highlight, mode, rank = 2 }: { block: Block; highlight?: string[] | null; mode: "passage" | "page"; rank?: HeadingRank }) {
  const span = (spans: Span[]) => <Spans spans={spans} highlight={highlight} />;
  if (block.kind === "rule") return null;

  if (block.kind === "table") {
    const table = { ...block, ...dropBlankColumns(block) };
    const line = headOnlyLine(table.head, table.rows);
    if (line) return <p>{span(line)}</p>;
    if (table.rows.length === 0) return null;
    const lines = blankHeadLines(table);
    if (lines) {
      if (lines.length === 0) return null;
      return (
        <div className="edp-lines">
          <div className="edp-lines-box">{lines.map((l, i) => <p key={i}>{span(l)}</p>)}</div>
        </div>
      );
    }
    const single = singleColumnList(table);
    if (single) {
      return (
        <div className="edp-lines">
          {single.title && <p className="edp-lines-title">{span(single.title)}</p>}
          <TextList items={single.items.map((item) => span(item))} />
        </div>
      );
    }
    return mode === "page" ? <WideTable head={table.head} rows={table.rows} highlight={highlight} /> : <RecordTables head={table.head} rows={table.rows} highlight={highlight} />;
  }

  if (block.kind === "list") {
    const desc = block.ordered ? null : toDescList(block.items, block.depths);
    if (desc && isLonePair(desc)) return <TextList items={[<><strong>{span(desc[0].label)}</strong> {span(desc[0].value)}</>]} />;
    if (desc) return <DescList rows={desc} highlight={highlight} />;
    // 원문 번호가 1 이 아니면 번호를 글자로 붙여 원문 번호를 지킨다
    if (block.ordered && block.start !== 1) return <TextList marker="none" items={block.items.map((item, j) => <>{block.start + j}. {span(item)}</>)} />;
    if (block.ordered) return <TextList marker="num" items={block.items.map((item) => span(item))} />;
    const nested = (nodes: ListNode[], level: number): ReactNode => (
      <TextList
        marker={NESTED[Math.min(level, NESTED.length - 1)]}
        items={nodes.map((n) => (
          <>
            {span(n.spans)}
            {n.children.length > 0 && <div className="edp-sublist">{nested(n.children, level + 1)}</div>}
          </>
        ))}
      />
    );
    const base = Math.min(...block.items.map((_, j) => block.depths[j] ?? 0));
    const list = nested(toTree(block.items, block.depths.map((d) => d - base)), 0);
    return base > 0 ? <div className="edp-sublist edp-sublist--indent">{list}</div> : list;
  }

  // 패널 제목이 h2 라 쪽 글 제목은 h3 · h4 · h5
  if (block.kind === "heading") {
    const Tag = rank === 0 ? "h3" : rank === 1 ? "h4" : "h5";
    return <Tag className={`edp-sub edp-sub--${rank}`}>{span(block.spans)}</Tag>;
  }
  return <p>{span(block.spans)}</p>;
}

/** 인용 부분 표 — 원문 한 줄 = 「항목 | 값」 세로 묶음 하나(칸은 하나도 빼지 않는다) */
function RecordTables({ head, rows, highlight }: { head: Span[][]; rows: Span[][][]; highlight?: string[] | null }) {
  return (
    <div className="edp-records">
      {rows.map((cells, r) => (
        <table key={r} className="edp-record">
          <tbody>
            {head.map((h, j) => (
              <tr key={j}>
                <th scope="row"><Spans spans={h} highlight={highlight} /></th>
                <td>{isBlankCell(cells[j]) ? "-" : <Spans spans={cells[j]} highlight={highlight} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

/** 쪽 전체 표 — 원문 표 그대로, 가로 스크롤 · 첫 열 고정 · 모든 칸 왼쪽 · 빈 칸 「-」 */
function WideTable({ head, rows, highlight }: { head: Span[][]; rows: Span[][][]; highlight?: string[] | null }) {
  return (
    <div className="edp-wide">
      <div className="edp-wide-scroll">
        <table className="edp-table" aria-label="근거 쪽 표">
          <thead>
            <tr>{head.map((h, j) => <th key={j} scope="col" className={j === 0 ? "edp-sticky" : undefined}><Spans spans={h} highlight={highlight} /></th>)}</tr>
          </thead>
          <tbody>
            {rows.map((cells, r) => (
              <tr key={r}>
                {head.map((_, j) => <td key={j} className={j === 0 ? "edp-sticky" : undefined}>{isBlankCell(cells[j]) ? "-" : <Spans spans={cells[j]} highlight={highlight} />}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 설명 목록 — 항목(작은 회색 · 폭 고정) + 값. 값 없이 하위 줄이 딸린 줄은 묶음 제목. 값이 빈 줄은 「-」 */
function DescList({ rows, highlight }: { rows: DescRow[]; highlight?: string[] | null }) {
  return (
    <div className="edp-dl">
      {rows.map((row, i) => {
        const parent = rows.slice(0, i).reverse().find((r) => r.depth < row.depth);
        const child = row.depth > 0 && parent?.kind === "pair";
        const indent = row.depth >= 2 || child ? " edp-dl-indent" : "";
        if (row.kind === "group") return <p key={i} className={`edp-dl-group${indent}`}><Spans spans={row.spans} highlight={highlight} /></p>;
        return (
          <dl key={i} className={`edp-dl-row${indent}`}>
            <dt><Spans spans={row.label} highlight={highlight} /></dt>
            <dd>{isBlankCell(row.value) ? "-" : <Spans spans={row.value} highlight={highlight} />}</dd>
          </dl>
        );
      })}
    </div>
  );
}

/** 글자에서 가림 표지를 「가림」 표시로 */
function Masked({ text }: { text: string }) {
  if (!text.includes(MASK_CHAR)) return <>{text}</>;
  return (
    <>
      {text.split(MASK_CHAR).map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="pii-mask" title={MASK_TIP}>{MASK_LABEL}</span>}
          {part}
        </Fragment>
      ))}
    </>
  );
}

/** 조각을 글자로 — 링크는 만들지 않는다(근거 문단 안의 링크는 열 곳을 모른다). 찾은 낱말은 <mark>, 가림 자리는 「가림」 */
function Spans({ spans, highlight }: { spans: Span[]; highlight?: string[] | null }) {
  return (
    <>
      {spans.map((s, i) => {
        if (s.br) return <br key={i} />;
        const pieces = markWords(s.text, highlight).map((p, j) =>
          p.hit ? <mark key={j} className="edp-hit"><Masked text={p.text} /></mark> : <Fragment key={j}><Masked text={p.text} /></Fragment>,
        );
        const inner = s.em ? <em>{pieces}</em> : pieces;
        return s.strong ? <strong key={i}>{inner}</strong> : <span key={i}>{inner}</span>;
      })}
    </>
  );
}
