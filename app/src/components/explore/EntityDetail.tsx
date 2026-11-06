"use client";
import { Fragment, useRef, useState, type ReactElement, type ReactNode, type Ref } from "react";
import { useT3qData, type T3qEnvelope } from "@/lib/t3qData";
import {
  basicRows, basisRows, KIND_NAMES, manageRows, NO_GEOMETRY, NOT_PROVIDED, recordCaution, riskRows, riskStateOf, sectionsWithContent,
  summaryTiles, text, UNAVAILABLE, withoutPii, type RiskDocument, type RiskObject, type Row,
} from "@/lib/riskObject";
import { IcCalendar, IcCamp, IcFacility, IcGate, IcHouseFlood, IcMapPin, IcPump, IcRiver, IcSlope, IcUnderpass, IcWarning, type IconProps } from "../answer/infoIcons";
import { useExplore } from "./ExploreCtx";
import { Tree } from "./DetailPane";
import "../answer/demoInfo.css";
import "./eventInfo.css";
import "./entity.css";

/**
 * 위험·취약 대상 상세 (SCR-UNE-205003) — 개발서버 features/panel/components/EntityTab(kjw 998facb) 그대로.
 * 머리: 분류 아이콘 원 + 이름, 오른쪽 [지도에서 보기](지도에 찍을 수 있을 때)·[참조](근거가 있을 때) → 머리 칩(분류·행정구역·지정일) → 「출처 · 자료 기준」
 * → 요약 타일(위험등급·지정일·지정면적·연장·취약속성) → 기본정보 · 위험·취약정보(점검·정비 기록 표 + 주의) · 피해 이력 · 관리정보 · 근거 → 원본 항목 전체 보기.
 * 내용이 없는 영역은 세우지 않고, 값은 받은 글자 그대로(lib/riskObject).
 * ctx: mapJob·mapRef = 지도 대상(답 속 이름·대상 목록·지도 말풍선에서 열었을 때). hasGeometry = 위치 유무(패널이 지도 대상으로 셈 — true 면 [지도에서 보기], false 면 위치 없음 주의).
 */
