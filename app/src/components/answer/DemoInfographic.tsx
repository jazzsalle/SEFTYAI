"use client";
import "./demoInfo.css";
import "./autoInfo.css";
import type { ReactNode } from "react";
import type { JobSummary } from "@/lib/jobTypes";
import { DEMO_SHOW, type ShowItem } from "@/lib/library";
import { Fig, Headline } from "./infoBits";
import InfoMapSvg, { type MapLabel } from "./InfoMapSvg";
import type { MapShape } from "./infoMap";
import { IcCalendar, IcEvacuate, IcGate, IcGauge, IcHouseFlood, IcLandmark, IcNews, IcPump, IcRain, IcRecovery, IcRiver, IcRoadBlock, IcSlope, IcSms, IcTide, IcUnderpass, IcWarning } from "./infoIcons";
import { ONCHEON_RING, ONCHEON_SPOTS } from "./oncheon";

/**
 * 시연 자료(인포그래픽) — 11/2 행안부 회의 코멘트(미리 만든 인포그래픽을 먼저 띄우고 AI 답이 설명, 사건 중심·지구 기반 연계 예시)로 추가(사용자 승인 2026-11-02).
 * 모양은 사용자가 준 참고 그림(행안부·언론 그래픽)의 문법 — 띠 제목·큰 숫자·날짜 칩+지도·지도 위 말풍선·단색 아이콘 타일·역대 비교 막대.
 * 질문 모음 「시연」 탭 항목의 답 카드에만 붙고, T3Q 답 글·답변 대상은 손대지 않는다(응답 무가공).
 * 그림의 숫자·이름은 모두 미리 받아 둔 고정 답 본문에 있는 값 그대로(출처 질문 번호를 그림마다 적는다) — 유엔이가 센 값·추정값 없음. 빨강 없음.
 */

/** 이 작업이 시연 항목이면 그 항목 — 시연 탭에서 누르면 library_id, 브리핑으로 보내면 질문 글이 같다(explore showPin 과 같은 규칙) */
export function demoItemOf(job: Pick<JobSummary, "library_id" | "question_user">): ShowItem | undefined {
  if (job.library_id?.startsWith("SH-")) return DEMO_SHOW.find((d) => d.id === job.library_id);
  const q = job.question_user.trim();
  return DEMO_SHOW.find((d) => d.text === q);
}

/** 항목 → 그림 목록. 없는 항목(1-4 하천기본계획·2-7 대응절차·2-9 캠핑장)은 패널이 없다 */
const FIGURES: Record<string, (() => ReactNode)[]> = {
  "SH-1-1": [RainCompare, () => <Underpasses />],
  "SH-1-2": [() => <OncheonMap />],
  "SH-1-3": [Chronicle, WhyFlood],
  "SH-2-1": [() => <OncheonMap />],
  "SH-2-5": [() => <Underpasses withMap />],
  "SH-2-6": [Event2020, DataMatrix],
  "SH-2-7": [Event2020],
  "SH-2-2": [RainCompare],
  "SH-2-3": [WhyFlood, RainCompare],
  "SH-2-4": [() => <OncheonMap />],
  "SH-2-9": [DataMatrix],
};

export function hasDemoInfographic(job: Pick<JobSummary, "library_id" | "question_user">) {
  const it = demoItemOf(job);
  return !!it && !!FIGURES[it.id];
}

/** 답 본문 위에 먼저 보이는 접이식 패널 */
export default function DemoInfoPanel({ job }: { job: Pick<JobSummary, "library_id" | "question_user"> }) {
  const it = demoItemOf(job);
  const figs = it ? FIGURES[it.id] : undefined;
  if (!it || !figs) return null;
  return (
    <details className="demo-info" open>
      <summary>
        <b>시연 자료</b> <span className="xs muted">미리 만든 그림({it.scene} {it.title}) · 아래 답은 에이전트 응답 그대로</span>
      </summary>
      <div className="viz demo-info-body">
        {figs.map((F, i) => (
          <F key={i} />
        ))}
      </div>
    </details>
  );
}

