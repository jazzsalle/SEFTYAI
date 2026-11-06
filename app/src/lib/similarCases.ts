/**
 * 유사사례 한눈 요약 재료 — 개발서버 features/search/summary/cases.ts(kjw 998facb) 그대로 옮김(R59) + 개발서버 AnswerPanel 의
 * 「유사사례 카드를 붙일 답인가」(isSimilarQuestion · isCaseQuestion) · 「T3Q-04 를 부를 조건」(withDisasterType).
 *
 * 개발서버 원문 설명: 유사사례 답은 refs 가 비어 있고(지도 대상이 아닌 과거 사건) 값은 답 글의 마크다운 표에만 있다.
 * 같은 갈래 질문 6건을 받아 보니 칸 이름과 방향이 답마다 달라, 칸 이름을 낱말로 알아보고 알아본 칸만 쓴다.
 * 값은 표 칸에 적힌 숫자 그대로 — 계산·추정하지 않는다. 숫자를 못 읽은 칸은 비워 둔다.
 */
import { DAY_ITEMS } from "./library";

export interface CaseValue {
  n: number
  /** 화면 글 — 「70.4mm」 「100mm 이상」. */
  shown: string
  /** 표 칸 원문. 막대에 마우스를 올리면 보인다. */
  raw: string
}

export interface SimilarCase {
  name: string
  period: string | null
  year: number | null
  /** 답이 「직접 유사」라고 적은 사례. */
  direct: boolean
}

export type CaseMetricKey = "rain1h" | "rainTotal" | "traces"

export interface CaseMetric {
  key: CaseMetricKey
  label: string
  values: (CaseValue | null)[]
}

export interface CaseSet {
  cases: SimilarCase[]
  metrics: CaseMetric[]
}

/** 표 칸 하나를 글로 — 굵게·코드 표시·줄바꿈 태그를 걷는다. */
const clean = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim()

const cellsOf = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map(clean)

const isDivider = (line: string) => /^\|?\s*:?-{2,}/.test(line.trim())

/** 답 글 안의 표들 — [머리, 행들]. */
function tables(text: string): { head: string[]; rows: string[][] }[] {
  const out: { head: string[]; rows: string[][] }[] = []
  const lines = text.split("\n")
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith("|") || !isDivider(lines[i + 1] ?? "")) continue
    const head = cellsOf(lines[i])
    const rows: string[][] = []
    let j = i + 2
    for (; j < lines.length && lines[j].trim().startsWith("|"); j++) rows.push(cellsOf(lines[j]))
    out.push({ head, rows })
    i = j - 1
  }
  return out
}

const NameField = /사건|재해|재난|태풍|사례|호우/
const NotName = /유사점|특성|특징|피해|원인|지역|규모|강우|강수|건수|흔적/
const PeriodField = /기간|일자|일시|연도|발생/
const Rain1hField = /1시간|시우량|시간당|최대\s*강우/
const TotalField = /누적|총\s*강수|총\s*강우|일\s*강수/
const RainField = /강우|강수/
const TraceField = /침수\s*흔적/

const Num = /(\d[\d,]*(?:\.\d+)?)/

function value(raw: string, at: number, unit: string): CaseValue | null {
  const rest = raw.slice(at)
  const m = Num.exec(rest)
  if (!m) return null
  const n = Number(m[1].replace(/,/g, ""))
  if (!Number.isFinite(n)) return null
  const after = rest.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 8)
  const qual = /초과/.test(after) ? " 초과" : /이상/.test(after) ? " 이상" : ""
  return { n, shown: `${m[1]}${unit}${qual}`, raw }
}

/** 칸 안에서 낱말 뒤의 숫자 — 「1시간 최대 60.2mm (누적 178.5mm)」 의 누적. */
function after(raw: string, word: RegExp, unit: string): CaseValue | null {
  const m = word.exec(raw)
  if (!m) return null
  const v = value(raw, (m.index ?? 0) + m[0].length, unit)
  // 낱말에서 너무 멀리 떨어진 숫자는 다른 값이다.
  return v && raw.slice((m.index ?? 0) + m[0].length).search(Num) <= 6 ? v : null
}

/** 사례마다 칸 이름 → 값. 사례가 열로 온 표(머리 첫 칸 「구분」)는 뒤집는다. */
function records(t: { head: string[]; rows: string[][] }): { name: string; fields: [string, string][] }[] | null {
  const first = t.head[0] ?? ""
  if (/^(구분|항목)$/.test(first) && t.rows.some((r) => PeriodField.test(r[0] ?? ""))) {
    return t.head.slice(1).map((name, j) => ({
      name,
      fields: t.rows.map((r) => [r[0] ?? "", r[j + 1] ?? ""] as [string, string]),
    }))
  }
  const nameAt = t.head.findIndex((h) => NameField.test(h) && !NotName.test(h))
  if (nameAt < 0) return null
  return t.rows.map((r) => ({
    name: r[nameAt] ?? "",
    fields: t.head.map((h, i) => [h, r[i] ?? ""] as [string, string]).filter((_, i) => i !== nameAt),
  }))
}

