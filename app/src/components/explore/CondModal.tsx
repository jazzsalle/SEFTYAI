"use client";
import "./condModal.css";
import { useEffect, useId, useState } from "react";
import { useSession, type Cond } from "@/lib/session";
import { COND_DISASTER_TYPES, COND_GROUPS, COND_ITEMS, COND_WARNING_KINDS, COND_WARNING_LEVELS } from "@/lib/library";
import type { DisasterType } from "@/lib/contract/agent";

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
export function fromMeasures(ms: Measure[]): NonNullable<Cond["conditions"]> {
  return ms.filter(isFilled).map((m) => ({ item: m.item, label: m.label, value: Number(m.value), unit: m.unit }));
}

/** 「YYYY.MM.DD」 ↔ 세션 조건의 「YYYY-MM-DD」 */
const toDot = (v?: string) => (v ? v.replaceAll("-", ".") : "");
function parseDot(v: string): string | null {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}
/** 체크를 풀었을 때 띄울 기간 — 최근 한 달(개발서버 defaultConditions) */
function lastMonth() {
  const to = new Date();
  const from = new Date(to);
  from.setMonth(from.getMonth() - 1);
  const f = (d: Date) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  return { from: f(from), to: f(to) };
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
 * 재난상황 조건 (시안 「재난상황 조건」 · 질의 줄 [조건 변경]) — 개발서버 ConditionModal 복제(R54).
 * 재난유형 칩 · 발생기간(「발생기간을 묻지 않음」) · 상황 상세정보(특보 종류·단계 · 피해·통제 키워드 · 기상·수문 9줄 체크+값).
 * 적용하기 전까지는 바깥 조건을 건드리지 않는다. 상세정보는 모두 선택 입력 — 비워 두면 그 칸은 상류로 나가지 않는다.
 * 우리 것으로 남긴 것: 기준시각(query_context.reference_time) 칸, 발생기간은 날짜 단위(시각 칸 없음 — 세션 조건·질문 프리셋이 날짜라서)
 */
export default function CondModal({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const id = useId();
  const c = s.cond;
  const nationwide = !c.base;
  const month = lastMonth();
  const [disasterType, setType] = useState<string | null>(c.disasterType && c.disasterType !== "전체" ? c.disasterType : null);
  const [referenceTime, setRef] = useState(c.referenceTime);
  const [noPeriod, setNoPeriod] = useState(!c.periodFrom && !c.periodTo);
  const [from, setFrom] = useState(toDot(c.periodFrom) || month.from);
  const [to, setTo] = useState(toDot(c.periodTo) || month.to);
  const [warningKind, setKind] = useState(c.warningKind ?? "");
  const [warningLevel, setLevel] = useState(c.warningLevel ?? "");
  const [keywords, setKw] = useState((c.keywords ?? []).join(", "));
  const [measures, setMeasures] = useState<Measure[]>(() => toMeasures(c));
  const [error, setError] = useState<string | null>(null);

  const patchMeasure = (item: string, change: Partial<Measure>) => setMeasures((ms) => ms.map((m) => (m.item === item ? { ...m, ...change } : m)));
  const reset = () => {
    // 기준지역은 바뀌지 않는다
    setType(null);
    setRef(undefined);
    setNoPeriod(true);
    setFrom(month.from);
    setTo(month.to);
    setKind("");
    setLevel("");
    setKw("");
    setMeasures(toMeasures({}));
    setError(null);
  };
  const apply = () => {
    let periodFrom: string | undefined;
    let periodTo: string | undefined;
    if (!noPeriod) {
      const f = parseDot(from);
      const t = parseDot(to);
      if (!f || !t) return setError("발생기간을 YYYY.MM.DD 형식으로 입력하세요.");
      if (f > t) return setError("발생기간의 시작이 끝보다 뒤입니다.");
      periodFrom = f;
      periodTo = t;
    }
    const kw = keywords.split(",").map((x) => x.trim()).filter(Boolean);
    const conditions = nationwide ? [] : fromMeasures(measures);
    // 지역은 그대로 두고 조건 칸은 모두 이 값으로 바꾼다(비운 칸은 undefined 로 — 이전 값이 남지 않게)
    s.setCond({
      disasterType: (disasterType ?? undefined) as DisasterType | undefined, referenceTime, periodFrom, periodTo,
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
    <div className="modal-bg" role="dialog" aria-modal="true" aria-label="재난상황 조건" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="modal cond-modal" style={{ width: 720 }}>
        <div className="modal-h"><b>재난상황 조건</b><span className="sp" /><button className="lnk" onClick={onClose} aria-label="닫기">×</button></div>

        <div className="cond-field" role="group" aria-label="재난유형">
          <p className="cond-title">재난유형</p>
          <div className="cond-chips">
            {[null, ...COND_DISASTER_TYPES].map((t) => (
              <button key={t ?? "all"} type="button" className={`cond-chip${disasterType === t ? " is-on" : ""}`} aria-pressed={disasterType === t} onClick={() => { setType(t); setError(null); }}>
                {disasterType === t && <Check />}
                {t ?? "전체"}
              </button>
            ))}
          </div>
        </div>

        <div className="cond-field" role="group" aria-label="발생기간">
          <div className="cond-title-row">
            <p className="cond-title">발생기간</p>
            <label className="cond-noperiod">
              <input type="checkbox" checked={noPeriod} onChange={(e) => { setNoPeriod(e.target.checked); setError(null); }} />
              발생기간을 묻지 않음
            </label>
          </div>
          <p className="cond-hint">{noPeriod ? "기간을 걸지 않고 묻습니다. 적어 둔 날짜는 그대로 두었다가 체크를 풀면 다시 씁니다." : "YYYY.MM.DD 형식으로 입력하세요. 예: 2026.07.25"}</p>
          <div className={`cond-period${noPeriod ? " is-off" : ""}`}>
            <input className="input cond-date" value={from} maxLength={10} aria-label="발생기간 시작 날짜" disabled={noPeriod} onChange={(e) => { setFrom(e.target.value); setError(null); }} />
            <span className="cond-tilde" aria-hidden="true">~</span>
            <input className="input cond-date" value={to} maxLength={10} aria-label="발생기간 끝 날짜" disabled={noPeriod} onChange={(e) => { setTo(e.target.value); setError(null); }} />
          </div>
          {error && <p className="cond-err" role="alert">{error}</p>}
        </div>

        <div className="cond-field" role="group" aria-label="기준시각">
          <p className="cond-title">기준시각</p>
          <input className="input" type="datetime-local" aria-label="기준시각" value={referenceTime?.slice(0, 16) ?? ""} onChange={(e) => setRef(e.target.value ? `${e.target.value}:00+09:00` : undefined)} />
          <p className="cond-hint">비워 두면 지금 시각으로 묻습니다.</p>
        </div>

        <p className="cond-title cond-title--detail">상황 상세정보 (선택 입력)</p>
        <div className="cond-detail">
          <h3 className="cond-group">상황 성격</h3>
          <div className="cond-two">
            <label className="cond-pick">
              <span className="cond-sub">특보 종류</span>
              <select className="input" value={warningKind} onChange={(e) => setKind(e.target.value)}>
                <option value="">선택하세요</option>
                {COND_WARNING_KINDS.map((k) => <option key={k}>{k}</option>)}
              </select>
            </label>
            <label className="cond-pick">
              <span className="cond-sub">특보 단계</span>
              <select className="input" value={warningLevel} onChange={(e) => setLevel(e.target.value)}>
                <option value="">선택하세요</option>
                {COND_WARNING_LEVELS.map((l) => <option key={l}>{l}</option>)}
              </select>
            </label>
          </div>
          <label className="cond-pick">
            <span className="cond-sub">피해·통제 키워드</span>
            <input className="input" value={keywords} placeholder="쉼표로 나눠 적습니다. 예: 침수, 지하차도" onChange={(e) => setKw(e.target.value)} />
          </label>

          <h3 className="cond-group">기상·수문 조건 (직접 입력)</h3>
          {nationwide && <p className="cond-hint cond-hint--blocked">기준지역이 전국이면 기상·수문 조건을 넣을 수 없습니다. 위쪽 기준지역에서 시·도를 고르세요.</p>}
          <div className="cond-two">
            <div className="cond-measures">{group("RAIN")}</div>
            <div className="cond-measures">{group("HYDRO")}{group("WEATHER")}</div>
          </div>
          <p className="cond-hint">입력한 값은 사용자 입력 조건으로 함께 보냅니다(실시간 관측·특보 아님). {s.weather?.realtimeCut ? "특보는 상단 특보 줄을 쓰세요." : "실시간 특보는 상단 기상특보(기상청)를 쓰세요."}</p>
        </div>

        <div className="modal-f">
          <button type="button" className="btn" onClick={reset}>기본 조건으로 되돌리기</button>
          <span className="sp" />
          <button type="button" className="btn" onClick={onClose}>취소</button>
          <button type="button" className="btn primary" onClick={apply}>적용</button>
        </div>
      </div>
    </div>
  );
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="m3.5 8.5 3 3 6-6.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
