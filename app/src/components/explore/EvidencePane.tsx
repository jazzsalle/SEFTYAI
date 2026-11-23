"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { docTitleOnly, type DocRow } from "@/lib/docRefs";
import { hasLooseRun, isNonPublic } from "@/lib/evidence/rules";
import { cleanT3qText } from "@/lib/t3qText";
import { copyPlain } from "@/lib/clipboard";
import PassageText, { looseBlocks } from "./PassageText";
import { useServerImage } from "./useServerImage";
import "./evidence.css";

/**
 * 우측 패널 「근거 문서」(SCR-UNE-208001) — 개발서버 features/evidence/components/EvidencePane(화면목록 V0.5 208001 · Figma [확정] 208000) 그대로 맞춤(2026-11-24).
 * 제목 줄(근거 이름 · ‹ i / n ›) → 근거 정보 상자(문서 · 공개 등급 · 발행/제공/자료 묶음 · 쪽) → 인용 부분 / 쪽 전체 / 원본 쪽 / 그림 탭 → 탭 내용.
 * 값은 T3Q 쪽 본문 API(설명서 6.10절)가 준 그대로 — 빈 값은 「-」. 쪽 본문·이미지·그림은 우리 서버가 대신 받는다(/api/agent/jobs/{id}/doc-refs/…).
 */
interface PageResult {
  title?: string | null;
  document?: { title?: string | null; publisher?: string | null; edition?: string | null; provider?: string | null; source?: string | null; disclosure?: string | null; access_rights?: string | null } | null;
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
type Load =
  | { kind: "loading" }
  | { kind: "ok"; result: PageResult; warnings: string[] }
  /** 410 DOC_CHANGED · 404 그 답에 없는 근거 · 403 제공기관 정책 · 409 쪽 본문 경로를 지을 수 없음(request_id 없음) */
  | { kind: "changed" | "not-found" | "forbidden" | "no-path" | "error" };
type View = "passage" | "page" | "image" | "figure";

/** 빈 값 — 화면목록 208001 「빈 값 「-」」 */
const DASH = "-";

/** 문구 — 개발서버 EvidencePane Msg(화면목록 208001 ▸ 문구 · Figma 주석) */
export const MSG = {
  changed: "근거 문서가 갱신되어 이 쪽을 열 수 없습니다. 질문을 다시 보내세요.",
  restricted: "제공기관 정책에 따라 이 문서는 인용 부분만 볼 수 있습니다.",
  notFound: "이 답변의 근거에서 해당 쪽을 찾을 수 없습니다.",
  error: "근거 쪽을 불러오지 못했습니다. 잠시 후 다시 열어 보세요.",
  noPath: "이 근거의 쪽 본문은 제공되지 않습니다.",
  noImage: "이 문서의 원본 쪽 이미지를 불러올 수 없습니다.",
  piiImage: "개인정보 보호를 위해 이 쪽의 원본 이미지는 보여 드리지 않습니다. 글은 개인정보를 가려서 보여 드립니다.",
  figureFailed: "그림을 불러오지 못했습니다.",
  piiFigure: "개인정보 보호로 이 그림은 볼 수 없습니다.",
  emptyBody: "해당 정보가 제공되지 않습니다.",
  loose: "원문 표나 그림 글자가 글줄로 풀려 왔습니다. 원본 쪽에서 원래 모양을 확인하세요.",
  pageNotSpecified: "답변이 쪽을 정하지 않아 강조 낱말이 처음 나오는 쪽을 보입니다.",
} as const;

/** 우리 서버 응답 → 상태(개발서버 evidenceApi.page 갈래와 같게) */
export function loadState(status: number, code: string | null): Exclude<Load, { kind: "loading" } | { kind: "ok" }>["kind"] {
  if (status === 410 || code === "DOC_CHANGED") return "changed";
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found";
  if (status === 409) return "no-path";
  return "error";
}

const text = (v: unknown): string | null => {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  const s = typeof v === "string" ? cleanT3qText(v).trim() : "";
  return s ? s : null;
};

export default function EvidencePane({ jobId, row, rows, view: wanted, onPick }: {
  jobId: string;
  row: DocRow;
  rows: DocRow[];
  /** 처음 볼 탭 — 「figure:f1」 이면 그 그림 */
  view?: string;
  /** 같은 답의 다른 근거로(‹ ›) */
  onPick: (row: DocRow) => void;
}) {
  const doc = row.doc!;
  const [st, setSt] = useState<Load>({ kind: "loading" });
  const base = `/api/agent/jobs/${encodeURIComponent(jobId)}/doc-refs/${doc}`;

  useEffect(() => {
    let alive = true;
    setSt({ kind: "loading" });
    fetch(base)
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { envelope?: { result?: PageResult; warnings?: { code?: string }[] }; code?: string | null } | null;
        if (!alive) return;
        if (!r.ok) return setSt({ kind: loadState(r.status, j?.code ?? null) });
        if (!j?.envelope?.result) return setSt({ kind: "error" });
        setSt({ kind: "ok", result: j.envelope.result, warnings: (j.envelope.warnings ?? []).map((w) => w.code ?? "") });
      })
      .catch(() => alive && setSt({ kind: "error" }));
    return () => {
      alive = false;
    };
  }, [base]);

  const docs = rows.filter((r) => r.doc);
  const at = Math.max(0, docs.findIndex((r) => r.doc === doc));
  const page = st.kind === "ok" ? st.result : null;

  return (
    <div className="dpane edp fadein">
      <div className="edp-head">
        <div className="edp-top">
          {/* 근거 제목 — T3Q 가 준 제목 그대로(「제2장 기초조사 p.32」) */}
          <h2 className="edp-title">{text(page?.title) ?? text(row.title) ?? DASH}</h2>
          {docs.length > 1 && <Pager label="근거" at={at} total={docs.length} onGo={(i) => docs[i] && onPick(docs[i])} />}
        </div>
        <InfoBox row={row} page={page} />
      </div>
      {/* 근거를 바꾸거나 그림 카드로 다시 열면 탭·이미지 상태를 처음부터 */}
      <PageView key={`${doc}#${wanted ?? ""}`} row={row} st={st} base={base} figure={wanted?.startsWith("figure:") ? wanted.slice(7) : null} />
    </div>
  );
}

