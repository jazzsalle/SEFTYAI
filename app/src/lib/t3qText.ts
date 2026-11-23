/**
 * T3Q 글에서 뜻 없는 글자를 걷는다 — 화면에 그리는 T3Q 글 공통(개발서버 shared/lib/text.ts cleanT3qText, 9e664db · 디자이너 결정 11-23).
 *  · 깨진 글자 표시 「�」(U+FFFD) — PDF 에서 읽지 못한 글자 자리
 *  · PDF 글꼴 아이콘 자리 문자(사용자 정의 영역 U+E000–U+F8FF) — 브라우저가 「≣≣」 같은 모양으로 그린다
 *  · 그래서 목록 점·번호만 남은 줄은 줄째 지운다. 다른 글자·띄어쓰기·빈 줄은 건드리지 않는다.
 * 가림 표지(lib/piiMask MASK_CHAR = U+E000)도 같은 영역 글자라 이 함수는 반드시 가림 표지를 넣기 전에 부른다.
 */
const JUNK = /[�-]/g;
const JUNK_TEST = /[�-]/;
/** 걷고 나서 목록 점·번호만 남은 줄 */
const EMPTY_MARKER = /^\s*(?:[-*+•·]|\d+[.)])?\s*$/;

export function cleanT3qText(text: string): string {
  if (!JUNK_TEST.test(text)) return text;
  return text
    .split("\n")
    .flatMap((line) => {
      if (!JUNK_TEST.test(line)) return [line];
      const rest = line.replace(JUNK, "");
      return EMPTY_MARKER.test(rest) ? [] : [rest];
    })
    .join("\n");
}
