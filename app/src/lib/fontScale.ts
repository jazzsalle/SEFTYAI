/**
 * 글자 크기 설정 (SCR-UNE-102004) — 개발서버 core/a11y/fontScale.ts(kjw 998facb) 이식(2026-11-07).
 * 다섯 단계 90·100·110·130·150%, 기본 보통(100%), 이 브라우저에 남긴다(계정이 아니라 기기 — 다른 PC 에서는 보통).
 * 개발서버는 화면 치수가 모두 rem 이라 루트 하나로 끝나지만 우리 화면은 글자 크기를 px 기준으로 적는다 →
 * 루트 글자(브라우저 기본에 대한 %)와 함께 배율 변수 --fs-scale 을 건다. 글자 크기는 모두 토큰(--fs-* = calc(Npx * var(--fs-scale)))이나
 * calc(Npx * var(--fs-scale)) 로만 적는다(R58 — harness/devsync/fontPx.test.ts 가 막는다). 보통(100%)이면 배율 1 이라 px 그대로.
 * 지도 캔버스 글자(OpenLayers)는 CSS 밖이라 scaledPx()로 크기를 셈하고 onScaleChange()로 다시 그린다.
 */

export interface FontScale { key: string; label: string; percent: number }

export const FONT_SCALES: FontScale[] = [
  { key: "small", label: "작게", percent: 90 },
  { key: "normal", label: "보통", percent: 100 },
  { key: "large", label: "조금 크게", percent: 110 },
  { key: "larger", label: "크게", percent: 130 },
  { key: "largest", label: "가장 크게", percent: 150 },
];
export const DEFAULT_SCALE = "normal";
export const FONT_SCALE_KEY = "sa.font-scale";
/** 예전 4단계(sa.font: s·m·l·xl) → 새 단계 */
const LEGACY: Record<string, string> = { s: "small", m: "normal", l: "large", xl: "larger" };

/** 배율 변수 — globals.css :root 의 --fs-scale(기본 1) */
export const SCALE_VAR = "--fs-scale";
const SCALE_EVENT = "sa:font-scale";

/** 글자 토큰 기본값(globals.css :root, 배율 1 일 때 px) — 토큰은 calc(값 * var(--fs-scale)) */
export const FONT_TOKENS: Record<string, number> = { "--fs-2xs": 12, "--fs-xs": 13, "--fs-s": 15, "--fs-m": 17, "--fs-hs": 19, "--fs-hm": 24, "--fs-hl": 32 };

export const scaleOf = (key: string): FontScale => FONT_SCALES.find((s) => s.key === key) ?? FONT_SCALES[1];

type Store = Pick<Storage, "getItem" | "setItem">;
const store = (): Store | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

/** 남겨 둔 값 — 없거나 모르는 값이면 보통. 저장을 못 읽는 브라우저(사생활 보호 창)도 보통 */
export function readScaleKey(s: Store | null = store()): string {
  try {
    const v = s?.getItem(FONT_SCALE_KEY);
    if (v && FONT_SCALES.some((x) => x.key === v)) return v;
    const old = s?.getItem("sa.font");
    if (old && LEGACY[old]) return LEGACY[old];
  } catch {}
  return DEFAULT_SCALE;
}

export function saveScaleKey(key: string, s: Store | null = store()) {
  try {
    s?.setItem(FONT_SCALE_KEY, key);
  } catch {}
}

/** 루트에 바로 먹인다 — 루트 글자 % + 배율 변수. 보통이면 둘 다 지운다(css 기본값 1) */
export function applyScale(key: string, el: HTMLElement | null = typeof document === "undefined" ? null : document.documentElement) {
  if (!el) return;
  const { percent } = scaleOf(key);
  el.style.fontSize = percent === 100 ? "" : `${percent}%`;
  if (percent === 100) el.style.removeProperty(SCALE_VAR);
  else el.style.setProperty(SCALE_VAR, String(percent / 100));
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(SCALE_EVENT));
  } catch {}
}

/** 지금 배율(루트에 건 --fs-scale, 없으면 1) */
export function currentScale(el: HTMLElement | null = typeof document === "undefined" ? null : document.documentElement): number {
  const v = parseFloat(el?.style.getPropertyValue(SCALE_VAR) ?? "");
  return v > 0 ? v : 1;
}

/** CSS 밖(캔버스 글자)에서 쓸 글자 크기 px — 배율 1 이면 받은 값 그대로 */
export const scaledPx = (px: number, scale = currentScale()): number => Math.round(px * scale * 100) / 100;

/** 글자 크기를 바꾸면 부른다 — 끊는 함수를 돌려준다 */
export function onScaleChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(SCALE_EVENT, cb);
  return () => window.removeEventListener(SCALE_EVENT, cb);
}
