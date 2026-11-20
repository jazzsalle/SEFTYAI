"use client";
import { docLabel, docRows, docTitleOnly, type DocRow } from "@/lib/docRefs";

/**
 * 답 아래 「근거 문서」·「문서 속 그림」 — 화면 설계: 디자인 캔버스 「근거 문서·문서 그림·개인정보 가림 화면 설계」 ①·②(2026-11-20).
 *  · 근거 번호(doc)가 있는 줄 = 단추. 누르면 우측 「근거 문서」 패널에 그 쪽이 열린다(쪽 본문 API — 새 창·내려받기 없음).
 *  · 그 쪽에서 뽑은 그림(figures — T3Q v0.4.8)이 있으면 위에 그림 줄(작은 그림 + 종류 + 제목). 누르면 패널의 「그림」 탭.
 *  · 번호가 없는 옛 꼴(http 미리보기 주소)은 그대로 새 창 링크(개발서버 DocRefs). 줄이 없으면 아무것도 그리지 않는다.
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
  const rows = docRows(refs, text);
  if (!rows.length) return null;
  const inPanel = !!jobId && !!onOpen;
  const figs = inPanel ? rows.flatMap((r) => (r.doc ? r.figures.map((f) => ({ r, f })) : [])) : [];
  return (
    <>
      {figs.length > 0 && (
        <section className="ans-figs" aria-label="문서 속 그림">
          <p className="ans-figs-h">
            <b>문서 속 그림</b>
            <span>{figs.length}장 · 답이 근거로 든 쪽에서 뽑은 그림입니다</span>
          </p>
          <ul className="ans-figs-list">
            {figs.map(({ r, f }) => (
              <li key={`${r.doc}:${f.figure}`}>
                <button type="button" className={`ans-fig${activeDoc === r.doc ? " on" : ""}`} onClick={() => onOpen!(r, rows, `figure:${f.figure}`)} title={`${f.title ?? "그림"} 크게 보기`}>
                  <span className="ans-fig-img">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/agent/jobs/${jobId}/doc-refs/${r.doc}/figures/${f.figure}`} alt="" loading="lazy" />
                    {f.kind && <span className={`fig-kind fig-kind--${kindTone(f.kind)}`}>{f.kind}</span>}
                  </span>
                  <span className="ans-fig-t">
                    <b>{f.title ?? "그림"}</b>
                    <small>{[r.source, f.page ? `p.${f.page}` : r.page ? `p.${r.page}` : null].filter(Boolean).join(" · ")}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="ans-docs" aria-label="근거 문서">
        <p className="ans-docs-h">
          <b>근거 문서</b>
          <span>{rows.length}건{inPanel && rows.some((r) => r.doc) ? " · 줄을 누르면 오른쪽에 그 쪽이 열립니다" : ""}</span>
        </p>
        <ul className="ans-docs-list">
          {rows.map((r, i) => {
            const { label, tip } = docLabel(r);
            if (inPanel && r.doc) {
              const on = activeDoc === r.doc;
              return (
                <li key={r.key}>
                  <button type="button" className={`ans-docrow${on ? " on" : ""}`} aria-current={on ? "true" : undefined} onClick={() => onOpen!(r, rows)}>
                    <span className="ans-docrow-n">{i + 1}</span>
                    <span className="ans-docrow-t">
                      <b>{docTitleOnly(r)}{r.page && <em> p.{r.page}</em>}</b>
                      {r.source && <small>{r.source}</small>}
                    </span>
                    {r.figures.length > 0 && <span className="ans-docrow-fig">그림 {r.figures.length}</span>}
                    <span className="ans-docrow-go" aria-hidden="true">{on ? "보는 중" : "›"}</span>
                  </button>
                </li>
              );
            }
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
    </>
  );
}

/** 그림 종류 → 표지 색(지도 초록 · 차트 파랑 · 도식 보라 · 사진 노랑 · 그 밖 회색). 글자는 받은 그대로 */
export function kindTone(kind: string): string {
  if (kind.includes("지도")) return "map";
  if (kind.includes("차트")) return "chart";
  if (kind.includes("도식")) return "diagram";
  if (kind.includes("사진")) return "photo";
  return "etc";
}

/** 새 창 표 — 문서 + 바깥 화살표 */
function DocIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 10v3.5H2.5V4H6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
