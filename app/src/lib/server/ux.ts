import "server-only";

/**
 * 사용자 노출 문구 정리 — 원천 데이터·메타에 섞인 내부 작업 용어(연계기관명·검증 메모·샘플 표기 등)를
 * 응답 직전에 서비스 문구로 바꾼다. 식별자(id 류)와 추적 정보(trace)는 건드리지 않는다.
 */
const RULES: [RegExp, string][] = [
  [/\s*—\s*시연\s*가정값/g, ""],
  [/T3Q\s*기상결합\s*\(ASOS\s*시간강수\)/g, "기상청 시간강수 결합"],
  [/\(T3Q\s*지식\)/g, ""],
  [/T3Q\s*(기상결합|결합|제공|지식)\s*/g, ""],
  [/ASOS\s*\/\s*AWS/g, "기상청 관측"],
  [/(\(\d{2,3}\))\s*ASOS\b/g, "$1 관측소"],
  [/\s*\(침수심은 원자료 단위 혼재\s*—\s*검증 후 표출\)/g, ""],
  [/공개자료\s*기반\s*\(검증\s*필요\)/g, "공개자료 기준"],
  [/\(공개자료·검증\s*필요\)/g, "(공개자료 기준)"],
  [/\(검증\s*필요\)/g, "(공개자료 기준)"],
  [/재구성\(시연\)\s*·\s*표준 스키마/g, "재구성 기록"],
  [/재구성\(시연\)/g, "재구성 기록"],
  [/synthetic\(시연용\)/g, "훈련 시나리오"],
  [/^\(샘플\)\s*/g, ""],
  [/\s*\(샘플\)/g, ""],
  [/\[샘플\]\s*/g, ""],
  [/\s*\(가상\)/g, ""],
  [/샘플\s*\(실데이터 미수신\)/g, "예시 자료"],
  [/\s*\(T3Q(\s*추출)?\)/g, ""],
  [/\s*\(\d+행\s*샘플 중 해당지역\)/g, ""],
  [/원시데이터현황_취약지역_\d+\s*>\s*/g, "취약지역 현황 · "],
  [/_추출(?=[.\s)]|$)/g, ""],
  [/\bnull\b/g, "—"],
];
const KEEP = new Set(["id", "eventId", "docId", "regionRecordId", "requestId", "riverId", "reportId", "traceId", "trace", "apis", "datasets", "entityIds", "url", "file"]);

export function uxText(s: string): string {
  let t = s;
  for (const [re, to] of RULES) t = t.replace(re, to);
  return t;
}

export function uxClean<T>(o: T, key = ""): T {
  if (KEEP.has(key)) return o;
  if (typeof o === "string") return uxText(o) as unknown as T;
  if (Array.isArray(o)) return o.map((v) => uxClean(v, key)) as unknown as T;
  if (o && typeof o === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) out[k] = uxClean(v, k);
    return out as T;
  }
  return o;
}
