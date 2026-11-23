"use client";
import { useEffect, useMemo, useState } from "react";
import { docLabel, docRows, docTableRows, type DocFigure, type DocRow, type DocTableRow } from "@/lib/docRefs";
import { cleanT3qText } from "@/lib/t3qText";
import { useServerImage } from "../explore/useServerImage";
import "../explore/evidence.css";

/**
 * 답 아래 「근거」 표 · 「그림」 카드 줄 — 개발서버 features/evidence/components/EvidenceTable · FigureCards(FUN-UFR-801007, 디자이너 지시 11-23) 그대로 맞춤.
 *  · 근거 표: 같은 문서(document_id)의 쪽들은 한 줄, 칸은 문서 · 자료 묶음 · 쪽(쪽마다 단추). 누르면 우측 「근거 문서」 패널이 그 쪽으로 열린다.
 *    문서 이름이 비어 오면(근거 이름이 「p.32」 뿐) 쪽 본문의 문서명을 받는다. 빈 값은 「-」.
 *  · 그림 카드: 근거에 그림(figures)이 있을 때만. 한 줄 3장, 넘치면 「{N}건 더보기」, 펼친 뒤에는 「접기」.
 *    카드 = 그림 · 종류 표지(값 있을 때만) · 쪽(값 있을 때만) · 그림 제목 · 자료 묶음명. 누르면 패널의 그림 탭 · 그 그림.
 *  · 번호가 없는 옛 꼴(http 미리보기 주소)은 그대로 새 창 링크(개발서버 DocRefs 옛 모양).
 */
