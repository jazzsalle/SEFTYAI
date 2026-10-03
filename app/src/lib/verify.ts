/**
 * 응답 정합성 검증 (내부용 · 시스템 운영자 / T3Q 담당자)
 *  ① 요청 정합 : UNE가 보낸 질의 ↔ Agent가 받았다고 되돌려준 질의(requestEcho)          — UNE·T3Q 연계
 *  ② 응답 정답 : Agent 응답값 ↔ 정답셋 기대값 (의도 · 대상 ID · DQ 항목값 · 근거)          — T3Q
 *  ③ 표출 정합 : Agent 응답값 ↔ 화면에 그려지는 값 (참조 누락 · 화면 표시 여부)            — UNE
 * 서버(일괄 실행)와 화면(실사용 질의 · DOM 대조)에서 함께 쓰는 순수 함수만 둔다.
 */
import type { AgentRequest, AgentResponse, DetailResponse, QueryContext } from "./contract/agent";

/* ---------------- 정답셋 ---------------- */
export interface GoldValue {
  /** 03_상세정보 제공항목 ID (DQ-GG-NNN) */
  dqId: string;
  entityType: string;
  entityId: string;
  /** 상세 응답의 항목 라벨 */
  field: string;
  expected: string;
}
export interface GoldItem {
  id: string;
  /** 역량질문 ID (있으면) */
  cq?: string[];
  group?: string;
  question: string;
  presetKey?: string;
  context: QueryContext;
  expect: {
    intent?: string;
    /** 응답에 반드시 포함돼야 할 대상 ID */
    entityIds?: string[];
    values?: GoldValue[];
    citations?: { docId: string; page?: number }[];
  };
  /** 정답값 출처 (T3Q 정답셋 수신 전에는 UNE 시드 기준) */
  source?: string;
  local?: boolean;
}

export type Mark = "ok" | "fail" | "warn" | "na";
export interface ReqRow { path: string; sent: string; received: string; mark: Mark; note?: string }
export interface ReqCheck { mark: Mark; rows: ReqRow[]; hasEcho: boolean; same: number; diff: number }
export interface AnsCheck {
  mark: Mark;
  intent: { expected?: string; actual: string; mark: Mark };
  ids: { expected: string[]; matched: string[]; missing: string[]; actualCount: number; mark: Mark };
  values: (GoldValue & { actual: string | null; mark: Mark })[];
  cites: { docId: string; page?: number; mark: Mark }[];
}
export interface RenderCheck { mark: Mark; rows: { label: string; mark: Mark; detail: string }[] }
export interface VerifyResult {
  id: string;
  ranAt: string;
  ms: number;
  status: string;
  intent: string;
  req: ReqCheck;
  ans: AnsCheck | null;
  render: RenderCheck;
  /** 단건 실행에서만 채움 (원문 보기) */
  request?: AgentRequest;
  response?: AgentResponse;
  error?: string;
}

