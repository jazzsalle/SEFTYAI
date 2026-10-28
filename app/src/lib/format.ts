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
