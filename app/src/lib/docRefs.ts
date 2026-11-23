/**
 * 「근거」 줄 — 답이 기댄 문서(개발서버 search/components/DocRefs·lib/answerMarkdown docLinks, kjw 998facb 이식 2026-11-07).
 * T3Q v0.4.5(11/9 예정)의 result.doc_refs[] {title, page, highlight[], url, source} 를 줄로 만든다. 꼴은 개발서버 types DocRef 기준 —
 * 계약 문서(v0.4.5)는 SEFTYAI·개발서버 저장소 어디에도 아직 없다.
 * url = T3Q 미리보기 주소(그 문서만 7일 읽는 토큰) → 새 창으로 연다. http(s) 가 아닌 주소는 링크로 만들지 않는다.
 * doc_refs 가 비면 답 글 안의 문서 링크([문서 이름 p.32](<주소>))로 대신한다. 같은 문서·같은 쪽은 한 번만.
 */
import { cleanT3qText } from "./t3qText";

export interface DocRef {
  title?: string | null;
  page?: number | string | null;
  highlight?: string[] | null;
  url?: string | null;
  source?: string | null;
  /** 한 응답 안의 근거 번호(d1…) — 답 글의 `#doc:d1` 과 짝(T3Q v0.4.6) */
  doc?: string | null;
  /** 같은 문서면 같은 값(불투명 ID) */
  document_id?: string | null;
  /** 그 쪽에서 뽑은 그림(위치도·차트·사진 등 — T3Q v0.4.8) */
  figures?: { figure?: string | null; title?: string | null; kind?: string | null; page?: number | string | null }[] | null;
}

/** 문서 속 그림 한 장 — 제목(캡션)·종류(지도·차트·도식·사진·표그림)는 받은 그대로 */
export interface DocFigure {
  figure: string;
  title: string | null;
  kind: string | null;
  page: string | null;
}

export interface DocRow {
  key: string;
  title: string;
  page: string | null;
  url: string | null;
  source: string | null;
  highlight: string[];
  /** 근거 번호(d1…) — 있으면 화면 안 「근거 문서」 패널로 연다(쪽 본문 API). 없으면 옛 꼴(새 창 링크) */
  doc: string | null;
  documentId: string | null;
  figures: DocFigure[];
}

const DOC_ID = /^d[0-9]{1,4}$/;
const FIG_ID = /^f[0-9]{1,4}$/;
const str = (v: unknown): string | null => (typeof v === "string" && cleanT3qText(v).trim() ? cleanT3qText(v).trim() : typeof v === "number" ? String(v) : null);

/** 받은 figures[] 를 그림 목록으로 — 번호 꼴이 아닌 것은 뺀다(주소를 만들 때 쓰는 값이라) */
export function docFigures(raw: unknown): DocFigure[] {
  if (!Array.isArray(raw)) return [];
  const out: DocFigure[] = [];
  for (const f of raw as NonNullable<DocRef["figures"]>) {
    if (!f || typeof f !== "object" || typeof f.figure !== "string" || !FIG_ID.test(f.figure)) continue;
    out.push({ figure: f.figure, title: str(f.title), kind: str(f.kind), page: str(f.page) });
  }
  return out;
}

/** 답 글 안의 근거 표지 `[라벨](#doc:dN)` 의 번호들(나온 순서, 한 번씩) */
export function docMarks(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const m of (text ?? "").matchAll(/\]\(#doc:(d[0-9]{1,4})\)/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** 쪽 글을 뺀 문서 이름 — 「제2장 기초조사 p.32」 → 「제2장 기초조사」 */
export function docTitleOnly(r: Pick<DocRow, "title" | "page">): string {
  return r.page ? r.title.replace(new RegExp(`\\s*p\\.?\\s*${r.page}\\s*$`, "i"), "").trim() || r.title : r.title;
}

const safeUrl = (u: unknown): string | null => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : null);

/** 근거 문서 링크 — [문서 이름 p.32](<미리보기 주소>). 꺾쇠로 감싼 주소도 받는다 */
const DOC_LINK = /\[([^\]]+)\]\(<?(https?:\/\/[^)\s>]+)>?\)/g;

/** 답 글 안의 근거 문서 링크를 모두 뽑는다 */
export function docLinks(text: string): { label: string; url: string }[] {
  const out: { label: string; url: string }[] = [];
  DOC_LINK.lastIndex = 0;
  for (let m = DOC_LINK.exec(text); m !== null; m = DOC_LINK.exec(text)) out.push({ label: m[1], url: m[2] });
  return out;
}

