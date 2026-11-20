"use client";
import { Fragment } from "react";
import { MASK_LABEL, MASK_TIP, countMasks, splitMasks } from "@/lib/piiMask";

/**
 * 보통 글(마크다운 아님 — 사건 타임라인의 재난문자·재해구호 서술 등) 속 `***` 를 「가림」 표시로.
 * 답 글(마크다운)은 Markdown.tsx rehypeMask 가 같은 모양으로 그린다.
 */
export function MaskedText({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  if (!text.includes("***")) return <>{text}</>;
  const parts = splitMasks(text);
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="pii-mask" title={MASK_TIP}>{MASK_LABEL}</span>}
          {part}
        </Fragment>
      ))}
    </>
  );
}

/**
 * 답 위 안내 — 「개인정보 N곳을 가리고 보여 드립니다」. 가린 곳이 없으면 그리지 않는다.
 * 화면 설계: 디자인 캔버스 「근거 문서·문서 그림·개인정보 가림 화면 설계」 ③(2026-11-20). 가리는 것은 T3Q(원천) — 우리는 그 사실만 알린다.
 */
export function PrivacyNote({ text }: { text: string | null | undefined }) {
  const n = countMasks(text);
  if (n === 0) return null;
  return (
    <aside className="pii-note" aria-label="개인정보 보호 안내">
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <path d="M9 1.5 15 4v4.6c0 3.6-2.4 6.4-6 7.9-3.6-1.5-6-4.3-6-7.9V4z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M6.4 9.2 8.2 11l3.4-3.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div>
        <b>개인정보 {n}곳을 가리고 보여 드립니다</b>
        <span>이름·생년월일·연락처·주택 번지 같은 개인정보는 가려져서 옵니다. 위험지구의 번지 같은 재난 위치 정보는 가리지 않습니다.</span>
      </div>
    </aside>
  );
}
