"use client";
/**
 * 내부용 「응답 정합성 검증」 — 시스템 운영자 · T3Q 담당자
 *  ① 요청 정합 : 보낸 질의 ↔ Agent가 받은 질의(echo)        (UNE·T3Q 연계)
 *  ② 응답 정답 : Agent 응답값 ↔ 정답셋 기대값               (T3Q)
 *  ③ 표출 정합 : Agent 응답값 ↔ 화면에 그려진 값            (UNE)
 * ①②③ 결과로 문항 판정(정합/부정합/보류·조치 담당·사유)을 자동으로 내고, 뒤집어야 할 때만 사람이 수정한다. CSV 내보내기. 판정·정답값·실행 결과는 서버 공용 저장(D39).
 */
import { api } from "@/lib/api";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentResponse, Citation, EntityRef } from "@/lib/contract/agent";
import { REGIONS } from "@/lib/config";
import { useSession, type Conversation, type Turn } from "@/lib/session";
import { MARK_LABEL, autoVerdict, checkRender, checkRequest, pct, visibleExpectations, type AutoVerdict, type GoldItem, type Mark, type VerifyResult } from "@/lib/verify";
import AnswerView from "../explore/AnswerView";
import { ExploreContext, type ExploreApi } from "../explore/ExploreCtx";
import { openHelp } from "@/components/HelpCenter";

interface Verdict { verdict: "정합" | "부정합" | "보류"; owner: "T3Q" | "UNE" | "공통"; memo: string; at: string; by: string }
interface GoldSet { meta: { name: string; builtAt: string; source: string; count: number }; items: GoldItem[] }
interface LiveRow { key: string; at: string; conv: string; account: string; turn: Turn }

const LS = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const MarkBadge = ({ m, text }: { m: Mark; text?: string }) => <span className={`badge ${m === "ok" ? "ok" : m === "fail" ? "danger" : m === "warn" ? "warn" : "neutral"}`}>{text ?? MARK_LABEL[m]}</span>;
const condOf = (c: GoldItem["context"]) => `${REGIONS[c.region].short} · ${c.aiMode ? "AI 모드" : c.refAdvisory ? `참조 ${c.refAdvisory.type}${c.refAdvisory.level}` : c.hydro || c.situationKind || c.scenarioId ? "입력 조건" : "조건 없음"}`;
const BASIS: Record<string, string> = { "ai-mode": "AI 모드 (현재 발효 특보)", "ref-advisory": "참조 특보", conditions: "입력한 재난상황 조건", none: "조건 없음 (기준지역 일반 질의)" };
const hm = (iso: string) => new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
/** 최종 판정 = 사람이 수정한 판정이 있으면 그것, 없으면 자동 판정 */
interface Final { verdict: Verdict["verdict"]; owner: string; reason: string; manual: boolean }
const finalOf = (auto: AutoVerdict | null, ov?: Verdict): Final | null =>
  ov ? { verdict: ov.verdict, owner: ov.owner, reason: ov.memo, manual: true } : auto ? { verdict: auto.verdict, owner: auto.owner ?? "", reason: auto.reasons.join(" / "), manual: false } : null;
const VerdictBadge = ({ f }: { f: Final | null }) =>
  f ? (
    <span className="row" style={{ gap: 4 }}>
      <span className={`badge ${f.verdict === "정합" ? "ok" : f.verdict === "부정합" ? "danger" : "warn"}`}>{f.verdict}</span>
      {f.verdict !== "정합" && f.owner && <span className="xs mute2">{f.owner}</span>}
      {f.manual && <span className="badge info" title="사람이 수정한 판정">수정</span>}
    </span>
  ) : <span className="xs mute2">미실행</span>;
const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** 응답 검증 공용 저장 (운영자, scope verify) — 실패해도 화면 값은 유지 */
function putVerify(key: string, value: unknown) {
  api("/api/kv", { method: "PUT", json: { scope: "verify", key, value } }).catch(() => console.warn("[verify] 서버 저장 실패", key));
}