export default function EntityDetail({ id, label, ctx, hasGeometry: known }: { id: string; label: string; ctx?: Record<string, unknown> | null; hasGeometry?: boolean | null }) {
  const x = useExplore();
  // 열쇠가 없는 대상(지역 단위로 가리킨 것)은 묻지 않는다 — 「nokey」 문구(개발서버 useRiskObject)
  const q = useT3qData<T3qEnvelope<RiskObject>>(id ? { api: "T3Q-15", id } : null);
  const state = riskStateOf(id, id ? q : null, label);
  const basisRef = useRef<HTMLElement>(null);

  const loaded = state.kind === "ok" ? state.object : null;
  const name = text(loaded?.name) ?? label ?? id;
  const kind = loaded?.data_group ?? null;
  const kindName = kind ? KIND_NAMES[kind] ?? null : null;
  const category = text(loaded?.category) ?? kindName;
  const area = text(loaded?.admin_area?.name);
  const designated = text(loaded?.risk?.designated_at);
  const asOf = text(loaded?.source?.as_of);
  const sourceName = text(loaded?.source?.name);
  const has = loaded ? sectionsWithContent(loaded) : null;

  const mapJob = typeof ctx?.mapJob === "string" ? ctx.mapJob : null;
  const mapRef = typeof ctx?.mapRef === "string" ? ctx.mapRef : null;
  // 지도에 찍을 수 있는지 — 패널이 지도 대상 목록으로 알려 준다(개발서버 SidePanel geometryKnown). 모르면 null
  const hasGeometry: boolean | null = known !== undefined ? known : ctx?.hasGeometry === false ? false : mapJob && mapRef ? true : null;

  return (
    <div className="dpane entity-tab evd fadein">
      <header className="evd-hero">
        <span className="evd-hero-ic"><CategoryIcon label={`${category ?? ""} ${name}`} size={28} /></span>
        <div className="evd-hero-t">
          <div className="evd-id">{[kindName, loaded?.object_id].filter(Boolean).join(" · ")}</div>
          <h2 className="evd-title">{name}</h2>
        </div>
        <div className="entity-head-actions">
          {hasGeometry === true && mapJob && mapRef && (
            <button type="button" className="btn sm entity-btn entity-btn--map" onClick={() => x.showOnMap(mapJob, mapRef)}>
              <MapIcon />
              지도에서 보기
            </button>
          )}
          {has?.basis && (
            <button type="button" className="btn sm entity-btn" onClick={() => basisRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>참조</button>
          )}
        </div>
      </header>

      {(category || area || designated) && (
        <div className="ev-chips">
          {category && <span className="di-tag evd-type"><CategoryIcon label={`${category} ${name}`} size={13} />{category}</span>}
          {area && <span className="di-tag t-b evd-type"><IcMapPin size={12} />{area}</span>}
          {designated && <span className="di-chip"><IcCalendar size={12} />지정 {designated}</span>}
        </div>
      )}
      {(asOf || sourceName) && <div className="xs muted evd-sub">{[sourceName, asOf ? `자료 기준 ${asOf}` : null].filter(Boolean).join(" · ")}</div>}

      {hasGeometry === false && <p className="ev-caution">{NO_GEOMETRY}</p>}

      {state.kind === "loading" && <p className="xs muted">상세 정보를 불러오는 중입니다…</p>}
      {state.kind !== "loading" && state.kind !== "ok" && <p className="xs muted">{UNAVAILABLE[state.kind]}</p>}

      {loaded && (
        <>
          <Summary object={loaded} />
          <Sec title="기본정보"><Rows rows={basicRows(loaded)} /></Sec>
          {has?.risk && <Sec title="위험·취약정보"><RiskSection object={loaded} /></Sec>}
          {has?.events && <Sec title="피해 이력" tone="t-c"><EventsSection events={loaded.basis?.past_events ?? []} /></Sec>}
          {has?.manage && <Sec title="관리정보" tone="t-b"><Rows rows={manageRows(loaded)} /></Sec>}
          {has?.basis && <Sec title="근거" secRef={basisRef}><BasisSection object={loaded} /></Sec>}
          <RawView name="대상" v={withoutPii(loaded)} />
        </>
      )}
    </div>
  );
}

/** 분류 글자(받은 그대로) → 선 아이콘. 그림만 고르고 글자는 바꾸지 않는다 — 모르면 일반 경고 */
const CATEGORY_ICONS: [RegExp, (p: IconProps) => ReactElement][] = [
  [/지하차도|지하도|터널/, IcUnderpass],
  [/급경사|사면|산사태|토사|낙석/, IcSlope],
  [/침수|홍수|내수/, IcHouseFlood],
  [/배수|펌프|빗물/, IcPump],
  [/수문|갑문/, IcGate],
  [/하천|제방|저수지|댐|해안|방조제/, IcRiver],
  [/야영|캠핑|숙박|펜션/, IcCamp],
  [/시설|건물|교량/, IcFacility],
];
export function CategoryIcon({ label, size }: { label: string; size: number }) {
  const Ic = CATEGORY_ICONS.find(([re]) => re.test(label))?.[1] ?? IcWarning;
  return <>{Ic({ size })}</>;
}

const TILE_ICON = { grade: IcWarning, at: IcCalendar, size: IcMapPin, weak: IcFacility } as const;
function Summary({ object }: { object: RiskObject }) {
  const tiles = summaryTiles(object);
  if (!tiles.length) return null;
  return (
    <div className="ev-head">
      <div className="di-head" role="list">
        {tiles.map((h) => (
          <div key={h.lb} className={`di-head-item${h.missing ? " missing" : ""}`} role="listitem">
            <span className="di-head-ic">{TILE_ICON[h.key]({ size: 24 })}</span>
            <span className="di-head-v"><b>{h.v}</b></span>
            <span className="di-head-lb">{h.lb}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 띠 위 알약 제목 한 칸 — 늘 펼쳐 둔다 */
export function Sec({ title, tone, secRef, children }: { title: string; tone?: "t-b" | "t-c"; secRef?: Ref<HTMLElement>; children: ReactNode }) {
  return (
    <section className="ev-sec" ref={secRef}>
      <h3 className={`di-pill${tone ? ` ${tone}` : ""}`}>{title}</h3>
      {children}
    </section>
  );
}

function RiskSection({ object }: { object: RiskObject }) {
  const { rows, records } = riskRows(object);
  const hasRows = rows.some((r) => r.value !== null);
  if (!hasRows && !records.length) return <p className="xs muted">{NOT_PROVIDED}</p>;
  return (
    <>
      {hasRows && <Rows rows={rows} />}
      {records.length > 0 && (
        <div className="evd-record">
          <h4 className="evd-record-h">점검·정비 기록</h4>
          <Rows rows={records} />
          <p className="ev-caution">{recordCaution(text(object.source?.as_of))}</p>
        </div>
      )}
    </>
  );
}

/** 피해 이력 — 사건명(없으면 근거번호) · 근거번호. 사례 상세로 가는 길은 아직 없다(개발서버와 같음) */
function EventsSection({ events }: { events: RiskDocument[] }) {
  if (!events.length) return <p className="xs muted">{NOT_PROVIDED}</p>;
  return (
    <>
      <ul className="s ev-evd">
        {events.map((e, i) => (
          <li key={i}>
            <b>{text(e.title) ?? e.evidence_ref ?? "—"}</b>
            {text(e.title) && e.evidence_ref ? <span className="xs muted"> · {e.evidence_ref}</span> : null}
          </li>
        ))}
      </ul>
      <p className="xs muted">사례 상세 화면은 준비 중입니다.</p>
    </>
  );
}

/** 근거 — 지정근거·관련 계획·관련 문서·출처. 「근거 원문 보기」 단추는 두지 않는다(열어 볼 문서가 있는지 이 응답으로는 알 수 없음) */
function BasisSection({ object }: { object: RiskObject }) {
  const rows = basisRows(object);
  if (!rows.some((r) => r.value !== null)) return <p className="xs muted">{NOT_PROVIDED}</p>;
  return <Rows rows={rows} />;
}

/** 키·값 줄 — 값이 없는 줄은 그리지 않는다 */
export function Rows({ rows }: { rows: Row[] }) {
  const shown = rows.filter((r) => r.value !== null);
  if (!shown.length) return <p className="xs muted">{NOT_PROVIDED}</p>;
  return (
    <dl className="kv ev-kv">
      {shown.map((r) => (
        <Fragment key={r.label}>
          <dt>{r.label}</dt>
          <dd className={r.missing ? "entity-card-missing" : undefined}>{r.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** 「대상 원본 항목 전체 보기」 — 받은 결과 전부(화면에 고른 항목 밖의 것 포함) */
export function RawView({ name, v }: { name: string; v: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ev-raw">
      <button className="lnk xs" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? `${name} 원본 항목 닫기` : `${name} 원본 항목 전체 보기`}</button>
      {open && <Tree v={v} />}
    </div>
  );
}

function MapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M1.5 3.5 5.5 2l5 1.5 4-1.5v10l-4 1.5-5-1.5-4 1.5zM5.5 2v10.5M10.5 3.5V14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}
