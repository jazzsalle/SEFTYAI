"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { Advisory, Citation, DetailResponse, EntityRef, RegionId } from "@/lib/contract/agent";
import { useSession } from "@/lib/session";
import { catStyle } from "@/lib/config";
import { useExplore, type PanelTab } from "./ExploreCtx";
import { DEFAULT_LAYERS, type Basemap, type LayerState, zoomBy } from "../map/MapView";
import { TL_COLOR } from "./AnswerView";
import SatCompare from "../SatCompare";
import SopPane from "../sop/SopPane";
import { IcChevR, IcDoc, IcExpand, IcMap, IcPushpin, IcRefresh, IcX } from "../Icons";

const MapView = dynamic(() => import("../map/MapView"), { ssr: false, loading: () => <div className="olmap" /> });

interface Props {
  tabs: PanelTab[];
  active: string;
  setActive: (k: string) => void;
  close: (k: string) => void;
  closeAll: () => void;
  mapPoints: EntityRef[];
  mapHighlight: string[];
  focusToken: number;
  areaToken?: number;
  riverHighlight: string[];
  /** 단계 바에서 고른 조치 (대응절차 탭에서 펼쳐 보임) */
  sopFocus?: { id: string; n: number };
}

export default function RightPanel(p: Props) {
  const tab = p.tabs.find((t) => t.key === p.active) ?? p.tabs[0];
  const withMap = (tab?.kind === "detail" && (tab.entity?.lon != null || tab.entity?.type === "river" || tab.entity?.type === "event")) || tab?.kind === "list";
  // 지도 ↔ 상세 분할 : both(함께) · map(상세 접기) · detail(상세 크게) + 지도 높이 % (브라우저별 기억)
  const [view, setView] = useState<"both" | "map" | "detail">("both");
  const [mapPct, setMapPct] = useState(40);
  const [drag, setDrag] = useState(false);
  useEffect(() => {
    try {
      const j = JSON.parse(localStorage.getItem("sa.rsplit") ?? "null");
      if (j && ["both", "map", "detail"].includes(j.view)) setView(j.view);
      if (j && j.pct >= 15 && j.pct <= 80) setMapPct(j.pct);
    } catch {}
  }, []);
  const saveSplit = (v: "both" | "map" | "detail", pct: number) => {
    setView(v);
    setMapPct(pct);
    try { localStorage.setItem("sa.rsplit", JSON.stringify({ view: v, pct: Math.round(pct) })); } catch {}
  };
  // 새 상세를 열면 접혀 있던 상세를 다시 보여줌
  useEffect(() => {
    if (tab?.kind !== "map") setView((v) => (v === "map" ? "both" : v));
  }, [tab?.key]);
  return (
    <aside className={`rpanel ${drag ? "dragging" : ""}`} aria-label="상세 패널">
      <div className="rtabs" role="tablist">
        {p.tabs.map((t) => (
          <div key={t.key} className={`rtab ${t.key === tab?.key ? "on" : ""} ${t.pinned ? "pinned" : ""}`} role="tab" aria-selected={t.key === tab?.key}>
            <button className="rtab-b" onClick={() => p.setActive(t.key)} title={t.pinned ? "고정 탭 · 닫을 수 없습니다" : undefined}>
              {t.pinned && <IcPushpin size={13} />}
              <span className="tl2">{t.title}</span>
            </button>
            {!t.pinned && <button className="x" onClick={() => p.close(t.key)} aria-label={`${t.title} 닫기`}><IcX size={13} /></button>}
          </div>
        ))}
        <span className="sp" />
        <button className="iconbtn" style={{ alignSelf: "center" }} title="패널 닫기" onClick={p.closeAll}><IcExpand size={15} /></button>
      </div>
      {/* 지도는 탭 전환 시에도 상태 유지 · 상세/목록일 때는 위쪽에 함께 표시 (상세 ↔ 지도 동기화) */}
      <div
        className={`rbody map ${tab?.kind === "map" ? "" : withMap ? `mini ${view === "detail" ? "gone" : ""}` : "hide"}`}
        style={withMap && view !== "detail" ? { flex: view === "map" ? "1 1 auto" : `0 0 ${mapPct}%` } : undefined}
      >
        <MapPanel {...p} />
      </div>
      {withMap && (
        <div className={`hsplit ${drag ? "on" : ""}`}>
          <div
            className="grab"
            role="separator"
            aria-orientation="horizontal"
            aria-label="지도와 상세 높이 조절"
            title="드래그해서 높이 조절 · 더블클릭하면 기본 높이"
            onPointerDown={(ev) => { if (view !== "both") return; ev.preventDefault(); (ev.target as HTMLElement).setPointerCapture(ev.pointerId); setDrag(true); }}
            onPointerMove={(ev) => {
              if (!drag) return;
              const box = (ev.currentTarget.closest(".rpanel") as HTMLElement).getBoundingClientRect();
              const top = box.top + 46;
              setMapPct(Math.min(80, Math.max(15, ((ev.clientY - top) / (box.bottom - top)) * 100)));
            }}
            onPointerUp={() => { if (drag) { setDrag(false); saveSplit(view, mapPct); } }}
            onDoubleClick={() => saveSplit("both", 40)}
          ><span /></div>
          <div className="seg">
            <button className={view === "map" ? "on" : ""} onClick={() => saveSplit(view === "map" ? "both" : "map", mapPct)} title="상세를 접고 지도를 크게">{view === "map" ? "상세 펼치기 ▲" : "상세 접기 ▼"}</button>
            <button className={view === "both" ? "on" : ""} onClick={() => saveSplit("both", mapPct)}>함께 보기</button>
            <button className={view === "detail" ? "on" : ""} onClick={() => saveSplit(view === "detail" ? "both" : "detail", mapPct)} title="지도를 접고 상세를 크게">{view === "detail" ? "지도 펼치기 ▼" : "상세 크게 ▲"}</button>
          </div>
        </div>
      )}
      {tab && tab.kind !== "map" && !(withMap && view === "map") && (
        <div className="rbody" key={tab.key}>
          {tab.kind === "detail" && tab.entity && <DetailPane e={tab.entity} sub={tab.sub} />}
          {tab.kind === "list" && tab.list && <ListPane list={tab.list} />}
          {tab.kind === "wx" && <WxPane />}
          {tab.kind === "doc" && tab.citation && <DocPane c={tab.citation} />}
          {tab.kind === "sop" && <SopPane focus={p.sopFocus} />}
        </div>
      )}
    </aside>
  );
}

