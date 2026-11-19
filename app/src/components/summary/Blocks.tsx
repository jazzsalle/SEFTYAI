"use client";
// 개발 서버 features/search/summary/Blocks.tsx 그대로 옮김(2026-11-06) — 값은 받은 그대로, 그림은 크기·순서·기간만. 치수(rem)는 summary.css 에서 px 로.
import { useState, type ReactNode } from 'react'
import { MAX_ROWS as MaxRows, cell, depthUnit, shortDate, text, type SummaryGroup, type SummaryRow } from '@/lib/summary'

/**
 * 구분별 블록 — 템플릿 정의 ② 블록 카탈로그.
 *
 * <p>
 * <c>compact</c> 는 대화창 카드(시안 1, 무채색 + 파랑 막대), <c>poster</c> 는 우측 패널
 * 「한눈 요약」(시안 2, 구분 색 바탕). 같은 값을 같은 순서로 그리고 얼굴만 다르다.
 * </p>
 */
export type Variant = 'compact' | 'poster'

interface BlockProps {
  group: SummaryGroup
  variant: Variant
  /** 답 기준 시각 「2026.11.02 14:58」 — 간트의 빨간 기준선. */
  basisAt: string
}

/** 한 구분이 차지하는 모듈들(침수흔적은 둘). */
export function GroupBlocks(props: BlockProps): ReactNode {
  switch (props.group.block) {
    case 'trace':
      return <TraceBlocks {...props} />
    case 'gantt':
      return <Module {...props} sub="사업기간" wide={props.variant === 'poster'}><Gantt {...props} /></Module>
    case 'check':
      return props.variant === 'poster' ? <CheckPoster {...props} /> : (
        <>
          <Module {...props} sub="위험 요소"><Checklist rows={props.group.rows} /></Module>
          <ControlDepth {...props} />
        </>
      )
    case 'gauge':
      return <Module {...props} sub="대응수위" wide={props.variant === 'poster'}><Gauge {...props} /></Module>
    case 'score':
      return <Module {...props} sub="점수"><Score rows={props.group.rows} /></Module>
    case 'collapse':
      return <Module {...props} sub="위험도"><Collapse rows={props.group.rows} /></Module>
    case 'river':
      return <RiverBlock {...props} />
    case 'reservoir':
      return (
        <Module {...props} sub="하류 거주인구" wide={props.variant === 'poster'}>
          <Reservoir rows={props.group.rows} />
        </Module>
      )
    default:
      return <Module {...props} sub="목록"><Names rows={props.group.rows} /></Module>
  }
}

function Module({
  group,
  variant,
  sub,
  wide,
  children,
  title,
}: BlockProps & { sub: string; wide?: boolean; children: ReactNode; title?: string; noMore?: boolean }) {
  /*
    「외 N곳 (표로 보기)」·보조 목록은 그리지 않는다(사용자 지시 46) — 아래 「표로 보기」가 받은 것
    전부를 들고 있고, 그림 밑 작은 회색 글은 무엇인지 읽히지 않았다. 제목의 「N곳」이 전체 수다.
  */
  return (
    <article className={`sm-mod sm-mod--${variant} sm-tone--${group.tone}${wide ? ' sm-mod--wide' : ''}`}>
      <h4 className="sm-mod-title">
        {title ?? (
          <>
            {group.short} {group.count}곳
          </>
        )}
        <span className="sm-mod-sub">{sub}</span>
      </h4>
      {children}
    </article>
  )
}

const head = (rows: SummaryRow[]) => rows.slice(0, MaxRows)

// ── 침수흔적 — 일자별 + 면적 ───────────────────────────────────────────────

