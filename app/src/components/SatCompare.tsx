"use client";
/** 위성영상 비교 뷰어 (FUN-UNE-602001~602004) — 발생 전/후 좌우 스와이프 + 수계 마스크 */
import { useRef, useState } from "react";

export default function SatCompare() {
  const [x, setX] = useState(50);
  const [mask, setMask] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const drag = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (r) setX(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };
  const src = (k: "before" | "after") => `/docs/sat/${mask ? "mask_" : ""}${k}.png`;
  return (
    <div style={{ marginTop: 12 }}>
      <div className="row" style={{ marginBottom: 8 }}>
        <span className="badge neutral">발생 전</span>
        <span className="sp" />
        <label className="chk xs"><input type="checkbox" checked={mask} onChange={() => setMask((v) => !v)} /> 수계 마스크(물 영역) 보기</label>
        <span className="sp" />
        <span className="badge danger">발생 후</span>
      </div>
      <div
        ref={box}
        style={{ position: "relative", width: "100%", aspectRatio: "1123 / 882", borderRadius: 8, overflow: "hidden", cursor: "ew-resize", background: "#111", userSelect: "none" }}
        onMouseMove={(e) => e.buttons === 1 && drag(e.clientX)}
        onMouseDown={(e) => drag(e.clientX)}
        onTouchMove={(e) => drag(e.touches[0].clientX)}
        role="slider"
        aria-label="발생 전후 비교 위치"
        aria-valuenow={Math.round(x)}
        tabIndex={0}
        onKeyDown={(e) => (e.key === "ArrowLeft" ? setX((v) => Math.max(0, v - 5)) : e.key === "ArrowRight" ? setX((v) => Math.min(100, v + 5)) : null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src("after")} alt="홍수 발생 후 위성영상" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: mask ? "none" : "contrast(1.15)" }} draggable={false} />
        <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${100 - x}% 0 0)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src("before")} alt="홍수 발생 전 위성영상" style={{ width: "100%", height: "100%", objectFit: "cover", filter: mask ? "none" : "contrast(1.15)" }} draggable={false} />
        </div>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `${x}%`, width: 3, background: "#fff", boxShadow: "0 0 6px rgba(0,0,0,.6)", transform: "translateX(-1.5px)" }}>
          <span style={{ position: "absolute", top: "50%", left: -14, width: 30, height: 30, borderRadius: "50%", background: "#fff", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 800, color: "#17223b", transform: "translateY(-50%)" }}>⇔</span>
        </div>
      </div>
      <p className="xs mute2" style={{ marginTop: 6 }}>※ 시연용 예시 영상(SAR, POC 산출물)으로 사건 위치와 무관합니다. 위성데이터 제공 시 사건별 영상으로 교체됩니다.</p>
    </div>
  );
}