export function parseCases(text: string): CaseSet | null {
  for (const t of tables(text)) {
    const recs = records(t)
    if (!recs || recs.length < 2) continue

    const cases: SimilarCase[] = []
    const rain1h: (CaseValue | null)[] = []
    const total: (CaseValue | null)[] = []
    const traces: (CaseValue | null)[] = []

    for (const r of recs) {
      const periodCell = r.fields.find(([h]) => PeriodField.test(h))?.[1] ?? null
      const name = r.name.replace(/\s*\((직접[^)]*|유사[^)]*|최근[^)]*)\)\s*$/, "").trim()
      if (!name) continue
      const year = /(19|20)\d{2}/.exec(`${periodCell ?? ""} ${r.name}`)
      cases.push({
        name,
        period: periodCell && periodCell !== "-" ? periodCell : null,
        year: year ? Number(year[0]) : null,
        direct: /직접/.test(r.name) || r.fields.some(([, v]) => /직접\s*유사/.test(v)),
      })

      let h1: CaseValue | null = null
      let tot: CaseValue | null = null
      let tr: CaseValue | null = null
      for (const [h, v] of r.fields) {
        if (!v || v === "-" || v === "—") continue
        if (TraceField.test(h)) tr ??= value(v, 0, "건")
        else if (Rain1hField.test(h)) {
          h1 ??= value(v, 0, "mm")
          tot ??= after(v, /(누적|총)\s*/, "mm")
        } else if (TotalField.test(h)) tot ??= value(v, 0, "mm")
        else if (RainField.test(h)) {
          h1 ??= after(v, /(1시간|시간당|시우량)[^\d]{0,6}/, "mm")
          tot ??= after(v, /(누적|총)\s*/, "mm")
        }
      }
      rain1h.push(h1)
      total.push(tot)
      traces.push(tr)
    }

    if (cases.length < 2) continue
    // 기간도 연도도 없는 표는 사례 표가 아니다(대응 점검표 같은 것).
    if (cases.filter((c) => c.period || c.year).length < 2) continue

    const metrics: CaseMetric[] = (
      [
        { key: "rain1h", label: "1시간 최대 강우", values: rain1h },
        { key: "rainTotal", label: "누적 강수량", values: total },
        { key: "traces", label: "침수흔적", values: traces },
      ] as CaseMetric[]
    ).filter((m) => m.values.filter(Boolean).length >= 2)

    return { cases, metrics }
  }
  return null
}

/** 유사사례를 물은 답인지 — 다른 표(점검표 등)에 사례 카드를 붙이지 않는다. */
export function isCaseQuestion(question: string | undefined, answer: string): boolean {
  return /유사|사례|과거.*(호우|태풍|침수|피해)/.test(question ?? "") || /유사\s*사례|과거\s*사례/.test(answer.slice(0, 400))
}

/** 질문 모음 「한눈 요약 질의」의 유사사례 문항과 글이 같은가(되살린 대화도 글로 알아본다 — 개발서버 dayScript isSimilarQuestion) */
let similarTexts: Set<string> | null = null;
export function isSimilarQuestion(question: string): boolean {
  similarTexts ??= new Set(DAY_ITEMS.filter((d) => d.similar).map((d) => d.text.trim()));
  return similarTexts.has(question.trim());
}

/**
 * 유사사례 한눈 요약을 붙일 답인가 — 개발서버 AnswerPanel caseCtx 조건 그대로.
 * 질문 글이 사례를 물을 때만(특정 날짜·장소를 묻는 질문에 붙으면 묻지 않은 사건이 1위로 올라 엉뚱해 보인다), 그리고 유사사례 문항이거나 답이 사례 답일 때.
 */
export function wantsSimilarSummary(question: string, answer: string): boolean {
  if (!/유사|사례/.test(question)) return false;
  return isSimilarQuestion(question) || isCaseQuestion(question, answer);
}

/**
 * 재난유형이 조건에 없으면 질문에서 읽어 넣는다(개발서버 AnswerPanel withDisasterType) — 유형 없이 T3Q-04 를 부르면
 * 호우를 물었는데 화재·운송거부가 1위로 온다.
 */
const TYPE_WORDS: [RegExp, string][] = [
  [/태풍/, "태풍"],
  [/호우|강우|집중호우|침수|홍수/, "호우"],
  [/산사태|급경사/, "산사태"],
  [/폭염/, "폭염"],
  [/대설|폭설/, "대설"],
  [/한파/, "한파"],
  [/지진/, "지진"],
  [/풍랑|강풍/, "풍랑"],
  [/산불/, "산불"],
];
export function withDisasterType(ctx: Record<string, unknown>, question: string): Record<string, unknown> {
  if (Array.isArray(ctx.disaster_types) && ctx.disaster_types.length > 0) return ctx;
  const hit = TYPE_WORDS.find(([re]) => re.test(question));
  return hit ? { ...ctx, disaster_types: [hit[1]] } : ctx;
}
