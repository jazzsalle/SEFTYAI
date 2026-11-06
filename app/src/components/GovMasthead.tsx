import "./masthead.css";

/**
 * 공식 누리집 띠(KRDS masthead) — 「이 누리집은 대한민국 공식 전자정부 누리집입니다.」
 * 개발서버 shared/components/GovHeader mastheadBar 그대로(R57 — R13 「위 띠 없앰」 대체). 개발서버처럼 들어오는 문(로그인 화면)에만 얹는다 —
 * 서비스 안쪽(통합 탐색·대화 이력 등)은 개발서버도 머리말을 한 줄로 접고 띠를 내린다(GovHeader compact, masthead 없음).
 */
export default function GovMasthead() {
  return (
    <div id="krds-masthead" className="gov-masthead">
      <div className="masthead-inner">
        <svg width="24" height="16" viewBox="0 0 24 16" aria-hidden="true" focusable="false" className="masthead-flag">
          <rect width="24" height="16" fill="#fff" stroke="#E0E2E4" strokeWidth="0.5" />
          <circle cx="12" cy="8" r="4" fill="#D0303C" />
          <path d="M12 4a4 4 0 0 1 0 8 2 2 0 0 0 0-4 2 2 0 0 1 0-4Z" fill="#134A9D" />
          <g stroke="#1E2124" strokeWidth="0.7">
            <path d="M3.6 3.6l2 2M4.6 2.6l2 2M19.4 12.4l-2-2M20.4 11.4l-2-2" />
          </g>
        </svg>
        <span className="masthead-text">이 누리집은 대한민국 공식 전자정부 누리집입니다.</span>
      </div>
    </div>
  );
}