/* ---------------- 지도 ---------------- */
/** 항목이 속한 시범 지자체 (하천 ID 접두어 · 좌표 위도로 판별) */
function regionOfEntity(e: EntityRef): RegionId | null {
  const m = e.id.match(/^RV-(BS|YC|IJ)-/);
  if (m) return m[1] === "BS" ? "busan" : m[1] === "YC" ? "yeongcheon" : "inje";
  if (e.lat == null) return null;
  return e.lat < 35.6 ? "busan" : e.lat < 37 ? "yeongcheon" : "inje";
}
function MapPanel(p: Props) {
  const { cond } = useSession();
  const x = useExplore();
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS);
  const [basemap, setBasemap] = useState<Basemap>("Base");
  const [lp, setLp] = useState(false);
  const [tile, setTile] = useState<"vworld" | "osm">("vworld");
  const hl = useMemo(() => [...p.mapHighlight, ...(x.hovered ? [x.hovered] : [])], [p.mapHighlight, x.hovered]);
  const sel = x.selectedId ? p.mapPoints.find((m) => m.id === x.selectedId) : null;
  const cats = useMemo(() => {
    const m = new Map<string, number>();
    p.mapPoints.forEach((e) => m.set(e.category ?? e.type, (m.get(e.category ?? e.type) ?? 0) + 1));
    return [...m.entries()];
  }, [p.mapPoints]);
  const T = (k: keyof LayerState) => setLayers((l) => ({ ...l, [k]: !l[k] }));
  // 참조 주제도 지자체 : 지자체를 고른 경우 그 지자체, 전국이면 사용자가 고른 항목(지도 선택·열린 상세)의 지자체만
  const tab = p.tabs.find((t) => t.key === p.active);
  const focusEnt = sel ?? (tab?.kind === "detail" ? tab.entity : undefined);
  const layerRegion: RegionId | null = cond.region !== "national" ? cond.region : focusEnt ? regionOfEntity(focusEnt) : null;
  // 읍면동을 고르면 읍면동 경계를 함께 켬
  useEffect(() => {
    if (cond.emd) setLayers((l) => (l.emd ? l : { ...l, emd: true }));
  }, [cond.emd]);
  return (
    <div className="mapwrap">
      <MapView
        region={cond.region}
        sigungu={cond.sigungu}
        emd={cond.emd}
        areaToken={p.areaToken}
        layerRegion={layerRegion}
        emdOn={cond.region === "national" && !!layerRegion}
        points={p.mapPoints}
        highlightIds={hl}
        selectedId={x.selectedId}
        riverHighlight={p.riverHighlight}
        layers={layers}
        basemap={basemap}
        focusToken={p.focusToken}
        onSelect={(e) => x.openDetail(e)}
        onTileStatus={setTile}
      />
      <div className="maplabel">
        <span>{tile === "vworld" ? "VWorld 배경지도" : "OSM 배경지도 (VWorld 연결 실패 · 키 도메인 확인)"}</span>
      </div>
      <div className="mapctl">
        <button onClick={() => zoomBy(1)}>확대</button>
        <button onClick={() => zoomBy(-1)}>축소</button>
        <button className={lp ? "on" : ""} onClick={() => setLp((v) => !v)}>레이어</button>
      </div>
      {lp && (
        <div className="layerpanel">
          <h4>배경지도</h4>
          <div className="modeSw" style={{ marginBottom: 6 }}>
            {(["Base", "gray", "Satellite"] as Basemap[]).map((b) => (
              <button key={b} className={basemap === b ? "on" : ""} onClick={() => setBasemap(b)}>{b === "Base" ? "일반" : b === "gray" ? "흐리게" : "영상"}</button>
            ))}
          </div>
          <h4>공통 참조 레이어</h4>
          <label><input type="checkbox" checked={layers.admin} onChange={() => T("admin")} /><span className="sw ln" style={{ background: "repeating-linear-gradient(90deg,#ff1fd2 0 9px,transparent 9px 11px,#ff1fd2 11px 12px,transparent 12px 14px)" }} />시·군·구 경계 <span className="c">1점쇄선</span></label>
          <label><input type="checkbox" checked={layers.emd} onChange={() => T("emd")} /><span className="sw ln" style={{ background: "repeating-linear-gradient(90deg,#b6ff00 0 7px,transparent 7px 9px,#b6ff00 9px 10px,transparent 10px 12px,#b6ff00 12px 13px,transparent 13px 15px)" }} />읍·면·동 경계 <span className="c">2점쇄선</span></label>
          <label><input type="checkbox" checked={layers.rivers} onChange={() => T("rivers")} /><span className="sw ln" style={{ background: "#00d8ff" }} />하천 중심선 (국가·지방)</label>
          <label><input type="checkbox" checked={layers.riverArea} onChange={() => T("riverArea")} /><span className="sw" style={{ background: "rgba(0,229,255,.35)", outline: "1.5px dashed #00b8d4", outlineOffset: -1.5 }} />실폭하천</label>
          <label><input type="checkbox" checked={layers.smallRiver} onChange={() => T("smallRiver")} /><span className="sw" style={{ background: "rgba(0,230,118,.3)", outline: "2px dotted #00c864", outlineOffset: -2 }} />소하천구역</label>
          <h4>조회결과 레이어</h4>
          <label><input type="checkbox" checked={layers.points} onChange={() => T("points")} /><span className="sw" style={{ background: "#256ef4" }} />조회결과 객체<span className="c">{p.mapPoints.length}</span></label>
        </div>
      )}
      {sel && (
        <div className="mapsel">
          <div className="k"><span className="dot" style={{ background: catStyle(sel.category).color }} /> 선택한 {sel.category ?? "객체"}</div>
          <h4>{sel.name}</h4>
          {sel.summary && <p>{sel.summary}</p>}
          <button className="btn xs line" style={{ marginTop: 8 }} onClick={() => x.openDetail(sel)}>상세정보 <IcChevR size={12} /></button>
        </div>
      )}
      <div className="maplegend">
        {cats.length ? cats.map(([c, n]) => (
          <span key={c}><i style={{ background: catStyle(c).color }} />{c} {n}</span>
        )) : <span>질문하면 관련 객체가 지도에 표시됩니다 · 하천을 클릭하면 하천 상세</span>}
        <span className="sp" />
        <span><i style={{ background: "#00d8ff", borderRadius: 2, height: 3, boxShadow: "0 0 0 1px #003a5c" }} />하천</span>
      </div>
    </div>
  );
}

