"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AgentResponse, Citation, EntityRef } from "@/lib/contract/agent";
import { useSession, uid, logTrace, type Conversation, type Turn } from "@/lib/session";
import { ExploreContext, type ExploreApi, type PanelTab } from "@/components/explore/ExploreCtx";
import AnswerView from "@/components/explore/AnswerView";
import Composer from "@/components/explore/Composer";
import StartBoard from "@/components/explore/StartBoard";
import RightPanel from "@/components/explore/RightPanel";
import { IcEdit, IcList, IcMap, IcPlus } from "@/components/Icons";

const LOADING_STEPS = ["질문과 재난상황 조건 해석", "재해대장·119 신고·위험지역 데이터 조회", "행동매뉴얼·계획문서 근거 확인", "답변 구성"];

function Loading() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((v) => Math.min(v + 1, LOADING_STEPS.length - 1)), 420);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="acard">
      <ul className="steps-loading">
        {LOADING_STEPS.map((s, i) => (
          <li key={s} className={i < n ? "done" : ""} style={{ opacity: i > n ? 0.35 : 1 }}>
            {i < n ? "✓" : i === n ? <span className="spin" /> : "·"} {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Explore() {
  const s = useSession();
  const router = useRouter();
  const sp = useSearchParams();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [tabs, setTabs] = useState<PanelTab[]>([]);
  const [active, setActive] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapExtra, setMapExtra] = useState<EntityRef[]>([]);
  const [mapHl, setMapHl] = useState<string[]>([]);
  const [focusToken, setFocusToken] = useState(0);
  const [editTitle, setEditTitle] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const busy = !!conv?.turns.some((t) => t.pending);

  // 이력에서 이어서 질문 / 특보 패널 딥링크
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
  const askedQ = useRef<string | null>(null);
  useEffect(() => {
    const q = sp.get("q");
    if (q && s.weather && askedQ.current !== q) {
      askedQ.current = q;
      ask(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, s.weather]);

  // 엔티티·근거 레지스트리 (대화 전체)
  const registry = useMemo(() => {
    const ents = new Map<string, EntityRef>();
    const cites = new Map<string, Citation>();
    conv?.turns.forEach((t) => {
      t.res?.entities.forEach((e) => ents.set(e.id, e));
    });
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
      // 탭 과다 시 오래된 상세 탭부터 정리 (지도 유지)
      while (next.length > 7) {
        const i = next.findIndex((p) => p.kind !== "map");
        next.splice(i, 1);
      }
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
      if (e.lon != null) setMapExtra((m) => (m.some((x) => x.id === e.id) ? m : [...m, e]));
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
    ask: (q, presetKey, ref) => ask(q, presetKey, ref),
  };

  const newChat = () => {
    setConv(null);
    setTabs([]);
    setActive("");
    setMapExtra([]);
    setMapHl([]);
    setSelectedId(null);
    router.replace("/explore");
  };

  const baseTimeLabel = s.cond.baseTime
    ? new Date(s.cond.baseTime).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : s.weather?.scenario && s.mode === "scenario"
      ? `${new Date(s.weather.scenario.baseTime).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} (재현)`
      : "현재 시각";

  async function ask(q: string, presetKey?: string, ref?: EntityRef) {
    if (busy) return;
    const now = new Date().toISOString();
    const turn: Turn = { id: uid("t"), q, at: now, presetKey, pending: true };
    const refEntity = ref ? { type: ref.type, id: ref.id, name: ref.name } : conv?.refEntity;
    const base: Conversation = conv ?? {
      id: uid("cv"),
      title: q.slice(0, 40),
      region: s.cond.region,
      disasterType: s.cond.disasterType,
      createdAt: now,
      updatedAt: now,
      turns: [],
    };
    const working = { ...base, refEntity, turns: [...base.turns, turn], updatedAt: now };
    setConv(working);
    setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
    const top = s.weather?.advisories.find((a) => a.status !== "해제" && (s.cond.region === "national" || a.regionId === s.cond.region));
    try {
      const r = await fetch("/api/agent/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: working.id,
          question: q,
          presetKey,
          context: {
            region: s.cond.region,
            sigungu: s.cond.sigungu,
            disasterType: s.cond.disasterType,
            baseTime: s.cond.baseTime ? new Date(s.cond.baseTime).toISOString() : s.mode === "scenario" && s.weather?.scenario ? s.weather.scenario.baseTime : now,
            mode: s.mode,
            advisory: top ? { type: top.type, level: top.level, issuedAt: top.issuedAt, area: top.area } : undefined,
            refEntity,
            hydro: s.cond.hydro,
            keywords: s.cond.keywords,
          },
        }),
      });
      const res: AgentResponse = await r.json();
      logTrace({ at: new Date().toISOString(), account: s.account?.id ?? "-", api: res.trace?.apis?.join(", ") ?? "T3Q Agent", intent: res.intent, status: r.ok ? res.status : "error", ms: res.trace?.elapsedMs ?? 0, q, requestId: res.requestId, datasets: res.trace?.datasets ?? [] });
      if (!r.ok && !res.blocks) throw new Error("응답 오류");
      const done: Conversation = {
        ...working,
        title: base.turns.length === 0 ? res.title : working.title,
        turns: working.turns.map((t) => (t.id === turn.id ? { ...t, pending: false, res } : t)),
        updatedAt: new Date().toISOString(),
      };
      setConv(done);
      s.saveConv(done);
      // 첫 답변에 위치 객체가 있으면 지도를 함께 연다
      const located = res.entities.filter((e) => e.lon != null);
      setMapExtra([]);
      setSelectedId(null);
      if (located.length && tabs.length) setActive("map");
      const manualCite = res.intent === "manual" ? res.citations.find((c) => c.kind === "매뉴얼") : undefined;
      if (manualCite) api.openCitation(manualCite);
      if (located.length && !tabs.length) {
        setMapHl(res.mapFocus?.entityIds ?? []);
        setFocusToken((t) => t + 1);
        openTab({ key: "map", kind: "map", title: "지도" });
      } else if (located.length) {
        setMapHl(res.mapFocus?.entityIds ?? []);
        setFocusToken((t) => t + 1);
      }
    } catch {
      logTrace({ at: new Date().toISOString(), account: s.account?.id ?? "-", api: "T3Q Agent", intent: "-", status: "TIMEOUT", ms: 30000, q, requestId: "-", datasets: [] });
      const failed: Conversation = {
        ...working,
        turns: working.turns.map((t) => (t.id === turn.id ? { ...t, pending: false, failed: "AI 에이전트 연계 지연(TIMEOUT). 잠시 후 다시 시도해 주세요." } : t)),
      };
      setConv(failed);
    }
    setTimeout(() => document.getElementById(`turn-${turn.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  }

  const retry = (t: Turn) => {
    setConv((c) => (c ? { ...c, turns: c.turns.filter((x) => x.id !== t.id) } : c));
    setTimeout(() => ask(t.q, t.presetKey), 0);
  };

  const split = tabs.length > 0;
  return (
    <ExploreContext.Provider value={api}>
      <main className={`work ${split ? "split" : ""}`}>
        <section className="chatcol">
          <div className="chathd">
            <button className="btn sm" onClick={() => router.push("/history")}><IcList size={14} /> 대화 목록</button>
            {editTitle && conv ? (
              <input
                className="input sm"
                autoFocus
                defaultValue={conv.title}
                onBlur={(e) => {
                  const c = { ...conv, title: e.target.value || conv.title };
                  setConv(c);
                  s.saveConv(c);
                  setEditTitle(false);
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              />
            ) : (
              <span className="ttl">{conv ? conv.title : "새 대화"}</span>
            )}
            {conv && !editTitle && <button className="iconbtn" title="제목 변경" onClick={() => setEditTitle(true)}><IcEdit size={14} /></button>}
            <span className="sp" />
            {conv?.refEntity && (
              <span className="refpill">참조대상 · {conv.refEntity.name}<button onClick={() => setConv({ ...conv, refEntity: undefined })} aria-label="참조 해제">×</button></span>
            )}
            {!split && <button className="btn sm" onClick={() => api.openMap()}><IcMap size={14} /> 지도</button>}
            {conv && <button className="btn sm line" onClick={newChat}><IcPlus size={14} /> 새 대화</button>}
          </div>
          <div className="scroll">
            <div className="thread">
              {!conv ? (
                <StartBoard onBriefing={() => ask("현재 상황 브리핑", "briefing")} />
              ) : (
                conv.turns.map((t) => (
                  <div key={t.id} id={`turn-${t.id}`} style={{ scrollMarginTop: 12 }}>
                    <div className="turn-q"><div className="bubble">{t.q}</div></div>
                    <div className="turn-a">
                      <div className="who">재난안전 AI {t.res?.trace && <span className="mute2">· T3Q Agent API ({t.res.trace.apis.join(", ")})</span>}</div>
                      {t.pending && <Loading />}
                      {t.failed && (
                        <div className="acard">
                          <div className="ablk"><div className="notice danger">{t.failed}</div></div>
                          <div className="ablk"><button className="btn sm" onClick={() => retry(t)}>다시 시도</button></div>
                        </div>
                      )}
                      {t.res && <AnswerView res={t.res} baseLabel={s.mode === "scenario" ? `${baseTimeLabel} 기준` : undefined} onReport={() => window.open(`/report?c=${conv.id}&t=${t.id}`, "_blank")} />}
                    </div>
                  </div>
                ))
              )}
              <div ref={bottom} />
            </div>
          </div>
          <Composer onSend={(q, p) => ask(q, p)} busy={busy} baseLabel={baseTimeLabel} />
        </section>
        {split && (
          <RightPanel
            tabs={tabs}
            active={active}
            setActive={setActive}
            close={(k) => {
              setTabs((prev) => {
                const n = prev.filter((p) => p.key !== k);
                if (active === k) setActive(n.at(-1)?.key ?? "");
                return n.length === 1 && n[0].kind === "map" && k !== "map" ? n : n;
              });
            }}
            closeAll={() => setTabs([])}
            mapPoints={mapPoints}
            mapHighlight={mapHl}
            focusToken={focusToken}
            riverHighlight={riverHighlight}
          />
        )}
      </main>
    </ExploreContext.Provider>
  );
}

export default function ExplorePage() {
  return (
    <Suspense>
      <Explore />
    </Suspense>
  );
}
