"use client";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { REMARK_PLUGINS, rehypeMask } from "../answer/Markdown";
import { kindTone } from "../answer/DocRefs";
import { docTitleOnly, type DocRow } from "@/lib/docRefs";
import { markMasks } from "@/lib/piiMask";
import "./evidence.css";

/**
 * 우측 패널 「근거 문서」 — 답이 근거로 든 문서의 그 쪽을 화면 안에서 본다(UFR-005-001-01 근거문서·인용위치·원문 확인).
 * 화면 설계: 디자인 캔버스 「근거 문서·문서 그림·개인정보 가림 화면 설계」(2026-11-20) ①②③.
 * T3Q 쪽 본문 API(설명서 6.10절)·문서 속 그림(v0.4.8)을 우리 서버가 대신 받아 준다(/api/agent/jobs/{id}/doc-refs/…).
 *  · 인용 부분(passage) → 쪽 전체(markdown) → 원본 쪽(이미지) → 그림 순서(T3Q 11/18 권장). 칠하는 낱말(highlight)은 띄어쓰기를 무시하고 맞춘다.
 *  · 개인정보는 T3Q 가 가려서 준다 — 가린 수(masked)를 보이고, 가린 쪽은 이미지·그림이 오지 않는다(글로만).
 *  · 그 쪽 하나만 열린다. 새 창·내려받기는 없다.
 */
interface PageResult {
  title?: string | null;
  document?: { title?: string | null; publisher?: string | null; edition?: string | null; provider?: string | null; source?: string | null; disclosure?: string | null } | null;
  page?: number | null;
  printed_page?: string | null;
  pages_total?: number | null;
  markdown?: string | null;
  passage?: string | null;
  highlight?: string[] | null;
  page_image?: string | null;
  page_image_withheld?: string | null;
  masked?: number | null;
}
type Load = { kind: "loading" } | { kind: "ok"; result: PageResult; warnings: string[] } | { kind: "error"; status: number; code: string | null };
type View = "passage" | "page" | "image" | "figure";

/** 못 여는 까닭 → 안내(설계서 「상태별 표시」) */
export function evidenceError(status: number, code: string | null): string {
  if (status === 410 || code === "DOC_CHANGED") return "근거 문서가 갱신되어 이 쪽을 더 열 수 없습니다. 같은 질문을 다시 하면 새 근거를 받습니다.";
  if (code === "DOC_REF_NOT_FOUND") return "대화가 삭제되어 근거 쪽을 더 열 수 없습니다.";
  if (status === 409) return "이 답은 근거 쪽을 다시 열 수 없습니다. 같은 질문을 다시 하면 근거를 받습니다.";
  return "근거 쪽을 불러오지 못했습니다. 잠시 후 다시 열어 주세요.";
}

/** 이미지가 오지 않는 까닭 → 안내 */
export function withheldText(reason: string | null | undefined): string {
  if (reason === "PII") return "이미지는 글자를 가릴 수 없어, 가린 개인정보가 있는 쪽은 글로만 확인할 수 있습니다.";
  return "이 쪽의 원본 이미지가 제공되지 않았습니다. 글로 확인해 주세요.";
}