/* ---------------- 목록 ---------------- */
function ListPane({ list }: { list: NonNullable<PanelTab["list"]> }) {
  const x = useExplore();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [sort, setSort] = useState("기본");
  const cats = [...new Set(list.items.map((i) => i.category).filter(Boolean))] as string[];
  let items = list.items.filter((i) => (!q || i.name.includes(q) || i.summary?.includes(q)) && (!cat || i.category === cat));
  if (sort === "이름") items = [...items].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return (
    <div className="dpane">
      <div className="dh">
        <h2>{list.label} <span className="mute2" style={{ fontSize: 16 }}>전체 {list.items.length}</span></h2>
        <div className="acts"><button className="btn sm" onClick={() => x.openMap(items.map((i) => i.id), items)}><IcMap size={13} /> 지도에서 보기</button></div>
      </div>
      <div className="row w" style={{ margin: "14px 0" }}>
        <input className="input sm" placeholder="이름·내용 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        {cats.length > 1 && (
          <select className="select sm" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">유형 전체</option>
            {cats.map((c) => <option key={c}>{c}</option>)}
          </select>
        )}
        <select className="select sm" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option>기본</option><option>이름</option>
        </select>
      </div>
      <ul className="reslist">
        {items.map((it, i) => (
          <li key={it.id} className={x.selectedId === it.id ? "on" : ""} onClick={() => x.openDetail(it)} onMouseEnter={() => x.hover(it.id)} onMouseLeave={() => x.hover(null)}>
            <span className="i">{i + 1}</span>
            {it.level && <span className={`dot ${it.level}`} />}
            <span className="col" style={{ minWidth: 0 }}>
              <span className="nm">{it.name}{it.category && <span className="mute2" style={{ fontWeight: 400 }}> · {it.category}</span>}</span>
              {it.summary && <span className="sm">{it.summary}</span>}
            </span>
            {it.metric && <span className="mt">{it.metric}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- 상세 ---------------- */
const W4 = [
  { k: "where", t: "어디에 있나", c: "#256ef4", i: "1" },
  { k: "why", t: "왜 위험한가", c: "#de3412", i: "2" },
  { k: "when", t: "언제 위험해지나", c: "#e5590b", i: "3" },
] as const;

export function DetailPane({ e, sub }: { e: EntityRef; sub?: string }) {
  const { cond, mode } = useSession();
  const x = useExplore();
  const [d, setD] = useState<DetailResponse | null>(null);
  const [err, setErr] = useState(false);
  const [st, setSt] = useState(sub ?? "");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch(`/api/agent/detail?type=${e.type}&id=${encodeURIComponent(e.id)}&region=${cond.region}&mode=${mode}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: DetailResponse) => {
        if (!alive) return;
        setD(j);
        setSt((s) => s || (j.w4 ? "w4" : j.sections[0]?.key) || "");
      })
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [e.type, e.id, cond.region, mode, retry]);

  if (err) return <div className="dpane"><div className="notice danger">상세정보를 불러오지 못했습니다. <button className="btn xs" onClick={() => { setErr(false); setD(null); setRetry((n) => n + 1); }}><IcRefresh size={12} /> 다시 시도</button></div></div>;
  if (!d) return <div className="dpane"><div className="typing"><i /><i /><i /></div></div>;
  const cites = (ids?: string[]) => ids?.map((id) => { const c = d.citations.find((cc) => cc.id === id); return c ? <button key={id} className="cite" onClick={() => x.openCitation(c)}>{id.slice(1)}</button> : null; });
  // 긴 상세를 한 줄로 늘어놓지 않고 보기 탭으로 나눔 : 요약(어디·왜·언제·무엇) · 정보 섹션들 · 연관 객체 · 근거
  const views: { key: string; label: string }[] = [
    ...(d.w4 ? [{ key: "w4", label: "요약" }] : []),
    ...d.sections.map((s) => ({ key: s.key, label: s.label })),
    ...(d.related.length ? [{ key: "rel", label: `연관 객체 ${d.related.length}` }] : []),
    ...(d.citations.length ? [{ key: "cite", label: `근거 ${d.citations.length}` }] : []),
  ];
  const cur = views.find((v) => v.key === st)?.key ?? views[0]?.key;
  const sec = d.sections.find((s) => s.key === cur);
  const src = <div className="srcline">출처 데이터 : {d.sources.map((s) => <span key={s} className="badge star">★ {s}</span>)}</div>;

  return (
    <div className="dpane fadein">
      <div className="dhead">
        <div className="dh">
          <div style={{ minWidth: 0 }}>
            <div className="xs b" style={{ color: catStyle(d.category).color }}>{d.category}</div>
            <h2>{d.title}</h2>
          </div>
          <div className="acts">
            {d.geometry && <button className="btn sm" onClick={() => x.openMap([d.id], [{ ...e, lon: d.geometry!.lon, lat: d.geometry!.lat, category: d.category ?? e.category }])}><IcMap size={13} /> 지도에서 보기</button>}
            <button className="btn sm line" onClick={() => x.ask(`${d.title}에 대해 지금 무엇을 해야 하나요?`, undefined, { ...e, name: d.title })}>이 객체로 질문</button>
          </div>
        </div>
        <div className="bds">
          {d.badges.map((b, i) => <span key={i} className={`badge ${b.tone}`}>{b.text}</span>)}
          <span className="badge neutral">ID · {d.id}</span>
        </div>
        {views.length > 1 && (
          <div className="subtabs" role="tablist">
            {views.map((v) => (
              <button key={v.key} role="tab" aria-selected={v.key === cur} className={v.key === cur ? "on" : ""} onClick={() => setSt(v.key)}>{v.label}</button>
            ))}
          </div>
        )}
      </div>

      {cur === "w4" && d.w4 && (
        <div className="w4">
          {W4.map((w) => (
            <div key={w.k} className="c">
              <h4><i style={{ background: w.c }}>{w.i}</i>{w.t}</h4>
              <p>{d.w4![w.k]}</p>
            </div>
          ))}
          <div className="c" style={{ borderColor: "#e8d9fb", background: "#fbf8ff" }}>
            <h4><i style={{ background: "#6f4bd8" }}>4</i>무엇을 해야 하나</h4>
            <ol>{d.w4.what.map((t, i) => <li key={i}>{t}</li>)}</ol>
          </div>
        </div>
      )}
      {sec?.key === "sat" && <SatCompare />}
      {sec && sec.key !== "timeline" && (
        <div className="sec">
          <dl className="kv">
            {sec.fields.map((f, i) => (
              <div key={i} style={{ display: "contents" }}>
                <dt>{f.label}</dt>
                <dd style={{ whiteSpace: "pre-line" }}>{f.value || "—"}{cites(f.cite)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {sec?.key === "timeline" && d.timeline && (
        <div className="sec">
          <ul className="tl">
            {d.timeline.map((t, i) => (
              <li key={i} style={{ ["--k" as string]: TL_COLOR[t.kind] ?? "#256ef4" }}>
                <span className="at">{t.at}</span><span className="lb">{t.label}</span>
                <div className="tx">{t.text}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {cur === "rel" && (
        <div className="sec">
          <ul className="reslist">
            {d.related.slice(0, 30).map((r) => (
              <li key={r.type + r.id} onClick={() => x.openDetail(r)} onMouseEnter={() => x.hover(r.id)} onMouseLeave={() => x.hover(null)}>
                {r.level && <span className={`dot ${r.level}`} />}
                <span className="col" style={{ minWidth: 0 }}>
                  <span className="nm">{r.name} <span className="mute2" style={{ fontWeight: 400 }}>· {r.category ?? r.type}</span></span>
                  {r.summary && <span className="sm">{r.summary}</span>}
                </span>
                {r.metric && <span className="mt">{r.metric}</span>}
                <IcChevR size={14} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {cur === "cite" && (
        <div className="sec">
          <div className="cites">
            {d.citations.map((c) => (
              <button key={c.id} className="citechip" onClick={() => x.openCitation(c)}><span className="k">{c.id.slice(1)}</span><IcDoc size={12} /><b>{c.title}</b>{c.page ? `p.${c.page}` : c.locator ? `· ${c.locator}` : ""}</button>
            ))}
          </div>
        </div>
      )}
      {src}
    </div>
  );
}

/* ---------------- 기상특보 ---------------- */
function WxPane() {
  const { weather, reloadWeather, mode } = useSession();
  const [sel, setSel] = useState<Advisory | null>(null);
  const [scope, setScope] = useState("");
  if (!weather) return <div className="dpane"><div className="typing"><i /><i /><i /></div></div>;
  const list = weather.advisories.filter((a) => !scope || a.area.includes(scope));
  if (sel)
    return (
      <div className="dpane fadein">
        <button className="btn xs ghost" onClick={() => setSel(null)}>‹ 발효 중 특보</button>
        <div className="dh" style={{ marginTop: 10 }}>
          <h2>{sel.area} {sel.type}{sel.level}</h2>
        </div>
        <div className="bds">
          <span className={`badge ${sel.level === "경보" ? "solid-danger" : "solid-warn"} sq`}>{sel.type}{sel.level}</span>
          <span className="badge neutral">{sel.status}</span>
          {weather.mode === "scenario" && <span className="badge" style={{ background: "#f4eefc", color: "#5b2a9c" }}>사건 재현</span>}
        </div>
        <div className="sec">
          <h3>특보 정보</h3>
          <dl className="kv">
            <dt>발표 시각</dt><dd>{new Date(sel.issuedAt).toLocaleString("ko-KR")}</dd>
            <dt>특보 구역</dt><dd>{sel.area}</dd>
            <dt>상태</dt><dd>{sel.status}</dd>
            <dt>내용</dt><dd style={{ whiteSpace: "pre-line" }}>{sel.text ?? "—"}</dd>
          </dl>
        </div>
        <div className="notice" style={{ marginTop: 16 }}>특보 기준 : 호우주의보 3시간 60mm 또는 12시간 110mm 이상 예상 · 호우경보 3시간 90mm 또는 12시간 180mm 이상 예상 (기상청)</div>
      </div>
    );
  return (
    <div className="dpane">
      <div className="dh">
        <h2>발효 중 특보</h2>
        <span className="xs mute2" style={{ alignSelf: "center" }}>{weather.mode === "live" ? "기상청 API" : "사건 재현"} · 갱신 {new Date(weather.status.fetchedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>
        <div className="acts"><button className="btn sm ghost" onClick={reloadWeather}><IcRefresh size={13} /> 새로고침</button></div>
      </div>
      <div className="row" style={{ margin: "12px 0" }}>
        <span className="s">경보 <b>{list.filter((a) => a.level === "경보").length}</b>건 · 주의보 <b>{list.filter((a) => a.level === "주의보").length}</b>건</span>
        <span className="sp" />
        <input className="input sm" placeholder="지역 검색" value={scope} onChange={(e) => setScope(e.target.value)} style={{ width: 140 }} />
      </div>
      {!weather.status.ok && <div className="notice danger">기상청 특보 조회에 실패했습니다 ({weather.status.message}). 미발효와 구분됩니다. <button className="btn xs" onClick={reloadWeather}>다시 조회</button></div>}
      {weather.status.ok && list.length === 0 && (
        <div className="notice">{mode === "live" ? `기상청 API 연동 정상 · ${weather.status.message}` : "발효 중인 특보가 없습니다."}</div>
      )}
      <ul className="reslist">
        {list.map((a) => (
          <li key={a.id} onClick={() => setSel(a)}>
            <span className={`badge ${a.level === "경보" ? "solid-danger" : a.level === "주의보" ? "solid-warn" : "warn"} sq`} style={{ width: 82, justifyContent: "center" }}>{a.type}{a.level}</span>
            <span className="nm">{a.area}</span>
            {a.isNew && <span className="badge danger">새 특보</span>}
            <span className="mt">{new Date(a.issuedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} {a.status}</span>
            <IcChevR size={14} />
          </li>
        ))}
      </ul>
      {weather.preliminary.map((p, i) => (
        <div key={i} className="notice warn" style={{ marginTop: 12 }}><b>예비특보</b> · {p.text}</div>
      ))}
    </div>
  );
}

/* ---------------- 근거 원문 ---------------- */
interface DocView { title: string; kind: string; page?: number; pageCount?: number; image?: string; heading?: string; text?: string; highlight?: string; region?: string; downloadable: boolean; meta: { label: string; value: string }[] }
export function DocPane({ c }: { c: Citation }) {
  const [d, setD] = useState<DocView | null>(null);
  useEffect(() => {
    fetch(`/api/docs?docId=${encodeURIComponent(c.docId)}${c.page ? `&page=${c.page}` : ""}&locator=${encodeURIComponent(c.locator ?? "")}`)
      .then((r) => r.json())
      .then(setD)
      .catch(() => setD(null));
  }, [c.docId, c.page, c.locator]);
  return (
    <div className="dpane fadein">
      <span className="badge ok sq">{c.kind}</span>
      <h2 style={{ fontSize: 19, marginTop: 8 }}>{d?.title ?? c.title}</h2>
      <div className="xs muted" style={{ marginTop: 4 }}>{d?.region} {c.dataset && <span className="badge star">★ {c.dataset}</span>}</div>
      <div className="row" style={{ margin: "14px 0", paddingBottom: 10, borderBottom: "1px solid var(--c-line)" }}>
        <span className="xs muted">{d?.heading ?? c.locator ?? ""}</span>
        <span className="sp" />
        {c.page && <span className="badge neutral">원본 {c.page}{d?.pageCount ? ` / ${d.pageCount}쪽` : "쪽"}</span>}
        {d?.downloadable && <a className="btn xs" href={`/api/docs?docId=${encodeURIComponent(c.docId)}&download=1`}>원문 내려받기</a>}
      </div>
      {(c.quote || d?.highlight) && (
        <div className="panel" style={{ background: "#fffbeb", borderColor: "#f0d38a", borderLeft: "4px solid #e0a83c", padding: "12px 16px" }}>
          <div className="xs b" style={{ color: "#8a5a00" }}>근거 · 답변이 인용한 문장</div>
          <div className="s" style={{ marginTop: 4, lineHeight: 1.7 }}>{c.quote ?? d?.highlight}</div>
        </div>
      )}
      {d?.meta?.length ? (
        <dl className="kv" style={{ marginTop: 14 }}>
          {d.meta.map((m) => (<div key={m.label} style={{ display: "contents" }}><dt>{m.label}</dt><dd>{m.value}</dd></div>))}
        </dl>
      ) : null}
      {d?.text && <div className="s" style={{ whiteSpace: "pre-line", lineHeight: 1.75, marginTop: 14 }}>{d.text}</div>}
      {d?.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={d.image} alt={`${d.title} ${c.page ?? ""}쪽 원문`} style={{ width: "100%", marginTop: 14, border: "1px solid var(--c-line)", borderRadius: 8 }} />
      )}
    </div>
  );
}