function TraceBlocks({ group, variant, basisAt }: BlockProps) {
  const byDate = new Map<string, number>()
  for (const r of group.rows) {
    const d = text(r.f.date)
    if (d) byDate.set(d, (byDate.get(d) ?? 0) + 1)
  }
  const dates = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))
  const areas = group.rows
    .filter((r) => typeof r.f.area === 'number')
    .sort((a, b) => (b.f.area as number) - (a.f.area as number))
  const total = group.rows.length
  // 평균 침수심(T3Q-30 avg_flood_depth_raw) — 깊은 순. 값이 온 곳만
  const depths = group.rows
    .filter((r) => typeof r.f.depth === 'number')
    .sort((a, b) => (b.f.depth as number) - (a.f.depth as number))
  const dUnit = depthUnit(depths[0]?.f.depthUnit)
  const dNote = text(depths[0]?.f.depthUnit)
  const depthRows = (n: number): [string, number, string][] =>
    depths.slice(0, n).map((r) => [r.name, r.f.depth as number, `${cell(r.f.depth)}${dUnit}`])

  if (variant === 'poster') {
    const peak = [...dates].sort((a, b) => b[1] - a[1])[0]
    const widest = areas[0]
    return (
      <>
        {peak && (
          <div className="sm-hero sm-hero--fill sm-tone--blue">
            <span className="sm-hero-label">침수흔적이 가장 많은 날</span>
            <span className="sm-hero-num">
              <b>{peak[1]}</b>곳
              <span className="sm-hero-meter" aria-hidden="true">
                <span style={{ width: `${(peak[1] / Math.max(total, 1)) * 100}%` }} />
              </span>
              <small>
                {peak[1]} / {total}곳
              </small>
            </span>
            <span className="sm-hero-foot">
              {shortDate(peak[0])} · 전체 {total}곳 중
            </span>
          </div>
        )}
        {widest && (
          <div className="sm-hero sm-tone--blue">
            <span className="sm-hero-label">가장 넓은 침수흔적</span>
            <span className="sm-hero-num">
              <b>{m2(widest.f.area)}</b>㎡
            </span>
            <span className="sm-hero-foot">
              {widest.name} · {shortDate(widest.f.date)}
            </span>
          </div>
        )}
        {dates.length > 0 && (
          <article className="sm-mod sm-mod--poster sm-mod--wide sm-tone--blue">
            <h4 className="sm-mod-title">
              침수흔적 {group.count}곳<span className="sm-mod-sub">언제 (원 크기 = 그날 개수)</span>
            </h4>
            <Timeline dates={dates} />
          </article>
        )}
        {areas.length > 0 && <Treemap rows={areas} />}
        {depths.length > 0 && (
          <article className="sm-mod sm-mod--poster sm-mod--wide sm-tone--blue">
            <h4 className="sm-mod-title">
              침수흔적 평균 침수심<span className="sm-mod-sub">깊은 순 {Math.min(depths.length, MaxRows)}곳 (물 높이 = 침수심)</span>
            </h4>
            <WaterBars rows={depthRows(MaxRows)} unit={dUnit} note={dNote} />
          </article>
        )}
      </>
    )
  }

  return (
    <>
      <Module group={group} variant={variant} basisAt={basisAt} sub="일자별" noMore>
        {dates.length > 0 ? <Columns dates={dates} /> : <p className="sm-note">호우 일자가 오지 않았습니다.</p>}
      </Module>
      {areas.length > 0 && (
        <Module
          group={group}
          variant={variant}
          basisAt={basisAt}
          sub={`큰 순 ${Math.min(areas.length, 5)}곳`}
          title="침수흔적 면적"
          noMore
        >
          <Bars
            rows={areas.slice(0, 5).map((r) => [r.name, r.f.area as number, `${m2(r.f.area)}㎡`])}
          />
        </Module>
      )}
      {depths.length > 0 && (
        <Module
          group={group}
          variant={variant}
          basisAt={basisAt}
          sub={`깊은 순 ${Math.min(depths.length, 5)}곳`}
          title="침수흔적 평균 침수심"
          noMore
        >
          <WaterBars rows={depthRows(5)} unit={dUnit} note={dNote} />
        </Module>
      )}
    </>
  )
}

/** 면적 표시 — 그림 위 글은 ㎡ 정수로(값은 표로 보기에 받은 그대로 남는다). */
const m2 = (v: string | number | null | undefined) =>
  typeof v === 'number' ? Math.round(v).toLocaleString('ko-KR') : cell(v)

/** 일자별 세로 막대 — 값 라벨은 막대 위, 날짜는 아래(겹치지 않게 「yy.mm.dd」). */
function Columns({ dates }: { dates: [string, number][] }) {
  const max = Math.max(...dates.map(([, n]) => n), 1)
  const shown = dates.slice(-8)
  return (
    <div className="sm-cols" role="list">
      {shown.map(([d, n]) => (
        <div key={d} className="sm-col" role="listitem" aria-label={`${shortDate(d)} ${n}곳`}>
          <span className="sm-col-val">{n}</span>
          <span className="sm-col-bar" style={{ height: `${(n / max) * 100}%` }} />
          <span className="sm-col-x">{shortDate(d)}</span>
        </div>
      ))}
    </div>
  )
}

