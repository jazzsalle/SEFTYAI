"use client";
/**
 * 계정·운영 모달 공통 틀 (KRDS modal) — body 로 포털, 초점 가두기·되돌리기, Esc 닫기
 * 헤더 안에 붙여도(stacking context·transform) 화면 전체를 덮도록 document.body 에 그린다.
 */
import "./account.css";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IcX } from "@/components/Icons";

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
  footer: React.ReactNode;
  /** 있으면 X 버튼·Esc 로 닫는다. 없으면 닫을 수 없는 안내(세션 만료 등) */
  onClose?: () => void;
  /** 바깥(딤)을 눌러 닫기 — 입력 폼에는 쓰지 않는다 */
  closeOnBackdrop?: boolean;
  /** 있으면 본문·버튼을 form 으로 감싼다(Enter 제출) */
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  role?: "dialog" | "alertdialog";
  size?: "md" | "sm";
  /** 처리 중에는 Esc·바깥 누름으로 닫지 않는다 */
  busy?: boolean;
  /** 열릴 때 먼저 초점을 둘 요소 (없으면 본문 첫 입력·버튼) */
  initialFocus?: React.RefObject<HTMLElement | null>;
}

export function Dialog({ title, desc, children, footer, onClose, closeOnBackdrop, onSubmit, role = "dialog", size = "md", busy, initialFocus }: DialogProps) {
  const [on, setOn] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const tid = useId();
  const did = useId();
  const closeRef = useRef(onClose);
  closeRef.current = busy ? undefined : onClose;
  useEffect(() => setOn(true), []);

  // 열릴 때 초점 이동, 닫히면 원래 자리로
  useEffect(() => {
    if (!on) return;
    const prev = document.activeElement as HTMLElement | null;
    const first = initialFocus?.current ?? (box.current ? focusables(box.current).find((x) => !x.classList.contains("acm-x")) : null) ?? box.current;
    first?.focus();
    return () => {
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
        <h2 id={tid}>{title}</h2>
        {desc && <div id={did} className="acm-desc">{desc}</div>}
        {children}
      </div>
      <div className="acm-ft">{footer}</div>
    </>
  );

  return createPortal(
    <div className="acm-ovl" onMouseDown={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) closeRef.current?.(); }}>
      <div
        ref={box}
        className={`acm-dlg ${size === "sm" ? "sm" : ""}`}
        role={role}
        aria-modal="true"
        aria-labelledby={tid}
        aria-describedby={desc ? did : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        {onSubmit ? <form onSubmit={onSubmit} noValidate>{inner}</form> : inner}
        {onClose && (
          <button type="button" className="acm-x" onClick={() => closeRef.current?.()} aria-label="닫기" disabled={busy}>
            <IcX size={22} />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
