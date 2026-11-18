"use client";
// 자동 시연 시나리오 고르기(사용자 지시 2026-11-18) — [자동 시연]을 누르면 뜬다. 고르면 그 장면들로 시작한다.
import { useEffect } from "react"
import { DemoScenarios, type DemoScenarioId } from "./autoScript"

export function ScenarioPicker({ onPick, onClose }: { onPick: (id: DemoScenarioId) => void; onClose: () => void }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", on)
    return () => window.removeEventListener("keydown", on)
  }, [onClose])
  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-label="자동 시연 시나리오 선택">
      <div className="modal autodemo-pick" style={{ width: 520 }}>
        <div className="modal-h"><h2>자동 시연 시나리오 선택</h2></div>
        <div className="autodemo-pick-list">
          {DemoScenarios.map((s, i) => (
            <button key={s.id} type="button" className="autodemo-pick-item" autoFocus={i === 0} onClick={() => onPick(s.id)}>
              <span className="autodemo-pick-name">{s.name}<small>{s.minutes}</small></span>
              <span className="autodemo-pick-desc">{s.desc}</span>
            </button>
          ))}
        </div>
        <div className="modal-f"><span className="sp" /><button type="button" className="btn" onClick={onClose}>취소</button></div>
      </div>
    </div>
  )
}
