"use client";
import { useEffect, useState } from "react";

/** 글자 크기 (Figma 102004, UFR-008 접근성) — 작게·보통·크게·아주 크게. 브라우저에 기억 */
const SIZES = [{ k: "s", l: "작게", px: 14 }, { k: "m", l: "보통", px: 16 }, { k: "l", l: "크게", px: 18 }, { k: "xl", l: "아주 크게", px: 20 }];

export default function FontSize() {
  const [open, setOpen] = useState(false);
  const [k, setK] = useState("m");
  useEffect(() => {
    try {
      const v = localStorage.getItem("sa.font");
      if (v) setK(v);
    } catch {}
  }, []);
  useEffect(() => {
    const px = SIZES.find((x) => x.k === k)?.px ?? 16;
    document.documentElement.style.fontSize = `${px}px`;
    try { localStorage.setItem("sa.font", k); } catch {}
  }, [k]);
  return (
    <div className="dd">
      <button className="hbtn" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="글자 크기">가 글자 크기</button>
      {open && (
        <div className="dd-menu right" onMouseLeave={() => setOpen(false)} role="menu">
          {SIZES.map((x) => (
            <button key={x.k} role="menuitemradio" aria-checked={k === x.k} className={k === x.k ? "on" : ""} onClick={() => { setK(x.k); setOpen(false); }} style={{ fontSize: x.px }}>{x.l}</button>
          ))}
        </div>
      )}
    </div>
  );
}
