"use client";
// 자동 시연 진행기(개발서버 features/demoMode/useAutoDemo.ts 복제 — R54) — 대본 장면을 차례로 돌린다(사용자 결정 2026-11-04: 대본대로 자동 진행 + 브라우저 음성).
//
// 장면 하나: 안내 읽기 → 저장된 답 놓기(에이전트 호출 없음) → 답으로 굴리고 강조 → 패널 열기 → 마무리 읽기 → 머물기.
// 저장된 답이 없는 장면은 건너뛴다. 일시정지는 읽던 문장을 끊고, 계속하면 그 문장부터 다시 읽는다
// (Chrome 의 speechSynthesis.pause 가 믿을 만하지 않아서).
import { useCallback, useEffect, useRef, useState } from "react"
import { type AutoScene, DefaultDwellMs, type DemoPin, type DemoRegion, type DemoStep, type FocusTarget, type Target, UI, scenesFrom } from "./autoScript"
import { clearMapMarks, markOnMap, parseMapSel } from "@/lib/autoDemoMap"
import { koreanVoices, pick, saveVoiceName, sentences, speakOne, speech } from "./speech"

export type AutoPhase = "idle" | "loading" | "playing" | "paused" | "done"

export interface AutoDemoActions {
  /** 시연 탭 질문 목록. */
  list: () => Promise<DemoPin[]>
  /** 새 대화로 비운다. */
  reset: () => void
  /** 기준지역을 바꾼다(대화가 새로 시작된다). 이미 그 지역이면 아무것도 하지 않는다. */
  region: (r: DemoRegion) => void
  /** 저장된 답을 대화에 놓는다. 답이 없으면 false. */
  play: (pin: DemoPin, region: DemoRegion | undefined) => Promise<boolean>
  /** AI 모드 시연 — 가상 특보를 띄우고 받아 둔 점검으로 AI 모드 창을 연다. 없으면 false. */
  aiMode: (pinId: string) => Promise<boolean>
  /** AI 모드 창을 닫는다(특보 줄의 가상 특보는 시연이 끝날 때까지 둔다). */
  closeAiMode: () => void
  /** 시연이 끝나거나 멈출 때 — 가상 특보·AI 모드 창을 걷는다. */
  cleanup: () => void
  /** 시연 화면 배치 — 질문 목록 접고 지도 넓히기. */
  layout: () => void
  /** 우측 패널에서 연다. */
  open: (what: NonNullable<AutoScene["open"]>) => void
}

interface Run {
  token: number
  skip: boolean
}

class Stopped extends Error {}

const StepMs = 100

let tagSeq = 0

/**
 * 대본의 Target 을 지금 화면의 요소 하나로 집어, 그 요소에 표(data-demo-t)를 달고 선택자를 돌려준다.
 * 커서·강조가 같은 요소를 계속 따라가게 하려는 것이다. 없으면 null.
 */
/** 대본이 앞 걸음에서 고른 대상 이름(remember) — Target.text 의 "$picked" 자리에 들어간다. */
let pickedName = ""

function resolve(t: Target): string | null {
  // 지도(OpenLayers 캔버스) — 지도에게 그 대상의 화면 자리를 묻고 그 자리에 표를 띄운다(R54 · lib/autoDemoMap)
  const onMap = parseMapSel(t.sel)
  if (onMap) {
    if (t.text === "$picked" && !pickedName) return null
    return markOnMap({ ...onMap, text: t.text === "$picked" ? pickedName : t.text })
  }
  let els = Array.from(document.querySelectorAll<HTMLElement>(t.sel))
  const text = t.text === "$picked" ? pickedName : t.text
  if (t.text === "$picked" && !pickedName) return null
  if (text) els = els.filter((e) => (e.textContent ?? "").includes(text))
  if (t.visible) els = els.filter(onScreen)
  if (t.largest) {
    const num = (e: HTMLElement) => Number((e.textContent ?? "").replace(/[^0-9]/g, "")) || 0
    els = [...els].sort((a, b) => num(b) - num(a))
  }
  const el = els[t.nth ?? 0]
  if (!el) return null
  if (!el.dataset.demoT) el.dataset.demoT = String(++tagSeq)
  return `[data-demo-t="${el.dataset.demoT}"]`
}

