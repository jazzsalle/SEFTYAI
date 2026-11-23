"use client";
import "./condModal.css";
import { useEffect, useId, useState } from "react";
import ExploreModal from "./ExploreModal";
import { HOUR_OPTIONS, defaultPeriod, formatDate, formatTime, parseDateTime, parsePeriod } from "./period";
import { useSession, type Cond } from "@/lib/session";
import { COND_DISASTER_TYPES, COND_GROUPS, COND_ITEMS, COND_WARNING_KINDS, COND_WARNING_LEVELS } from "@/lib/library";
import type { DisasterType } from "@/lib/contract/agent";
import { toKstIso } from "@/lib/format";

type Group = (typeof COND_ITEMS)[number]["group"];
/** 모달 안에서 고쳐 쓰는 수치 줄 — 체크와 사람이 치는 글자 그대로(개발서버 MeasureInput) */
interface Measure {
  item: string;
  label: string;
  unit: string;
  group: Group;
  checked: boolean;
  value: string;
}

/** 체크했고 숫자가 들어 있는 줄만 조건으로 친다(개발서버 isFilled) */
export const isFilled = (m: Pick<Measure, "checked" | "value">) => m.checked && m.value.trim().length > 0 && !Number.isNaN(Number(m.value));

/** 세션 조건 → 수치 줄 9개(개발서버 MeasureFields 차례) */
export function toMeasures(c: Pick<Cond, "conditions">): Measure[] {
  return COND_ITEMS.map((f) => {
    const v = c.conditions?.find((x) => x.item === f.item);
    return { item: f.item, label: f.label, unit: f.unit, group: f.group, checked: !!v, value: v ? String(v.value) : "" };
  });
}

/** 수치 줄 → 질의 조건(query_context.detail.conditions 로 나감 — 서버가 source_type MANUAL 을 붙인다). 채운 줄만 */
export function fromMeasures(ms: Measure[], observedAt?: string): NonNullable<Cond["conditions"]> {
  return ms.filter(isFilled).map((m) => ({ item: m.item, label: m.label, value: Number(m.value), unit: m.unit, ...(observedAt ? { observedAt } : {}) }));
}

/**
 * 기준지역이 전국이 되면 기상·수문 조건을 비운다(개발서버 withRegion — 설계 201002 「전국」 ③ · 201003 ⑥).
 * 「1시간 강우 50mm」는 어디서 50mm 인지가 붙어야 뜻이 생긴다 — 전국이면 가리킬 자리가 없는 숫자를 Agent 가 관측값으로 받아 쓴다
 */
