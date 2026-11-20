/**
 * 개인정보 가림 표시(사용자 지시 2026-11-20 — T3Q 11/18 메일 「개인정보 마스킹 시연」).
 * T3Q 는 이름·생년월일·연락처·주택 번지 등을 `***` 로 가려서 보낸다(원천에서 이미 가려져 온다 — 우리가 가리는 것이 아니다).
 * 화면은 그 `***` 를 「가림」 표시 하나로 그린다 — 답 글·사건 타임라인·근거 쪽 어디서나 같은 모양.
 * 글자를 바꾸는 것은 그리기 직전뿐이고, 원문 보기·복사는 받은 글 그대로다.
 */

/** 그리기 직전에 `***` 자리에 넣는 표지(사설 영역 글자 U+E000 — 본문에 올 일이 없다) */
export const MASK_CHAR = String.fromCharCode(0xe000);

/**
 * 별표 꼭 세 개 — 앞뒤에 별표가 더 붙지 않고, 바로 앞이 글자·숫자·역빗금이 아닌 것(줄 처음·빈칸·괄호·빗금 뒤).
 * 글자에 바로 붙은 세 별표는 가림이 아니다(녹화 답 실측): 「**2025년***」 = 굵게 + 각주 별표, 「83건\***」 = 별표 글자 + 굵게 닫기.
 * T3Q 의 가림은 「번길 *** 단독주택」·「***(***) ***」·「vo.la/***」 꼴로 온다.
 */
const MASK_SRC = "(?<![\\p{L}\\p{N}*\\\\])\\*{3}(?!\\*)";
const mask = () => new RegExp(MASK_SRC, "gu");
/** 줄 전체가 `***` 뿐이면 마크다운 가로줄이다 — 가림이 아니다 */
const RULE_LINE = /^\s*\*{3}\s*$/;

/** 글 속 `***` 를 가림 표지로 — 가로줄(줄 전체가 ***)은 그대로 */
export function markMasks(text: string): string {
  if (!text.includes("***")) return text;
  return text
    .split("\n")
    .map((line) => (RULE_LINE.test(line) ? line : line.replace(mask(), MASK_CHAR)))
    .join("\n");
}

/** 가린 곳 수 — 답 위 안내 「개인정보 N곳을 가리고 보여 드립니다」 */
export function countMasks(text: string | null | undefined): number {
  if (!text || !text.includes("***")) return 0;
  let n = 0;
  for (const line of text.split("\n")) if (!RULE_LINE.test(line)) n += line.match(mask())?.length ?? 0;
  return n;
}

/** 보통 글(마크다운 아님)을 가림 자리로 나눈다 — 칸과 칸 사이가 가림 자리 */
export function splitMasks(text: string): string[] {
  return text.split(mask());
}

export const MASK_LABEL = "가림";
export const MASK_TIP = "개인정보 보호를 위해 가린 부분입니다";