export default function VerifyTab() {
  const s = useSession();
  const [gold, setGold] = useState<GoldSet | null>(null);
  const [local, setLocal] = useState<GoldItem[]>([]);
  const [over, setOver] = useState<Record<string, GoldItem["expect"]>>({});
  const [results, setResults] = useState<Record<string, VerifyResult>>({});
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [view, setView] = useState<"gold" | "live">("gold");
  const [group, setGroup] = useState("");
  const [onlyBad, setOnlyBad] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [allConvs, setAllConvs] = useState<{ account: string; convs: Conversation[] }[]>([]);

  useEffect(() => {
    // 실사용 질의 : 서버에 저장된 모든 계정의 대화 (운영자 전용)
    api<{ account: string; convs: Conversation[] }[]>("/api/conversations?all=1").then(setAllConvs).catch(() => setAllConvs([]));
    fetch("/api/verify").then((r) => r.json()).then(setGold).catch(() => setGold({ meta: { name: "정답셋을 불러오지 못했습니다", builtAt: "", source: "", count: 0 }, items: [] }));
    // 판정·정답값·실행 결과·직접 등록 문항 — 서버 공용(D39). 이 브라우저에 예전 것이 있고 서버가 비어 있으면 처음 한 번 옮김
    api<Record<string, { value: unknown }>>("/api/kv?scope=verify")
      .then(async (kv) => {
        const pick = <T,>(key: string, d: T): T => {
          if (kv[key]) return kv[key].value as T;
          const old = LS.get<T | null>(`sa.${key}`, null);
          if (old && (Array.isArray(old) ? old.length : Object.keys(old as object).length)) putVerify(key, old);
          return old ?? d;
        };
        setLocal(pick("goldLocal", []));
        setOver(pick("goldOverride", {}));
        setResults(pick("verifyRun", {}));
        setVerdicts(pick("verdict", {}));
      })
      .catch(() => {});
  }, []);

  /** 정답셋 문항 (로컬 등록분 포함, 화면에서 고친 정답값 반영) */
  const items = useMemo(() => [...(gold?.items ?? []), ...local].map((x) => (over[x.id] ? { ...x, expect: over[x.id], source: "화면에서 수정한 정답값" } : x)), [gold, local, over]);
  const groups = useMemo(() => [...new Set(items.map((x) => x.group ?? "기타"))], [items]);
  const fin = (id: string) => finalOf(results[id] ? autoVerdict(results[id]) : null, verdicts[id]);
  const shown = items.filter((x) => (!group || (x.group ?? "기타") === group) && (!onlyBad || fin(x.id)?.verdict === "부정합"));
  const keepResults = (next: Record<string, VerifyResult>) => {
    setResults(next);
    putVerify("verifyRun", Object.fromEntries(Object.entries(next).map(([k, v]) => [k, { ...v, request: undefined, response: undefined }])));
  };
  const post = async (body: unknown): Promise<VerifyResult[]> => {
    const r = await fetch("/api/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message ?? "검증 실행 실패");
    return j.results;
  };
  const runAll = async () => {
    setRunning("all");
    try {
      const target = shown;
      const plain = target.filter((x) => !x.local && !over[x.id]).map((x) => x.id);
      const custom = target.filter((x) => x.local || over[x.id]);
      const out: VerifyResult[] = plain.length ? await post({ ids: plain }) : [];
      for (const it of custom) out.push(...(await post({ item: it })));
      keepResults({ ...results, ...Object.fromEntries(out.map((r) => [r.id, r])) });
      s.toast(`${out.length}문항 실행 완료`);
    } catch (e) {
      s.toast(e instanceof Error ? e.message : "검증 실행 실패");
    }
    setRunning(null);
  };
  const runOne = async (it: GoldItem) => {
    setRunning(it.id);
    try {
      const [r] = await post({ item: it, full: true });
      setResults((prev) => {
        const next = { ...prev, [it.id]: r };
        putVerify("verifyRun", Object.fromEntries(Object.entries(next).map(([k, v]) => [k, { ...v, request: undefined, response: undefined }])));
        return next;
      });
    } catch (e) {
      s.toast(e instanceof Error ? e.message : "검증 실행 실패");
    }
    setRunning(null);
  };
  const saveVerdict = (key: string, v: Omit<Verdict, "at" | "by">) => {
    const next = { ...verdicts, [key]: { ...v, at: new Date().toISOString(), by: s.account?.id ?? "-" } };
    setVerdicts(next);
    putVerify("verdict", next);
    s.toast("판정을 수정했습니다");
  };
  const clearVerdict = (key: string) => {
    const next = { ...verdicts };
    delete next[key];
    setVerdicts(next);
    putVerify("verdict", next);
    s.toast("자동 판정으로 되돌렸습니다");
  };

  /* ---------- 집계 ---------- */
  const ran = shown.map((x) => results[x.id]).filter((r): r is VerifyResult => !!r);
  const okN = (f: (r: VerifyResult) => Mark | undefined) => ran.filter((r) => f(r) === "ok").length;
  const idExp = ran.reduce((n, r) => n + (r.ans?.ids.expected.length ?? 0), 0), idHit = ran.reduce((n, r) => n + (r.ans?.ids.matched.length ?? 0), 0);
  const valAll = ran.reduce((n, r) => n + (r.ans?.values.length ?? 0), 0), valOk = ran.reduce((n, r) => n + (r.ans?.values.filter((v) => v.mark === "ok").length ?? 0), 0);
  const fins = shown.map((x) => fin(x.id)).filter((f): f is Final => !!f);
  const cards: [string, string, string, Mark][] = [
    ["① 요청 정합", ran.length ? `${pct(okN((r) => r.req.mark), ran.length)}%` : "—", `보낸 질의 = 받은 질의 · 불일치 ${ran.filter((r) => r.req.mark === "fail").length}건`, ran.some((r) => r.req.mark === "fail") ? "fail" : "ok"],
    ["② 응답 정답", ran.length ? `${pct(okN((r) => r.ans?.mark), ran.length)}%` : "—", `대상 ID ${pct(idHit, idExp)}% · 항목값 ${pct(valOk, valAll)}% (${valOk}/${valAll})`, ran.some((r) => r.ans?.mark === "fail" || r.error) ? "fail" : "ok"],
    ["③ 표출 정합", ran.length ? `${pct(okN((r) => r.render.mark), ran.length)}%` : "—", `응답 값이 화면 모델로 빠짐없이 · 누락 ${ran.filter((r) => r.render.mark === "fail").length}건`, ran.some((r) => r.render.mark === "fail") ? "fail" : "ok"],
    ["판정 (자동)", fins.length ? `정합 ${fins.filter((f) => f.verdict === "정합").length} · 부정합 ${fins.filter((f) => f.verdict === "부정합").length}` : "—", `보류 ${fins.filter((f) => f.verdict === "보류").length} · 사람이 수정 ${fins.filter((f) => f.manual).length}건 · 미실행 ${shown.length - fins.length}`, fins.some((f) => f.verdict === "부정합") ? "fail" : "na"],
  ];

  const exportCsv = () => {
    const head = ["문항 ID", "역량질문", "구분", "질문", "조건", "① 요청 정합", "기대 의도", "응답 의도", "대상 ID 기대", "대상 ID 일치", "누락 ID", "항목값 일치", "항목값 전체", "불일치 항목", "근거 일치", "② 응답 정답", "③ 표출 정합", "오류", "판정", "판정 방식", "조치 담당", "사유", "실행 시각"];
    const rows = shown.map((x) => {
      const r = results[x.id], v = fin(x.id), a = r?.ans;
      return [x.id, (x.cq ?? []).join(" "), x.group ?? "", x.question, condOf(x.context), r ? MARK_LABEL[r.req.mark] : "", a?.intent.expected ?? "", a?.intent.actual ?? "", a?.ids.expected.length ?? "", a?.ids.matched.length ?? "", a?.ids.missing.join(" ") ?? "",
        a?.values.filter((q) => q.mark === "ok").length ?? "", a?.values.length ?? "", a?.values.filter((q) => q.mark !== "ok").map((q) => `${q.dqId} ${q.entityId} ${q.field}: ${q.expected} → ${q.actual ?? "없음"}`).join(" / ") ?? "",
        a ? `${a.cites.filter((c) => c.mark === "ok").length}/${a.cites.length}` : "", a ? MARK_LABEL[a.mark] : "", r ? MARK_LABEL[r.render.mark] : "", r?.error ?? "", v?.verdict ?? "", v ? (v.manual ? "사람 수정" : "자동") : "", v?.owner ?? "", v?.reason ?? "", r ? r.ranAt : ""];
    });
    const csv = "\uFEFF" + [head, ...rows].map((l) => l.map(csvCell).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `응답정합성검증_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* ---------- 실사용 질의 (서버에 저장된 모든 계정 대화) ---------- */
  const live: LiveRow[] = useMemo(
    () => allConvs.flatMap(({ account, convs }) => convs.flatMap((c) => c.turns.filter((t) => t.res).map((t) => ({ key: `T:${t.id}`, at: t.at, conv: c.title, account, turn: t })))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 150),
    [allConvs],
  );
  const promote = (row: LiveRow) => {
    const t = row.turn, res = t.res!;
    if (!t.req) return s.toast("보낸 질의 기록이 없는 대화입니다 (이전 버전에서 저장됨)");
    const head = res.blocks.find((b) => b.kind === "headline");
    const headIds = head && head.kind === "headline" ? [...new Set([...head.text.matchAll(/\{\{e:([^}]+)\}\}/g)].map((m) => m[1]))] : [];
    const item: GoldItem = {
      id: `L-${String(local.length + 1).padStart(2, "0")}-${t.id.slice(-4)}`, group: "실사용 질의 등록", question: t.req.question, presetKey: t.req.presetKey, context: t.req.context, local: true,
      source: "실사용 질의에서 등록 — 정답값은 T3Q 담당자가 [정답값 편집]으로 확정",
      expect: { intent: res.intent, entityIds: (res.mapFocus?.entityIds?.length ? res.mapFocus.entityIds : headIds).slice(0, 5), values: [], citations: res.citations.slice(0, 2).map((c) => ({ docId: c.docId, page: c.page })) },
    };
    const next = [...local, item];
    setLocal(next);
    putVerify("goldLocal", next);
    setView("gold");
    setGroup("실사용 질의 등록");
    setSel(null);
    s.toast("정답셋에 등록했습니다 — 정답값을 확인·수정하세요");
  };

  if (!gold) return <div className="typing"><i /><i /><i /></div>;

  /* ---------- 상세 ---------- */
  if (sel) {
    if (sel.startsWith("T:")) {
      const row = live.find((l) => l.key === sel);
      if (!row) return null;
      const res = row.turn.res!;
      return (
        <Detail
          id={row.key} title={row.turn.q} sub={`실사용 질의 · ${hm(row.at)} · ${row.account} · ${row.conv}`}
          req={checkRequest(row.turn.req, res)} ans={null} render={checkRender(res)} response={res} request={row.turn.req}
          auto={autoVerdict({ req: checkRequest(row.turn.req, res), ans: null, render: checkRender(res) })}
          verdict={verdicts[row.key]} onVerdict={(v) => saveVerdict(row.key, v)} onClearVerdict={() => clearVerdict(row.key)} onBack={() => setSel(null)}
          extra={<button className="btn sm line" onClick={() => promote(row)}>정답셋으로 등록</button>}
          note="정답셋에 없는 질문이라 ② 응답 정답은 자동 판정하지 않습니다. 정답셋으로 등록하면 기대값과 비교할 수 있습니다."
        />
      );
    }
    const i = shown.findIndex((x) => x.id === sel);
    const it = items.find((x) => x.id === sel);
    if (!it) return null;
    const r = results[it.id];
    return (
      <Detail
        id={it.id} title={it.question} sub={`${it.group ?? ""}${it.cq?.length ? ` · ${it.cq.join(" · ")}` : ""} · ${condOf(it.context)}`}
        req={r?.req} ans={r?.ans ?? null} render={r?.render} response={r?.response} request={r?.request} error={r?.error} ranAt={r?.ranAt} busy={running === it.id}
        item={it} overridden={!!over[it.id]}
        onRun={() => runOne(it)}
        onExpect={(ex) => {
          const next = { ...over };
          if (ex) next[it.id] = ex; else delete next[it.id];
          setOver(next);
          putVerify("goldOverride", next);
          runOne({ ...it, expect: ex ?? (gold.items.find((g) => g.id === it.id) ?? local.find((g) => g.id === it.id) ?? it).expect });
        }}
        auto={r ? autoVerdict(r) : null}
        verdict={verdicts[it.id]} onVerdict={(v) => saveVerdict(it.id, v)} onClearVerdict={() => clearVerdict(it.id)} onBack={() => setSel(null)}
        onPrev={i > 0 ? () => setSel(shown[i - 1].id) : undefined} onNext={i >= 0 && i < shown.length - 1 ? () => setSel(shown[i + 1].id) : undefined}
      />
    );
  }

  /* ---------- 목록 ---------- */
  return (
    <>
      <div className="notice row" style={{ marginBottom: 14, gap: 10 }}>
        <span>
          <b>무엇을 확인하나</b> — ① 우리가 보낸 질의를 Agent가 그대로 받았는지 · ② Agent 응답이 <b>정답셋의 기대값</b>과 같은지(T3Q) · ③ 응답 값이 화면에 빠짐없이 그려지는지(UNE).
          결과에 따라 <b>정합/부정합이 자동으로 판정</b>되고, 뒤집어야 할 때만 수정합니다.
        </span>
        <span className="sp" />
        <button className="btn sm line" style={{ flex: "none" }} onClick={() => openHelp("verify")}>도움말 · 사용 방법</button>
      </div>
      <div className="row w" style={{ marginBottom: 14, gap: 8 }}>
        <div className="subtabs" style={{ margin: 0, maxWidth: 360 }}>
          <button className={view === "gold" ? "on" : ""} onClick={() => setView("gold")}>정답셋 검증 {items.length}</button>
          <button className={view === "live" ? "on" : ""} onClick={() => setView("live")}>실사용 질의 {live.length}</button>
        </div>
        <span className="sp" />
        {view === "gold" && (
          <>
            <select className="select sm" value={group} onChange={(e) => setGroup(e.target.value)} aria-label="구분">
              <option value="">전체 구분</option>
              {groups.map((g) => <option key={g}>{g}</option>)}
            </select>
            <label className="row xs" style={{ gap: 4 }}><input type="checkbox" checked={onlyBad} onChange={(e) => setOnlyBad(e.target.checked)} /> 부정합만</label>
            <button className="btn sm pri" onClick={runAll} disabled={!!running}>{running === "all" ? "실행 중…" : `▶ ${shown.length}문항 실행`}</button>
            <button className="btn sm" onClick={exportCsv} disabled={!ran.length}>CSV 내보내기</button>
          </>
        )}
      </div>

      {view === "gold" && (
        <>
          <div className="grid3" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 14 }}>
            {cards.map(([l, v, d, m]) => (
              <div key={l} className="panel" style={{ padding: "14px 16px", borderColor: m === "fail" ? "#f8cdc9" : undefined }}>
                <div className="xs muted">{l}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: m === "fail" ? "var(--c-dang-dk)" : undefined }}>{v}</div>
                <div className="xs mute2">{d}</div>
              </div>
            ))}
          </div>
          <p className="xs mute2" style={{ margin: "0 0 8px" }}>정답셋 : {gold.meta.name} · {gold.meta.source} · 실행 {ran.length}/{shown.length}문항</p>
          <table className="tbl">
            <thead><tr><th>문항</th><th>질문</th><th>조건</th><th>① 요청</th><th>② 응답 정답 (의도 · 대상 ID · 항목값 · 근거)</th><th>③ 표출</th><th>판정</th></tr></thead>
            <tbody>
              {shown.map((x) => {
                const r = results[x.id], a = r?.ans;
                return (
                  <tr key={x.id} className="click" onClick={() => { setSel(x.id); if (!r?.response) runOne(x); }}>
                    <td className="xs"><code>{x.id}</code>{x.cq?.length ? <div className="mute2">{x.cq[0]}{x.cq.length > 1 ? ` 외 ${x.cq.length - 1}` : ""}</div> : null}{over[x.id] ? <div><span className="badge info">정답값 수정</span></div> : null}</td>
                    <td>{x.question}<div className="xs mute2">{x.group}</div></td>
                    <td className="xs">{condOf(x.context)}</td>
                    <td>{r ? <MarkBadge m={r.req.mark} /> : <span className="xs mute2">미실행</span>}</td>
                    <td className="xs">
                      {r?.error ? <span className="badge danger">오류</span> : a ? (
                        <span className="row w" style={{ gap: 4 }}>
                          <MarkBadge m={a.mark} />
                          <MarkBadge m={a.intent.mark} text={`의도 ${a.intent.actual}`} />
                          {a.ids.expected.length > 0 && <MarkBadge m={a.ids.mark} text={`ID ${a.ids.matched.length}/${a.ids.expected.length}`} />}
                          {a.values.length > 0 && <MarkBadge m={a.values.every((q) => q.mark === "ok") ? "ok" : "fail"} text={`값 ${a.values.filter((q) => q.mark === "ok").length}/${a.values.length}`} />}
                          {a.cites.length > 0 && <MarkBadge m={a.cites.every((q) => q.mark === "ok") ? "ok" : "fail"} text={`근거 ${a.cites.filter((q) => q.mark === "ok").length}/${a.cites.length}`} />}
                        </span>
                      ) : null}
                    </td>
                    <td>{r ? <MarkBadge m={r.render.mark} /> : null}</td>
                    <td><VerdictBadge f={fin(x.id)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {view === "live" && (
        <>
          <p className="xs mute2" style={{ margin: "0 0 8px" }}>서버에 저장된 모든 계정의 실제 질의입니다. 정답셋에 없으므로 ①·③만 자동 점검하고, 좋은 사례는 정답셋으로 등록합니다.</p>
          <table className="tbl">
            <thead><tr><th>시각</th><th>계정</th><th>질문</th><th>의도 · 판단 기준</th><th>① 요청</th><th>③ 표출</th><th>판정</th></tr></thead>
            <tbody>
              {live.map((l) => {
                const res = l.turn.res!, rq = checkRequest(l.turn.req, res), rd = checkRender(res);
                return (
                  <tr key={l.key} className="click" onClick={() => setSel(l.key)}>
                    <td className="num xs">{hm(l.at)}</td>
                    <td className="xs">{l.account}</td>
                    <td>{l.turn.q}<div className="xs mute2">{l.conv}</div></td>
                    <td className="xs">{res.intent}{res.interpretation ? <div className="mute2">{BASIS[res.interpretation.basis]}</div> : null}</td>
                    <td>{l.turn.req ? <MarkBadge m={rq.mark} /> : <span className="xs mute2">기록 없음</span>}</td>
                    <td><MarkBadge m={rd.mark} /></td>
                    <td><VerdictBadge f={finalOf(autoVerdict({ req: rq, ans: null, render: rd }), verdicts[l.key])} /></td>
                  </tr>
                );
              })}
              {!live.length && <tr><td colSpan={7} className="xs mute2">아직 주고받은 질의가 없습니다. 대화 화면에서 질문하면 여기에 쌓입니다.</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

/* =====================================================================
   단건 검증 상세 — 3단 비교 + 화면 미리보기 + 사람 판정
   ===================================================================== */
function Detail(p: {
  id: string; title: string; sub: string;
  req?: VerifyResult["req"]; ans: VerifyResult["ans"]; render?: VerifyResult["render"];
  request?: unknown; response?: AgentResponse; error?: string; ranAt?: string; busy?: boolean;
  item?: GoldItem; overridden?: boolean;
  onRun?: () => void; onExpect?: (ex: GoldItem["expect"] | null) => void;
  auto: AutoVerdict | null;
  verdict?: Verdict; onVerdict: (v: Omit<Verdict, "at" | "by">) => void; onClearVerdict: () => void;
  onBack: () => void; onPrev?: () => void; onNext?: () => void; extra?: React.ReactNode; note?: string;
}) {
  const [vd, setVd] = useState<Verdict["verdict"]>(p.verdict?.verdict ?? "정합");
  const [owner, setOwner] = useState<Verdict["owner"]>(p.verdict?.owner ?? "T3Q");
  const [memo, setMemo] = useState(p.verdict?.memo ?? "");
  const [fix, setFix] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const [editErr, setEditErr] = useState("");
  const [dom, setDom] = useState<{ kind: string; text: string; ok: boolean }[] | null>(null);
  const pv = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setVd(p.verdict?.verdict ?? "정합"); setOwner(p.verdict?.owner ?? "T3Q"); setMemo(p.verdict?.memo ?? ""); setFix(false); setEdit(null); setEditErr(""); setDom(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id]);
  // ③ 화면 대조 : 미리보기로 그린 답변 카드에 응답 값이 실제로 보이는지
  useEffect(() => {
    if (!p.response) return;
    const t = window.setTimeout(() => {
      const txt = (pv.current?.innerText ?? "").replace(/\s+/g, "");
      setDom(visibleExpectations(p.response!).map((x) => ({ ...x, ok: txt.includes(x.text.replace(/\s+/g, "")) })));
    }, 350);
    return () => window.clearTimeout(t);
  }, [p.response]);
  const stub: ExploreApi = useMemo(() => {
    const ents = new Map<string, EntityRef>((p.response?.entities ?? []).map((e) => [e.id, e]));
    const cites = new Map<string, Citation>((p.response?.citations ?? []).map((c) => [c.id, c]));
    const no = () => {};
    return { openDetail: no, openList: no, openCitation: no, openMap: no, openWx: no, hover: no, hovered: null, ask: no, entityById: (id) => ents.get(id), citationById: (id) => cites.get(id), selectedId: null };
  }, [p.response]);
  const ip = p.response?.interpretation;
  const domBad = dom?.filter((d) => !d.ok) ?? [];

  return (
    <div className="vf">
      <div className="row w" style={{ gap: 8, marginBottom: 10 }}>
        <button className="btn sm" onClick={p.onBack}>← 목록</button>
        {p.onPrev && <button className="btn sm ghost" onClick={p.onPrev}>◀ 이전</button>}
        {p.onNext && <button className="btn sm ghost" onClick={p.onNext}>다음 ▶</button>}
        <span className="sp" />
        {p.ranAt && <span className="xs mute2">실행 {hm(p.ranAt)}</span>}
        {p.extra}
        {p.onRun && <button className="btn sm pri" onClick={p.onRun} disabled={p.busy}>{p.busy ? "실행 중…" : "다시 실행"}</button>}
      </div>
      <h2 style={{ fontSize: 20 }}><code style={{ fontSize: 13, marginRight: 8 }}>{p.id.replace(/^T:/, "")}</code>{p.title}</h2>
      <p className="xs muted" style={{ margin: "4px 0 14px" }}>{p.sub}</p>
      {p.error && <div className="notice danger" style={{ marginBottom: 12 }}>{p.error}</div>}
      {p.note && <div className="notice" style={{ marginBottom: 12 }}>{p.note}</div>}
      {!p.req && !p.error && <div className="notice">{p.busy ? "실행 중입니다…" : "아직 실행하지 않았습니다. [다시 실행]을 누르세요."}</div>}

      {/* ① 요청 정합 */}
      {p.req && (
        <section className="panel vf-sec">
          <div className="row"><h3>① 요청 정합 <span className="xs muted">보낸 질의 ↔ Agent가 받은 질의 · UNE·T3Q 연계</span></h3><span className="sp" /><MarkBadge m={p.req.mark} /></div>
          {ip && (
            <div className="row w xs" style={{ gap: 6, margin: "8px 0" }}>
              <span className="muted">Agent 해석</span>
              <span className="badge info">의도 {ip.intent}</span>
              <span className="badge neutral">지역 {REGIONS[ip.region].short}</span>
              <span className="badge neutral">재난유형 {ip.disasterType ?? "선택 안 함"}</span>
              <span className="badge neutral">판단 기준 · {BASIS[ip.basis]}</span>
              {ip.refEntityId && <span className="badge neutral">참조 대상 {ip.refEntityId}</span>}
            </div>
          )}
          {p.req.rows.length > 0 ? (
            <table className="tbl vf-t">
              <thead><tr><th>항목</th><th>보낸 값 (UNE)</th><th>받은 값 (Agent echo)</th><th>결과</th></tr></thead>
              <tbody>
                {p.req.rows.map((r) => (
                  <tr key={r.path} className={r.mark === "fail" ? "bad" : ""}>
                    <td><code>{r.path}</code></td><td>{r.sent}</td><td>{r.received}</td>
                    <td><MarkBadge m={r.mark} text={r.note ?? MARK_LABEL[r.mark]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="xs mute2">보낸 질의 기록이 없는 대화입니다 (이전 버전에서 저장됨).</p>}
        </section>
      )}

      {/* ② 응답 정답 */}
      {p.ans && p.item && (
        <section className="panel vf-sec">
          <div className="row"><h3>② 응답 정답 <span className="xs muted">Agent 응답값 ↔ 정답셋 기대값 · T3Q</span></h3><span className="sp" /><MarkBadge m={p.ans.mark} /></div>
          <p className="xs mute2" style={{ margin: "4px 0 8px" }}>정답값 출처 : {p.item.source ?? "UNE 시드 기준 (T3Q 정답셋 수신 시 교체)"}</p>
          <table className="tbl vf-t">
            <thead><tr><th>구분</th><th>대상 · 항목</th><th>기대값 (정답셋)</th><th>응답값 (Agent)</th><th>결과</th></tr></thead>
            <tbody>
              <tr className={p.ans.intent.mark === "fail" ? "bad" : ""}><td>의도</td><td>질의 의도</td><td>{p.ans.intent.expected ?? "—"}</td><td>{p.ans.intent.actual}</td><td><MarkBadge m={p.ans.intent.mark} /></td></tr>
              <tr className={p.ans.ids.mark === "fail" ? "bad" : ""}>
                <td>대상 ID</td><td>응답에 포함돼야 할 대상</td><td>{p.ans.ids.expected.join(", ") || "—"}</td>
                <td>일치 {p.ans.ids.matched.length} / 기대 {p.ans.ids.expected.length} (응답 대상 {p.ans.ids.actualCount}건){p.ans.ids.missing.length ? ` · 누락 ${p.ans.ids.missing.join(", ")}` : ""}</td>
                <td><MarkBadge m={p.ans.ids.mark} /></td>
              </tr>
              {p.ans.values.map((v, i) => (
                <tr key={i} className={v.mark === "fail" ? "bad" : ""}>
                  <td><code>{v.dqId}</code></td><td>{v.entityId} · {v.field}</td><td>{v.expected}</td><td>{v.actual ?? "(상세 응답에 없음)"}</td><td><MarkBadge m={v.mark} /></td>
                </tr>
              ))}
              {p.ans.cites.map((c, i) => (
                <tr key={`c${i}`} className={c.mark === "fail" ? "bad" : ""}><td>근거</td><td>근거 문서</td><td>{c.docId}{c.page ? ` p.${c.page}` : ""}</td><td>{c.mark === "ok" ? "응답 근거에 있음" : "응답 근거에 없음"}</td><td><MarkBadge m={c.mark} /></td></tr>
              ))}
            </tbody>
          </table>
          {p.onExpect && (
            <div style={{ marginTop: 10 }}>
              {edit == null ? (
                <div className="row w" style={{ gap: 6 }}>
                  <button className="btn xs" onClick={() => setEdit(JSON.stringify(p.item!.expect, null, 1))}>정답값 편집</button>
                  {p.overridden && <button className="btn xs ghost" onClick={() => p.onExpect!(null)}>원래 정답값으로</button>}
                  <span className="xs mute2">T3Q 담당자가 기대값을 고쳐 다시 비교할 수 있습니다 (서버에 저장).</span>
                </div>
              ) : (
                <>
                  <textarea className="vf-json" rows={12} value={edit} onChange={(e) => setEdit(e.target.value)} aria-label="정답값 JSON" />
                  {editErr && <div className="xs" style={{ color: "var(--c-dang-dk)" }}>{editErr}</div>}
                  <div className="row" style={{ gap: 6, marginTop: 6 }}>
                    <button className="btn xs pri" onClick={() => { try { const ex = JSON.parse(edit); setEditErr(""); setEdit(null); p.onExpect!(ex); } catch { setEditErr("JSON 형식이 올바르지 않습니다."); } }}>적용하고 다시 비교</button>
                    <button className="btn xs ghost" onClick={() => { setEdit(null); setEditErr(""); }}>취소</button>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {/* ③ 표출 정합 */}
      {p.render && (
        <section className="panel vf-sec">
          <div className="row"><h3>③ 표출 정합 <span className="xs muted">Agent 응답값 ↔ 화면에 그려진 값 · UNE</span></h3><span className="sp" /><MarkBadge m={p.render.mark === "ok" && domBad.length ? "fail" : p.render.mark} /></div>
          <div className="vf-two">
            <div>
              <table className="tbl vf-t">
                <thead><tr><th>점검</th><th>내용</th><th>결과</th></tr></thead>
                <tbody>
                  {p.render.rows.map((r) => <tr key={r.label} className={r.mark === "fail" ? "bad" : ""}><td>{r.label}</td><td>{r.detail}</td><td><MarkBadge m={r.mark} /></td></tr>)}
                  {dom && (
                    <tr className={domBad.length ? "bad" : ""}>
                      <td>화면 표시</td>
                      <td>응답 값 {dom.length}개 중 {dom.length - domBad.length}개가 답변 카드에 보임{domBad.length ? ` · 안 보이는 값 : ${domBad.slice(0, 3).map((d) => `[${d.kind}] ${d.text.slice(0, 24)}`).join(", ")}` : ""}</td>
                      <td><MarkBadge m={domBad.length ? "fail" : "ok"} /></td>
                    </tr>
                  )}
                </tbody>
              </table>
              {!p.response && <p className="xs mute2" style={{ marginTop: 6 }}>화면 미리보기는 [다시 실행] 후 표시됩니다.</p>}
            </div>
            {p.response && (
              <div className="vf-pv" ref={pv} aria-label="답변 카드 미리보기">
                <div className="xs muted b" style={{ marginBottom: 6 }}>공개용 화면에 그려지는 답변 카드</div>
                <ExploreContext.Provider value={stub}><AnswerView res={p.response} /></ExploreContext.Provider>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 판정 : 자동 + (필요할 때만) 사람 수정 */}
      {(p.auto || p.verdict) && (
        <section className="panel vf-sec">
          <div className="row">
            <h3>판정 <span className="xs muted">①②③ 결과로 자동 판정 · 뒤집어야 할 때만 수정</span></h3>
            <span className="sp" />
            <VerdictBadge f={finalOf(p.auto, p.verdict)} />
          </div>
          {p.auto && (
            <div className={`vf-auto ${p.auto.verdict === "정합" ? "ok" : p.auto.verdict === "부정합" ? "bad" : "hold"}`}>
              <b>자동 판정 : {p.auto.verdict}</b>
              {p.auto.owner && <span> · 조치 담당 {p.auto.owner}</span>}
              {p.auto.reasons.length > 0 ? <ul>{p.auto.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul> : <span> · 요청·응답·표출이 모두 일치합니다.</span>}
            </div>
          )}
          {p.verdict && !fix && (
            <div className="vf-auto fix">
              <b>사람이 수정한 판정 : {p.verdict.verdict}</b> · 조치 담당 {p.verdict.owner} · {hm(p.verdict.at)} · {p.verdict.by}
              {p.verdict.memo && <div style={{ marginTop: 4 }}>{p.verdict.memo}</div>}
            </div>
          )}
          {!fix ? (
            <div className="row w" style={{ gap: 6, marginTop: 10 }}>
              <button className="btn xs" onClick={() => { setVd(p.verdict?.verdict ?? (p.auto?.verdict === "정합" ? "부정합" : "정합")); setFix(true); }}>{p.verdict ? "수정한 판정 고치기" : "판정 수정"}</button>
              {p.verdict && <button className="btn xs ghost" onClick={p.onClearVerdict}>자동 판정으로 되돌리기</button>}
              <span className="xs mute2">자동 판정이 맞으면 아무것도 하지 않아도 됩니다. 정답셋이 틀렸던 경우처럼 뒤집어야 할 때만 수정하세요.</span>
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              <div className="row w" style={{ gap: 14, marginBottom: 8 }}>
                {(["정합", "부정합", "보류"] as const).map((v) => <label key={v} className="row s" style={{ gap: 4 }}><input type="radio" name="vd" checked={vd === v} onChange={() => setVd(v)} /> {v}</label>)}
                <span className="xs muted">조치 담당</span>
                <select className="select sm" value={owner} onChange={(e) => setOwner(e.target.value as Verdict["owner"])} aria-label="조치 담당"><option>T3Q</option><option>UNE</option><option>공통</option></select>
              </div>
              <textarea className="vf-json" style={{ fontFamily: "inherit" }} rows={3} placeholder="수정 사유 (필수) — 예: 정답셋의 기대값이 옛 자료 기준이라 응답이 맞음" value={memo} onChange={(e) => setMemo(e.target.value)} aria-label="판정 수정 사유" />
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <button className="btn sm pri" disabled={!memo.trim()} onClick={() => { p.onVerdict({ verdict: vd, owner, memo: memo.trim() }); setFix(false); }}>수정 저장</button>
                <button className="btn sm ghost" onClick={() => setFix(false)}>취소</button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 원문 */}
      {(p.request || p.response) && (
        <section className="panel vf-sec">
          <h3>원문 보기</h3>
          {p.request ? <details><summary>보낸 질의 (JSON)</summary><pre className="vf-pre">{JSON.stringify(p.request, null, 1)}</pre></details> : null}
          {p.response?.requestEcho && <details><summary>Agent가 받은 질의 — requestEcho (JSON)</summary><pre className="vf-pre">{JSON.stringify(p.response.requestEcho, null, 1)}</pre></details>}
          {p.response && <details><summary>Agent 응답 (JSON)</summary><pre className="vf-pre">{JSON.stringify(p.response, null, 1)}</pre></details>}
          {p.item && <details><summary>정답값 (JSON)</summary><pre className="vf-pre">{JSON.stringify(p.item.expect, null, 1)}</pre></details>}
        </section>
      )}
    </div>
  );
}
