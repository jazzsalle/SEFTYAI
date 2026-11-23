/**
 * 개인정보 가림 표시(사용자 지시 2026-11-20 — T3Q 11/18 메일 「개인정보 마스킹 시연」 · 개발서버 FUN-UFR-903005 shared/lib/mask.ts).
 * T3Q 는 이름·생년월일·연락처·주택 번지 등을 별표로 가려서 보낸다(원천에서 이미 가려져 온다 — 우리가 가리는 것이 아니다).
 * 화면은 그 자리를 「가림」 표시 하나로 그린다 — 답 글·사건 타임라인·근거 쪽 어디서나 같은 모양.
 * 글자를 바꾸는 것은 그리기 직전뿐이고, 원문 보기·복사는 받은 글 그대로다.
 */

/** 그리기 직전에 가림 자리에 넣는 표지(사설 영역 글자 U+E000 — 본문에 올 일이 없다. lib/t3qText cleanT3qText 를 먼저 거친다) */
export const MASK_CHAR = String.fromCharCode(0xe000);

/**
 * 별표 셋 이상 — 앞뒤에 별표가 더 붙지 않고, 바로 앞이 글자·숫자·역빗금이 아닌 것(줄 처음·빈칸·괄호·빗금·붙임표 뒤).
 * 글자에 바로 붙은 별표는 가림이 아니다(녹화 답 실측): 「**2025년***」 = 굵게 + 각주 별표, 「83건\***」 = 별표 글자 + 굵게 닫기.
 * T3Q 의 가림은 「번길 *** 단독주택」·「***(***) ***」·「vo.la/***」·「051-****-****」 꼴로 온다.
 */
const MASK_SRC = "(?<![\\p{L}\\p{N}*\\\\])\\*{3,}(?!\\*)";
const mask = () => new RegExp(MASK_SRC, "gu");
/** 줄 전체가 별표뿐이면 마크다운 가로줄이다 — 가림이 아니다 */
const RULE_LINE = /^\s*\*{3,}\s*$/;
/** 한 줄 안의 진짜 기울임+굵게(「***글***」) — 가림이 아니라 꾸밈(개발서버 mask.ts BoldItalic) */
const BOLD_ITALIC = /\*{3}(?=[^*\s])(?=[^*\n]*[가-힣A-Za-z])([^*\n]*?[^\s*])\*{3}/g;
/** 한 줄 안의 굵게(「**글**」) — 꾸밈 */
const BOLD = /\*\*(?=[^*\s])(?=[^*\n]*[가-힣A-Za-z])([^*\n]*?[^\s*])\*\*/g;
/** 줄 앞 목록 점(「* 항목」) — 목록 표지 */
const LEAD_BULLET = /^(\s*)\*(?=\s)/;
const ANY_STARS = /\*+/g;
const HOLD = /(\d+)/g;

/**
 * 글 속 가림 자리를 가림 표지로 — 가로줄(줄 전체가 별표)과 「***글***」 꾸밈은 그대로.
 * strict — T3Q 가 이 글에서 개인정보를 가렸다고 알려 준 때(근거 쪽 masked > 0 — 개발서버 디자이너 지시 11-23):
 * 줄 앞 목록 점 「* 」과 굵게 「**글**」 를 뺀 모든 별표를 가림으로 본다(실측: 「*(*)」 처럼 한 개짜리도 온다).
 */
export function markMasks(text: string, strict = false): string {
  if (!(strict ? text.includes("*") : text.includes("***"))) return text;
  return text
    .split("\n")
    .map((line) => {
      if (RULE_LINE.test(line)) return line;
      const keep: string[] = [];
      const hold = (m: string) => {
        keep.push(m);
        return `${keep.length - 1}`;
      };
      let held = line.replace(BOLD_ITALIC, hold);
      if (strict) held = held.replace(LEAD_BULLET, (_, sp: string) => sp + hold("*")).replace(BOLD, hold).replace(ANY_STARS, MASK_CHAR);
      else held = held.replace(mask(), MASK_CHAR);
      return held.replace(HOLD, (_, i: string) => keep[Number(i)]);
    })
    .join("\n");
}

/** 가린 곳 수 — 답 위 안내 「개인정보 N곳을 가리고 보여 드립니다」 */
export function countMasks(text: string | null | undefined): number {
  if (!text || !text.includes("***")) return 0;
  const before = text.split(MASK_CHAR).length;
  return markMasks(text).split(MASK_CHAR).length - before;
}

/** 보통 글(마크다운 아님)을 가림 자리로 나눈다 — 칸과 칸 사이가 가림 자리 */
export function splitMasks(text: string): string[] {
  return markMasks(text).split(MASK_CHAR);
}

export const MASK_LABEL = "가림";
export const MASK_TIP = "개인정보 보호를 위해 가린 부분입니다";
