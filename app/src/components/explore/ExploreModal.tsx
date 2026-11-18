"use client";
import "./exploreModal.css";
import { useEffect, useId, useRef } from "react";

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * 통합 탐색 창 틀 — 개발서버 shared/components/Modal 그대로(재난상황 조건 · AI 모드 창).
 * 덮개 검정 75% · 흰 상자 1px 테두리(그림자 없음) · ✕ 줄 24 · 제목 h2 24/36 · 하단 단추 오른쪽 정렬.
 * 덮개를 눌러도 닫히지 않는다(개발서버 Modal 에 덮개 닫기 없음). Esc 로 닫고, 초점은 창 안에서 돈다.
 * 열면 첫 입력칸(없으면 첫 단추)에 초점, 닫히면 원래 자리로.
 */
export default function ExploreModal({ title, className, layerClass, onClose, footer, children }: {
  title: string;
  /** 상자에 덧붙일 class(창마다 폭·높이) */
  className?: string;
  /** 덮개에 덧붙일 class */
  layerClass?: string;
  onClose: () => void;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const dlg = box.current;
    if (!dlg) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => [...dlg.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = dlg.querySelector<HTMLElement>("input:not(:disabled)") ?? focusable()[0] ?? dlg;
    first.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const edge = e.shiftKey ? items[0] : items[items.length - 1];
      if (document.activeElement === edge) {
        e.preventDefault();
        (e.shiftKey ? items[items.length - 1] : items[0]).focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return (
    <div className={layerClass ? `xm-layer ${layerClass}` : "xm-layer"}>
      <div ref={box} className={className ? `modal xm-box ${className}` : "modal xm-box"} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1}>
        <div className="xm-close-row">
          <button type="button" className="xm-close" aria-label="닫기" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="xm-content">
          <h2 className="xm-title" id={`${id}-title`}>{title}</h2>
          {children}
        </div>
        <div className="modal-f xm-footer">{footer}</div>
      </div>
    </div>
  );
}
