"use client";
/**
 * 공통 창 틀 — 개발서버 shared/components/Modal(Modal.tsx · index.css .modal-layer/.modal/.modal-* · styles/renewal/modal.css) 그대로(2026-11-19 「개발서버와 동일하게」)
 *  · 덮개 검정 75% · 상자 1px #b1b8be · 모서리 12 · 그림자 없음 · 기본 폭 560, 확인 창(size="sm" = 개발서버 modal--confirm) 400
 *  · ✕ 는 흐름 안의 24px 줄 오른쪽 끝(onClose 를 줄 때만) · 제목 24/36 · 설명 17/26 · 바닥 단추 줄은 footer 를 줄 때만
 *  · 바깥(덮개)을 눌러도 닫지 않는다(개발서버 Modal). Esc 는 onClose 가 있으면 닫는다. 초점은 안에 가두고, 닫히면 원래 자리로
 *  · drawer — 오른쪽 서랍(개발서버 header.css .modal--help/.modal--alert): 너비 min(720px,100vw), 화면 높이, 옅은 덮개
 * 헤더 안에 붙여도(stacking context·transform) 화면 전체를 덮도록 document.body 에 그린다.
 */
import "./account.css";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
/** 화면에 보이는 초점 가능 요소 (hidden·display:none 제외) */
const focusables = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.getClientRects().length > 0);

/** 클라이언트에서만 document.body 로 포털 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(true), []);
  return on ? createPortal(children, document.body) : null;
}

export interface DialogProps {
  title: string;
  desc?: React.ReactNode;
  children?: React.ReactNode;
  /** 바닥 단추 줄 — 주지 않으면 줄 자체를 내지 않는다(개발서버 Modal footer) */
  footer?: React.ReactNode;
  /** 있으면 ✕ 버튼·Esc 로 닫는다. 없으면 닫을 수 없는 안내(접속 종료 등) */
  onClose?: () => void;
  /** @deprecated 개발서버 Modal 은 바깥 누름으로 닫지 않는다 — 넘겨도 아무 일도 하지 않는다 */
  closeOnBackdrop?: boolean;
  /** 있으면 본문·버튼을 form 으로 감싼다(Enter 제출) */
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  role?: "dialog" | "alertdialog";
  /** md = 560(기본) · sm = 확인 창 400(개발서버 modal--confirm) */
  size?: "md" | "sm";
  /** 오른쪽 서랍(도움말·기상특보 상세 — 개발서버 modal--help · modal--alert) */
  drawer?: boolean;
  /** 처리 중에는 Esc 로 닫지 않는다 */
  busy?: boolean;
  /** 열릴 때 먼저 초점을 둘 요소 (없으면 본문 첫 입력, 없으면 첫 단추) */
  initialFocus?: React.RefObject<HTMLElement | null>;
  /** 상자에 덧붙일 class(넓은 창 — 브리핑 설정 등) */
  className?: string;
}

export function Dialog({ title, desc, children, footer, onClose, onSubmit, role = "dialog", size = "md", drawer, busy, initialFocus, className }: DialogProps) {
  const [on, setOn] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const tid = useId();
  const did = useId();
  const closeRef = useRef(onClose);
  closeRef.current = busy ? undefined : onClose;
  useEffect(() => setOn(true), []);

  // 열릴 때 초점 이동(개발서버 Modal — 첫 입력 칸, 없으면 첫 단추), 닫히면 원래 자리로. 뒤 화면은 굴리지 않는다
  useEffect(() => {
    if (!on) return;
    const prev = document.activeElement as HTMLElement | null;
    const list = box.current ? focusables(box.current).filter((x) => !x.classList.contains("acm-x")) : [];
    const first = initialFocus?.current ?? list.find((x) => x.tagName === "INPUT") ?? list[0] ?? box.current;
    first?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      if (prev && prev.isConnected) prev.focus();
    };
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!on) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeRef.current?.();
      return;
    }
    if (e.key !== "Tab" || !box.current) return;
    const list = focusables(box.current);
    if (!list.length) return;
    const first = list[0], last = list[list.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === box.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const inner = (
    <>
      <div className="acm-body">
        <h2 id={tid} className="acm-title">{title}</h2>
        {desc && <div id={did} className="acm-desc">{desc}</div>}
        {children}
      </div>
      {footer !== undefined && footer !== null && <div className="acm-ft">{footer}</div>}
    </>
  );

  return createPortal(
    <div className={`acm-ovl${drawer ? " acm-ovl-drawer" : ""}`}>
      <div
        ref={box}
        className={`acm-dlg${size === "sm" ? " sm" : ""}${drawer ? " acm-drawer" : ""}${className ? ` ${className}` : ""}`}
        role={role}
        aria-modal="true"
        aria-labelledby={tid}
        aria-describedby={desc ? did : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        {/* ✕ 줄은 흐름 안에 둔다(개발서버 .modal-close-row — 24px 줄 오른쪽 끝) */}
        {onClose && (
          <div className="acm-close-row">
            <button type="button" className="acm-x" onClick={() => closeRef.current?.()} aria-label="닫기" disabled={busy}>
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
        {onSubmit ? <form className="acm-form" onSubmit={onSubmit} noValidate>{inner}</form> : inner}
      </div>
    </div>,
    document.body,
  );
}
