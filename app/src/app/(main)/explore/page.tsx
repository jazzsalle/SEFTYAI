"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Advisory, AgentResponse, Citation, EntityRef, QueryContext, RegionId } from "@/lib/contract/agent";
import { useSession, uid, logTrace, type Conversation, type Turn } from "@/lib/session";
import { ExploreContext, type ExploreApi, type PanelTab } from "@/components/explore/ExploreCtx";
import AnswerView from "@/components/explore/AnswerView";
import Composer, { type ScenarioItem } from "@/components/explore/Composer";
import StartScreen from "@/components/explore/StartScreen";
import { advLabel, advTone } from "@/lib/wxref";
import { REGIONS } from "@/lib/config";
import RightPanel from "@/components/explore/RightPanel";
import AimOverlay from "@/components/explore/AimOverlay";
import LibraryDrawer from "@/components/explore/LibraryDrawer";
import { IcEdit, IcList, IcMap, IcPlus } from "@/components/Icons";

const LOADING_STEPS = ["질문과 재난상황 조건 해석", "재난안전 데이터 조회", "매뉴얼·계획문서 근거 확인", "답변 구성"];

function Loading() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((v) => Math.min(v + 1, LOADING_STEPS.length - 1)), 380);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="acard">
      <ul className="steps-loading">
        {LOADING_STEPS.map((s, i) => (
          <li key={s} className={i < n ? "done" : ""} style={{ opacity: i > n ? 0.35 : 1 }}>{i < n ? "✓" : i === n ? <span className="spin" /> : "·"} {s}</li>
        ))}
      </ul>
    </div>
  );
}

interface AskOpts { region?: RegionId; baseTime?: string; prev?: string; scenario?: ScenarioItem; ref?: EntityRef | null; wx?: Advisory | null; aim?: boolean }