/** 화면 안에 있고, 그 가운데를 다른 것이 가리지 않는지(지도 점·묶음). */
function onScreen(e: HTMLElement) {
  const r = e.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return false
  const x = r.left + r.width / 2
  const y = r.top + r.height / 2
  const box = e.closest(".sa-map")?.getBoundingClientRect()
  if (box && (x < box.left + 8 || x > box.right - 8 || y < box.top + 8 || y > box.bottom - 8)) return false
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false
  const hit = document.elementFromPoint(x, y)
  return hit !== null && (hit === e || e.contains(hit))
}

/** 강조 목록을 Spotlight 가 쓰는 선택자 목록으로. 못 찾은 것은 뺀다. */
function focusOf(list: FocusTarget[]): string[] {
  return list.flatMap((f) => {
    if (typeof f === "string") return [f]
    const s = resolve(f)
    return s ? [s] : []
  })
}

/** 시연 배속(사용자 요청 2026-11-04) — 음성 속도와 모든 기다림을 같은 비율로 줄인다. */
export const DemoSpeeds = [1, 1.1, 1.2, 1.3] as const
const SpeedKey = "dsai.autodemo.speed"
/** 처음 배속 — 1.0 은 느리다(사용자 2026-11-04). 막대에서 바꾸면 그 값을 기억한다. */
const DefaultSpeed = 1.1

function savedSpeed(): number {
  try {
    const v = Number(localStorage.getItem(SpeedKey))
    return (DemoSpeeds as readonly number[]).includes(v) ? v : DefaultSpeed
  } catch {
    return DefaultSpeed
  }
}