/** 연도 축 위 원 — 원 크기 = 그날 개수. 가장 많은 날만 진하게. */
function Timeline({ dates }: { dates: [string, number][] }) {
  const t = (d: string) => new Date(d).getTime()
  const times = dates.map(([d]) => t(d)).filter(Number.isFinite)
  const min = Math.min(...times)
  const max = Math.max(...times)
  const span = Math.max(max - min, 1)
  const top = Math.max(...dates.map(([, n]) => n), 1)
  const y0 = new Date(min).getFullYear()
  const y1 = new Date(max).getFullYear()
  return (
    <div className="sm-tl">
      <div className="sm-tl-axis">
        {dates.map(([d, n], i) => {
          const size = 2 + (n / top) * 2.4
          return (
            <span
              key={d}
              className={`sm-tl-dot${n === top ? ' is-peak' : ''}${i % 2 ? ' is-below' : ''}`}
              style={{ left: `${dates.length === 1 ? 50 : ((t(d) - min) / span) * 100}%`, width: `${size * 10}px`, height: `${size * 10}px` }}
              title={`${shortDate(d)} · ${n}곳`}
            >
              {n}
              <small>{shortDate(d)}</small>
            </span>
          )
        })}
      </div>
      <div className="sm-tl-years" aria-hidden="true">
        <span>{y0}</span>
        {y1 !== y0 && <span>{y1}</span>}
      </div>
    </div>
  )
}

/**
 * 칸 넓이 = 면적. 앞 8곳은 칸 안에 이름·면적을 적고, 나머지는 작은 칸으로.
 *
 * <p>
 * 칸이 좁으면 글이 잘려 어딘지 알 수 없다 — <b>칸을 누르면 제목 줄 오른쪽에 이름·면적</b>을
 * 적는다(사용자 지시 46). 처음에는 가장 넓은 곳을 적어 두어 누를 수 있다는 것이 보이게 한다.
 * </p>
 */
function Treemap({ rows }: { rows: SummaryRow[] }) {
  const total = rows.reduce((s, r) => s + (r.f.area as number), 0) || 1
  const [pick, setPick] = useState(0)
  const on = rows[pick] ?? rows[0]
  return (
    <article className="sm-mod sm-mod--poster sm-mod--wide sm-tone--blue">
      <h4 className="sm-mod-title">
        침수흔적 면적<span className="sm-mod-sub">{rows.length}곳 (칸 넓이 = 면적)</span>
        {on && (
          <span className="sm-mod-pick" aria-live="polite">
            <b>{on.name}</b> {m2(on.f.area)}㎡
            {text(on.f.date) && <small> · {shortDate(on.f.date)}</small>}
          </span>
        )}
      </h4>
      <div className="sm-tree">
        {rows.map((r, i) => (
          <button
            type="button"
            key={r.id}
            className={`sm-tree-cell sm-tree-cell--${Math.min(i, 4)}${i === pick ? ' is-on' : ''}`}
            style={{ flexGrow: (r.f.area as number) / total }}
            title={`${r.name} · ${cell(r.f.area)}㎡`}
            aria-pressed={i === pick}
            aria-label={`${r.name} ${m2(r.f.area)}㎡`}
            onClick={() => setPick(i)}
          >
            {i < MaxRows && (
              <>
                <b>{m2(r.f.area)}㎡</b>
                <small>{r.name}</small>
              </>
            )}
          </button>
        ))}
      </div>
    </article>
  )
}

/** 가로 막대 [이름, 값, 값 글]. 막대 길이 = 값 / 최댓값. */
function Bars({ rows }: { rows: [string, number, string][] }) {
  const max = Math.max(...rows.map(([, v]) => v), 1)
  return (
    <ul className="sm-bars">
      {rows.map(([label, v, shown], i) => (
        <li key={`${label}-${i}`} className="sm-bar">
          <span className="sm-bar-label" title={label}>
            {label}
          </span>
          <span className="sm-bar-track" aria-hidden="true">
            <span className="sm-bar-fill" style={{ width: `${(v / max) * 100}%` }} />
          </span>
          <span className="sm-bar-val">{shown}</span>
        </li>
      ))}
    </ul>
  )
}