/* ---------------- 공통 ---------------- */
const show = (v: unknown) => (v === undefined ? "(없음)" : typeof v === "string" ? v : JSON.stringify(v));
/** 객체를 점 경로로 펼침 (배열은 값 하나로) */
export function flatten(o: unknown, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  if (o && typeof o === "object" && !Array.isArray(o)) {
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (v === undefined) continue;
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else if (prefix) out[prefix] = o;
  return out;
}
const worst = (ms: Mark[]): Mark => (ms.includes("fail") ? "fail" : ms.includes("warn") ? "warn" : ms.every((m) => m === "na") ? "na" : "ok");
const norm = (s: string) => s.replace(/[\s,]/g, "").toLowerCase();

/* ---------------- ① 요청 정합 ---------------- */
export function checkRequest(sent: Pick<AgentRequest, "question" | "presetKey" | "context"> | undefined, res: AgentResponse): ReqCheck {
  const echo = res.requestEcho;
  if (!sent) return { mark: "na", rows: [], hasEcho: !!echo, same: 0, diff: 0 };
  if (!echo) {
    return { mark: "warn", hasEcho: false, same: 0, diff: 0, rows: [{ path: "requestEcho", sent: "보낸 질의 있음", received: "(응답에 없음)", mark: "warn", note: "Agent가 받은 질의를 되돌려주지 않아 대조할 수 없음" }] };
  }
  const a = flatten({ question: sent.question, presetKey: sent.presetKey, context: sent.context });
  const b = flatten({ question: echo.question, presetKey: echo.presetKey, context: echo.context });
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  const rows: ReqRow[] = keys.map((k) => {
    const inA = k in a, inB = k in b;
    const same = inA && inB && JSON.stringify(a[k]) === JSON.stringify(b[k]);
    return { path: k, sent: inA ? show(a[k]) : "(보내지 않음)", received: inB ? show(b[k]) : "(받지 못함)", mark: same ? "ok" : "fail", note: same ? undefined : !inB ? "누락" : !inA ? "보내지 않은 값이 추가됨" : "값이 바뀜" };
  });
  const diff = rows.filter((r) => r.mark === "fail").length;
  return { mark: diff ? "fail" : "ok", rows, hasEcho: true, same: rows.length - diff, diff };
}

/* ---------------- ② 응답 정답 ---------------- */
/** 상세 응답에서 항목 라벨로 값 찾기 (섹션 항목 → 배지) */
export function detailValue(d: DetailResponse | null | undefined, field: string): string | null {
  if (!d) return null;
  for (const s of d.sections) {
    const f = s.fields.find((x) => x.label === field);
    if (f) return f.value;
  }
  return null;
}
export function checkAnswer(item: GoldItem, res: AgentResponse, details: Record<string, DetailResponse | null>): AnsCheck {
  const ex = item.expect;
  const intent = { expected: ex.intent, actual: res.intent, mark: (ex.intent ? (ex.intent === res.intent ? "ok" : "fail") : "na") as Mark };
  // 대상 ID : 응답 entities + 결과 목록
  const got = new Set<string>(res.entities.map((e) => e.id));
  res.blocks.forEach((b) => b.kind === "results" && b.groups.forEach((g) => g.items.forEach((it) => got.add(it.id))));
  const expIds = ex.entityIds ?? [];
  const matched = expIds.filter((id) => got.has(id));
  const missing = expIds.filter((id) => !got.has(id));
  const ids = { expected: expIds, matched, missing, actualCount: got.size, mark: (expIds.length ? (missing.length ? "fail" : "ok") : "na") as Mark };
  const values = (ex.values ?? []).map((v) => {
    const actual = detailValue(details[`${v.entityType}:${v.entityId}`], v.field);
    const mark: Mark = actual == null ? "fail" : norm(actual) === norm(v.expected) || norm(actual).includes(norm(v.expected)) ? "ok" : "fail";
    return { ...v, actual, mark };
  });
  const cites = (ex.citations ?? []).map((c) => ({ ...c, mark: (res.citations.some((x) => x.docId === c.docId && (c.page == null || x.page === c.page)) ? "ok" : "fail") as Mark }));
  return { mark: worst([intent.mark, ids.mark, ...values.map((v) => v.mark), ...cites.map((c) => c.mark)]), intent, ids, values, cites };
}

/* ---------------- ③ 표출 정합 (응답 → 화면 모델) ---------------- */
const TOK_E = /\{\{e:([^}]+)\}\}/g;
const TOK_C = /\[\[(c\d+)\]\]/g;
function blockTexts(res: AgentResponse): string[] {
  const out: string[] = [];
  for (const b of res.blocks) {
    if (b.kind === "headline" || b.kind === "notice") out.push(b.text);
    else if (b.kind === "narrative") out.push(...b.paragraphs);
    else if (b.kind === "facts") b.items.forEach((f) => out.push(f.value, f.note ?? ""));
    else if (b.kind === "actions") b.items.forEach((i) => out.push(i.task));
    else if (b.kind === "timeline") b.items.forEach((i) => out.push(i.text));
    else if (b.kind === "briefing") b.items.forEach((i) => out.push(i.summary));
  }
  return out;
}
export function checkRender(res: AgentResponse): RenderCheck {
  const ents = new Set(res.entities.map((e) => e.id));
  const cites = new Set(res.citations.map((c) => c.id));
  const texts = blockTexts(res);
  const eTok = texts.flatMap((t) => [...t.matchAll(TOK_E)].map((m) => m[1]));
  const cTok = texts.flatMap((t) => [...t.matchAll(TOK_C)].map((m) => m[1]));
  const badE = [...new Set(eTok.filter((id) => !ents.has(id)))];
  const badC = [...new Set(cTok.filter((id) => !cites.has(id)))];
  const items = res.blocks.flatMap((b) => (b.kind === "results" ? b.groups.flatMap((g) => g.items) : []));
  const noName = items.filter((i) => !i.name);
  const halfGeo = [...res.entities, ...items].filter((e) => (e.lon == null) !== (e.lat == null));
  const badFocus = (res.mapFocus?.entityIds ?? []).filter((id) => !ents.has(id) && !items.some((i) => i.id === id));
  const actCites = res.blocks.flatMap((b) => (b.kind === "actions" ? b.items.flatMap((i) => i.cite ?? []) : []));
  const badAct = [...new Set(actCites.filter((id) => !cites.has(id)))];
  const hasHead = res.blocks.some((b) => b.kind === "headline" || b.kind === "notice");
  const row = (label: string, bad: unknown[], okText: string, sample: (x: unknown[]) => string) => ({ label, mark: (bad.length ? "fail" : "ok") as Mark, detail: bad.length ? sample(bad) : okText });
  const rows = [
    { label: "결론 문장", mark: (hasHead ? "ok" : "fail") as Mark, detail: hasHead ? "있음" : "결론(headline) 블록이 없어 화면이 비어 보임" },
    row("본문 대상 칩", badE, `${new Set(eTok).size}개 모두 대상 정보와 연결`, (x) => `대상 정보가 없는 ID ${x.length}개 : ${x.slice(0, 3).join(", ")}`),
    row("본문 근거 번호", badC, `${new Set(cTok).size}개 모두 근거 문서와 연결`, (x) => `근거 문서가 없는 번호 ${x.length}개 : ${x.slice(0, 3).join(", ")}`),
    row("대응절차 근거", badAct, `${new Set(actCites).size}개 연결`, (x) => `근거 문서가 없는 번호 ${x.length}개`),
    row("결과 목록 이름", noName, `${items.length}건 모두 이름 있음`, (x) => `이름 없는 항목 ${x.length}건`),
    row("지도 좌표", halfGeo, "경도·위도 짝 맞음", (x) => `경도·위도 한쪽만 있는 대상 ${x.length}건`),
    row("지도 강조 대상", badFocus, `${res.mapFocus?.entityIds.length ?? 0}개 모두 응답에 있음`, (x) => `응답에 없는 강조 ID ${x.length}개`),
  ];
  return { mark: worst(rows.map((r) => r.mark)), rows };
}