/** ‹ i / n › — 근거 이동과 그림 넘기기가 같이 쓴다 */
function Pager({ label, at, total, onGo }: { label: string; at: number; total: number; onGo: (i: number) => void }) {
  return (
    <nav className="edp-nav" aria-label={`${label} 이동`}>
      <button type="button" className="edp-nav-b" aria-label={`이전 ${label}`} disabled={at === 0} onClick={() => onGo(at - 1)}>
        <Arrow dir="left" />
      </button>
      <span className="edp-count" aria-live="polite">
        <span className="edp-count-now">{at + 1}</span>
        <span aria-hidden="true"> / </span>
        <span className="sr-only">전체 </span>
        {total}
      </span>
      <button type="button" className="edp-nav-b" aria-label={`다음 ${label}`} disabled={at === total - 1} onClick={() => onGo(at + 1)}>
        <Arrow dir="right" />
      </button>
    </nav>
  );
}

/** 근거 정보 상자 — 문서(문서명 · 공개 등급 · 발행/제공/자료 묶음) · 쪽. 위치(절·항목)는 T3Q 가 줄 때만 — 쪽 본문에 아직 그 값이 없어 줄을 두지 않는다 */
function InfoBox({ row, page }: { row: DocRow; page: PageResult | null }) {
  const d = page?.document ?? null;
  const disclosure = text(d?.disclosure);
  const printed = text(page?.printed_page);
  const pdf = text(page?.page) ?? text(row.page);
  return (
    <dl className="edp-info">
      <div className="edp-info-row">
        <dt>문서</dt>
        <dd>
          <span className="edp-info-doc">
            <span>{text(d?.title) ?? (page ? DASH : docTitleOnly(row))}</span>
            {/* 공개 등급 — 받은 글자 그대로. T3Q 가 비공개라 한 것만 주의(노랑) 색 */}
            {disclosure && <span className={`edp-badge${isNonPublic(d) ? " edp-badge--warn" : ""}`}>{disclosure}</span>}
          </span>
          <span className="edp-info-sub">
            {text(d?.publisher) ?? DASH} 발행 · {text(d?.provider) ?? DASH} 제공 · {text(d?.source) ?? text(row.source) ?? DASH}
          </span>
        </dd>
      </div>
      <div className="edp-info-row">
        <dt>쪽</dt>
        <dd>
          {printed && `인쇄 ${printed}쪽 · `}PDF {pdf ?? DASH}쪽 · 전체 {text(page?.pages_total) ?? DASH}쪽
        </dd>
      </div>
    </dl>
  );
}

