"use client";
/** 시작 화면 (목업 SCR-UNE-101001) — 재난상황 조건 브리핑 카드 + 추천 질문 4 */
import { useSession } from "@/lib/session";
import { useExplore } from "./ExploreCtx";
import { IcChevR } from "../Icons";
import { WX_INFO_Q, WX_QQ, advLabel } from "@/lib/wxref";
import { condChips } from "./Composer";
import { REGIONS } from "@/lib/config";

const ALERT_Q = [
  { k: "상황 판단", q: "지금 상황에서 비상 몇 단계이고, 대책본부 가동·중앙 보고가 필요한가요?" },
  { k: "위험·취약지역", q: "우리 지역의 급경사지 붕괴위험지역은?" },
  { k: "유사재난 사례", q: "2020년 7월 23일 집중호우 때 어떤 대응조치를 했나요?" },
  { k: "행동매뉴얼", q: "이 상황에서 행동매뉴얼상 확인해야 할 대응절차는?" },
];
const CALM_Q = [
  { k: "유사재난 사례", q: "비슷한 강우 때 과거에 어디가 침수됐나요?" },
  { k: "위험·취약지역", q: "평시에 점검해야 할 위험·취약지역은 어디인가요?" },
  { k: "잠재 위험요소·취약시설", q: "과거에 통제했던 도로·지하차도는 어디인가요?" },
  { k: "계획지식", q: "과거 피해가 반복된 곳 중 아직 정비되지 않은 위험지구는?" },
];

export default function StartScreen({ onBriefing, onLibrary }: { onBriefing: () => void; onLibrary: () => void }) {
  const { weather, cond, wxRef, aimOn } = useSession();
  const x = useExplore();
  const active = (weather?.advisories ?? []).some((a) => a.status === "발효" && (cond.region === "national" || a.regionId === cond.region));
  const qs: { k: string; q: string; p?: string }[] = wxRef ? [...WX_QQ.map((x) => ({ k: x.nm, q: x.q, p: x.k })), { k: WX_INFO_Q.nm, q: WX_INFO_Q.q, p: WX_INFO_Q.k }] : aimOn && active ? ALERT_Q : CALM_Q;
  // 브리핑에 쓰일 조건 (AI 모드 = 현재 특보 · 그 외 = 입력 조건 + 참조 특보)
  const chips = [...(cond.disasterType ? [cond.disasterType] : []), ...(cond.scenarioTitle ? [`시나리오 · ${cond.scenarioTitle.split(" · ")[1] ?? cond.scenarioTitle}`] : []), ...condChips(cond).map((c) => c.t)];
  const basis = aimOn ? ["AI 모드 · 현재 발효 특보"] : [...(wxRef ? [`참조 특보 · ${wxRef.area} ${advLabel(wxRef)}`] : []), ...chips];
  return (
    <div className="start" style={{ maxWidth: 760, margin: "0 auto" }}>
      <div className="hero" style={{ margin: "40px 0 34px" }}>
        <div className="kicker">재난안전 AI 에이전트</div>
        <h1>어떤 재난상황을 살펴볼까요?</h1>
      </div>
      <section className="brief-card">
        <div className="bd">
          <div style={{ flex: 1 }}>
            <h2>재난상황 조건 브리핑</h2>
            <p>입력한 재난상황 조건(재난유형·기간·강우·수위 등)과 참조한 특보로 지금 필요한 정보를 한 번에 정리합니다.</p>
            <p className="xs" style={{ marginTop: 6 }}>
              적용 조건 :{" "}
              {basis.length ? basis.map((b) => <span key={b} className="pill" style={{ marginRight: 4 }}>{b}</span>) : <span className="mute2">입력된 조건 없음 — 기준지역({REGIONS[cond.region].name}{cond.sigungu ? ` ${cond.sigungu}` : ""}{cond.emd ? ` ${cond.emd}` : ""}) 평시 현황으로 정리합니다</span>}
            </p>
          </div>
          <button className="btn pri lg" onClick={onBriefing}>브리핑 시작 <IcChevR size={14} /></button>
        </div>
        <div className="ft">포함 항목<b>현재 기상상황 · 위험·취약지역 · 과거 유사사례 · 행동매뉴얼 대응절차</b></div>
      </section>
      <div className="sugg">
        <div className="row"><h3 style={{ fontSize: "var(--fs-s)" }}>{wxRef ? `${advLabel(wxRef)} 빠른질의` : "추천 질문"}</h3><span className="sp" /><button className="btn xs ghost" onClick={onLibrary}>더보기 ›</button></div>
        <div className="sugg-grid" style={{ marginTop: 10 }}>
          {qs.map((s) => (
            <button key={s.q} className="sugg-card" onClick={() => x.ask(s.q, s.p)}>
              <span className="col"><span className="k">{s.k}</span><span className="q">{s.q}</span></span>
              <span className="arr"><IcChevR /></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