// ── ① 온천천 침수 연대기 (답 1-3 · 2-3) — 날짜 칩 목록(참고 그림 「특별재난지역 선포 사례」 문법) ──
const EVENTS = [
  { when: "2014.8.25", tag: "하천 범람", tone: "a", rain: "시우량 최대 130mm(금정구) · 일 244mm", area: "침수 약 2.63㎢ · 38개 조사지구", why: "온천천 계획홍수위 초과 → 하천 범람 · 저지대 우수관거 배수 차단" },
  { when: "2017.9.11", tag: "내수침수", tone: "b", rain: "시우량 80mm 이상(출근 시간대)", area: "침수 약 12.3만㎡ · 5개 조사지구", why: "저지대 내수 배제 불량 · 하수관로 통수단면 부족" },
  { when: "2020.7.23~24", tag: "내수침수 · 만조", tone: "b", rain: "시우량 80~86mm · 일 210mm 이상 · 만조(22:30 전후) 중첩", area: "침수 약 17.2만㎡ · 32개 흔적지구", why: "만조로 수영강 수위 상승 + 온천천 유입 → 수문 폐쇄 · 펌프 용량 초과 내수침수" },
  { when: "2021.8.23~24", tag: "내수침수", tone: "b", rain: "단시간 집중호우", area: "연산동 105-1 일원 28,441㎡", why: "단시간 집중호우에 따른 내수침수" },
  { when: "2024.9.20~21", tag: "내수침수 · 방재시설", tone: "b", rain: "시우량 40~60mm · 일 200~300mm 이상", area: "침수 약 18.7만㎡ · 12개 흔적지구", why: "도시 배수시설 설계용량 초과 → 방재시설 용량 부족 내수침수" },
] as const;
function Chronicle() {
  return (
    <Fig title="온천천 침수 연대기" src="값 출처: 답 1-3 · 2-3" label="2014년부터 2024년까지 온천천 집중호우 침수 사건의 강우량·침수면적·원인">
      <Headline items={[
        { v: "130", unit: "mm/h", lb: "2014.8.25 시우량 최대(금정구)", icon: <IcRain /> },
        { v: "2.63", unit: "㎢", lb: "2014년 침수면적(38개 지구)", icon: <IcHouseFlood /> },
        { v: "18.7", unit: "만㎡", lb: "2024년 침수면적(12개 지구)", icon: <IcHouseFlood /> },
      ]} />
      <ol className="di-chron">
        {EVENTS.map((e) => (
          <li key={e.when}>
            <div className={`di-chip t-${e.tone}`}><IcCalendar size={14} />{e.when}</div>
            <div className="di-chron-body">
              <div className="di-chron-top"><span className={`di-tag t-${e.tone}`}>{e.tag}</span><span className="di-chron-area">{e.area}</span></div>
              <div className="di-chron-rain">{e.rain}</div>
              <div className="xs muted">{e.why}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="di-legend xs"><span className="di-tag t-a">하천 범람(외수)</span><span className="di-tag t-b">내수침수</span></div>
    </Fig>
  );
}

// ── ② 온천천 한 장 지도 (답 2-1 · 좌표는 공간 API geo 그대로) — 번호 표지 + 말풍선 값 + 지도 위 띠 ──
const RIVER: MapShape = { ref: "river", kind: "area", paths: [ONCHEON_RING] };
const SPOT_SHAPES: MapShape[] = ONCHEON_SPOTS.map((s) => ({ ref: s.id, kind: "point", paths: [[s.c]], precision: "dong_center" }));
/** 번호는 답 2-1 순서 — ① 연산교 ② 안락2 ③ 토곡·거제 ④ 지하차도. 말풍선 값은 답 2-1·2-3 본문 */
const SPOT_LABELS: Record<string, MapLabel> = {
  "HZ-6793": { num: "①", name: "연산교 일원", sub: "홍수취약지구 온천천-1" },
  "HZ-1564": { num: "②", name: "안락2", sub: "2020년 22,886㎡" },
  "HZ-1582": { num: "③", name: "토곡", sub: "2024년 20,467㎡" },
  "HZ-1581": { num: "③", name: "거제", sub: "2024년 25,253㎡" },
  "UP-636": { num: "④", name: "내성·우장춘", sub: "통제 5.0cm", tone: "b" },
  "UP-628": { num: "④", name: "구서", sub: "통제 5.0cm", tone: "b" },
  "UP-630": { num: "④", name: "장전①②", sub: "통제 5.0cm", tone: "b" },
};
function labelsOf(only?: "지하차도") {
  const m = new Map<string, MapLabel>();
  for (const s of ONCHEON_SPOTS) {
    if (only && s.kind !== only) continue;
    const l = SPOT_LABELS[s.id];
    if (l) m.set(s.id, l);
  }
  // 같은 좌표에 모이는 점(안락2=연산교=안락지하차도 · 장전①=② · 내성=우장춘)은 대표 하나만 이름을 적는다
  if (!only) { m.set("UP-637", { num: "④", name: "", tone: "b" }); }
  else { m.set("UP-637", { num: "④", name: "안락", sub: "통제 5.0cm", tone: "b" }); }
  return m;
}
function OncheonMap() {
  return (
    <Fig title="온천천 유역 — 먼저 볼 곳 네 가지" src="값 출처: 답 2-1 · 2-2 · 2-3" label="온천천 물길과 연산교 합류부, 안락2·토곡·거제 위험개선지구, 지하차도 위치를 번호로 표시한 지도"
      foot="지점 위치는 공간정보 조회가 준 동 중심(근사) 좌표 그대로 — 같은 동은 표지가 겹친다. 기준 관측소 부산시(세병교)는 좌표가 없어 글로만.">
      <div className="di-maphead">
        <span className="di-mh warn"><IcWarning size={18} />호우 예비특보 · 부산광역시</span>
        <span className="di-mh cond"><IcRain size={18} />가정 1시간 30mm</span>
        <span className="di-mh"><IcGauge size={18} />기준 관측소 부산시(세병교)</span>
        <span className="di-mh"><IcTide size={18} />만조 중첩 주의</span>
      </div>
      <div className="im-wrap">
        <InfoMapSvg shapes={[RIVER, ...SPOT_SHAPES]} labels={labelsOf()} width={300} maxH={460} />
        <ol className="di-map-legend">
          <li><b className="t-a">①</b><IcRiver size={16} /> 연산교 일원 — 온천천·수영강 합류부, 국가하천 온천천 홍수취약지구(온천천-1)</li>
          <li><b className="t-a">②</b><IcLandmark size={16} /> 안락2(안락서원) — 자연재해위험개선지구 침수위험 나등급(2022년 지정), 2014년 약 11.9만㎡·2020년 22,886㎡ 침수</li>
          <li><b className="t-a">③</b><IcHouseFlood size={16} /> 토곡(2023년 지정)·거제 — 연제구 상습 내수침수 저지대, 2024년 연서초 61,883㎡·교대역 아래 48,529㎡·거제역 아래 25,253㎡</li>
          <li><b className="t-b">④</b><IcUnderpass size={16} /> 지하차도 — 내성·우장춘(온천동), 구서(구서동), 장전①②(장전동), 안락(안락동) · 통제 침수심 5.0cm</li>
          <li className="muted"><IcGauge size={16} /> 세병교 수위 — 산책로 차단 약 1.5~1.8m, 하상도로 통제 약 2.45m</li>
        </ol>
      </div>
    </Fig>
  );
}

// ── ③ 왜 잠기나 (답 1-3 원인 분석) — 아이콘 흐름 ──
const WHY: { t: string; ic: ReactNode }[] = [
  { t: "금정산 등 급경사 유출 30분~1시간 안에 본류 도달", ic: <IcSlope /> },
  { t: "온천천 본류 수위 급상승", ic: <IcRiver /> },
  { t: "수영강 합류부 배수위 · 만조 중첩", ic: <IcTide /> },
  { t: "제방 배수문 폐쇄(역류 방지)", ic: <IcGate /> },
  { t: "저지대 우수 펌프 용량 초과", ic: <IcPump /> },
  { t: "주택·상가·지하차도 내수침수", ic: <IcHouseFlood /> },
];
function WhyFlood() {
  return (
    <Fig title="왜 잠기나 — 온천천 침수 흐름" src="값 출처: 답 1-3" label="급경사 유출부터 저지대 내수침수까지 여섯 단계 흐름" tone="b">
      <ol className="di-flow">
        {WHY.map((w, i) => (
          <li key={i}><span className="di-flow-n">{i + 1}</span><span className="di-flow-ic">{w.ic}</span>{w.t}</li>
        ))}
      </ol>
    </Fig>
  );
}

// ── ④ 2020.7.23 사건 카드 (답 2-3) — 큰 숫자 + 아이콘 네 칸 ──
function Event2020() {
  return (
    <Fig title="사건 하나로 보기 — 2020년 7월 23~24일 집중호우" src="값 출처: 답 2-3" label="2020년 7월 23일 집중호우의 기상, 침수 지구, 대응 조치, 연계 예정 자료" tone="c"
      foot="회색 칸은 행안부가 제공한 자료를 확보해 둔 것 — 지구(주소) 기준으로 연결 예정, 지금 답에는 들어 있지 않음.">
      <Headline items={[
        { v: "80~86", unit: "mm/h", lb: "시우량", icon: <IcRain /> },
        { v: "210", unit: "mm 이상", lb: "일 누적", icon: <IcRain /> },
        { v: "22:30", lb: "만조 전후 · 폭우 중첩", icon: <IcTide /> },
        { v: "0.5~1.3", unit: "m", lb: "침수심", icon: <IcHouseFlood /> },
      ]} />
      <div className="di-ev">
        <section>
          <h4><IcHouseFlood size={18} />침수 지구</h4>
          <ul><li>연제구 거제동 1471 일원 <b>16,914㎡</b></li><li>연제구 연산동 310·402·1515 일원 <b>10,980㎡</b></li><li>동래구 안락동 425-54 일원 <b>22,887㎡</b></li><li>장전동 농구장 사면 600㎡ 파손</li></ul>
        </section>
        <section>
          <h4><IcEvacuate size={18} />대응 조치</h4>
          <ul><li>산책로 선제 전면 통제·대피 방송</li><li>세병교·수연교·연안교 하상도로 차단</li><li>빗물펌프장 조기 가동 · 차수판·모래주머니</li><li>재난문자로 주민 대피 유도</li></ul>
        </section>
        <section className="pending">
          <h4><IcLandmark size={18} />연계 예정 자료</h4>
          <ul className="di-ev-icons">
            <li><IcRecovery size={22} />피해 복구 자료</li>
            <li><IcSms size={22} />재난문자 발송 이력</li>
            <li><IcRoadBlock size={22} />교통 돌발·통제 정보</li>
            <li><IcNews size={22} />언론 보도</li>
          </ul>
        </section>
      </div>
    </Fig>
  );
}

// ── ⑤ 역대 비교 가로막대 + 세병교 수위 (답 1-3 · 2-4 · 1-1) ──
const RAIN_MAX = 140;
/** 과거 사건 시우량(받은 값) — 큰 순으로 놓은 비교 막대, 가정값은 노랑 */
const RAIN_ROWS = [
  { lb: "2014년 8월 25일", a: 130, b: 130, txt: "130mm" },
  { lb: "2020년 7월 23일", a: 80, b: 86, txt: "80~86mm" },
  { lb: "2017년 9월 11일", a: 80, b: 80, txt: "80mm 이상" },
  { lb: "2024년 9월 20일", a: 40, b: 60, txt: "40~60mm" },
  { lb: "지금 가정", a: 30, b: 30, txt: "30mm", now: true },
];
const LEVEL_MAX = 3;
const LEVEL_MARKS = [
  { lb: "산책로 차단 약 1.5~1.8m", a: 1.5, b: 1.8 },
  { lb: "하상도로 통제 약 2.45m", a: 2.45, b: 2.45 },
];
function RainCompare() {
  return (
    <Fig title="지금 가정한 비는 과거 어디쯤인가" src="값 출처: 답 1-3 · 2-4 · 1-1" label="시간당 강우량을 과거 사건과 비교한 가로막대와 세병교 수위 기준">
      <div className="di-gauge-lb"><IcRain size={16} /> 1시간 강우량(mm) — 과거 사건과 비교</div>
      <div className="di-bars">
        {RAIN_ROWS.map((r) => (
          <div key={r.lb} className={`di-bar-row ${r.now ? "now" : ""}`}>
            <span className="di-bar-lb">{r.lb}</span>
            <span className="di-bar-track">
              <span className="di-bar" style={{ width: `${(r.b / RAIN_MAX) * 100}%` }} />
              {r.b > r.a && <span className="di-bar rng" style={{ left: `${(r.a / RAIN_MAX) * 100}%`, width: `${((r.b - r.a) / RAIN_MAX) * 100}%` }} />}
              <span className="di-bar-v" style={{ left: `${(r.b / RAIN_MAX) * 100}%` }}>{r.txt}</span>
            </span>
          </div>
        ))}
        <div className="di-bar-axis">{[0, 30, 60, 90, 120, 140].map((t) => <span key={t} style={{ left: `${(t / RAIN_MAX) * 100}%` }}>{t}</span>)}</div>
      </div>
      <div className="di-gauge-lb"><IcGauge size={16} /> 세병교 관측소 수위(m) — 통제 기준</div>
      <div className="di-gauge">
        <div className="di-gauge-track">
          {LEVEL_MARKS.map((m) => (
            <div key={m.lb} className="di-gauge-mk" style={{ left: `${(m.a / LEVEL_MAX) * 100}%`, width: `${Math.max(((m.b - m.a) / LEVEL_MAX) * 100, 0.6)}%` }}><span>{m.lb}</span></div>
          ))}
        </div>
        <div className="di-gauge-axis">{[0, 1, 2, 3].map((t) => <span key={t} style={{ left: `${(t / LEVEL_MAX) * 100}%` }}>{t}m</span>)}</div>
      </div>
      <ul className="di-rules xs">
        <li>30mm/h 이상이면 30분 안에 세병교 수위 1m 이상 급상승 가능 → 산책로 예비 통제</li>
        <li>호우주의보 3시간 60mm·12시간 110mm / 호우경보 3시간 90mm·12시간 180mm</li>
        <li>지하차도 진입 차단 기준 침수심 5.0cm</li>
      </ul>
    </Fig>
  );
}

// ── ⑥ 지하차도 6곳 (답 2-2 표 · 1-1) ──
const UNDER = [
  { name: "구서지하차도", where: "금정구 구서동", near: "온천천 500m 안", shape: "U자형", mgmt: "인명피해우려지역" },
  { name: "장전지하차도(1)", where: "금정구 장전동", near: "온천천 500m 안", shape: "U자형", mgmt: "차단시설 운영" },
  { name: "장전지하차도(2)", where: "금정구 장전동", near: "온천천 500m 안", shape: "박스구간", mgmt: "인명피해우려지역" },
  { name: "내성지하차도", where: "동래구 온천동", near: "온천천 500m 안", shape: "U자형", mgmt: "인명피해우려지역" },
  { name: "우장춘지하차도", where: "동래구 온천동", near: "배후 연결도로", shape: "U자형", mgmt: "인명피해우려지역" },
  { name: "안락지하차도", where: "동래구 안락동", near: "하류 합류권역", shape: "U자형", mgmt: "인명피해우려지역" },
];
function Underpasses({ withMap }: { withMap?: boolean }) {
  return (
    <Fig title="온천천 인접 지하차도 6곳 — 통제 침수심 5.0cm" src="값 출처: 답 2-2 · 1-1" label="온천천 인접 지하차도 여섯 곳의 위치, 구조, 관리 구분" tone="b">
      <div className="di-under-wrap">
        {withMap && <InfoMapSvg shapes={[RIVER, ...SPOT_SHAPES.filter((s) => s.ref?.startsWith("UP-"))]} labels={labelsOf("지하차도")} small width={110} maxH={220} />}
        <ul className="di-under">
          {UNDER.map((u) => (
            <li key={u.name}>
              <b><IcUnderpass size={18} />{u.name}</b>
              <span>{u.where} · {u.near}</span>
              <span className="xs muted">{u.shape} · {u.mgmt}</span>
            </li>
          ))}
        </ul>
      </div>
    </Fig>
  );
}

// ── ⑦ 지구 × 자료 보유표 (답 1-2 · 1-4 · 2-3 · 행안부 제공 자료 목록) ──
const COLS: { lb: string; ic: ReactNode }[] = [
  { lb: "침수흔적", ic: <IcHouseFlood size={16} /> }, { lb: "위험지구 지정", ic: <IcLandmark size={16} /> }, { lb: "하천기본계획", ic: <IcRiver size={16} /> },
  { lb: "피해 복구", ic: <IcRecovery size={16} /> }, { lb: "재난문자", ic: <IcSms size={16} /> }, { lb: "교통 돌발", ic: <IcRoadBlock size={16} /> }, { lb: "언론 보도", ic: <IcNews size={16} /> },
];
const ROWS: { name: string; has: boolean[] }[] = [
  { name: "연산교 일원(합류부)", has: [false, true, true, false, false, false, false] },
  { name: "안락2(안락서원)", has: [true, true, true, false, false, false, false] },
  { name: "토곡", has: [true, true, true, false, false, false, false] },
  { name: "거제", has: [true, true, true, false, false, false, false] },
  { name: "장전(장전1~5지구)", has: [true, false, true, false, false, false, false] },
];
function DataMatrix() {
  return (
    <Fig title="지구별로 모아 보기 — 지금 답에 나온 것 · 연결 예정인 것" src="값 출처: 답 1-2 · 1-4 · 2-3" label="온천천 주요 지구별로 어떤 자료가 답에 나왔고 어떤 자료가 연결 예정인지 표" tone="c"
      foot="● 지금 답에 나옴 · ○ 행안부 제공 자료 확보, 지구(주소) 기준 연결 예정 — 상습침수지역·피해데이터, 지하차도·캠핑장, 복구·재난문자, 교통돌발정보, 침수흔적도, 홍수취약지구">
      <table className="di-matrix">
        <thead>
          <tr><th>지구</th>{COLS.map((c) => <th key={c.lb}><span className="di-th">{c.ic}{c.lb}</span></th>)}</tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.name}>
              <th>{r.name}</th>
              {r.has.map((h, i) => <td key={i} className={h ? "on" : "off"}>{h ? "●" : "○"}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </Fig>
  );
}