/**
 * 탭 — 인용 부분(있을 때) · 쪽 전체 · 원본 쪽 · 그림(그림이 있을 때).
 * 처음 탭: 그림 카드로 왔으면 그림, 아니면 인용 부분(없으면 쪽 전체) — 화면목록 208001.
 */
function PageView({ row, st, base, figure }: { row: DocRow; st: Load; base: string; figure: string | null }) {
  const page = st.kind === "ok" ? st.result : null;
  // T3Q 가 이 쪽에서 개인정보를 가렸다고 알려 준 때 — 별표를 모두 가림 표시로(개발서버 디자이너 지시 11-23)
  const masked = typeof page?.masked === "number" && page.masked > 0;
  const words = useMemo(() => (page?.highlight?.length ? page.highlight : row.highlight).filter((w): w is string => typeof w === "string" && w.trim() !== ""), [page, row.highlight]);
  const hasPassage = !!page && !!text(page.passage) && !(st.kind === "ok" && st.warnings.includes("PASSAGE_NOT_FOUND"));
  const figs = row.figures;
  const hasFigure = figs.length > 0;
  const [chosen, setTab] = useState<View | null>(figure && hasFigure ? "figure" : null);
  const fallback: View = hasPassage ? "passage" : "page";
  const tab: View = chosen === "passage" && !hasPassage ? "page" : chosen === "figure" && !hasFigure ? fallback : (chosen ?? fallback);

  if (st.kind === "loading") return <div className="typing" role="status" aria-label="근거 쪽을 불러오는 중"><i /><i /><i /></div>;
  // 열람 제한 — 탭 없이 안내만(화면목록 208001 · Figma 권한없음). 403 이면 쪽 본문이 오지 않아 보일 인용 부분이 없다
  if (st.kind === "forbidden") return <div className="notice info">{MSG.restricted}</div>;
  if (st.kind === "changed") return <div className="notice warn">{MSG.changed}</div>;
  if (st.kind === "not-found") return <div className="notice warn">{MSG.notFound}</div>;
  if (st.kind === "error") return <div className="notice danger">{MSG.error}</div>;
  if (st.kind === "no-path" || !page) return <p className="edp-note">{MSG.noPath}</p>;

  const firstFig = Math.max(0, figs.findIndex((f) => f.figure === figure));
  const items: { id: View; label: string; content: ReactNode }[] = [
    ...(hasPassage ? [{ id: "passage" as const, label: "인용 부분", content: <Body body={page.passage} words={words} mode="passage" masked={masked} /> }] : []),
    { id: "page", label: "쪽 전체", content: <PageWhole markdown={page.markdown} words={words} masked={masked} onShowImage={() => setTab("image")} /> },
    { id: "image", label: "원본 쪽", content: <PageImage page={page} src={`${base}/image`} /> },
    ...(hasFigure ? [{ id: "figure" as const, label: "그림", content: <FigureView row={row} base={base} start={firstFig} onShowPage={() => setTab("image")} /> }] : []),
  ];
  const now = items.find((i) => i.id === tab) ?? items[0];

  return (
    <>
      {st.kind === "ok" && st.warnings.includes("PAGE_NOT_SPECIFIED") &&<p className="edp-note">{MSG.pageNotSpecified}</p>}
      <div className="edp-tabs" role="tablist" aria-label="근거 쪽 보기">
        {items.map((i) => (
          <button key={i.id} type="button" role="tab" id={`edp-tab-${i.id}`} aria-selected={now.id === i.id} aria-controls="edp-panel" className={`edp-tab${now.id === i.id ? " on" : ""}`} onClick={() => setTab(i.id)}>
            {i.label}
          </button>
        ))}
      </div>
      <section className="edp-panel" id="edp-panel" role="tabpanel" aria-labelledby={`edp-tab-${now.id}`}>
        {now.content}
      </section>
    </>
  );
}

