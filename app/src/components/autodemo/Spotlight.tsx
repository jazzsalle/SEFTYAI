"use client";
// 강조 박스 — 화면 좌표를 고정하지 않고 «요소»를 찾아 그 위치를 매번 잰다.
// 빔프로젝터 해상도가 달라도, 창 크기·스크롤·패널이 바뀌어도 박스가 요소를 따라간다.
import { useEffect, useState } from "react"
import { FOCUS, UI, type FocusName } from "./autoScript"

/** 이 영역 안에서만 테를 그린다 — 답 카드가 아래 질문 칸까지 덮지 않게(대화 칸 — SEFTYAI .ex-main .thread). */
const Clip: Partial<Record<FocusName, string>> = {
  answer: UI.scroll,
  "answer-summary": UI.scroll,
  question: UI.scroll,
}

/** 강조 이름 → 우리 화면 요소(개발서버 Selectors 를 SEFTYAI 화면으로 옮긴 것 — autoScript FOCUS) */
const Selectors: Record<FocusName, string> = FOCUS

interface Box {
  top: number
  left: number
  width: number
  height: number
}

const Pad = 6
/** 다시 재는 주기 — 부드럽게 구르는 중에도 따라가도록 짧게. */
const TickMs = 200

function measure(names: string[]): Box[] {
  const vw = window.innerWidth
  const vh = window.innerHeight
  return names.flatMap((n) => {
    // 이름이면 정해 둔 선택자, 아니면 진행기가 집어 둔 요소의 선택자 그대로.
    const el = document.querySelector(Selectors[n as FocusName] ?? n)
    if (!el) return []
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return []
    // 보이는 만큼만 테를 두른다 — 화면 밖, 그리고 대화 영역 밖(질문 칸)은 잘라 낸다.
    // 대본이 직접 짚은 요소도 대화 영역 안이면 그 영역으로 자른다(아래 질문 칸을 덮지 않게).
    const sel = Clip[n as FocusName] ?? (el.closest(UI.scroll) ? UI.scroll : undefined)
    const c = sel ? document.querySelector(sel)?.getBoundingClientRect() : undefined
    const top = Math.max(4, c ? c.top + 2 : 0, r.top - Pad)
    const left = Math.max(4, c ? c.left + 2 : 0, r.left - Pad)
    const bottom = Math.min(vh - 4, c ? c.bottom - 2 : vh, r.bottom + Pad)
    const right = Math.min(vw - 4, c ? c.right - 2 : vw, r.right + Pad)
    if (bottom <= top || right <= left) return []
    return [{ top, left, width: right - left, height: bottom - top }]
  })
}

export function Spotlight({ focus }: { focus: string[] | null }) {
  const [boxes, setBoxes] = useState<Box[]>([])

  useEffect(() => {
    if (focus === null || focus.length === 0) {
      setBoxes([])
      return
    }
    const update = () => setBoxes(measure(focus))
    update()
    const t = window.setInterval(update, TickMs)
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      window.clearInterval(t)
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [focus])

  if (boxes.length === 0) return null

  /*
   * 테두리 대신 «나머지를 어둡게» — 강조할 곳만 구멍을 뚫은 반투명 막을 덮는다(사용자 지시 2026-11-05:
   * 아웃라인은 촌스럽다). 구멍이 여럿이어도 서로를 어둡게 하지 않도록 SVG 마스크로 뚫는다.
   */
  return (
    <svg className="autodemo-dim" width="100%" height="100%" aria-hidden="true">
      <defs>
        <mask id="autodemo-hole">
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          {boxes.map((b, i) => (
            <rect key={i} className="autodemo-hole" x={b.left} y={b.top} width={b.width} height={b.height} rx="10" fill="black" />
          ))}
        </mask>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill="rgba(15, 23, 42, 0.22)" mask="url(#autodemo-hole)" />
    </svg>
  )
}