function Explore() {
  const s = useSession();
  const router = useRouter();
  const sp = useSearchParams();
  const [conv, setConvS] = useState<Conversation | null>(null);
  const convRef = useRef<Conversation | null>(null);
  const setConv = (c: Conversation | null) => { convRef.current = c; setConvS(c); };
  const lastFocus = useRef<EntityRef | null>(null);
  const [tabs, setTabs] = useState<PanelTab[]>([]);
  const [active, setActive] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapExtra, setMapExtra] = useState<EntityRef[]>([]);
  const [mapHl, setMapHl] = useState<string[]>([]);
  const [focusToken, setFocusToken] = useState(0);
  const [areaToken, setAreaToken] = useState(0);
  const [editTitle, setEditTitle] = useState(false);
  const [aimCollapsed, setAimCollapsed] = useState(false);
  const [lib, setLib] = useState(false);
  const [flowRun, setFlowRun] = useState<{ i: number; n: number } | null>(null);
  const [regionNotice, setRegionNotice] = useState<{ from: RegionId; to: RegionId } | null>(null);
  const [noMore, setNoMore] = useState(false);
  const [mapEpoch, setMapEpoch] = useState(0); // 새 대화마다 지도·우측 패널을 새로 그림 (주제도 누적 방지)
  // 대화창 ↔ 지도 패널 폭 조절 (대화창 비율 %, 브라우저별 기억)
  const [chatW, setChatW] = useState(46);
  const [dragging, setDragging] = useState(false);
  const workRef = useRef<HTMLElement>(null);
  useEffect(() => {
    try { const v = Number(localStorage.getItem("sa.chatW")); if (v >= 25 && v <= 75) setChatW(v); } catch {}
  }, []);
  const saveChatW = (v: number) => { setChatW(v); try { localStorage.setItem("sa.chatW", String(v)); } catch {} };
  const onSplitDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onSplitMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !workRef.current) return;
    const r = workRef.current.getBoundingClientRect();
    setChatW(Math.min(75, Math.max(25, ((e.clientX - r.left) / r.width) * 100)));
  };
  const onSplitUp = () => { if (!dragging) return; setDragging(false); saveChatW(Math.round(chatW * 10) / 10); };
  const busy = !!conv?.turns.some((t) => t.pending);

  useEffect(() => {
    const cid = sp.get("c");
    if (cid) {
      const c = s.convs.find((x) => x.id === cid);
      if (c) setConv(c);
    }
    if (sp.get("panel") === "wx") openTab({ key: "wx", kind: "wx", title: "기상특보" });
    if (sp.get("new")) newChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);
  // 기준지역(시도·시군구·읍면동) 변경 → 지도를 열고 해당 행정경계로 이동
  const areaRef = useRef<string | null>(null);
  useEffect(() => {
    const k = `${s.cond.region}|${s.cond.sigungu ?? ""}|${s.cond.emd ?? ""}`;
    if (areaRef.current === null) { areaRef.current = k; return; }
    if (areaRef.current === k) return;
    const prevRegion = areaRef.current.split("|")[0];
    areaRef.current = k;
    // 전국 ↔ 시·도(광역) 단위가 바뀌면 새 대화로 시작 — 이전 지역의 지도 주제도·결과가 섞이지 않게 (이전 대화는 대화 목록에 저장됨)
    if (prevRegion !== s.cond.region && convRef.current?.turns.length) {
      newChat();
      let hide = false;
      try { hide = localStorage.getItem("sa.hideRegionNotice") === "1"; } catch {}
      if (!hide) setRegionNotice({ from: prevRegion as RegionId, to: s.cond.region });
    }
    setAreaToken((t) => t + 1);
    setSelectedId(null);
    openTab({ key: "map", kind: "map", title: "지도" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.cond.region, s.cond.sigungu, s.cond.emd]);
  const askedQ = useRef<string | null>(null);
  useEffect(() => {
    const q = sp.get("q");
    if (q && s.weather && askedQ.current !== q) {
      askedQ.current = q;
      ask(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, s.weather]);
  useEffect(() => {
    if (s.aimOn) setAimCollapsed(!!conv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.aimOn]);

  const registry = useMemo(() => {
    const ents = new Map<string, EntityRef>();
    const cites = new Map<string, Citation>();
    conv?.turns.forEach((t) => t.res?.entities.forEach((e) => ents.set(e.id, e)));
    conv?.turns.forEach((t) => t.res?.citations.forEach((c) => cites.set(c.id, c)));
    const last = conv?.turns.filter((t) => t.res).at(-1)?.res;
    last?.citations.forEach((c) => cites.set(c.id, c));
    mapExtra.forEach((e) => ents.set(e.id, { ...ents.get(e.id), ...e }));
    return { ents, cites };
  }, [conv, mapExtra]);

  const mapPoints = useMemo(() => {
    const last = conv?.turns.filter((t) => t.res).at(-1)?.res;
    const m = new Map<string, EntityRef>();
    last?.entities.filter((e) => e.lon != null).forEach((e) => m.set(e.id, e));
    mapExtra.filter((e) => e.lon != null).forEach((e) => m.set(e.id, e));
    return [...m.values()];
  }, [conv, mapExtra]);

  const riverHighlight = useMemo(() => {
    const ids = new Set<string>();
    const last = conv?.turns.filter((t) => t.res).at(-1)?.res;
    last?.entities.filter((e) => e.type === "river").forEach((e) => ids.add(e.id));
    const h = hovered && registry.ents.get(hovered);
    if (h && h.type === "river") ids.add(h.id);
    const sel = tabs.find((t) => t.key === active)?.entity;
    if (sel?.type === "river") ids.add(sel.id);
    return [...ids];
  }, [conv, hovered, registry, tabs, active]);

  const openTab = useCallback((t: PanelTab) => {
    setTabs((prev) => {
      const ex = prev.find((p) => p.key === t.key);
      if (ex) return prev.map((p) => (p.key === t.key ? { ...p, ...t } : p));
      const base = prev.some((p) => p.kind === "map") || t.kind === "map" ? prev : [{ key: "map", kind: "map" as const, title: "지도" }, ...prev];
      const next = [...base, t];
      while (next.length > 6) next.splice(next.findIndex((p) => p.kind !== "map"), 1);
      return next;
    });
    setActive(t.key);
  }, []);

  const api: ExploreApi = {
    hovered,
    selectedId,
    hover: setHovered,
    entityById: (id) => registry.ents.get(id),
    citationById: (id) => registry.cites.get(id),
    openDetail: (e, sub) => {
      setSelectedId(e.id);
      lastFocus.current = e;
      if (e.lon != null) setMapExtra((m) => (m.some((x) => x.id === e.id) ? m : [...m, e]));
      setFocusToken((t) => t + 1);
      openTab({ key: `d:${e.type}:${e.id}`, kind: "detail", title: e.name, entity: e, sub });
    },
    openList: (label, groupKey, items) => {
      setMapExtra((m) => [...m.filter((x) => !items.some((i) => i.id === x.id)), ...items]);
      openTab({ key: `l:${groupKey}`, kind: "list", title: `전체 목록 · ${label}`, list: { label, items, groupKey } });
    },
    openCitation: (c) => openTab({ key: `c:${c.docId}:${c.page ?? c.locator ?? ""}`, kind: "doc", title: `근거 · ${c.title}`, citation: c }),
    openMap: (ids, extra) => {
      if (extra) setMapExtra((m) => [...m.filter((x) => !extra.some((i) => i.id === x.id)), ...extra]);
      setMapHl(ids ?? []);
      setSelectedId(null);
      setFocusToken((t) => t + 1);
      openTab({ key: "map", kind: "map", title: "지도" });
    },
    openWx: () => openTab({ key: "wx", kind: "wx", title: "기상특보" }),
    ask: (q, presetKey, ref) => { ask(q, presetKey, { ref }); },
  };

  const newChat = () => {
    setConv(null);
    setMapEpoch((n) => n + 1);
    setTabs([]);
    setActive("");
    setMapExtra([]);
    setMapHl([]);
    setSelectedId(null);
    lastFocus.current = null;
    router.replace("/explore");
  };

  const scenarioBase = s.weather?.scenario && s.mode === "scenario" ? s.weather.scenario.baseTime : null;
  const fmt = (iso: string) => new Date(iso).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const baseTimeLabel = s.cond.baseTime ? fmt(s.cond.baseTime) : scenarioBase ? fmt(scenarioBase) : "현재 시각";

  async function ask(q: string, presetKey?: string, o: AskOpts = {}): Promise<AgentResponse | null> {
    const cur = convRef.current;
    if (cur?.turns.some((t) => t.pending)) return null;
    // 전광판은 접지 않음 — 띄워 둔 채(필요하면 옮겨서) 대화를 이어감. 전광판 안의 질문·브리핑 버튼은 스스로 접음
    const now = new Date().toISOString();
    // 참조 특보 : 객체를 직접 참조한 질문(이 객체로 질문)·AI 점검에는 싣지 않음
    // AI 모드 켜짐 = 현재 발효 특보를 함께 전달 · 꺼짐 = 사용자 입력 조건(+특보 참조)만
    const aim = presetKey === "check" ? true : o.aim ?? s.aimOn;
    const wxSel = aim ? null : o.wx !== undefined ? o.wx : s.wxRef;
    const wxr = wxSel && !o.ref && presetKey !== "check" ? wxSel : null;
    const turn: Turn = { id: uid("t"), q: presetKey === "check" ? `AI 상황 점검 · ${fmt(o.baseTime ?? now)}` : q, at: now, presetKey, pending: true, refAdv: wxr ? { type: wxr.type, level: wxr.level, area: wxr.area, issuedAt: wxr.issuedAt } : undefined };
    const sc = o.scenario;
    const region = o.region ?? (sc && sc.region !== "national" ? sc.region : s.cond.region);
    const explicitRef = o.ref ?? undefined;
    const base: Conversation = cur ?? { id: uid("cv"), title: q.slice(0, 40), region, disasterType: sc?.disasterType ?? s.cond.disasterType, createdAt: now, updatedAt: now, turns: [] };
    const working: Conversation = { ...base, refEntity: explicitRef ? { type: explicitRef.type, id: explicitRef.id, name: explicitRef.name } : base.refEntity, turns: [...base.turns, turn], updatedAt: now };
    setConv(working);
    setTimeout(() => document.getElementById(`turn-${turn.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    const top = aim ? s.weather?.advisories.find((a) => a.status === "발효" && (region === "national" || a.regionId === region)) : undefined;
    const refE = explicitRef ?? (wxr ? lastFocus.current : working.refEntity ? (working.refEntity as EntityRef) : lastFocus.current);
    const context: QueryContext = {
      region,
      sigungu: sc ? undefined : s.cond.sigungu,
      emd: sc ? undefined : s.cond.emd,
      disasterType: sc?.disasterType ?? s.cond.disasterType,
      baseTime: o.baseTime ?? (s.cond.baseTime ? new Date(s.cond.baseTime).toISOString() : scenarioBase ?? now),
      endTime: s.cond.endTime ? new Date(s.cond.endTime).toISOString() : undefined,
      mode: s.mode,
      advisory: top ? { type: top.type, level: top.level, issuedAt: top.issuedAt, area: top.area } : undefined,
      aiMode: aim || undefined,
      refEntity: refE ? { type: refE.type, id: refE.id, name: refE.name } : undefined,
      hydro: sc ? sc.hydro : s.cond.hydro,
      keywords: sc ? sc.keywords : s.cond.keywords,
      situationKind: sc ? (sc.advisory ? { type: sc.advisory.type, level: sc.advisory.level } : undefined) : s.cond.situationKind,
      scenarioId: sc?.id ?? s.cond.scenarioId,
      prevCheckAt: o.prev,
      refAdvisory: wxr ? { id: wxr.id, type: wxr.type, level: wxr.level, area: wxr.area, issuedAt: wxr.issuedAt, regionId: wxr.regionId } : undefined,
    };
    let res: AgentResponse | null = null;
    try {
      const r = await fetch("/api/agent/query", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: working.id, question: q, presetKey, context }) });
      res = await r.json();
      if (!r.ok || !res?.blocks) throw new Error("응답 오류");
      logTrace({ at: new Date().toISOString(), account: s.account?.id ?? "-", api: res.trace?.apis?.join(", ") ?? "T3Q Agent", intent: res.intent, status: res.status, ms: res.trace?.elapsedMs ?? 0, q, requestId: res.requestId, datasets: res.trace?.datasets ?? [] });
      const done: Conversation = { ...working, title: base.turns.length === 0 ? res.title : working.title, turns: working.turns.map((t) => (t.id === turn.id ? { ...t, pending: false, res: res!, req: { question: q, presetKey, context } } : t)), updatedAt: new Date().toISOString() };
      setConv(done);
      s.saveConv(done);
      if (res.focusEntity) lastFocus.current = res.focusEntity;
      const located = res.entities.filter((e) => e.lon != null);
      setMapExtra([]);
      setSelectedId(null);
      const manualCite = ["manual", "reporting", "message"].includes(res.intent) ? res.citations.find((c) => c.kind === "매뉴얼") : undefined;
      if (manualCite) {
        openTab({ key: `c:${manualCite.docId}:${manualCite.page ?? ""}`, kind: "doc", title: `근거 · ${manualCite.title}`, citation: manualCite });
      } else if (located.length || res.entities.some((e) => e.type === "river")) {
        setMapHl(res.mapFocus?.entityIds ?? []);
        setFocusToken((t) => t + 1);
        openTab({ key: "map", kind: "map", title: "지도" });
      }
    } catch {
      logTrace({ at: new Date().toISOString(), account: s.account?.id ?? "-", api: "T3Q Agent", intent: "-", status: "TIMEOUT", ms: 30000, q, requestId: "-", datasets: [] });
      setConv({ ...working, turns: working.turns.map((t) => (t.id === turn.id ? { ...t, pending: false, failed: "AI 에이전트 연계 지연(TIMEOUT). 잠시 후 다시 시도해 주세요." } : t)) });
    }
    setTimeout(() => document.getElementById(`turn-${turn.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    return res;
  }

  const applyScenario = (sc: ScenarioItem) => {
    s.setCond({
      region: sc.region !== "national" ? sc.region : s.cond.region, sigungu: undefined, emd: undefined, disasterType: sc.disasterType, hydro: sc.hydro, keywords: sc.keywords,
      situationKind: sc.advisory ? { type: sc.advisory.type, level: sc.advisory.level } : undefined, scenarioId: sc.id, scenarioTitle: sc.title,
    });
    return sc;
  };
  const runFlow = async (steps: string[], sc?: ScenarioItem, wx?: { type: string; level: string; regionId: RegionId }) => {
    if (sc) applyScenario(sc);
    // 특보 참조 흐름 : 발효 중인 해당 특보를 참조로 걸고 시작 (새 대화)
    const adv = wx ? s.weather?.advisories.find((a) => a.type === wx.type && a.level === wx.level && a.regionId === wx.regionId && a.status === "발효") ?? null : undefined;
    if (wx) {
      if (!adv) { s.toast(`${wx.type}${wx.level}가 현재 발효 중이 아닙니다`); return; }
      if (s.aimOn) s.setAimOn(false);
      newChat();
      s.setWxRef(adv);
      await new Promise((ok) => setTimeout(ok, 50));
    }
    for (let i = 0; i < steps.length; i++) {
      setFlowRun({ i: i + 1, n: steps.length });
      const r = await ask(steps[i], undefined, { scenario: sc, ...(adv ? { wx: adv, aim: false } : {}) });
      if (!r) break;
      await new Promise((ok) => setTimeout(ok, 1600));
    }
    setFlowRun(null);
  };

  const retry = (t: Turn) => {
    const c = convRef.current;
    if (c) setConv({ ...c, turns: c.turns.filter((x) => x.id !== t.id) });
    setTimeout(() => ask(t.q, t.presetKey), 0);
  };

  const split = tabs.length > 0;
  return (
    <ExploreContext.Provider value={api}>
      <main ref={workRef} className={`work ${split ? "split" : ""} ${dragging ? "dragging" : ""} ${s.aimOn && aimCollapsed ? "aim-pad" : ""}`} style={{ ["--chat-w" as string]: `${chatW}%` }}>
        {s.aimOn && !aimCollapsed && (
          <AimOverlay
            region={s.cond.region}
            mode={s.mode}
            collapsed={aimCollapsed}
            setCollapsed={setAimCollapsed}
            onAsk={(q, preset, region) => ask(q, preset, { region })}
            onCheck={(at, prev) => ask("상황점검", "check", { baseTime: at, prev })}
            onClose={() => s.setAimOn(false)}
          />
        )}
        <section className="chatcol">
          {s.aimOn && aimCollapsed && (
            <AimOverlay
              region={s.cond.region}
              mode={s.mode}
              collapsed
              setCollapsed={setAimCollapsed}
              onAsk={(q, preset, region) => ask(q, preset, { region })}
              onCheck={(at, prev) => ask("상황점검", "check", { baseTime: at, prev })}
              onClose={() => s.setAimOn(false)}
            />
          )}
          <div className="chathd">
            <button className="btn sm" onClick={() => router.push("/history")}><IcList size={14} /> 대화 목록</button>
            {editTitle && conv ? (
              <input className="input sm" autoFocus defaultValue={conv.title} onBlur={(e) => { const c = { ...conv, title: e.target.value || conv.title }; setConv(c); s.saveConv(c); setEditTitle(false); }} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
            ) : (
              <span className="ttl">{conv ? conv.title : "새 대화"}</span>
            )}
            {conv && !editTitle && <button className="iconbtn" title="제목 변경" onClick={() => setEditTitle(true)}><IcEdit size={14} /></button>}
            <span className="sp" />
            {flowRun && <span className="badge info">연속 질의 {flowRun.i}/{flowRun.n}</span>}
            {conv?.refEntity && <span className="refpill">참조대상 · {conv.refEntity.name}<button onClick={() => setConv({ ...conv, refEntity: undefined })} aria-label="참조 해제">×</button></span>}
            {!split && <button className="btn sm" onClick={() => api.openMap()}><IcMap size={14} /> 지도</button>}
            {conv && <button className="btn sm line" onClick={newChat}><IcPlus size={14} /> 새 대화</button>}
          </div>
          <div className="scroll">
            <div className="thread">
              {!conv ? (
                <StartScreen onBriefing={() => ask("재난상황 조건 브리핑", "briefing")} onLibrary={() => setLib(true)} />
              ) : (
                conv.turns.map((t) => (
                  <div key={t.id} id={`turn-${t.id}`} style={{ scrollMarginTop: 12 }}>
                    <div className="turn-q">
                      {t.refAdv && <button className="qref" onClick={() => api.openWx()} title="특보 상세 보기"><span className="rl">참조</span><span className={`lvb ${advTone(t.refAdv)}`}>{advLabel(t.refAdv)}</span>{t.refAdv.area}</button>}
                      <div className="bubble">{t.q}</div>
                    </div>
                    <div className="turn-a">
                      <div className="who">재난안전 AI</div>
                      {t.pending && <Loading />}
                      {t.failed && (
                        <div className="acard">
                          <div className="ablk"><div className="notice danger">{t.failed}</div></div>
                          <div className="ablk"><button className="btn sm" onClick={() => retry(t)}>다시 시도</button></div>
                        </div>
                      )}
                      {t.res && <AnswerView res={t.res} baseLabel={t.presetKey === "check" ? "자동 점검" : s.mode === "scenario" ? `${baseTimeLabel} 기준` : undefined} onReport={() => window.open(`/report?c=${conv.id}&t=${t.id}`, "_blank")} />}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <Composer onSend={(q, p) => ask(q, p)} busy={busy} baseLabel={baseTimeLabel} onLibrary={() => setLib(true)} onScenario={(sc) => ask(applyScenario(sc).question, undefined, { scenario: sc })} />
        </section>
        {split && (
          <div
            className="splitter"
            role="separator"
            aria-orientation="vertical"
            aria-label="대화창과 지도 폭 조절"
            aria-valuenow={Math.round(chatW)}
            aria-valuemin={25}
            aria-valuemax={75}
            tabIndex={0}
            title="드래그해서 폭 조절 · 더블클릭하면 기본 폭"
            onPointerDown={onSplitDown}
            onPointerMove={onSplitMove}
            onPointerUp={onSplitUp}
            onPointerCancel={onSplitUp}
            onDoubleClick={() => saveChatW(46)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") saveChatW(Math.max(25, chatW - 3));
              else if (e.key === "ArrowRight") saveChatW(Math.min(75, chatW + 3));
            }}
          >
            <span className="grip" />
          </div>
        )}
        {split && (
          <RightPanel
            key={mapEpoch}
            tabs={tabs}
            active={active}
            setActive={setActive}
            close={(k) => setTabs((prev) => { const n = prev.filter((p) => p.key !== k); if (active === k) setActive(n.at(-1)?.key ?? ""); return n; })}
            closeAll={() => setTabs([])}
            mapPoints={mapPoints}
            mapHighlight={mapHl}
            focusToken={focusToken}
            areaToken={areaToken}
            riverHighlight={riverHighlight}
          />
        )}
      </main>
      {regionNotice && (
        <div className="ovl" onClick={() => setRegionNotice(null)}>
          <div className="modal" style={{ width: "min(460px,100%)" }} onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal aria-label="새 대화 안내">
            <div className="modal-hd"><h2>새 대화로 시작합니다</h2></div>
            <div className="modal-bd">
              <p style={{ margin: 0, lineHeight: 1.6 }}>지역 단위가 바뀌면 새 대화창으로 시작합니다.</p>
              <p className="xs mute2" style={{ margin: "8px 0 0" }}>이전 대화는 [대화 목록]에서 다시 볼 수 있습니다.</p>
              <label className="row xs" style={{ marginTop: 14, gap: 6, cursor: "pointer" }}>
                <input type="checkbox" checked={noMore} onChange={(e) => setNoMore(e.target.checked)} /> 다시 보지 않기
              </label>
            </div>
            <div className="modal-ft">
              <span className="sp" />
              <button className="btn pri" onClick={() => { if (noMore) { try { localStorage.setItem("sa.hideRegionNotice", "1"); } catch {} } setRegionNotice(null); }}>확인</button>
            </div>
          </div>
        </div>
      )}
      {lib && <LibraryDrawer region={s.cond.region} onClose={() => setLib(false)} onAsk={(q, p) => ask(q, p)} onScenario={(sc) => ask(applyScenario(sc).question, undefined, { scenario: sc })} onFlow={(steps, sc, wx) => runFlow(steps, sc, wx)} />}
    </ExploreContext.Provider>
  );
}

export default function ExplorePage() {
  return <Suspense><Explore /></Suspense>;
}