/**
 * 쪽 전체 탭 — (풀린 쪽 안내) → 오른쪽 [복사] 텍스트 단추 하나 → 쪽 글(개발서버 디자이너 결정 11-23).
 * 복사는 답변 복사(FUN-UFR-303006)와 같게 일반 텍스트 하나(화면 글 그대로, 가림은 「가림」). 결과는 화면낭독으로만 알린다.
 */
function PageWhole({ markdown, words, masked, onShowImage }: { markdown: string | null | undefined; words: string[]; masked: boolean; onShowImage: () => void }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const has = !!text(markdown);
  const loose = useMemo(() => (has ? hasLooseRun(looseBlocks(markdown ?? "", masked)) : false), [has, markdown, masked]);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (done === null) return;
    const t = setTimeout(() => setDone(null), 2000);
    return () => clearTimeout(t);
  }, [done]);
  const copy = async () => {
    const el = bodyRef.current;
    if (!el) return;
    const ok = await copyPlain(plainText(el));
    setDone(ok ? "복사했습니다" : "복사하지 못했습니다");
  };
  return (
    <div className="edp-whole">
      {loose && (
        <div className="notice info edp-loose">
          <span>{MSG.loose}</span>
          <button type="button" className="edp-textbtn" onClick={onShowImage}>
            원본 쪽 보기 <Arrow dir="right" />
          </button>
        </div>
      )}
      {has && (
        <div className="edp-copybar" role="toolbar" aria-label="쪽 내용 복사">
          <span className="sr-only" role="status">{done ?? ""}</span>
          <button type="button" className="edp-textbtn" aria-label="쪽 내용 복사" onClick={() => void copy()}>
            <CopyIcon /> 복사
          </button>
        </div>
      )}
      <div ref={bodyRef}>
        <Body body={markdown} words={words} mode="page" masked={masked} />
      </div>
    </div>
  );
}

/** 일반 텍스트 — 화면 글 그대로(목록 점은 글과 한 줄로) */
function plainText(el: HTMLElement): string {
  return (el.innerText ?? el.textContent ?? "").replace(/^([•–·])[ \t]*\n/gm, "$1 ").trim();
}

/** 글 — 인용 부분(표는 세로 묶음) · 쪽 전체(표는 가로 스크롤). 찾은 낱말은 굵게 */
function Body({ body, words, mode, masked }: { body: string | null | undefined; words: string[]; mode: "passage" | "page"; masked: boolean }) {
  return (
    <div className={`edp-body edp-body--${mode}`}>
      {text(body) ? <PassageText text={body ?? ""} highlight={words} mode={mode} strictMask={masked} /> : <p className="edp-note">{MSG.emptyBody}</p>}
    </div>
  );
}

/** 원본 PDF 그 쪽의 이미지 — 「원본 쪽」 탭을 열었을 때만 받는다 */
function PageImage({ page, src }: { page: PageResult; src: string }) {
  const path = text(page.page_image);
  const img = useServerImage(path ? src : null);
  if (!path) return <p className="edp-note">{text(page.page_image_withheld) === "PII" ? MSG.piiImage : MSG.noImage}</p>;
  if (img.state === "withheld") return <p className="edp-note">{MSG.piiImage}</p>;
  if (img.state === "error") return <p className="edp-note">{MSG.noImage}</p>;
  return (
    <div className="edp-image">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="edp-img" src={src} alt={`원본 PDF ${text(page.page) ?? ""}쪽 이미지`} onLoad={img.onLoad} onError={img.onError} />
    </div>
  );
}