export function useAutoDemo(actions: AutoDemoActions) {
  const act = useRef(actions)
  act.current = actions

  const [phase, setPhase] = useState<AutoPhase>("idle")
  const [index, setIndex] = useState(0)
  const [total, setTotal] = useState(0)
  const [title, setTitle] = useState("")
  const [caption, setCaption] = useState("")
  const [focus, setFocusState] = useState<string[] | null>(null)
  const setFocus = useCallback((f: FocusTarget[] | null) => setFocusState(f === null ? null : focusOf(f)), [])
  const [voiceName, setVoiceName] = useState<string | null>(null)
  /** 이 브라우저의 한국어 음성들 — 조작 막대에서 고른다(사용자 요청 2026-11-04). */
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)
  const [voiceOn, setVoiceOn] = useState(true)
  const [speed, setSpeedState] = useState(savedSpeed)
  const [skipped, setSkipped] = useState<string[]>([])
  /** 가상 커서가 가리킬 요소(선택자)와 누른 횟수 — 누를 때마다 물결이 한 번 퍼진다. */
  const [cursor, setCursor] = useState<{ sel: string; click: number } | null>(null)

  const tokenRef = useRef(0)
  const pausedRef = useRef(false)
  const pauseCount = useRef(0)
  const voiceOnRef = useRef(true)
  const speedRef = useRef(speed)
  const runRef = useRef<Run | null>(null)
  /** 시연이 체크한 대응절차 조치 — 끝날 때(멈춤 포함) 남아 있으면 거둔다. 체크는 기관 단위로 서버에 남는다. */
  const checkedRef = useRef<HTMLInputElement | null>(null)
  /** 시연 질문 목록(pin_id → 질문) — 장면 안 걸음(play)이 받아 둔 답을 찾는다. */
  const pinsRef = useRef<Map<string, DemoPin>>(new Map())
  const uncheck = useCallback(() => {
    const el = checkedRef.current
    checkedRef.current = null
    if (el?.isConnected && el.checked) el.click()
  }, [])

  const start = useCallback(async () => {
    const alive = (run: Run) => {
      if (tokenRef.current !== run.token) throw new Stopped()
    }

    /** 멈춰 있는 동안 기다린다. */
    const gate = async (run: Run) => {
      while (pausedRef.current) {
        alive(run)
        await new Promise((r) => window.setTimeout(r, StepMs))
      }
      alive(run)
    }

    /** 멈춘 시간은 빼고 ms 만큼 기다린다. [다음]을 누르면 바로 끝난다. */
    const wait = async (ms: number, run: Run) => {
      let left = ms
      while (left > 0 && !run.skip) {
        await new Promise((r) => window.setTimeout(r, StepMs))
        alive(run)
        if (!pausedRef.current) left -= StepMs * speedRef.current
      }
    }

    const say = async (text: string | undefined, _voice: SpeechSynthesisVoice | null, run: Run) => {
      if (!text) return
      for (const s of sentences(text)) {
        // 재생 중에 음성을 바꾸면 다음 문장부터 그 음성으로 읽는다.
        const voice = voiceRef.current
        for (;;) {
          await gate(run)
          if (run.skip) return
          setCaption(s)
          // 녹화용 기록 — 녹화 도구가 window.__ttsLog 를 배열로 만들어 둔 때만 남긴다(평소엔 아무 일 없음).
          const log = (window as unknown as { __ttsLog?: { t: number; text: string }[] }).__ttsLog
          if (Array.isArray(log)) log.push({ t: Date.now(), text: s })
          // 녹화용 — 녹화 도구가 문장별 음성 길이를 넣어 두면 그 길이만큼 자막을 보이고(음성은 나중에 입힌다).
          const rec = (window as unknown as { __ttsDurations?: Record<string, number> }).__ttsDurations
          if (rec || !voiceOnRef.current || voice === null) {
            await wait(rec?.[s] !== undefined ? rec[s] + 250 : Math.min(8000, 1200 + s.length * 120), run)
            break
          }
          const before = pauseCount.current
          await speakOne(s, voice, speedRef.current)
          alive(run)
          if (run.skip) return
          // 읽는 도중 일시정지로 끊겼으면 그 문장을 다시 읽는다.
          if (pauseCount.current === before) break
        }
      }
    }

    /** 커서를 옮기고(누르기까지) 움직임이 보이도록 잠깐 기다린다. */
    const point = async (sel: string, click: boolean, run: Run) => {
      setCursor((c) => ({ sel, click: click ? (c?.click ?? 0) + 1 : (c?.click ?? 0) }))
      await wait(click ? 1100 : 800, run)
    }

    /** sel 이 나타날 때까지 기다린다(최대 ms). */
    const until = async (sel: string, ms: number, run: Run) => {
      for (let left = ms; left > 0 && !document.querySelector(sel); left -= StepMs) {
        await new Promise((r) => window.setTimeout(r, StepMs))
        alive(run)
      }
    }

    /** 누르기 — 화면 안으로 끌어온 뒤 누른다. 체크박스를 켰으면 기억해 둔다. */
    const press = (sel: string) => {
      const el = document.querySelector<HTMLElement>(sel)
      if (!el) return
      el.click()
      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        if (el.checked) checkedRef.current = el
        else if (checkedRef.current === el) checkedRef.current = null
      }
    }

    /** 답을 놓은 뒤의 화면 동작(5차안). 집을 요소가 없으면 동작만 건너뛰고 자막은 읽는다. */
    const runSteps = async (steps: DemoStep[], run: Run): Promise<void> => {
      for (const st of steps) {
        if (run.skip) return
        await gate(run)
        let missing = false
        if (st.open) {
          act.current.open(st.open)
          // 지도는 처음 열릴 때 답의 대상 전체로 한 번 맞춘다 — 그 전에 누르면 확대가 덮인다.
          await wait(st.open === "map" ? 2600 : 900, run)
        }
        if (st.scroll) {
          const s = resolve(st.scroll)
          if (s) document.querySelector(s)?.scrollIntoView({ behavior: "smooth", block: "center" })
          else missing = true
          await wait(500, run)
        }
        if (st.look) {
          const s = resolve(st.look)
          if (s) await point(s, false, run)
          else missing = true
        }
        if (st.fill) {
          const s = resolve(st.fill.at)
          const box = s ? document.querySelector<HTMLElement>(s) : null
          const input =
            box instanceof HTMLInputElement || box instanceof HTMLTextAreaElement
              ? box
              : box?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea")
          if (s && input) {
            input.scrollIntoView({ behavior: "smooth", block: "nearest" })
            await point(s, true, run)
            input.focus()
            // React 가 값을 알아채도록 원래 setter 로 넣고 input 사건을 낸다.
            const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
            const set = Object.getOwnPropertyDescriptor(proto, "value")?.set
            for (let i = 1; i <= st.fill.value.length && !run.skip; i++) {
              set?.call(input, st.fill.value.slice(0, i))
              input.dispatchEvent(new Event("input", { bubbles: true }))
              await wait(45, run)
            }
            await wait(300, run)
          } else missing = true
        }
        const turnsBefore = document.querySelectorAll(UI.turns).length
        if (st.click) {
          const s = resolve(st.click)
          if (s && st.remember) pickedName = (document.querySelector(s)?.textContent ?? "").trim()
          if (s) {
            document.querySelector(s)?.scrollIntoView({ behavior: "smooth", block: "nearest" })
            await point(s, true, run)
            // 커서가 가는 사이 지도가 다시 그려져 요소가 바뀌었으면 같은 조건으로 다시 집는다.
            press(document.querySelector(s) ? s : (resolve(st.click) ?? s))
            await wait(400, run)
          } else missing = true
        }
        if (st.silentClick) {
          const s = resolve(st.silentClick)
          if (s) press(s)
          await wait(200, run)
        }
        // 녹화·점검용 — 대본이 집으려던 요소가 화면에 없었다.
        if (missing) console.info("[autodemo] 요소 없음", JSON.stringify(st.click ?? st.look ?? st.scroll ?? st.fill?.at))
        if (missing && st.orElse) await runSteps(st.orElse, run)
        if (st.play) {
          const pin = pinsRef.current.get(st.play)
          const ok = pin != null && pin.received_at !== null && (await act.current.play(pin, undefined))
          alive(run)
          if (!ok) console.info("[autodemo] 받아 둔 답 없음", st.play)
          // 질문 칸에 넣어 둔 글을 비운다 — 답이 놓였으니 보낸 것처럼 보여야 한다.
          const box = document.querySelector<HTMLTextAreaElement>(UI.questionBox)
          if (box) {
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(box, "")
            box.dispatchEvent(new Event("input", { bubbles: true }))
          }
          await wait(700, run)
          document.querySelector(UI.lastTurn)?.scrollIntoView({ behavior: "smooth", block: "start" })
          await wait(1200, run)
        }
        if (st.waitAnswer) {
          // 실제 질문이다 — 새 답 칸이 생기고, 본문이 그려지고, 진행 표시가 걷힐 때까지.
          setCaption("답을 받고 있습니다…")
          const done = () => {
            const list = document.querySelectorAll(UI.turns)
            const last = list[list.length - 1]
            return list.length > turnsBefore && !!last?.querySelector(UI.answerBody) && !last.querySelector(UI.answerRunning)
          }
          for (let left = st.waitAnswer; left > 0 && !done(); left -= 500) {
            await new Promise((r) => window.setTimeout(r, 500))
            alive(run)
            if (run.skip) break
          }
          if (!done()) console.info("[autodemo] 답 시간 초과", st.waitAnswer)
          // 한눈 요약·지도가 그려질 틈.
          await wait(1500, run)
        }
        // 누를 요소가 없었으면 그 결과(지도 말풍선 등)도 오지 않는다 — 4초를 헛되이 기다리지 않는다(사용자 지적 2026-11-04).
        if (st.waitFor && !missing) await until(st.waitFor, 4000, run)
        if (st.focus) setFocus(st.focus)
        await say(st.say, voiceRef.current, run)
        if (st.wait) await wait(st.wait, run)
      }
    }

    speech.cancel()
    const token = ++tokenRef.current
    pausedRef.current = false
    setPhase("loading")
    setSkipped([])
    setFocus(null)
    setCaption("")

    try {
      const list = await koreanVoices()
      setVoices(list)
      const voice = pick(list)
      voiceRef.current = voice
      setVoiceName(voice?.name ?? null)
      const pins = await act.current.list()
      pinsRef.current = new Map(pins.map((p) => [p.pin_id, p]))
      if (tokenRef.current !== token) return
      const plan = scenesFrom(pins)
      setTotal(plan.length)
      act.current.reset()
      act.current.layout()
      setPhase("playing")

      // 리허설·점검용 — 점검 도구가 window.__autodemoScenes 에 장면 번호(1부터)를 넣어 두면 그 장면만 돈다.
      const only = (window as unknown as { __autodemoScenes?: number[] }).__autodemoScenes
      for (let i = 0; i < plan.length; i++) {
        if (Array.isArray(only) && !only.includes(i + 1)) continue
        const { scene, pin, fallback } = plan[i]
        clearMapMarks()
        const run: Run = { token, skip: false }
        runRef.current = run
        setIndex(i + 1)
        setTitle(scene.label)
        setFocus(null)

        if (scene.region) act.current.region(scene.region)

        // 원 질문의 답이 없고 대체 질문으로 갈 때는 그 질문에 맞는 안내를 읽는다.
        const useFallback = (pin === null || pin.received_at === null) && fallback?.received_at != null
        await say(useFallback && scene.fallbackIntro ? scene.fallbackIntro : scene.intro, voice, run)
        if (run.skip) continue
        await gate(run)

        if (scene.aiModePinId) {
          // 머리말 [AI 모드]를 누르는 것처럼 보인다. 켜 둔 AI 모드가 저절로 띄우는 장면은 누르지 않는다.
          if (!scene.autoPopup) await point(UI.aiButton, true, run)
          const ok = await act.current.aiMode(scene.aiModePinId)
          alive(run)
          if (!ok) {
            setSkipped((s) => [...s, scene.label])
            setCaption("AI 모드 점검 결과가 없어 건너뜁니다.")
            await wait(1200, run)
            continue
          }
          await wait(600, run)
          for (const step of scene.aiModeSteps ?? []) {
            if (run.skip) break
            // 각 단계 강조 곳으로 창 안을 스크롤한다.
            const at = document.querySelector(
              step.focus.includes("aim-tiles") ? UI.aimBrief : step.focus.includes("aim-card") ? UI.aimCard : UI.aim,
            )
            at?.scrollIntoView({ behavior: "smooth", block: "start" })
            setFocus(step.focus)
            await point(
              step.focus[0] === "alert" ? UI.alert : step.focus[0] === "aim-tiles" ? UI.aimBrief : UI.aimCard,
              false,
              run,
            )
            await say(step.say, voice, run)
            await wait(400, run)
          }
          if (!run.skip) {
            setFocus(["aimode"])
            await say(scene.outro, voice, run)
            await wait(scene.dwellMs ?? DefaultDwellMs, run)
          }
          act.current.closeAiMode()
          setFocus(null)
          continue
        }

        if (scene.pinId) {
          // 질문 칸을 눌러 묻는 것처럼 보인다.
          await point(UI.questionBox, true, run)
          // 저장된 답이 없으면 대체 질문으로, 그것도 없으면 건너뛴다(에이전트는 부르지 않는다).
          let ok = pin !== null && pin.received_at !== null && (await act.current.play(pin, scene.region))
          alive(run)
          if (!ok && fallback !== null && fallback.received_at !== null) {
            ok = await act.current.play(fallback, scene.region)
            alive(run)
          }
          if (!ok) {
            setSkipped((s) => [...s, scene.label])
            setCaption("저장된 답이 없어 건너뜁니다.")
            await wait(1200, run)
            continue
          }

          // 답 카드가 그려질 틈을 주고 그리로 굴린다.
          await wait(500, run)
          document
            .querySelector(UI.lastTurn)
            ?.scrollIntoView({ behavior: "smooth", block: "start" })
          await point(`${UI.lastTurn} ${UI.answerCard}`, false, run)
          if (!scene.steps) {
            if (scene.open) {
              await point(UI.panelTabs, true, run)
              act.current.open(scene.open)
            }
            setFocus(scene.focus ?? ["answer"])
          }
        }

        if (scene.steps) {
          await runSteps(scene.steps, run)
          uncheck()
          if (run.skip) continue
        }

        await say(scene.outro, voice, run)
        await wait(scene.dwellMs ?? DefaultDwellMs, run)
      }

      setFocus(null)
      setCursor(null)
      clearMapMarks()
      act.current.cleanup()
      setCaption("시연을 마쳤습니다.")
      setPhase("done")
    } catch (e) {
      if (!(e instanceof Stopped)) {
        setCaption("자동 시연을 진행하지 못했습니다.")
        setPhase("done")
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 진행기는 처음 만든 함수 하나로 돈다(개발서버와 같음)
  }, [])

  const pause = useCallback(() => {
    pausedRef.current = true
    pauseCount.current++
    speech.cancel()
    setPhase("paused")
  }, [])

  const resume = useCallback(() => {
    pausedRef.current = false
    setPhase("playing")
  }, [])

  /** 지금 장면을 끝내고 다음으로. 멈춰 있었으면 풀고 넘어간다. */
  const next = useCallback(() => {
    if (runRef.current) runRef.current.skip = true
    pausedRef.current = false
    speech.cancel()
    setPhase((p) => (p === "paused" ? "playing" : p))
  }, [])

  const stop = useCallback(() => {
    tokenRef.current++
    pausedRef.current = false
    runRef.current = null
    speech.cancel()
    setFocus(null)
    setCursor(null)
    uncheck()
    clearMapMarks()
    act.current.cleanup()
    setCaption("")
    setPhase("idle")
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 진행기는 처음 만든 함수 하나로 돈다(개발서버와 같음)
  }, [])

  const toggleVoice = useCallback(() => {
    voiceOnRef.current = !voiceOnRef.current
    setVoiceOn(voiceOnRef.current)
    if (!voiceOnRef.current) {
      // 읽던 문장은 끊고 자막 시간만큼 기다리게 한다.
      pauseCount.current++
      speech.cancel()
    }
  }, [])

  /** 배속 — 읽고 있는 문장은 그대로 끝까지, 다음 문장과 기다림부터 새 배속을 쓴다. */
  const setSpeed = useCallback((v: number) => {
    speedRef.current = v
    setSpeedState(v)
    try {
      localStorage.setItem(SpeedKey, String(v))
    } catch {
      /* 저장이 막혀도 이번 시연에는 쓴다 */
    }
  }, [])

  /** 음성 바꾸기 — 다음 문장부터. 고른 이름은 브라우저에 기억한다. */
  const setVoice = useCallback(
    (name: string) => {
      const v = voices.find((x) => x.name === name) ?? null
      if (v === null) return
      voiceRef.current = v
      setVoiceName(v.name)
      saveVoiceName(v.name)
    },
    [voices],
  )

  // 화면을 떠나면 읽던 것도 멈춘다.
  useEffect(
    () => () => {
      tokenRef.current++
      speech.cancel()
    },
    [],
  )

  return {
    phase,
    index,
    total,
    title,
    caption,
    focus,
    cursor,
    voiceName,
    voices,
    setVoice,
    voiceOn,
    speed,
    setSpeed,
    skipped,
    start,
    pause,
    resume,
    next,
    stop,
    toggleVoice,
  }
}

export type AutoDemo = ReturnType<typeof useAutoDemo>