export default function EvidencePane({ jobId, row, rows, view: wanted, onPick }: {
  jobId: string;
  row: DocRow;
  rows: DocRow[];
  /** 처음 볼 탭 — 「figure:f1」 이면 그 그림 */
  view?: string;
  /** 같은 답의 다른 근거로 */
  onPick: (row: DocRow) => void;
}) {
  const doc = row.doc!;
  const [st, setSt] = useState<Load>({ kind: "loading" });
  const [view, setView] = useState<View | null>(null);
  const [fig, setFig] = useState(0);
  const base = `/api/agent/jobs/${encodeURIComponent(jobId)}/doc-refs/${doc}`;

  useEffect(() => {
    let alive = true;
    setSt({ kind: "loading" });
    setView(null);
    const f = wanted?.startsWith("figure:") ? row.figures.findIndex((x) => x.figure === wanted.slice(7)) : -1;
    setFig(Math.max(0, f));
    fetch(base)
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { envelope?: { result?: PageResult; warnings?: { code?: string }[] }; code?: string | null } | null;
        if (!alive) return;
        if (!r.ok || !j?.envelope?.result) return setSt({ kind: "error", status: r.status, code: j?.code ?? null });
        setSt({ kind: "ok", result: j.envelope.result, warnings: (j.envelope.warnings ?? []).map((w) => w.code ?? "") });
      })
      .catch(() => alive && setSt({ kind: "error", status: 0, code: null }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, wanted]);

  const res = st.kind === "ok" ? st.result : null;
  const words = useMemo(() => (res?.highlight?.length ? res.highlight : row.highlight).filter((w) => typeof w === "string" && w.trim()), [res, row.highlight]);
  const hasPassage = !!res?.passage?.trim();
  const hasPage = !!res?.markdown?.trim();
  const figs = row.figures;
  // 처음 탭 — 고른 그림 → 인용 부분 → 쪽 전체 → 원본 쪽
  const first: View = wanted?.startsWith("figure:") && figs.length ? "figure" : hasPassage ? "passage" : hasPage ? "page" : "image";
  const tab = view ?? first;
  const idx = rows.filter((r) => r.doc).findIndex((r) => r.doc === doc);
  const docs = rows.filter((r) => r.doc);
  const d = res?.document;
  const masked = typeof res?.masked === "number" ? res.masked : 0;

  return (
    <div className="dpane evp fadein">
      <header className="evp-head">
        <span className="evp-crumb">{d?.source ?? row.source ?? "근거 문서"}</span>
        <h2 className="evp-title">{d?.title ?? docTitleOnly(row)}</h2>
        <div className="evp-badges">
          {d?.publisher && <span className="evp-badge">발행 {d.publisher}</span>}
          {d?.edition && <span className="evp-badge">{d.edition}</span>}
          {d?.provider && <span className="evp-badge">제공 {d.provider}</span>}
          {d?.disclosure && <span className={`evp-badge${d.disclosure === "공개" ? "" : " evp-badge--lock"}`}>공개 등급 {d.disclosure}</span>}
          {masked > 0 && <span className="evp-badge evp-badge--mask">가린 개인정보 {masked}곳</span>}
        </div>
      </header>

      {docs.length > 1 && (
        <nav className="evp-nav" aria-label="이 답의 근거 문서">
          {docs.map((r, i) => (
            <button key={r.doc} type="button" className={`evp-nav-b${r.doc === doc ? " on" : ""}`} aria-current={r.doc === doc ? "true" : undefined} title={r.title} onClick={() => onPick(r)}>
              {i + 1}
            </button>
          ))}
          <span className="evp-nav-t">근거 {idx + 1} / {docs.length}</span>
        </nav>
      )}

      {st.kind === "loading" && <div className="typing" role="status" aria-label="근거 쪽을 불러오는 중"><i /><i /><i /></div>}
      {st.kind === "error" && <div className="notice danger">{evidenceError(st.status, st.code)}</div>}

      {res && (
        <>
          <div className="evp-pageno">
            <span>PDF <b>{res.page ?? row.page ?? "—"}</b>쪽</span>
            <span className={res.printed_page ? "" : "mute"}>인쇄 쪽 {res.printed_page ? <b>{res.printed_page}</b> : "—"}</span>
            {res.pages_total ? <span>전체 <b>{res.pages_total}</b>쪽</span> : null}
            {words.length > 0 && <span className="evp-words">칠한 낱말 {words.map((w) => <mark key={w}>{w}</mark>)}</span>}
          </div>
          {st.kind === "ok" && st.warnings.includes("PAGE_NOT_SPECIFIED") && <p className="evp-note">쪽이 지정되지 않아 낱말이 처음 나오는 쪽을 보여 드립니다.</p>}

          <div className="evp-tabs" role="tablist" aria-label="근거 쪽 보기">
            {hasPassage && <Tab id="passage" on={tab} set={setView}>인용 부분</Tab>}
            {hasPage && <Tab id="page" on={tab} set={setView}>쪽 전체</Tab>}
            <Tab id="image" on={tab} set={setView} locked={!res.page_image}>원본 쪽</Tab>
            {figs.length > 0 && <Tab id="figure" on={tab} set={setView}>그림 <i>{figs.length}</i></Tab>}
          </div>

          {tab === "passage" && hasPassage && (
            <section className="evp-body" role="tabpanel">
              <DocMarkdown text={res.passage!} words={words} />
              <p className="evp-foot">답이 인용한 부분입니다. 표에서 인용되면 머리 줄과 해당 줄만 보입니다. 앞뒤 내용은 「쪽 전체」에서 확인합니다.</p>
            </section>
          )}
          {tab === "page" && hasPage && (
            <section className="evp-body evp-body--page" role="tabpanel">
              <DocMarkdown text={res.markdown!} words={words} />
            </section>
          )}
          {tab === "image" && (
            <section className="evp-body" role="tabpanel">
              {res.page_image ? (
                <Picture src={`${base}/image`} alt={`${d?.title ?? row.title} ${res.page ?? ""}쪽 원본 이미지`} />
              ) : (
                <div className="evp-withheld">
                  <LockIcon />
                  <div>
                    <b>원본 쪽 이미지는 제공되지 않습니다</b>
                    <span>{withheldText(res.page_image_withheld)}</span>
                  </div>
                </div>
              )}
              {res.page_image && <p className="evp-foot">원본 PDF 의 그 쪽을 이미지로 보여 줍니다. 이 쪽 하나만 열립니다.</p>}
            </section>
          )}
          {tab === "figure" && figs[fig] && (
            <section className="evp-body" role="tabpanel">
              <div className="evp-fig">
                <Picture src={`${base}/figures/${figs[fig].figure}`} alt={figs[fig].title ?? "문서 속 그림"} withheld="이 쪽에 가린 개인정보가 있어 그림이 제공되지 않습니다." />
                {figs[fig].kind && <span className={`fig-kind fig-kind--${kindTone(figs[fig].kind!)}`}>{figs[fig].kind}</span>}
              </div>
              <p className="evp-fig-cap">
                <b>{figs[fig].title ?? "그림"}</b>
                <span>문서에 적힌 그림 제목 그대로입니다. 그림은 원본 PDF 에서 따로 뽑은 것입니다.</span>
              </p>
              <div className="evp-fig-foot">
                <button type="button" className="btn secondary" onClick={() => setView(res.page_image ? "image" : hasPage ? "page" : "passage")}>
                  이 그림이 실린 쪽 보기{figs[fig].page ? ` (p.${figs[fig].page})` : ""}
                </button>
                <span className="sp" />
                {figs.length > 1 && (
                  <span className="evp-fig-pager">
                    <button type="button" className="btn" disabled={fig === 0} onClick={() => setFig(fig - 1)} aria-label="앞 그림">‹</button>
                    {fig + 1} / {figs.length}
                    <button type="button" className="btn" disabled={fig === figs.length - 1} onClick={() => setFig(fig + 1)} aria-label="다음 그림">›</button>
                  </span>
                )}
              </div>
            </section>
          )}
        </>
      )}

      <p className="evp-lock">
        <LockIcon />
        근거 쪽은 로그인한 사용자만 화면 안에서 봅니다. 새 창·내려받기는 없습니다.
      </p>
    </div>
  );
}