// ── 물 높이(침수심 · 통제 수심 · 대응수위) — 한 가지 그림말 ───────────────
/*
 * 사용자 지시 2026-11-20 — 침수심·수위처럼 「물 높이」인 값은 구분이 달라도 같은 그림으로 보인다.
 *  · 물색(파랑) 채움 + 눈금 — 구분 색(노랑·빨강 바탕)과 상관없이 늘 같은 물색
 *  · 길이는 받은 값 / 그 블록의 최댓값(다른 가로 막대와 같은 비례), 값 글은 받은 그대로
 *  · 대응수위(0.7·0.9)는 한 줄 물기둥 위 두 눈금 — 눈금 자리는 이름의 비율(70%·90%), 적힌 값은 받은 그대로
 * T3Q 실측(2026-11-20): T3Q-30 avg_flood_depth_raw(단위 글 「원천 단위 미표기(cm 로 보임)」) · T3Q-15 control_depth_cm ·
 * response_level_07/09 는 값이 온다. T3Q-30 max_depth_m · T3Q-16 stations(관측소 수위)는 원천에 없어 오지 않는다 — 오면 같은 그림에 얹는다.
 */

/** 물 높이 막대 [이름, 값, 값 글] — 막대 길이 = 값 / 최댓값. 아래에 0 ~ 최댓값 눈금자 */
function WaterBars({ rows, unit, note }: { rows: [string, number, string][]; unit: string; note?: string | null }) {
  if (rows.length === 0) return null
  const max = Math.max(...rows.map(([, v]) => v), 0)
  return (
    <div className="sm-water">
      <ul className="sm-bars">
        {rows.map(([label, v, shown], i) => (
          <li key={`${label}-${i}`} className="sm-bar">
            <span className="sm-bar-label" title={label}>
              {label}
            </span>
            <span className="sm-bar-track sm-water-track" aria-hidden="true">
              <span className="sm-bar-fill sm-water-fill" style={{ width: `${max > 0 ? (v / max) * 100 : 0}%` }} />
            </span>
            <span className="sm-bar-val">{shown}</span>
          </li>
        ))}
        <li className="sm-bar sm-water-axis" aria-hidden="true">
          <span />
          <span className="sm-water-scale">
            <span>0</span>
            <span>
              {cell(max)}
              {unit}
            </span>
          </span>
          <span />
        </li>
      </ul>
      {/* 단위 글이 「cm」 한 글자가 아니면(원천 단위 미표기 등) 받은 글을 그대로 적는다 */}
      {note && note !== unit && <p className="sm-note">단위 — {note}</p>}
    </div>
  )
}

/** 지하차도 통제 기준 수심(T3Q-15 control_depth_cm) — 응답 순서 그대로(위 점검표와 같은 줄 순서) */
function ControlDepth(props: BlockProps) {
  const rows: [string, number, string][] = []
  for (const r of head(props.group.rows)) {
    const raw = text(r.f.control_depth_cm)
    if (raw === null) continue
    const v = Number(raw.replace(/,/g, ''))
    if (Number.isFinite(v)) rows.push([r.name, v, `${raw}cm`])
  }
  if (rows.length === 0) return null
  return (
    <Module {...props} sub="물 높이 = 통제 수심" title="통제 기준 수심">
      <WaterBars rows={rows} unit="cm" />
    </Module>
  )
}

/** 대응수위 두 눈금 — 물기둥 한 줄 위에 0.7 · 0.9 자리. 값은 받은 그대로 */
function LevelMarks({ l07, l09 }: { l07: string | number | null; l09: string | number | null }) {
  const marks: [number, string, string | number | null][] = [
    [70, '0.7', l07],
    [90, '0.9', l09],
  ]
  const shown = marks.filter(([, , v]) => v !== null)
  if (shown.length === 0) return null
  const first = shown[0][0]
  const top = Math.max(...shown.map(([p]) => p))
  return (
    <div className="sm-level" role="img" aria-label={shown.map(([, k, v]) => `대응수위 ${k} ${cell(v)}`).join(', ')}>
      <span className="sm-level-track">
        <span className="sm-level-fill" style={{ width: `${first}%` }} />
        {top > first && <span className="sm-level-band" style={{ left: `${first}%`, width: `${top - first}%` }} />}
        {shown.map(([p, k, v]) => (
          <span key={k} className={`sm-level-mark sm-level-mark--${k === '0.7' ? 'lo' : 'hi'}`} style={{ left: `${p}%` }}>
            <b>{cell(v)}</b>
            <small>대응수위 {k}</small>
          </span>
        ))}
      </span>
    </div>
  )
}