/** doc_refs 를 줄로. 비었으면 답 글 안의 문서 링크로 */
export function docRows(refs: unknown, text: string | null | undefined): DocRow[] {
  const rows: DocRow[] = [];
  const seen = new Set<string>();
  const push = (r: DocRow) => {
    if (seen.has(r.key)) return;
    seen.add(r.key);
    rows.push(r);
  };
  for (const d of Array.isArray(refs) ? (refs as DocRef[]) : []) {
    if (!d || typeof d !== "object") continue;
    const title = typeof d.title === "string" ? cleanT3qText(d.title).trim() : "";
    if (!title) continue;
    const page = d.page === undefined || d.page === null || d.page === "" ? null : String(d.page);
    push({
      key: `${title}|${page ?? ""}`,
      title,
      page,
      url: safeUrl(d.url),
      source: typeof d.source === "string" && d.source.trim() ? d.source.trim() : null,
      highlight: Array.isArray(d.highlight) ? d.highlight.filter((h): h is string => typeof h === "string" && !!h.trim()) : [],
      doc: typeof d.doc === "string" && DOC_ID.test(d.doc) ? d.doc : null,
      documentId: str(d.document_id),
      figures: docFigures(d.figures),
    });
  }
  if (rows.length > 0) return rows;
  for (const l of docLinks(text ?? "")) {
    const m = /^(.*?)\s*p\.?\s*(\d+)\s*$/i.exec(l.label);
    const title = (m ? m[1] : l.label).trim();
    const page = m ? m[2] : null;
    push({ key: `${title}|${page ?? ""}`, title, page, url: l.url, source: null, highlight: [], doc: null, documentId: null, figures: [] });
  }
  return rows;
}

/** 답 아래 「근거」 표의 쪽 단추 하나 — 같은 쪽을 다른 번호(d1·d3)로 인용했으면 한 단추 */
export interface DocPageButton {
  /** 누르면 여는 근거 줄 */
  row: DocRow;
  /** 이 단추가 맡은 근거 번호 모두 — 「보는 중」 은 이 중 하나면 켠다 */
  docs: string[];
  /** 단추 글자 — 「p.39」. 쪽이 없으면 T3Q 근거 이름 */
  label: string;
  page: number | null;
}

/** 답 아래 「근거」 표 한 줄 — 같은 문서(document_id)의 쪽들 */
export interface DocTableRow {
  key: string;
  /** 문서 이름 — 근거 이름에서 끝의 「p.N」 을 뗀 것. 비면 null(쪽 본문의 문서명을 받는다) */
  name: string | null;
  source: string | null;
  pages: DocPageButton[];
}

const PAGE_SUFFIX = /\s*p\.?\s*\d+\s*$/i;

/**
 * 근거 줄 → 「근거」 표 줄(개발서버 EvidenceTable docRowsOf, 디자이너 지시 11-23).
 * 묶음은 T3Q 의 document_id 로만 가른다(이름이 같다고 같은 문서로 보지 않는다 — 판이 다른 같은 이름 계획서가 함께 온다).
 * 줄 차례는 답이 든 차례, 한 줄 안의 쪽은 쪽 번호 차례. 근거 번호(doc)가 없는 줄은 열 곳이 없어 뺀다.
 */
export function docTableRows(rows: DocRow[]): DocTableRow[] {
  const groups: { key: string; rows: DocRow[] }[] = [];
  const byId = new Map<string, { key: string; rows: DocRow[] }>();
  rows.forEach((r, i) => {
    if (!r.doc) return;
    const id = r.documentId;
    if (id) {
      const g = byId.get(id);
      if (g) return void g.rows.push(r);
      const ng = { key: `id:${id}`, rows: [r] };
      byId.set(id, ng);
      groups.push(ng);
      return;
    }
    groups.push({ key: `ref:${r.doc ?? i}`, rows: [r] });
  });
  return groups.map((g) => {
    const first = g.rows[0];
    const seen = new Map<string, DocPageButton>();
    const pages: DocPageButton[] = [];
    for (const r of g.rows) {
      const n = r.page !== null && r.page.trim() !== "" && Number.isFinite(Number(r.page)) ? Number(r.page) : null;
      const label = n !== null ? `p.${n}` : r.title || (r.doc as string);
      const same = seen.get(label);
      if (same) {
        same.docs.push(r.doc as string);
        continue;
      }
      const b = { row: r, docs: [r.doc as string], label, page: n };
      seen.set(label, b);
      pages.push(b);
    }
    pages.sort((a, b) => (a.page ?? Infinity) - (b.page ?? Infinity));
    return { key: g.key, name: first.title.replace(PAGE_SUFFIX, "").trim() || null, source: first.source, pages };
  });
}

/** 줄 이름 「문서 p.32」 와 풍선 도움말 「… 원문 보기 (새 창) — 출처 · 강조: …」 */
export function docLabel(r: DocRow): { label: string; tip: string } {
  // v0.4.6 부터 title 에 쪽이 이미 들어 온다(「제3.1장 기초조사 p.475」) — 두 번 적지 않는다
  const label = r.page && !new RegExp(`p\\.?\\s*${r.page}\\s*$`, "i").test(r.title) ? `${r.title} p.${r.page}` : r.title;
  const extra = [r.source, r.highlight.length ? `강조: ${r.highlight.join(", ")}` : null].filter(Boolean).join(" · ");
  return { label, tip: r.url ? `${label} 원문 보기 (새 창)${extra ? ` — ${extra}` : ""}` : extra };
}
