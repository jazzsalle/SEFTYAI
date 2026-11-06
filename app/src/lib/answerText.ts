import type { T3qRef } from "./jobTypes";

/**
 * 답변 글 화면 처리 (사용자 결정 2026-11-06 — 「답변 표시는 개발서버처럼」. 앞선 「T3Q 답 글자 그대로(R0)」를 이 규칙이 대신한다)
 * 개발서버(safetyai_une nia_ai-frontend/src/features/search) 의 규칙을 같은 뜻으로 옮겼다. 글자를 새로 지어내지 않고 걷어 내기만 한다.
 *  · 내부 DB 표 이름(`flood.trace` 등) — 출처만 적은 줄은 통째로, 표 이름만 든 괄호는 괄호째, 남은 표 이름은 앞 쉼표와 함께 뺀다(lib/answerMarkdown.ts hideDbNames)
 *  · 표의 「정비 내용」 칸 — 머리글로 가려 칸째 뺀다(lib/answerMarkdown.ts dropHiddenColumns)
 *  · 대상 링크 이름의 대괄호 — `[[부산진구] 문현1지구](#ref:r6)` → 「부산진구 문현1지구」, `[[이름](#ref:r1)]` 은 바깥 괄호를 걷는다(lib/answerMarkdown.ts EntityLink·plainName)
 *  · 대상 링크는 본문 글자와 refs 이름이 같은 것일 때만(lib/refMatch.ts sameThing·isRefId), 위치가 없다고 짚어 준 대상은 링크로 만들지 않는다(lib/answerRefs.ts mappableRefs)
 * 원문 보기·마크다운 원문 복사는 이 처리를 거치지 않은 받은 글 그대로다.
 */

// ── 내부 DB 표 이름(개발서버 사용자 지시 56) ──
const DB_NAME = "`[a-z_][a-z0-9_]*\\.[a-z_][a-z0-9_.]*`";
const HAS_DB_NAME = new RegExp(DB_NAME);
/** 표 이름만 든 괄호 — 「(`flood.trace`, `link.trace_event`)」 */
const DB_ONLY_PAREN = new RegExp(`\\s*\\(\\s*(?:${DB_NAME}\\s*(?:,|·|/|및|와|과)?\\s*)+\\)`, "g");
/** 남은 표 이름과 그 앞 쉼표 */
const DB_LOOSE = new RegExp(`\\s*[,·]?\\s*${DB_NAME}`, "g");

/** 답 글에서 내부 DB 표 이름을 걷는다 — 수치·사건 ID(T10107-…)·문장은 그대로, 표 이름만 */
export function hideDbNames(text: string): string {
  if (!HAS_DB_NAME.test(text)) return text;
  return text
    .split("\n")
    .filter((line) => {
      // 출처만 적은 줄 — 「*(출처: … DB …)*」 「- **데이터 출처**: …(`flood.trace`)」
      const bare = line.replace(/[*_()>\-\s]/g, "");
      return !(HAS_DB_NAME.test(line) && /^(데이터)?출처[:：]/.test(bare));
    })
    .map((line) => line.replace(DB_ONLY_PAREN, "").replace(DB_LOOSE, ""))
    .join("\n");
}

