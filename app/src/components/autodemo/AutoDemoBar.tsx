"use client";
// 자동 시연 조작 막대 — 화면 아래 오른쪽. 장면 번호·자막·일시정지/다음/끝내기·음성 켜고 끄기.
import "./autodemo.css"
import { useEffect, useState, type ReactNode } from "react"
import { DemoCursor } from "./DemoCursor"
import { Spotlight } from "./Spotlight"
import { type AutoDemo, DemoSpeeds } from "./useAutoDemo"

/** 리허설 때 프로젝터 해상도를 맞추려고 지금 창 크기를 보인다. */
function useViewport() {
  // 서버에서 그릴 때는 창이 없다 — 처음 그린 뒤에 잰다
  const [size, setSize] = useState("")
  useEffect(() => {
    const on = () => setSize(`${window.innerWidth}×${window.innerHeight}`)
    on()
    window.addEventListener("resize", on)
    return () => window.removeEventListener("resize", on)
  }, [])
  return size
}

/** «Microsoft SunHi Online (Natural) - Korean (Korea)» → «SunHi (Natural)». */
function shortVoice(name: string): string {
  const n = name
    .replace(/^Microsoft\s+/, "")
    .replace(/\s*-\s*Korean.*$/i, "")
    .replace(/\s+Online/, "")
    .replace(/\s+Desktop/, "")
    .trim()
  return n || name
}

/** 패널 크기 — 펼침 · 접기(제목 한 줄) · 숨기기(작은 단추만). 사용자 요청 2026-11-04. */
type BarView = "open" | "fold" | "hide"
const ViewKey = "dsai.autodemo.bar"
function readView(): BarView {
  try {
    const v = localStorage.getItem(ViewKey)
    return v === "fold" || v === "hide" ? v : "open"
  } catch {
    return "open"
  }
}

/** children — 막대 아래에 덧붙일 것(우리: 운영자의 AI 모드 장면 받아 두기 — 개발서버는 운영 도구로 받음) */
export function AutoDemoBar({ demo, children }: { demo: AutoDemo; children?: ReactNode }) {
  const size = useViewport()
  const [view, setViewState] = useState<BarView>(readView)
  const setView = (v: BarView) => {
    setViewState(v)
    try {
      localStorage.setItem(ViewKey, v)
    } catch {
      /* 저장이 막힌 창 — 이번 화면에서만 기억한다 */
    }
  }
  if (demo.phase === "idle") return null

  const playing = demo.phase === "playing"
  const paused = demo.phase === "paused"
  const done = demo.phase === "done"
  const stepText = demo.phase === "loading" ? "준비 중" : done ? "끝" : `${demo.index}/${demo.total}`

  if (view === "hide") {
    return (
      <>
        <Spotlight focus={demo.focus} />
        <DemoCursor target={demo.cursor} />
        <button
          type="button"
          className="autodemo-pill"
          onClick={() => setView("open")}
          title="자동 시연 패널 펼치기"
          aria-label={`자동 시연 패널 펼치기 · ${stepText}`}
        >
          {paused ? "⏸" : "▶"} 자동 시연 <b>{stepText}</b>
        </button>
      </>
    )
  }

  return (
    <>
      <Spotlight focus={demo.focus} />
      <DemoCursor target={demo.cursor} />
      <div className={view === "fold" ? "autodemo-bar is-fold" : "autodemo-bar"} role="region" aria-label="자동 시연">
        <div className="autodemo-head">
          <span className="autodemo-step">{stepText}</span>
          <b className="autodemo-title">{done ? "자동 시연" : demo.title}</b>
          {view === "open" && (
            <span className="autodemo-size" title="지금 창 크기 — 프로젝터 해상도와 맞춰 리허설하세요.">
              {size}
            </span>
          )}
          {view === "fold" && !done && (
            <button
              type="button"
              className="autodemo-icon"
              disabled={!playing && !paused}
              onClick={paused ? demo.resume : demo.pause}
              title={paused ? "계속" : "일시정지"}
              aria-label={paused ? "계속" : "일시정지"}
            >
              {paused ? "▶" : "⏸"}
            </button>
          )}
          <button
            type="button"
            className="autodemo-icon"
            onClick={() => setView(view === "fold" ? "open" : "fold")}
            title={view === "fold" ? "펼치기" : "접기"}
            aria-label={view === "fold" ? "자동 시연 패널 펼치기" : "자동 시연 패널 접기"}
            aria-expanded={view === "open"}
          >
            {view === "fold" ? "▴" : "▾"}
          </button>
          <button
            type="button"
            className="autodemo-icon"
            onClick={() => setView("hide")}
            title="숨기기 — 오른쪽 아래 작은 단추로 다시 엽니다"
            aria-label="자동 시연 패널 숨기기"
          >
            ✕
          </button>
        </div>

        {view === "open" && demo.caption && <p className="autodemo-caption">{demo.caption}</p>}

        {view === "open" && (
        <div className="autodemo-ctrl">
          {!done && (
            <>
              <button type="button" disabled={!playing && !paused} onClick={paused ? demo.resume : demo.pause}>
                {paused ? "▶ 계속" : "⏸ 일시정지"}
              </button>
              <button type="button" disabled={!playing && !paused} onClick={demo.next}>
                ⏭ 다음
              </button>
            </>
          )}
          {!done && (
            <span className="autodemo-speed" role="group" aria-label="시연 배속">
              {DemoSpeeds.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={demo.speed === v}
                  title={`${v}배속 — 다음 문장부터 적용`}
                  onClick={() => demo.setSpeed(v)}
                >
                  {v === 1 ? "보통" : `${v}배`}
                </button>
              ))}
            </span>
          )}
          {!done && demo.voices.length > 0 && (
            <select
              className="autodemo-voice"
              aria-label="음성 고르기"
              title="음성 고르기 — 다음 문장부터 적용"
              value={demo.voiceName ?? ""}
              onChange={(e) => demo.setVoice(e.target.value)}
            >
              {demo.voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {shortVoice(v.name)}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            aria-pressed={demo.voiceOn}
            title={demo.voiceName ?? "한국어 음성이 없습니다 — 자막만 보입니다."}
            disabled={demo.voiceName === null}
            onClick={demo.toggleVoice}
          >
            {demo.voiceName === null ? "음성 없음" : demo.voiceOn ? "🔊 음성" : "🔇 음성 끔"}
          </button>
          <button type="button" className="autodemo-stop" onClick={demo.stop}>
            {done ? "닫기" : "⏹ 끝내기"}
          </button>
        </div>
        )}

        {view === "open" && demo.skipped.length > 0 && (
          <p className="autodemo-skip">건너뜀 {demo.skipped.length}건 — 저장된 답 없음</p>
        )}
        {view === "open" && children}
      </div>
    </>
  )
}
