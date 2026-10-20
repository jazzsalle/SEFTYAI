"use client";
/** 연락망·상황전파 공통 — 창(화면 맨 위에 띄움), 삭제 확인, 번호 보기/가리기 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { IcEye, IcEyeOff, IcX } from "../Icons";

export function Modal({ title, sub, width, onClose, children, foot }: { title: string; sub?: React.ReactNode; width?: number; onClose: () => void; children: React.ReactNode; foot: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="ovl" onClick={onClose}>
      <div className="modal ct-modal" style={width ? { width: `min(${width}px, 100%)` } : undefined} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-hd">
          <div style={{ minWidth: 0 }}>
            <h2>{title}</h2>
            {sub && <div className="xs mute2" style={{ marginTop: 4 }}>{sub}</div>}
          </div>
          <span className="sp" />
          <button className="btn sm ghost" onClick={onClose} aria-label="닫기"><IcX size={16} /></button>
        </div>
        <div className="modal-bd">{children}</div>
        <div className="modal-ft">{foot}</div>
      </div>
    </div>,
    document.body,
  );
}

export type Confirm = { title: string; message: string; ok?: string; run: () => string | null } | null;

export function ConfirmDelete({ c, onClose }: { c: Confirm; onClose: () => void }) {
  if (!c) return null;
  return <ConfirmBody c={c} onClose={onClose} />;
}
function ConfirmBody({ c, onClose }: { c: NonNullable<Confirm>; onClose: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title={c.title} width={460} onClose={onClose}
      foot={<>{err && <span className="ct-err">{err}</span>}<span className="sp" /><button className="btn" onClick={onClose}>취소</button><button className="btn danger" onClick={() => { const e = c.run(); if (e) setErr(e); else onClose(); }}>{c.ok ?? "삭제"}</button></>}>
      <p style={{ fontSize: "var(--fs-s)", lineHeight: 1.6 }}>{c.message}</p>
    </Modal>
  );
}

export function ShowNumbers({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button className="btn sm" onClick={onToggle} aria-pressed={show}>
      {show ? <IcEyeOff size={14} /> : <IcEye size={14} />} {show ? "번호 가리기" : "번호 보기"}
    </button>
  );
}