// ── 개선지구·정비지구 — 사업기간 간트 ─────────────────────────────────────

function Gantt({ group, variant, basisAt }: BlockProps) {
  const rows = head(group.rows).filter((r) => typeof r.f.from === 'number' && typeof r.f.to === 'number')
  if (rows.length === 0) return <Names rows={group.rows} />

  const basis = /(\d{4})\.(\d{2})\.(\d{2})/.exec(basisAt)
  const now = basis ? Number(basis[1]) + (Number(basis[2]) - 1) / 12 : null
  const years = rows.flatMap((r) => [r.f.from as number, (r.f.to as number) + 1])
  if (now) years.push(now)
  const min = Math.floor(Math.min(...years))
  const max = Math.ceil(Math.max(...years))
  const span = Math.max(max - min, 1)
  const pos = (y: number) => ((y - min) / span) * 100
  const released = rows.filter((r) => text(r.f.released)).length
  const ticks = variant === 'poster' ? yearTicks(min, max) : [min, max - 1]

  return (
    <div className="sm-gantt">
      {variant === 'poster' && released > 0 && (
        <p className="sm-note">해제 {released}곳(회색)</p>
      )}
      <ul className="sm-gantt-rows">
        {rows.map((r) => {
          const from = r.f.from as number
          const to = r.f.to as number
          const off = text(r.f.released)
          return (
            <li key={r.id} className={`sm-gantt-row${off ? ' is-off' : ''}`}>
              <span className="sm-gantt-label">
                <b>{r.name}</b>
                {variant === 'compact' && (
                  <small>
                    {from}–{to}
                    {r.grade ? ` · 등급 ${r.grade}` : ''}
                    {off ? ` · 해제 ${off.replace(/-/g, '.')}` : ''}
                  </small>
                )}
              </span>
              <span className="sm-gantt-track">
                <span className="sm-gantt-bar" style={{ left: `${pos(from)}%`, width: `${pos(to + 1) - pos(from)}%` }}>
                  {variant === 'poster' && `${from}–${to}`}
                </span>
                {variant === 'poster' && off && (
                  <span className="sm-gantt-off" style={{ left: `calc(${pos(to + 1)}% + 6px)` }}>
                    해제 {off.replace(/-/g, '.')}
                  </span>
                )}
                {now !== null && <span className="sm-gantt-now" style={{ left: `${pos(now)}%` }} />}
              </span>
            </li>
          )
        })}
      </ul>
      <div className="sm-gantt-axis">
        <span className="sm-gantt-axis-pad" />
        <span className="sm-gantt-axis-line">
          {ticks.map((y) => (
            <span key={y} style={{ left: `${pos(y)}%` }}>
              {y}
            </span>
          ))}
          {now !== null && basis && (
            <span className="sm-gantt-axis-now" style={{ left: `${pos(now)}%` }}>
              기준 {basis[1].slice(2)}.{basis[2]}.{basis[3]}
            </span>
          )}
        </span>
      </div>
    </div>
  )
}

function yearTicks(min: number, max: number): number[] {
  const step = Math.max(1, Math.ceil((max - min) / 6))
  const out: number[] = []
  for (let y = min; y <= max; y += step) out.push(y)
  return out
}

// ── 지하차도 — 위험 요소 점검표 ───────────────────────────────────────────

const CheckCols = [
  { key: 'u_shaped', label: 'U형' },
  { key: 'near_river_500m', label: '하천 500m' },
  { key: 'casualty_risk_area', label: '인명피해' },
]

