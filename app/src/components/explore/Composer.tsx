"use client";
import { useEffect, useRef, useState } from "react";
import { useSession, type Cond } from "@/lib/session";
import { REGIONS, DISASTER_TYPES } from "@/lib/config";
import type { DisasterType, RegionId } from "@/lib/contract/agent";
import { IcDoc, IcPlus, IcX } from "../Icons";

export const PRESETS = [
  { key: "wx", label: "현재 기상상황", q: "지금 우리 지역 기상특보와 강우 상황은 어떤가요?" },
  { key: "risk", label: "위험·취약지역", q: "지금 강우 조건에서 먼저 확인해야 할 위험·취약지역은 어디인가요?" },
  { key: "similar", label: "과거 유사사례", q: "비슷한 강우 때 과거에 어디서 어떤 피해가 있었나요?" },
  { key: "manual", label: "행동매뉴얼 대응절차", q: "지금 특보 단계에서 행동매뉴얼상 제가 해야 할 일은 무엇인가요?" },
];

export interface ScenarioItem {
  id: string; region: RegionId; stage: string; title: string; summary: string; disasterType: DisasterType;
  advisory?: { type: string; level: string }; hydro: NonNullable<Cond["hydro"]>; keywords?: string[]; question: string; chain: string[];
}

const fmtDt = (iso?: string) => (iso ? new Date(iso).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

/** 조건 요약 칩 (목업 : 상황 성격 · 기상·수문 조건 ⊗) */
export function condChips(c: Cond): { k: string; t: string }[] {
  const h = c.hydro ?? {};
  const out: { k: string; t: string }[] = [];
  if (c.situationKind?.type) out.push({ k: "sk", t: `${c.situationKind.type}${c.situationKind.level ?? ""}` });
  c.keywords?.forEach((w) => out.push({ k: `kw:${w}`, t: w }));
  const R: [keyof typeof h, string, string][] = [["rain1h", "1시간 강우", "mm"], ["rain3h", "3시간 누적", "mm"], ["rain6h", "6시간 누적", "mm"], ["rain12h", "12시간 누적", "mm"], ["rain24h", "24시간 누적", "mm"], ["rainTotal", "누적 강우", "mm"], ["waterLevel", "하천 수위", "m"], ["flow", "하천 유량", "㎥/s"], ["wind", "풍속", "m/s"], ["humidity", "습도", "%"]];
  R.forEach(([k, l, u]) => h[k] != null && h[k] !== false && out.push({ k: `h:${k}`, t: `${l} ${h[k]}${u}` }));
  return out;
}

export default function Composer({ onSend, busy, baseLabel, onLibrary, onScenario }: { onSend: (q: string, preset?: string) => void; busy: boolean; baseLabel: string; onLibrary: () => void; onScenario: (s: ScenarioItem) => void }) {
  const { cond, setCond } = useSession();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const send = () => {
    const t = q.trim();
    if (!t || busy) return;
    onSend(t);
    setQ("");
  };
  const chips = condChips(cond);
  const removeChip = (k: string) => {
    if (k === "sk") return setCond({ situationKind: undefined });
    if (k.startsWith("kw:")) return setCond({ keywords: cond.keywords?.filter((w) => w !== k.slice(3)) });
    const hk = k.slice(2) as keyof NonNullable<Cond["hydro"]>;
    setCond({ hydro: { ...cond.hydro, [hk]: undefined }, scenarioId: undefined, scenarioTitle: undefined });
  };
  return (
    <div className="composer-wrap">
      <div className="composer">
        <div className="cond">
          <span className="l">재난상황 조건</span>
          <span className="pill pri">{cond.disasterType}</span>
          <span className="pill">{baseLabel}</span>
          {cond.scenarioTitle && <span className="pill pri" title={cond.scenarioTitle}>시나리오 · {cond.scenarioTitle.split(" · ")[1] ?? cond.scenarioTitle}</span>}
          {chips.slice(0, 4).map((c) => (
            <span key={c.k} className="pill">{c.t}<button className="pill-x" onClick={() => removeChip(c.k)} aria-label={`${c.t} 해제`}>⊗</button></span>
          ))}
          {chips.length > 4 && <span className="pill">+{chips.length - 4}</span>}
          <button className="edit" onClick={() => setOpen(true)}>조건 변경 ›</button>
        </div>
        <textarea
          ref={ta}
          value={q}
          rows={2}
          maxLength={2000}
          placeholder="질문을 입력하세요. (Enter 전송 · Shift+Enter 줄바꿈)"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="tools">
          <div className="tool-chips">
            <button className="chip" onClick={() => onSend("현재 상황 브리핑", "briefing")} disabled={busy}><IcDoc size={13} /> 현재 상황 브리핑</button>
            <span style={{ width: 1, height: 20, background: "var(--c-line)", flex: "none" }} />
            {PRESETS.map((p) => <button key={p.key} className="chip" onClick={() => onSend(p.q, p.key)} disabled={busy}>{p.label}</button>)}
            <button className="chip" onClick={onLibrary} title="추천 질문 · 조건 시나리오 · 연속 질의"><IcPlus size={13} /></button>
          </div>
          <span className="cnt">{q.length} / 2,000</span>
          <button className="btn pri sm" onClick={send} disabled={busy || !q.trim()}>질의 ›</button>
        </div>
      </div>
      {open && <CondModal onClose={() => setOpen(false)} onApplyAsk={(qq) => { setOpen(false); if (qq) onSend(qq); }} onScenario={(s) => { setOpen(false); onScenario(s); }} />}
    </div>
  );
}

/* ---------------- 재난상황 조건 (목업 SCR-UNE-101001e · 101002) ---------------- */
const HYDRO_FIELDS: { k: keyof NonNullable<Cond["hydro"]>; l: string; u: string; g: string }[] = [
  { k: "rain1h", l: "1시간 강우", u: "mm", g: "누적강우" },
  { k: "rain3h", l: "3시간 누적", u: "mm", g: "누적강우" },
  { k: "rain6h", l: "6시간 누적", u: "mm", g: "누적강우" },
  { k: "rain12h", l: "12시간 누적", u: "mm", g: "누적강우" },
  { k: "rain24h", l: "24시간 누적", u: "mm", g: "누적강우" },
  { k: "waterLevel", l: "하천 수위", u: "m", g: "수문" },
  { k: "flow", l: "하천 유량", u: "m³/s", g: "수문" },
  { k: "wind", l: "풍속", u: "m/s", g: "기상" },
  { k: "humidity", l: "습도", u: "%", g: "기상" },
];

function CondModal({ onClose, onApplyAsk, onScenario }: { onClose: () => void; onApplyAsk: (q?: string) => void; onScenario: (s: ScenarioItem) => void }) {
  const { cond, setCond, weather, mode } = useSession();
  const [region, setRegion] = useState<RegionId>(cond.region);
  const [sgg, setSgg] = useState(cond.sigungu ?? "");
  const [emd, setEmd] = useState(cond.emd ?? "");
  const [sggList, setSggList] = useState<string[]>([]);
  const [emds, setEmds] = useState<Record<string, string[]>>({});
  const [dt, setDt] = useState<DisasterType>(cond.disasterType);
  const [start, setStart] = useState(cond.baseTime ?? "");
  const [end, setEnd] = useState(cond.endTime ?? "");
  const [det, setDet] = useState(!!(cond.hydro && Object.values(cond.hydro).some((v) => v != null)) || !!cond.situationKind);
  const [kind, setKind] = useState(cond.situationKind?.type ?? "");
  const [lvl, setLvl] = useState(cond.situationKind?.level ?? "");
  const [kw, setKw] = useState(cond.keywords?.join(", ") ?? "");
  const [h, setH] = useState<Record<string, string>>(Object.fromEntries(Object.entries(cond.hydro ?? {}).filter(([, v]) => v != null && typeof v === "number").map(([k, v]) => [k, String(v)])));
  const [scs, setScs] = useState<ScenarioItem[]>([]);
  const [scenario, setScenario] = useState<ScenarioItem | null>(null);

  useEffect(() => {
    fetch("/data/regions.json").then((r) => r.json()).then((j) => setSggList(j.regions.find((x: { id: string }) => x.id === region)?.sigungu.map((s: { name: string }) => s.name) ?? [])).catch(() => setSggList([]));
  }, [region]);
  useEffect(() => {
    fetch("/data/emd_index.json").then((r) => r.json()).then(setEmds).catch(() => {});
    fetch(`/api/scenarios?region=national`).then((r) => r.json()).then((j) => setScs(j.conditions)).catch(() => {});
  }, []);
  // 특보에서 채워진 조건 (목업 : ⚠ 특보에서 채워진 조건입니다)
  const top = weather?.advisories.find((a) => a.status === "발효" && (region === "national" || a.regionId === region) && a.type === "호우");
  const fillFromAdvisory = () => { if (top) { setKind(top.type); setLvl(top.level); setDet(true); } };

  const pickScenario = (id: string) => {
    const s = scs.find((x) => x.id === id) ?? null;
    setScenario(s);
    if (!s) return;
    if (s.region !== "national") setRegion(s.region);
    setSgg(""); setEmd("");
    setDt(s.disasterType);
    setDet(true);
    setKind(s.advisory?.type ?? ""); setLvl(s.advisory?.level ?? "");
    setKw(s.keywords?.join(", ") ?? "");
    setH(Object.fromEntries(Object.entries(s.hydro).filter(([, v]) => typeof v === "number").map(([k, v]) => [k, String(v)])));
  };
  const apply = (ask: boolean) => {
    if (scenario && ask) return onScenario(scenario);
    const num = (k: string) => (h[k] ? Number(h[k]) : undefined);
    setCond({
      region, sigungu: sgg || undefined, emd: emd || undefined, disasterType: dt,
      baseTime: start || undefined, endTime: end || undefined,
      situationKind: kind || lvl ? { type: kind || undefined, level: lvl || undefined } : undefined,
      keywords: kw ? kw.split(/[,\s]+/).filter(Boolean) : undefined,
      hydro: Object.fromEntries(HYDRO_FIELDS.map((f) => [f.k, num(f.k)])) as Cond["hydro"],
      scenarioId: undefined, scenarioTitle: undefined,
    });
    onApplyAsk();
  };
  const reset = () => { setDt("호우"); setStart(""); setEnd(""); setKind(""); setLvl(""); setKw(""); setH({}); setScenario(null); setSgg(""); setEmd(""); };
  const groups = ["누적강우", "수문", "기상"];

  return (
    <div className="ovl" onClick={onClose}>
      <div className="modal" style={{ width: "min(860px,100%)" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal aria-label="재난상황 조건">
        <div className="modal-hd">
          <h2>재난상황 조건</h2>
          <span className="sp" />
          <button className="iconbtn" onClick={onClose} aria-label="닫기"><IcX size={20} /></button>
        </div>
        <div className="modal-bd">
          <div className="frow" style={{ background: "var(--c-primary-sub)", padding: "10px 12px", borderRadius: 8 }}>
            <span className="lb">시나리오로 채우기</span>
            <select className="select sm" value={scenario?.id ?? ""} onChange={(e) => pickScenario(e.target.value)}>
              <option value="">직접 입력</option>
              {["사전대비(예비특보)", "초기대응(주의보)", "비상대응(경보)", "수습·복구", "재발방지·계획"].map((g) => (
                <optgroup key={g} label={g}>
                  {scs.filter((s) => s.stage === g).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          {scenario && <p className="xs muted" style={{ margin: "-4px 0 8px 124px" }}>{scenario.summary} · 적용하면 “{scenario.question}”로 바로 질의합니다.</p>}

          <div className="frow">
            <span className="lb">기준지역 <span style={{ color: "var(--c-dang)" }}>*</span></span>
            <div className="row w">
              <select className="select sm" value={region} onChange={(e) => { setRegion(e.target.value as RegionId); setSgg(""); setEmd(""); }} aria-label="도·시">
                {(["national", "busan", "yeongcheon", "inje"] as RegionId[]).map((r) => <option key={r} value={r}>{r === "national" ? "전국" : REGIONS[r].sido || REGIONS[r].name}{r === "yeongcheon" || r === "inje" ? ` ${REGIONS[r].short}` : ""}</option>)}
              </select>
              <select className="select sm" value={sgg} disabled={region === "national"} onChange={(e) => { setSgg(e.target.value); setEmd(""); }} aria-label="시·군·구">
                <option value="">시·군·구 전체</option>
                {sggList.map((s) => <option key={s}>{s}</option>)}
              </select>
              <select className="select sm" value={emd} disabled={!sgg} onChange={(e) => setEmd(e.target.value)} aria-label="읍·면·동">
                <option value="">읍·면·동 전체</option>
                {(emds[sgg] ?? []).map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="frow">
            <span className="lb">재난유형</span>
            <div className="row w">
              {DISASTER_TYPES.map((t) => <button key={t} className={`chip ${dt === t ? "on" : ""}`} onClick={() => setDt(t as DisasterType)}>{dt === t ? "✓ " : ""}{t}</button>)}
            </div>
          </div>
          <div className="frow">
            <span className="lb">발생·기준일시</span>
            <div className="row w">
              <input type="datetime-local" className="input sm" value={start} onChange={(e) => setStart(e.target.value)} aria-label="시작 일시" />
              <span className="mute2">~</span>
              <input type="datetime-local" className="input sm" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="종료 일시" />
              {!start && <span className="xs mute2">비우면 {mode === "scenario" ? "훈련 시나리오" : "현재"} 기준</span>}
            </div>
          </div>
          <div className="frow">
            <span className="lb">상황 상세정보</span>
            <div className="row">
              <span className={`xs ${condChips({ ...cond, situationKind: kind || lvl ? { type: kind, level: lvl } : undefined }).length ? "b" : "mute2"}`} style={{ color: "var(--c-primary-dk)" }}>{kind || Object.values(h).some(Boolean) ? "입력됨" : "선택 안 함"}</span>
              <button className="btn xs ghost" onClick={() => setDet((v) => !v)} aria-expanded={det}>{det ? "접기 ⌃" : "펼치기 ⌄"}</button>
            </div>
          </div>
          {det && (
            <div className="panel" style={{ background: "var(--c-surface)" }}>
              {region === "national" ? (
                <div className="notice">전국 조건에서는 기상·수문 조건을 입력하지 않습니다. 기준지역을 고르면 입력할 수 있습니다.</div>
              ) : (
                <>
                  <b className="s">상황 성격</b>
                  <div className="grid2" style={{ marginTop: 8 }}>
                    <label className="xs muted">특보종류<select className="select sm" style={{ width: "100%", marginTop: 4 }} value={kind} onChange={(e) => setKind(e.target.value)}><option value="">선택 안 함</option>{["호우", "태풍", "강풍", "풍랑", "폭풍해일"].map((o) => <option key={o}>{o}</option>)}</select></label>
                    <label className="xs muted">경보단계<select className="select sm" style={{ width: "100%", marginTop: 4 }} value={lvl} onChange={(e) => setLvl(e.target.value)}><option value="">선택 안 함</option><option>예비특보</option><option>주의보</option><option>경보</option></select></label>
                  </div>
                  <label className="xs muted" style={{ display: "block", marginTop: 10 }}>피해·통제 키워드<input className="input sm" style={{ width: "100%", marginTop: 4 }} placeholder="예: 침수, 지하차도, 도로통제" value={kw} onChange={(e) => setKw(e.target.value)} /></label>
                  {top && <button className="btn xs line" style={{ marginTop: 8 }} onClick={fillFromAdvisory}>발효 특보로 채우기 ({top.type}{top.level})</button>}
                  <hr style={{ border: 0, borderTop: "1px solid var(--c-line)", margin: "14px 0" }} />
                  <b className="s">기상·수문 조건 (직접 입력)</b>
                  {groups.map((g) => (
                    <div key={g} style={{ marginTop: 10 }}>
                      <div className="xs muted b" style={{ marginBottom: 6 }}>{g} 직접 입력</div>
                      <div className="hydro-grid">
                        {HYDRO_FIELDS.filter((f) => f.g === g).map((f) => (
                          <label key={f.k} className="row xs">
                            <input type="checkbox" checked={!!h[f.k]} readOnly />
                            <span style={{ width: 76 }}>{f.l}</span>
                            <input className="input sm" style={{ width: 92 }} inputMode="decimal" placeholder="값 입력" value={h[f.k] ?? ""} onChange={(e) => setH({ ...h, [f.k]: e.target.value.replace(/[^\d.]/g, "") })} />
                            <span className="mute2">{f.u}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                  {(kind || Object.values(h).some(Boolean)) && (
                    <div className="row w" style={{ marginTop: 12, gap: 6 }}>
                      <span className="xs muted">직접 입력한 조건 · {start ? fmtDt(start) : "기준일시"} 기준</span>
                      {kind && <span className="pill pri">{kind}{lvl}</span>}
                      {HYDRO_FIELDS.filter((f) => h[f.k]).map((f) => <span key={f.k} className="pill">{f.l} {h[f.k]}{f.u}</span>)}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {top && mode === "scenario" && <p className="xs" style={{ color: "var(--c-warn-dk)", marginTop: 10 }}>⚠ 기상특보({top.area} {top.type}{top.level}) 기준 조건입니다 · 확인 후 질의하세요.</p>}
        </div>
        <div className="modal-ft">
          <button className="btn ghost sm" onClick={reset} title="로그인한 계정의 처음 조건으로 되돌립니다">기본 조건으로 되돌리기</button>
          <span className="sp" />
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn pri" onClick={() => apply(true)}>적용</button>
        </div>
      </div>
    </div>
  );
}