export function useClearMeasuresOnNation() {
  const s = useSession();
  const nation = !s.cond.base;
  const has = !!s.cond.conditions?.length;
  useEffect(() => {
    if (nation && has) s.setCond({ conditions: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nation, has]);
}

/**
 * 재난상황 조건 (시안 「재난상황 조건」 · 질의 줄 [조건 변경]) — 개발서버 ConditionModal 그대로.
 * 재난유형 칩 · 발생기간(날짜 + 시각, 「발생기간을 묻지 않음」) · 상황 상세정보(특보 종류·단계 · 피해·통제 키워드 · 기상·수문 9줄 체크+값).
 * 적용하기 전까지는 바깥 조건을 건드리지 않는다. 상세정보는 모두 선택 입력 — 비워 두면 그 칸은 상류로 나가지 않는다.
 * [기본 조건으로 되돌리기] = 개발서버 defaultConditions(최근 한 달 · 재난유형 전체 · 상세 비움). 기준지역은 바뀌지 않는다
 */
export default function CondModal({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const id = useId();
  const c = s.cond;
  const nationwide = !c.base;
  // 기간을 지운 조건으로 열면 칸에는 기본값(최근 한 달)을 띄워 둔다 — 체크를 풀었을 때 쓸 만한 값이 나와야 한다
  const [init] = useState(() => {
    const from = parsePeriod(c.periodFrom);
    const to = parsePeriod(c.periodTo);
    return from && to ? { noPeriod: false, from, to } : { noPeriod: true, ...defaultPeriod() };
  });
  const [disasterType, setType] = useState<string | null>(c.disasterType && c.disasterType !== "전체" ? c.disasterType : null);
  const [noPeriod, setNoPeriod] = useState(init.noPeriod);
  const [fromDate, setFromDate] = useState(formatDate(init.from));
  const [fromTime, setFromTime] = useState(formatTime(init.from));
  const [toDate, setToDate] = useState(formatDate(init.to));
  const [toTime, setToTime] = useState(formatTime(init.to));
  const [warningKind, setKind] = useState(c.warningKind ?? "");
  const [warningLevel, setLevel] = useState(c.warningLevel ?? "");
  const [keywords, setKw] = useState((c.keywords ?? []).join(", "));
  const [measures, setMeasures] = useState<Measure[]>(() => toMeasures(c));
  const [error, setError] = useState<string | null>(null);

  // 칸을 고치면 앞서 띄운 오류를 거둔다(개발서버 patch)
  function edit<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setError(null);
    };
  }
  const patchMeasure = (item: string, change: Partial<Measure>) => setMeasures((ms) => ms.map((m) => (m.item === item ? { ...m, ...change } : m)));
  const reset = () => {
    const d = defaultPeriod();
    setType(null);
    setNoPeriod(false);
    setFromDate(formatDate(d.from));
    setFromTime(formatTime(d.from));
    setToDate(formatDate(d.to));
    setToTime(formatTime(d.to));
    setKind("");
    setLevel("");
    setKw("");
    setMeasures(toMeasures({}));
    setError(null);
  };
  const apply = () => {
    // 묻지 않기로 했으면 적은 글자를 살피지 않는다 — 어차피 나가지 않는다
    const from = noPeriod ? null : parseDateTime(fromDate, fromTime);
    const to = noPeriod ? null : parseDateTime(toDate, toTime);
    if (!noPeriod) {
      if (from === null || to === null) return setError("발생기간을 YYYY.MM.DD 형식으로 입력하세요.");
      if (from > to) return setError("발생기간의 시작이 끝보다 뒤입니다.");
    }
    const kw = keywords.split(",").map((x) => x.trim()).filter(Boolean);
    // 칸을 꺼 두었으니 비어 있겠지만, 나가는 자리에서 한 번 더 턴다
    // 기상·수문 값은 [적용]을 누른 시각을 기준시각으로 찍는다(observed_at — 개발서버 67617f2 · FUN-UFR-102001)
    const conditions = nationwide ? [] : fromMeasures(measures, toKstIso(new Date()));
    // 지역은 그대로 두고 조건 칸은 모두 이 값으로 바꾼다(비운 칸은 undefined 로 — 이전 값이 남지 않게).
    // 기준시각은 개발서버 조건에 없는 칸이라 함께 비운다(예전 판이 남긴 값이 몰래 실리지 않게)
    s.setCond({
      disasterType: (disasterType ?? undefined) as DisasterType | undefined, referenceTime: undefined,
      periodFrom: from?.toISOString(), periodTo: to?.toISOString(),
      warningKind: warningKind || undefined, warningLevel: warningLevel || undefined,
      keywords: kw.length ? kw : undefined, conditions: conditions.length ? conditions : undefined,
    });
    onClose();
  };

  const group = (g: Group) => (
    <>
      <p className={`cond-sub${nationwide ? " is-off" : ""}`}>{COND_GROUPS[g]}</p>
      {measures.filter((m) => m.group === g).map((m) => (
        <div className={`cond-measure${nationwide ? " is-off" : ""}`} key={m.item}>
          <label className="cond-measure-check" htmlFor={`${id}-${m.item}`}>
            <input type="checkbox" id={`${id}-${m.item}`} checked={m.checked} disabled={nationwide} onChange={() => patchMeasure(m.item, { checked: !m.checked })} />
            {m.label}
          </label>
          <input
            className="input cond-measure-value"
            value={m.value}
            inputMode="decimal"
            placeholder={nationwide ? "" : "값 입력"}
            disabled={nationwide}
            aria-label={`${m.label} 값 (${m.unit})`}
            // 숫자를 적으면 쓰겠다는 뜻이다 — 체크를 따로 누르게 하지 않는다
            onChange={(e) => patchMeasure(m.item, { value: e.target.value, checked: e.target.value.length > 0 })}
          />
          <span className="cond-measure-unit">{m.unit}</span>
        </div>
      ))}
    </>
  );

  return (
    <ExploreModal
      title="재난상황 조건"
      className="cond-modal"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={reset}>기본 조건으로 되돌리기</button>
          <button type="button" className="btn primary" onClick={apply}>적용</button>
        </>
      }
    >
      <div className="cond-field" role="group" aria-label="재난유형">
        <p className="cond-title">재난유형</p>
        <div className="cond-chips">
          {[null, ...COND_DISASTER_TYPES].map((t) => (
            <button key={t ?? "all"} type="button" className={`cond-chip${disasterType === t ? " is-on" : ""}`} aria-pressed={disasterType === t} onClick={() => edit(setType)(t)}>
              {disasterType === t && <Check />}
              {t ?? "전체"}
            </button>
          ))}
        </div>
      </div>

      <div className="cond-field" role="group" aria-label="발생기간">
        <div className="cond-title-row">
          <p className="cond-title">발생기간</p>
          {/* 때와 상관없는 물음이 많다(행동매뉴얼·위험지구·대피시설) — 한 달 창을 달아 보내면 그 밖의 것을 빼고 답한다. 끌 수 있어야 한다 */}
          <label className="cond-noperiod">
            <input type="checkbox" checked={noPeriod} onChange={(e) => edit(setNoPeriod)(e.target.checked)} />
            발생기간을 묻지 않음
          </label>
        </div>
        <p className="cond-hint">{noPeriod ? "기간을 걸지 않고 묻습니다. 적어 둔 날짜는 그대로 두었다가 체크를 풀면 다시 씁니다." : "YYYY.MM.DD 형식으로 입력하세요. 예: 2026.07.25"}</p>
        <div className={`cond-period${noPeriod ? " is-off" : ""}`}>
          <input className="input cond-date" value={fromDate} maxLength={10} aria-label="발생기간 시작 날짜" disabled={noPeriod} onChange={(e) => edit(setFromDate)(e.target.value)} />
          <select className="input cond-time" value={fromTime} aria-label="발생기간 시작 시각" disabled={noPeriod} onChange={(e) => edit(setFromTime)(e.target.value)}>
            {HOUR_OPTIONS.map((h) => <option key={h}>{h}</option>)}
          </select>
          <span className="cond-tilde" aria-hidden="true">~</span>
          <input className="input cond-date" value={toDate} maxLength={10} aria-label="발생기간 끝 날짜" disabled={noPeriod} onChange={(e) => edit(setToDate)(e.target.value)} />
          <select className="input cond-time" value={toTime} aria-label="발생기간 끝 시각" disabled={noPeriod} onChange={(e) => edit(setToTime)(e.target.value)}>
            {HOUR_OPTIONS.map((h) => <option key={h}>{h}</option>)}
          </select>
        </div>
        {error && <p className="cond-err" role="alert">{error}</p>}
      </div>

      <p className="cond-title cond-title--detail">상황 상세정보 (선택 입력)</p>
      <div className="cond-detail">
        <h3 className="cond-group">상황 성격</h3>
        <div className="cond-two">
          <label className="cond-pick">
            <span className="cond-sub">특보 종류</span>
            <select className="input" value={warningKind} onChange={(e) => edit(setKind)(e.target.value)}>
              <option value="">선택하세요</option>
              {COND_WARNING_KINDS.map((k) => <option key={k}>{k}</option>)}
            </select>
          </label>
          <label className="cond-pick">
            <span className="cond-sub">특보 단계</span>
            <select className="input" value={warningLevel} onChange={(e) => edit(setLevel)(e.target.value)}>
              <option value="">선택하세요</option>
              {COND_WARNING_LEVELS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </label>
        </div>
        <label className="cond-pick">
          <span className="cond-sub">피해·통제 키워드</span>
          <input className="input" value={keywords} placeholder="쉼표로 나눠 적습니다. 예: 침수, 지하차도" onChange={(e) => edit(setKw)(e.target.value)} />
        </label>

        <h3 className="cond-group">기상·수문 조건 (직접 입력)</h3>
        {nationwide && <p className="cond-hint cond-hint--blocked">기준지역이 전국이면 기상·수문 조건을 넣을 수 없습니다. 위쪽 기준지역에서 시·도를 고르세요.</p>}
        <div className="cond-two">
          <div className="cond-measures">{group("RAIN")}</div>
          <div className="cond-measures">{group("HYDRO")}{group("WEATHER")}</div>
        </div>
      </div>
    </ExploreModal>
  );
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="m3.5 8.5 3 3 6-6.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
