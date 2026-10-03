"use client";
/** 시작 화면 (목업 SCR-UNE-101001) — 재난상황 조건 브리핑 카드 + 브리핑 질문 4 (내 브리핑 항목에서 접속할 때마다 무작위) */
import { useSession } from "@/lib/session";
import { useExplore } from "./ExploreCtx";
import { IcChevR } from "../Icons";
import { WX_INFO_Q, WX_QQ, advLabel } from "@/lib/wxref";
import { condChips } from "./Composer";
import { REGIONS } from "@/lib/config";
import { BRIEF_START_COUNT, useRandomBrief } from "@/lib/briefing";

export default function StartScreen({ onBriefing, onLibrary }: { onBriefing: () => void; onLibrary: () => void }) {
  const { cond, wxRef, aimOn } = useSession();
  const brief = useRandomBrief(BRIEF_START_COUNT);
  const x = useExplore();
  // 특보를 참조로 걸었으면 그 특보의 빠른질의, 아니면 내 브리핑 항목에서 무작위 4개
  const qs: { k: string; q: string; p?: string }[] = wxRef ? [...WX_QQ.map((x) => ({ k: x.nm, q: x.q, p: x.k })), { k: WX_INFO_Q.nm, q: WX_INFO_Q.q, p: WX_INFO_Q.k }] : brief.map((b) => ({ k: b.label, q: b.q, p: b.preset }));
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
        <div className="row"><h3 style={{ fontSize: "var(--fs-s)" }}>{wxRef ? `${advLabel(wxRef)} 빠른질의` : "브리핑 질문"}</h3><span className="sp" /><button className="btn xs ghost" onClick={onLibrary}>더보기 ›</button></div>
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