/**
 * 그림 탭(FUN-UFR-801007) — T3Q 가 준 그림만. 한 장씩 크게, 여러 장이면 ‹ i / N ›.
 * 종류 표지는 값이 있을 때만 그림 왼쪽 위 · 그림 제목은 화면에 내지 않고 대체 텍스트로만(Figma) ·
 * 아래 줄 [크게 보기](새 창에 원래 크기) · [이 그림이 실린 쪽 보기(p.N)] → 원본 쪽 탭.
 */
function FigureView({ row, base, start, onShowPage }: { row: DocRow; base: string; start: number; onShowPage: () => void }) {
  const figs = row.figures;
  const [at, setAt] = useState(start);
  const fig = figs[at] ?? figs[0];
  const src = `${base}/figures/${fig.figure}`;
  const img = useServerImage(src);
  const title = text(fig.title);
  const kind = text(fig.kind);
  const page = text(fig.page);
  const frameRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const height = useFillHeight(frameRef, footRef);
  const openLarge = () => {
    if (img.state === "ok") window.open(src, "_blank", "noopener");
  };
  return (
    <div className="edp-figure">
      <div className="edp-figure-frame" ref={frameRef} style={height ? { height } : undefined}>
        {img.state === "withheld" ? (
          <p className="edp-note">{MSG.piiFigure}</p>
        ) : img.state === "error" ? (
          <p className="edp-note">{MSG.figureFailed}</p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src} className="edp-img edp-img--zoomable" src={src} alt={[kind, title].filter(Boolean).join(" · ") || "근거 그림"} onLoad={img.onLoad} onError={img.onError} onClick={openLarge} />
        )}
        {kind && <span className="edp-figure-kind">{kind}</span>}
      </div>
      <div className="edp-figure-foot" ref={footRef}>
        {img.state === "ok" && (
          <button type="button" className="edp-textbtn" aria-label="그림 크게 보기(새 창)" onClick={openLarge}>
            <SearchIcon /> 크게 보기
          </button>
        )}
        {page && (
          <button type="button" className="edp-textbtn" onClick={onShowPage}>
            이 그림이 실린 쪽 보기(p.{page}) <Arrow dir="right" />
          </button>
        )}
        {figs.length > 1 && <Pager label="그림" at={at} total={figs.length} onGo={setAt} />}
      </div>
    </div>
  );
}

/** 그림 칸 최소 높이 — Figma 그림의 300 */
const MIN_FIGURE_HEIGHT = 300;

/** 그림 칸이 지금 탭에 남은 높이 — 패널 본문(.rbody) 안에서 칸 위쪽부터 아래 줄을 뺀 만큼(최소 300) */
function useFillHeight(frameRef: RefObject<HTMLDivElement | null>, footRef: RefObject<HTMLDivElement | null>): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const box = frame.closest<HTMLElement>(".rbody");
    const measure = () => {
      const foot = footRef.current?.getBoundingClientRect().height ?? 0;
      const gap = parseFloat(getComputedStyle(frame.parentElement ?? frame).rowGap) || 0;
      let room: number;
      if (box) {
        const top = frame.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
        room = box.clientHeight - (parseFloat(getComputedStyle(box).paddingBottom) || 0) - top - foot - gap;
      } else {
        room = window.innerHeight - frame.getBoundingClientRect().top - foot - gap;
      }
      setHeight(Math.max(MIN_FIGURE_HEIGHT, Math.floor(room)));
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (box) observer?.observe(box);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [frameRef, footRef]);
  return height;
}

function Arrow({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={dir === "left" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M5.5 5.5h7v8h-7zM3.5 10.5v-8h7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