function Checklist({ rows }: { rows: SummaryRow[] }) {
  const shown = head(rows)
  return (
    <>
      <table className="sm-check">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">이름</span>
            </th>
            <th scope="col">등급</th>
            {CheckCols.map((c) => (
              <th key={c.key} scope="col">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id}>
              <th scope="row">{r.name}</th>
              <td className="sm-check-grade">{r.grade ?? '—'}</td>
              {CheckCols.map((c) => (
                <td key={c.key}>
                  <Dot value={text(r.f[c.key])} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sm-legend" aria-hidden="true">
        <span className="sm-dot sm-dot--yes" /> 예 <span className="sm-dot sm-dot--no" /> 아니오
      </p>
    </>
  )
}

function Dot({ value }: { value: string | null }) {
  if (value === '예') return <span className="sm-dot sm-dot--yes" role="img" aria-label="예" />
  if (value === '아니오') return <span className="sm-dot sm-dot--no" role="img" aria-label="아니오" />
  return <span className="sm-dash">{value ?? '—'}</span>
}

/** 시안 2 — 등급 도넛 + 칸 색 = 예. */
function CheckPoster({ group, basisAt }: BlockProps) {
  const rows = head(group.rows)
  const grades = new Map<string, number>()
  for (const r of group.rows) if (r.grade) grades.set(r.grade, (grades.get(r.grade) ?? 0) + 1)
  const list = [...grades.entries()].sort((a, b) => b[1] - a[1])
  const total = list.reduce((s, [, n]) => s + n, 0)
  let acc = 0
  const stops = list
    .map(([, n], i) => {
      const a = (acc / Math.max(total, 1)) * 100
      acc += n
      const b = (acc / Math.max(total, 1)) * 100
      return `var(${i === 0 ? '--sm-strong' : '--sm-soft'}) ${a}% ${b}%`
    })
    .join(', ')

  return (
    <>
      {total > 0 && (
        <article className="sm-mod sm-mod--poster sm-tone--yellow">
          <h4 className="sm-mod-title">
            {group.short} {group.count}곳<span className="sm-mod-sub">위험등급</span>
          </h4>
          <div className="sm-donut-wrap">
            <span className="sm-donut" style={{ background: `conic-gradient(${stops})` }} aria-hidden="true">
              <b>{group.count}</b>
            </span>
            <ul className="sm-donut-legend">
              {list.map(([g, n]) => (
                <li key={g}>
                  <b>{n}</b> 곳 · 등급 {g}
                </li>
              ))}
            </ul>
          </div>
        </article>
      )}
      <Module group={group} variant="poster" basisAt={basisAt} sub="" title="위험 요소 (칸 색 = 예)">
        <table className="sm-grid">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">이름</span>
              </th>
              {CheckCols.map((c) => (
                <th key={c.key} scope="col">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.name}</th>
                {CheckCols.map((c) => {
                  const v = text(r.f[c.key])
                  return (
                    <td key={c.key}>
                      <span className={`sm-grid-cell${v === '예' ? ' is-yes' : v === null ? ' is-none' : ''}`} role="img" aria-label={v ?? '값 없음'} />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td />
              {CheckCols.map((c) => {
                const known = rows.filter((r) => text(r.f[c.key]) !== null)
                const yes = known.filter((r) => text(r.f[c.key]) === '예').length
                return <td key={c.key}>{known.length > 0 ? `예 ${yes}/${known.length}` : '—'}</td>
              })}
            </tr>
          </tfoot>
        </table>
      </Module>
      <ControlDepth group={group} variant="poster" basisAt={basisAt} />
    </>
  )
}

// ── 홍수취약지구 — 대응수위 ───────────────────────────────────────────────

function Gauge({ group }: BlockProps) {
  const withValue = head(group.rows).filter((r) => r.f.l07 !== null || r.f.l09 !== null)
  const without = group.rows.length - withValue.length
  return (
    <>
      {withValue.map((r) => (
        <div key={r.id} className="sm-gauge">
          <p className="sm-gauge-name">
            <b>{r.name}</b> {[text(r.f.river), text(r.f.station) && `특보지점 ${r.f.station}`].filter(Boolean).join(' · ')}
          </p>
          <LevelMarks l07={r.f.l07} l09={r.f.l09} />
        </div>
      ))}
      {without > 0 && <p className="sm-note">대응수위 값 없음 {without}곳</p>}
    </>
  )
}

function Value({ value, unit, label }: { value: string | number | null; unit: string; label: string }) {
  return (
    <div className="sm-value">
      <span className="sm-value-num">
        {cell(value)}
        {value !== null && unit && <small>{unit}</small>}
      </span>
      <span className="sm-value-label">{label}</span>
    </div>
  )
}

// ── 급경사지 — 점수 막대 ─────────────────────────────────────────────────

function Score({ rows }: { rows: SummaryRow[] }) {
  const scored = head(rows).filter((r) => typeof r.f.score === 'number')
  if (scored.length === 0) return <Names rows={rows} />
  return (
    <>
      <Bars
        rows={scored.map((r) => [
          `${r.name}${r.grade ? ` (${r.grade})` : ''}`,
          r.f.score as number,
          `${cell(r.f.score)}점`,
        ])}
      />
    </>
  )
}

// ── 붕괴위험지역 — 값 카드 ───────────────────────────────────────────────

function Collapse({ rows }: { rows: SummaryRow[] }) {
  return (
    <>
      {head(rows).map((r) => (
        <div key={r.id} className="sm-gauge">
          <p className="sm-gauge-name">
            <b>{r.name}</b>
            {r.grade ? ` 등급 ${r.grade}` : ''}
          </p>
          <div className="sm-values">
            <Value value={r.f.score} unit="점" label="위험도 점수" />
            <Value value={r.f.households} unit="가구" label="거주가구" />
            <Value value={r.f.residents} unit="명" label="거주인구" />
          </div>
        </div>
      ))}
    </>
  )
}

// ── 하천 — 값 카드 ───────────────────────────────────────────────────────

function RiverBlock({ group, variant, basisAt }: BlockProps) {
  const rows = head(group.rows)
  const single = rows.length === 1 ? rows[0] : null

  const body = single ? (
    <>
      <p className="sm-gauge-name">
        <b>{single.name}</b> {[text(single.f.kind), text(single.f.system)].filter(Boolean).join(' · ')}
      </p>
      <div className="sm-values">
        <Value value={single.f.length} unit="km" label="길이" />
        <Value value={single.f.catchment} unit="km²" label="유역면적" />
      </div>
    </>
  ) : (
    <>
      <p className="sm-sublabel">길이</p>
      <Bars rows={rows.filter((r) => typeof r.f.length === 'number').map((r) => [r.name, r.f.length as number, `${cell(r.f.length)}km`])} />
      <p className="sm-sublabel">유역면적</p>
      <Bars rows={rows.filter((r) => typeof r.f.catchment === 'number').map((r) => [r.name, r.f.catchment as number, `${cell(r.f.catchment)}km²`])} />
    </>
  )

  if (variant === 'poster') {
    return (
      <div className="sm-hero sm-hero--fill sm-hero--wide sm-tone--sky">
        <span className="sm-hero-label">
          하천{single ? ` · ${single.name}${text(single.f.kind) ? ` · ${single.f.kind}` : ''}` : ` ${group.count}곳 · 길이 / 유역면적`}
        </span>
        {body}
      </div>
    )
  }
  return (
    <Module group={group} variant={variant} basisAt={basisAt} sub="" title={`하천 ${group.count}곳`}>
      {body}
    </Module>
  )
}

// ── 재해위험저수지 — 하류 거주인구 ─────────────────────────────────────

/** 하류 거주인구 큰 순 막대. 막대 옆 글에 안전등급·하류 주택 거리(받은 값 그대로). */
function Reservoir({ rows }: { rows: SummaryRow[] }) {
  const known = head(rows)
    .filter((r) => typeof r.f.people === 'number')
    .sort((a, b) => (b.f.people as number) - (a.f.people as number))
  if (known.length === 0) return <Names rows={rows} />
  return (
    <>
      <Bars rows={known.map((r) => [r.name, r.f.people as number, `${cell(r.f.people)}명`])} />
    </>
  )
}

// ── 이름 목록 ─────────────────────────────────────────────────────────────

/** 등급별 개수 — 이름 목록 위에 한 줄. 등급이 오지 않으면 내지 않는다. */
function GradeLine({ rows }: { rows: SummaryRow[] }) {
  const map = new Map<string, number>()
  for (const r of rows) if (r.grade) map.set(r.grade, (map.get(r.grade) ?? 0) + 1)
  if (map.size === 0) return null
  const list = [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  return (
    <ul className="sm-grades" aria-label="등급별 개수">
      {list.map(([g, n]) => (
        <li key={g}>
          등급 {g} <b>{n}</b>
        </li>
      ))}
    </ul>
  )
}

function Names({ rows }: { rows: SummaryRow[] }) {
  return (
    <>
    <GradeLine rows={rows} />
    <ul className="sm-names">
      {head(rows).map((r) => (
        <li key={r.id}>
          <b>{r.name}</b>
          {[r.grade && `등급 ${r.grade}`, text(r.f.type)].filter(Boolean).map((s) => ` · ${s}`)}
        </li>
      ))}
    </ul>
    </>
  )
}