export default function DocRefs({ refs, text, jobId, activeDoc, onOpen }: {
  refs: unknown;
  text: string | null | undefined;
  jobId?: string;
  /** 지금 패널에 열려 있는 근거 번호 */
  activeDoc?: string | null;
  /** view = 「figure:f1」 이면 그 그림부터 */
  onOpen?: (row: DocRow, rows: DocRow[], view?: string) => void;
}) {
  const rows = useMemo(() => docRows(refs, text), [refs, text]);
  if (!rows.length) return null;
  if (jobId && onOpen && rows.some((r) => r.doc)) {
    return (
      <>
        <EvidenceTable rows={rows} jobId={jobId} current={activeDoc ?? null} onOpen={(r) => onOpen(r, rows)} />
        <FigureCards rows={rows} jobId={jobId} onOpen={(r, f) => onOpen(r, rows, `figure:${f}`)} />
      </>
    );
  }
  // 예전 꼴(미리보기 주소만 있는 근거)
  return (
    <section className="ans-docs" aria-label="근거 문서">
      <b className="ans-docs-h">근거</b>
      <ul className="ans-docs-list">
        {rows.map((r) => {
          const { label, tip } = docLabel(r);
          return (
            <li key={r.key} className="ans-docs-old">
              {r.url ? (
                <a className="ans-doc" href={r.url} target="_blank" rel="noopener noreferrer" title={tip}>
                  <span className="ans-doc-t">{label}</span>
                  <DocIcon />
                </a>
              ) : (
                <span className="ans-doc ans-doc--off" title={tip || undefined}>
                  <span className="ans-doc-t">{label}</span>
                </span>
              )}
              {r.source && <span className="ans-doc-src">{r.source}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** 답 아래 「근거」 표 — 문서 · 자료 묶음 · 쪽(단추) */
function EvidenceTable({ rows, jobId, current, onOpen }: { rows: DocRow[]; jobId: string; current: string | null; onOpen: (row: DocRow) => void }) {
  const table = useMemo(() => docTableRows(rows), [rows]);
  const names = useDocNames(table, jobId);
  if (table.length === 0) return null;
  const nameOf = (r: DocTableRow) => r.name ?? names.get(r.key) ?? null;
  return (
    <section className="edp-refs" aria-label="근거 문서">
      <span className="edp-refs-title">근거</span>
      <div className="edp-refs-table">
        <table aria-label="근거 문서 목록">
          <thead>
            <tr>
              <th scope="col">문서</th>
              <th scope="col">자료 묶음</th>
              <th scope="col">쪽</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r) => (
              <tr key={r.key}>
                <td>{nameOf(r) ?? "-"}</td>
                <td>{r.source ?? "-"}</td>
                <td>
                  <span className="edp-pages">
                    {r.pages.map((p) => {
                      const on = current !== null && p.docs.includes(current);
                      return (
                        <button key={p.docs[0]} type="button" className="edp-page" aria-current={on ? "true" : undefined} aria-label={`${nameOf(r) ?? ""} ${p.label} 근거문서 보기`.trim()} onClick={() => onOpen(p.row)}>
                          {p.label}
                        </button>
                      );
                    })}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** 이름이 비어 온 문서만 쪽 본문(설명서 6.10절)의 문서명을 받는다 */
function useDocNames(table: DocTableRow[], jobId: string) {
  const [names, setNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let alive = true;
    for (const r of table) {
      const doc = r.pages[0]?.row.doc;
      if (r.name || !doc) continue;
      fetch(`/api/agent/jobs/${encodeURIComponent(jobId)}/doc-refs/${doc}`)
        .then((x) => (x.ok ? x.json() : null))
        .then((j: { envelope?: { result?: { document?: { title?: unknown } } } } | null) => {
          const t = j?.envelope?.result?.document?.title;
          const title = typeof t === "string" ? cleanT3qText(t).trim() : "";
          if (alive && title) setNames((m) => new Map(m).set(r.key, title));
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [table, jobId]);
  return names;
}

/** 처음 보이는 장수 — 한 줄 3장 */
const FIRST_ROW = 3;

/** 근거 차례 그대로 그림을 모은다(같은 근거의 같은 그림은 한 번) */
export function figuresOf(rows: DocRow[]): { key: string; row: DocRow; figure: DocFigure }[] {
  const out: { key: string; row: DocRow; figure: DocFigure }[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.doc) continue;
    for (const f of r.figures) {
      const key = `${r.doc}:${f.figure}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, row: r, figure: f });
    }
  }
  return out;
}

function FigureCards({ rows, jobId, onOpen }: { rows: DocRow[]; jobId: string; onOpen: (row: DocRow, figure: string) => void }) {
  const items = figuresOf(rows);
  const [all, setAll] = useState(false);
  if (items.length === 0) return null;
  const shown = all ? items : items.slice(0, FIRST_ROW);
  const rest = items.length - shown.length;
  return (
    <section className="edp-figs" aria-label="근거 그림">
      <span className="edp-refs-title">그림</span>
      <div className="edp-figs-body">
        <ul className="edp-figs-list">
          {shown.map((it) => (
            <li key={it.key}>
              <FigureCard src={`/api/agent/jobs/${encodeURIComponent(jobId)}/doc-refs/${it.row.doc}/figures/${it.figure.figure}`} row={it.row} figure={it.figure} onOpen={() => onOpen(it.row, it.figure.figure)} />
            </li>
          ))}
        </ul>
        {rest > 0 && (
          <button type="button" className="edp-more" onClick={() => setAll(true)}>
            {rest}건 더보기 <Caret up={false} />
          </button>
        )}
        {/* 펼친 뒤에는 같은 자리에서 다시 첫 줄 3장으로 접는다 */}
        {all && items.length > FIRST_ROW && (
          <button type="button" className="edp-more" onClick={() => setAll(false)}>
            접기 <Caret up />
          </button>
        )}
      </div>
    </section>
  );
}

function FigureCard({ src, row, figure, onOpen }: { src: string; row: DocRow; figure: DocFigure; onOpen: () => void }) {
  const img = useServerImage(src);
  const page = figure.page;
  return (
    <button type="button" className="edp-fig" onClick={onOpen} aria-label={`${figure.title ?? "근거 그림"}${page ? ` p.${page}` : ""} 근거문서에서 보기`}>
      <span className="edp-fig-media">
        {img.state === "withheld" ? (
          <span className="edp-fig-none">개인정보 보호로 이 그림은 볼 수 없습니다.</span>
        ) : img.state === "error" ? (
          <span className="edp-fig-none">그림을 불러오지 못했습니다.</span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="edp-fig-img" src={src} alt="" loading="lazy" onLoad={img.onLoad} onError={img.onError} />
        )}
        {figure.kind && <span className="edp-figure-kind">{figure.kind}</span>}
      </span>
      <span className="edp-fig-body">
        {page && <span className="edp-fig-page">p.{page}</span>}
        <span className="edp-fig-title">{figure.title ?? "-"}</span>
        {row.source && <span className="edp-fig-src">{row.source}</span>}
      </span>
    </button>
  );
}

function Caret({ up }: { up: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d={up ? "m3 7.5 3-3 3 3" : "m3 4.5 3 3 3-3"} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 새 창 표 — 문서 + 바깥 화살표 */
function DocIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 10v3.5H2.5V4H6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