function Tab({ id, on, set, locked, children }: { id: View; on: View; set: (v: View) => void; locked?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={on === id} className={`evp-tab${on === id ? " on" : ""}${locked ? " is-locked" : ""}`} onClick={() => set(id)}>
      {locked && <LockIcon />}
      {children}
    </button>
  );
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M3 5.5V4a3 3 0 0 1 6 0v1.5M2.2 5.5h7.6v5H2.2z" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** 이미지 — 못 받으면(403 가림 · 404 없음) 그 까닭을 글로 */
function Picture({ src, alt, withheld }: { src: string; alt: string; withheld?: string }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  if (bad) return <div className="evp-withheld"><LockIcon /><div><b>이미지를 보여 드릴 수 없습니다</b><span>{withheld ?? "이 쪽의 이미지가 제공되지 않았습니다. 글로 확인해 주세요."}</span></div></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="evp-img" src={src} alt={alt} onError={() => setBad(true)} />;
}

// ── 쪽 글(마크다운) — 낱말 칠하기 + 가림 표시 ──
interface HNode { type: string; value?: string; tagName?: string; properties?: Record<string, unknown>; children?: HNode[] }

/** 낱말 → 띄어쓰기를 무시하는 정규식(「범천 2지구」 = 「범천2지구」) */
export function highlightRe(words: string[]): RegExp | null {
  const parts = words
    .map((w) => w.replace(/\s+/g, "").split("").map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"))
    .filter(Boolean);
  return parts.length ? new RegExp(`(${parts.join("|")})`, "g") : null;
}

function rehypeHighlight(words: string[]) {
  const re = highlightRe(words);
  const visit = (p: HNode) => {
    if (!p.children || p.tagName === "mark") return;
    const out: HNode[] = [];
    for (const c of p.children) {
      if (re && c.type === "text" && typeof c.value === "string" && c.value.search(re) >= 0) {
        c.value.split(re).forEach((part, i) => {
          if (!part) return;
          out.push(i % 2 ? { type: "element", tagName: "mark", properties: {}, children: [{ type: "text", value: part }] } : { type: "text", value: part });
        });
      } else {
        visit(c);
        out.push(c);
      }
    }
    p.children = out;
  };
  return () => (tree: HNode) => visit(tree);
}

function DocMarkdown({ text, words }: { text: string; words: string[] }) {
  const key = words.join("\u0001");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plugins = useMemo(() => [rehypeMask, rehypeHighlight(words)], [key]);
  return (
    <div className="md evp-md">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS as never} rehypePlugins={plugins as never} components={{ table: ({ children }) => <div className="md-table"><table>{children}</table></div>, a: ({ children }) => <>{children}</>, img: ({ alt }) => <>{alt}</> }}>
        {markMasks(text)}
      </ReactMarkdown>
    </div>
  );
}