// ── 표의 숨길 칸(개발서버 사용자 지시 2026-11-03) ──
/** 화면에 내지 않는 칸 — 「주요 정비 내용」·「주요 정비 내용 및 상태」. 문장 속 정비 서술은 건드리지 않는다 */
const HIDDEN_COLUMN = /정비\s*내용/;
/** 표의 구분줄 — |---|:---:|---:| (이 줄이 있어야 표로 본다) */
const TABLE_DIVIDER = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
const FENCE = /^\s*(```|~~~)/;

/** 표 한 줄 → 칸 글(원문 그대로, 앞뒤 공백만 뗌). \| 는 칸 나눔이 아니라 글자 */
function splitRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\" && line[i + 1] === "|") {
      cur += "\\|";
      i++;
    } else if (ch === "|") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  // 줄 앞뒤 막대는 테두리 — 바깥 빈 칸을 버린다
  if (out.length > 1 && out[0].trim() === "") out.shift();
  if (out.length > 1 && out[out.length - 1].trim() === "") out.pop();
  return out.map((c) => c.trim());
}

/**
 * 표에서 「정비 내용」 칸을 뺀다. 머리·구분줄·본문을 같은 자리로 함께 걸러야 값이 옆 칸으로 밀리지 않는다.
 * 남길 칸이 하나도 없으면 그대로 둔다(빈 표보다 원래 표). 코드 블록 안은 보지 않는다
 */
export function dropHiddenColumns(text: string): string {
  if (!HIDDEN_COLUMN.test(text)) return text;
  const lines = text.split("\n");
  const out: string[] = [];
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE.test(line)) fence = !fence;
    if (fence || !line.includes("|") || i + 1 >= lines.length || !TABLE_DIVIDER.test(lines[i + 1])) {
      out.push(line);
      continue;
    }
    const head = splitRow(line);
    const keep = head.map((h, j) => (HIDDEN_COLUMN.test(h) ? -1 : j)).filter((j) => j >= 0);
    // 표 끝 — 빈 줄이거나 막대가 없는 줄 앞까지
    let end = i + 2;
    while (end < lines.length && lines[end].trim() !== "" && lines[end].includes("|")) end++;
    if (keep.length === head.length || keep.length === 0) {
      out.push(...lines.slice(i, end));
    } else {
      const marks = splitRow(lines[i + 1]);
      const row = (cells: string[]) => `| ${keep.map((j) => cells[j] ?? "").join(" | ")} |`;
      out.push(row(head), `|${keep.map((j) => marks[j] ?? "---").join("|")}|`);
      for (let r = i + 2; r < end; r++) out.push(row(splitRow(lines[r])));
    }
    i = end - 1;
  }
  return out.join("\n");
}

// ── 대상 링크 이름의 대괄호 ──
/** [이름](#ref:rN) — 이름 안 대괄호 한 겹, 링크 전체를 감싼 바깥 괄호 한 겹까지 */
const ENTITY_LINK = /(\[?)\[((?:[^[\]]|\[[^[\]]*\])+)\]\(#ref:([A-Za-z0-9_-]+)\)(\]?)/g;
/** 링크 글의 「[구] 이름」 → 「구 이름」 */
const plainName = (raw: string) => raw.replace(/\[([^[\]]*)\]/g, "$1").replace(/\s{2,}/g, " ").trim();

/** 대상 링크 이름의 대괄호를 걷는다 — 바깥 괄호는 짝이 맞을 때만, 한쪽만 있으면 본문 글자로 둔다 */
export function cleanEntityLinks(text: string): string {
  return text.replace(ENTITY_LINK, (_m, lead: string, name: string, id: string, tail: string) => {
    const wrapped = lead === "[" && tail === "]";
    return `${wrapped ? "" : lead}[${plainName(name)}](#ref:${id})${wrapped ? "" : tail}`;
  });
}

/** 화면에 그릴 답 글 — 받은 글에 위 규칙을 차례로(표 이름 → 숨길 칸 → 링크 괄호) */
export function displayAnswer(text: string): string {
  return cleanEntityLinks(dropHiddenColumns(hideDbNames(text.replace(/\r\n?/g, "\n"))));
}

// ── 대상 링크 맞춤(개발서버 lib/refMatch.ts) ──
/**
 * 본문 글자와 그 번호가 가리키는 대상이 같은 것인가 — T3Q 가 「내가평교」에 덕산지구 번호를 다는 식으로 번호를 엉뚱하게 붙여 보낸다.
 * 이름이 같거나 한쪽이 다른 쪽을 품으면 같다(「녹번1·2 지구」↔「녹번1」). 이름이 없으면 가릴 길이 없어 믿지 않는다
 */
export function sameThing(text: string, ref: Pick<T3qRef, "display_name">): boolean {
  const name = (ref.display_name ?? "").trim();
  const shown = text.trim();
  if (name === "" || shown === "") return false;
  return shown === name || shown.includes(name) || name.includes(shown);
}

/** 본문 글자가 번호 그 자체인가 — [#ref:r100](#ref:r100). 그 자리는 그 번호의 이름으로 적는다 */
export const isRefId = (text: string) => /^#?ref:[A-Za-z0-9_-]+$/.test(text.trim());

/** 지도에 보일 수 있는 대상인가 — T3Q 가 위치 없음(map.has_geometry: false)을 짚어 준 것만 뺀다. 칸이 없으면 모르는 것이라 남긴다 */
export const mappable = (ref: T3qRef) => (ref.map as { has_geometry?: boolean } | null | undefined)?.has_geometry !== false;

// ── 실패 안내 문구(개발서버 lib/agentRun.ts describe·AnswerFailed) ──
export const ANSWER_FAILED = "답변을 불러오지 못했습니다.";
/** 받지 못한 답의 안내 — 기술 사유(서버 재시작·HTTP 코드 등)는 화면에 내지 않고 정해 둔 문구만 */
export function failureText(state: string): string {
  if (state === "TIMEOUT") return "질의가 제한 시간을 넘겼습니다. 조건을 좁혀 다시 시도하세요.";
  if (state === "CANCELLED") return "질의를 취소했습니다.";
  return ANSWER_FAILED;
}
