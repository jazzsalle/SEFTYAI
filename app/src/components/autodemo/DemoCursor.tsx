"use client";
// 시연 중 마우스를 잘 보이게(사용자 지시 2026-11-05).
//
// - 가상 커서: 자동 시연이 «누르는» 자리로 큰 화살표가 미끄러져 가고, 누를 때 물결이 퍼진다.
//   좌표가 아니라 요소를 찾아 그 가운데로 가므로 해상도와 무관하다.
// - 실제 마우스: 발표자가 직접 움직이는 마우스 둘레에 노란 원을 그린다(빔프로젝터에서 잘 보이게).
import { useEffect, useState } from "react"

interface Pt {
  x: number
  y: number
}

/** 요소의 가운데(너무 큰 요소는 위쪽 1/3 지점). */
function centerOf(sel: string): Pt | null {
  const el = document.querySelector(sel)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return null
  const y = r.height > 240 ? r.top + Math.min(120, r.height / 3) : r.top + r.height / 2
  return { x: r.left + Math.min(r.width / 2, 260), y: Math.min(window.innerHeight - 20, Math.max(20, y)) }
}

export function DemoCursor({ target }: { target: { sel: string; click: number } | null }) {
  const [pt, setPt] = useState<Pt>(() => (typeof window === "undefined" ? { x: 0, y: 0 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 }))
  const [ripple, setRipple] = useState<{ at: Pt; key: number } | null>(null)
  const [mouse, setMouse] = useState<Pt | null>(null)

  // 가리킬 요소로 옮긴다. 요소가 움직이면(스크롤·패널) 따라간다.
  useEffect(() => {
    if (target === null) return
    const update = () => {
      const p = centerOf(target.sel)
      if (p) setPt(p)
    }
    update()
    const t = window.setInterval(update, 300)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 가리킬 요소가 바뀔 때만
  }, [target?.sel])

  // 누를 때마다 물결.
  useEffect(() => {
    if (target === null || target.click === 0) return
    const t = window.setTimeout(() => {
      const p = centerOf(target.sel)
      if (p) setRipple({ at: p, key: target.click })
    }, 650)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 누른 횟수가 바뀔 때만 물결
  }, [target?.click])

  // 실제 마우스 둘레의 노란 원.
  useEffect(() => {
    const on = (e: MouseEvent) => setMouse({ x: e.clientX, y: e.clientY })
    window.addEventListener("mousemove", on)
    return () => window.removeEventListener("mousemove", on)
  }, [])

  return (
    <>
      {mouse && <div className="demo-mouse-halo" style={{ left: mouse.x, top: mouse.y }} aria-hidden="true" />}
      {target && (
        <div className="demo-cursor" style={{ left: pt.x, top: pt.y }} aria-hidden="true">
          <svg width="36" height="36" viewBox="0 0 24 24">
            <path
              d="M4 2.5 L4 19.5 L8.6 15.2 L11.6 21.8 L14.6 20.4 L11.7 14 L18 14 Z"
              fill="#111"
              stroke="#fff"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
      {ripple && (
        <div
          key={ripple.key}
          className="demo-cursor-ripple"
          style={{ left: ripple.at.x, top: ripple.at.y }}
          aria-hidden="true"
        />
      )}
    </>
  )
}
