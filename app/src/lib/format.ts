/**
 * 숫자 표기 — 천 단위 쉼표로 통일(사용자 결정 2026-10-28). 정수 부분만 쉼표, 소수부는 받은 자릿수 그대로(반올림 없음).
 * 번호·코드·연도·순번·순위처럼 이름 구실을 하는 숫자(열 이름이 _id·_no·_code·year·seq·rank 등)는 쉼표 없이 그대로.
 * 글자로 온 값(코드 대부분)은 손대지 않는다 — 숫자(number)로 온 값만. 에이전트 답 글 안의 숫자는 원문 그대로(여기 안 거침).
 * toLocaleString 은 소수 3자리로 반올림하므로 쓰지 않는다. 지수 표기·NaN 등 쉼표를 넣을 수 없는 꼴은 글자 그대로.
 */
export function fmtNum(n: number): string {
  const s = String(n);
  if (!/^-?\d+(\.\d+)?$/.test(s)) return s;
  const [int, frac] = s.split(".");
  return int.replace(/\B(?=(\d{3})+$)/g, ",") + (frac === undefined ? "" : `.${frac}`);
}
const PLAIN_NUM_KEY = /(^|_)(id|no|code|cd|year|yr|seq|ord|rank|page|size|version|pnu)$/i;
/** 이름 구실을 하는 숫자 열인가(쉼표를 찍지 않음) */
export const isPlainNumKey = (key?: string | null) => !!key && PLAIN_NUM_KEY.test(key);
/** 받은 숫자 → 글자: 양(금액·건수·인원·면적 등)이면 천 단위 쉼표, 번호·코드·연도 열이면 그대로 */
export const fmtValue = (key: string | null | undefined, n: number) => (isPlainNumKey(key) ? String(n) : fmtNum(n));

/**
 * 시간 표기 — 모두 「n분 n초」 한 가지 꼴(시각 설계 §0.2). 1분 미만은 「n초」.
 * - fmtElapsed: 제공처가 준 처리 시간(meta.elapsed_ms) → 「1분 46초」 (초 단위 반올림)
 * - fmtRunning: 진행 중 경과 시계 → 「1분 45초째」 (지난 초만 — 내림)
 * - fmtAgo: 지난 시간 → 「40초 전」·「25분 전」·「18시간 전」 (내림)
 */

function minSec(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

/** 처리 시간(ms) → 「1분 46초」·「46초」. 값이 없거나 숫자가 아니거나 음수면 「—」 */
export function fmtElapsed(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "—";
  return minSec(Math.round(ms / 1000));
}

/** 진행 중 경과(ms) → 「1분 45초째」·「45초째」. 시계 차이로 음수면 「0초째」 */
export function fmtRunning(ms: number): string {
  const sec = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  return `${minSec(sec)}째`;
}

/**
 * 지난 시간(ms) → 「n초 전」·「n분 전」·「n시간 전」(내림). 숫자가 아니면 null, 시계 차이로 음수면 「0초 전」.
 * 재사용 답의 주의 줄(D5)과 브리핑 현황판 칸(D1)이 같은 함수를 쓴다 — 같은 답이 두 곳에서 다르게 읽히지 않게
 */
export function fmtAgo(ms: number): string | null {
  if (!Number.isFinite(ms)) return null;
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  return `${Math.floor(s / 3600)}시간 전`;
}
