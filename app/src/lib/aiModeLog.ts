/**
 * AI 모드 켬/끔 기록 규칙(FUN-UFR-907002) — 개발서버 Dsai.Portal.IBll AiModeLogRules(844333a) 그대로(R63).
 * 화면이 보내 온 값은 그대로 믿지 않는다. 기준지역 코드는 행정구역 코드(숫자)뿐이라, 그 꼴이 아니면 기록에 싣지 않는다 —
 * 아주 긴 글이나 줄바꿈이 섞인 값으로 기록을 어지럽히거나 부풀릴 수 없게 한다.
 */

/** 행정구역 코드의 최대 길이(법정동 10자리) */
export const AIM_LOG_MAX_REGION = 10;

/** 기록에 싣는 기준지역. 숫자 코드가 아니거나 길거나 비었으면 「-」 */
export function safeAimRegion(region: unknown): string {
  if (typeof region !== "string" || !region.trim() || region.length > AIM_LOG_MAX_REGION) return "-";
  return /^[0-9]+$/.test(region) ? region : "-";
}
