/**
 * 「근거」 줄 — 답이 기댄 문서(개발서버 search/components/DocRefs·lib/answerMarkdown docLinks, kjw 998facb 이식 2026-11-07).
 * T3Q v0.4.5(11/9 예정)의 result.doc_refs[] {title, page, highlight[], url, source} 를 줄로 만든다. 꼴은 개발서버 types DocRef 기준 —
 * 계약 문서(v0.4.5)는 SEFTYAI·개발서버 저장소 어디에도 아직 없다.
 * url = T3Q 미리보기 주소(그 문서만 7일 읽는 토큰) → 새 창으로 연다. http(s) 가 아닌 주소는 링크로 만들지 않는다.
 * doc_refs 가 비면 답 글 안의 문서 링크([문서 이름 p.32](<주소>))로 대신한다. 같은 문서·같은 쪽은 한 번만.
 */

export interface DocRef {
  title?: string | null;
  page?: number | string | null;
  highlight?: string[] | null;
  url?: string | null;
  source?: string | null;
}

export interface DocRow {
  key: string;
  title: string;
  page: string | null;
  url: string | null;
  source: string | null;
  highlight: string[];
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
    const title = typeof d.title === "string" ? d.title.trim() : "";
    if (!title) continue;
    const page = d.page === undefined || d.page === null || d.page === "" ? null : String(d.page);
    push({
      key: `${title}|${page ?? ""}`,
      title,
      page,
      url: safeUrl(d.url),
      source: typeof d.source === "string" && d.source.trim() ? d.source.trim() : null,
      highlight: Array.isArray(d.highlight) ? d.highlight.filter((h): h is string => typeof h === "string" && !!h.trim()) : [],
    });
  }
  if (rows.length > 0) return rows;
  for (const l of docLinks(text ?? "")) {
    const m = /^(.*?)\s*p\.?\s*(\d+)\s*$/i.exec(l.label);
    const title = (m ? m[1] : l.label).trim();
    const page = m ? m[2] : null;
    push({ key: `${title}|${page ?? ""}`, title, page, url: l.url, source: null, highlight: [] });
  }
  return rows;
}

/** 줄 이름 「문서 p.32」 와 풍선 도움말 「… 원문 보기 (새 창) — 출처 · 강조: …」 */
export function docLabel(r: DocRow): { label: string; tip: string } {
  const label = r.page ? `${r.title} p.${r.page}` : r.title;
  const extra = [r.source, r.highlight.length ? `강조: ${r.highlight.join(", ")}` : null].filter(Boolean).join(" · ");
  return { label, tip: r.url ? `${label} 원문 보기 (새 창)${extra ? ` — ${extra}` : ""}` : extra };
}
