"use client";
import "./skipLink.css";

/** 본문 바로가기가 옮겨 갈 본문 요소의 id — 화면마다 본문에 id={MAIN_ID} tabIndex={-1} 을 단다 */
export const MAIN_ID = "main-content";

/**
 * [본문 바로가기] (FUN-UFR-908009 · 개발서버 GovHeader skip — R61).
 * 모든 화면 머리의 첫 초점 요소다. 평소에는 보이지 않다가 Tab 으로 닿으면 나타난다.
 * 해시 링크를 그대로 두면 주소가 바뀌므로 직접 본문으로 초점을 옮긴다. 본문이 없는 화면에서도 주소는 건드리지 않는다.
 */
export default function SkipLink() {
  return (
    <a
      className="skip-link"
      href={`#${MAIN_ID}`}
      onClick={(e) => {
        e.preventDefault();
        const main = document.getElementById(MAIN_ID);
        if (!main) return;
        main.focus();
        main.scrollIntoView({ block: "start" });
      }}
    >
      본문 바로가기
    </a>
  );
}
