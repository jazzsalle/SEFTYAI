// 자동 시연의 음성 안내 — 브라우저 내장 음성(Web Speech API)만 쓴다. 서버·키·비용 없음(사용자 결정 2026-11-04).
// Chrome 은 한 번에 읽는 글이 길면 15초쯤에서 끊는다 → 문장 단위로 쪼개 차례로 읽는다.

const synth: SpeechSynthesis | null = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null

/**
 * 고를 한국어 음성 — 앞에 있을수록 먼저 고른다(사용자 지시 2026-11-04: 밝고 상냥한 음성).
 * Edge 의 SunHi(Natural, 온라인)가 가장 자연스럽다. 온라인이 안 되면 목록에서 빠지므로
 * Google 한국의 → PC 내장 Heami 로 저절로 내려간다.
 */
const Preferred = ["SunHi", "Natural", "Online", "Google 한국의", "Yuna", "Heami"]

let cached: SpeechSynthesisVoice[] | undefined

/** 조작 막대에서 고른 음성 이름(브라우저에 기억). */
const VoiceKey = "dsai.autodemo.voice"

export function savedVoiceName(): string | null {
  try {
    return localStorage.getItem(VoiceKey)
  } catch {
    return null
  }
}

export function saveVoiceName(name: string) {
  try {
    localStorage.setItem(VoiceKey, name)
  } catch {
    /* 저장이 막혀도 이번 시연에는 쓴다 */
  }
}

const isKorean = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace("_", "-").startsWith("ko")

/** 한국어 음성 가운데 하나 — 고른 이름이 있으면 그것, 없으면 우선순위대로. */
export function pick(ko: SpeechSynthesisVoice[], wanted: string | null = savedVoiceName()): SpeechSynthesisVoice | null {
  const chosen = wanted ? ko.find((v) => v.name === wanted) : undefined
  if (chosen) return chosen
  for (const name of Preferred) {
    const hit = ko.find((v) => v.name.includes(name))
    if (hit) return hit
  }
  return ko[0] ?? null
}

/** 이 브라우저의 한국어 음성 목록. 목록이 늦게 오는 브라우저를 위해 잠깐(최대 2초) 기다린다. */
export function koreanVoices(): Promise<SpeechSynthesisVoice[]> {
  if (synth === null) return Promise.resolve([])
  if (cached !== undefined && cached.length > 0) return Promise.resolve(cached)
  const now = synth.getVoices()
  if (now.length > 0) return Promise.resolve((cached = now.filter(isKorean)))
  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener("voiceschanged", done)
      window.clearTimeout(t)
      resolve((cached = synth.getVoices().filter(isKorean)))
    }
    const t = window.setTimeout(done, 2000)
    synth.addEventListener("voiceschanged", done)
  })
}

/** 글을 문장으로 쪼갠다 — 마침표·물음표·느낌표·줄바꿈 뒤에서. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * 한 문장을 읽는다. 다 읽거나 끊기면(cancel) 끝난다 — 끊긴 것도 오류로 보지 않는다.
 * 음성이 없으면 글 길이만큼 기다린다(자막만 보이고 흐름은 같게).
 */
export function speakOne(text: string, voice: SpeechSynthesisVoice | null, rate = 1): Promise<void> {
  if (synth === null || voice === null) {
    return new Promise((r) => window.setTimeout(r, Math.min(8000, 1200 + text.length * 120)))
  }
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text)
    u.voice = voice
    u.lang = voice.lang
    u.rate = rate
    u.onend = () => resolve()
    u.onerror = () => resolve()
    synth.speak(u)
  })
}

export const speech = {
  available: synth !== null,
  pause: () => synth?.pause(),
  resume: () => synth?.resume(),
  cancel: () => synth?.cancel(),
}
