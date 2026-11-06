"use client";
import { docLabel, docRows } from "@/lib/docRefs";

/** 「근거」 줄 — 문서 이름 · 쪽, 누르면 원문 미리보기를 새 창으로(개발서버 DocRefs). 줄이 없으면 그리지 않는다 */
export default function DocRefs({ refs, text }: { refs: unknown; text: string | null | undefined }) {
  const rows = docRows(refs, text);
  if (!rows.length) return null;
  return (
    <section className="ans-docs" aria-label="근거 문서">
      <b className="ans-docs-h">근거</b>
      <ul className="ans-docs-list">
        {rows.map((r) => {
          const { label, tip } = docLabel(r);
          return (
            <li key={r.key}>
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

/** 새 창 표 — 문서 + 바깥 화살표 */
function DocIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 10v3.5H2.5V4H6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