/** 화면(DOM)에 실제로 보여야 할 값 — 결론 문장의 대상 이름 · 결과 목록 첫 그룹 상위 · 근거 문서 제목 · 이어서 질문 */
export function visibleExpectations(res: AgentResponse): { kind: string; text: string }[] {
  const byId = new Map(res.entities.map((e) => [e.id, e.name]));
  const out: { kind: string; text: string }[] = [];
  const head = res.blocks.find((b) => b.kind === "headline");
  if (head && head.kind === "headline") [...new Set([...head.text.matchAll(TOK_E)].map((m) => m[1]))].forEach((id) => byId.get(id) && out.push({ kind: "결론 문장의 대상", text: byId.get(id)! }));
  const results = res.blocks.find((b) => b.kind === "results");
  if (results && results.kind === "results") results.groups[0]?.items.slice(0, 5).forEach((i) => out.push({ kind: "결과 목록", text: i.name }));
  res.citations.slice(0, 4).forEach((c) => out.push({ kind: "근거 문서", text: c.title }));
  res.followUps.slice(0, 3).forEach((f) => out.push({ kind: "이어서 질문", text: f }));
  return out;
}

export const MARK_LABEL: Record<Mark, string> = { ok: "일치", fail: "불일치", warn: "확인 필요", na: "해당 없음" };
export const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
