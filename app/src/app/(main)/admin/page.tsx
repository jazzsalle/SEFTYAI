"use client";
/**
 * 운영관리 (S7 · SCR-UNE-302001 운영설정 · 302002 추적로그 조회) — 시스템 운영자 전용
 * 탭: 질의 현황(/api/admin/jobs · 강제 취소 · 원응답 JSON) · 브리핑 예열(/api/admin/warm) · 시연 세트 예열(/api/admin/warm/demo · 시연 시나리오 특보 /api/admin/scenario) · 계정(/api/admin/accounts)
 *     · 답변 평가(/api/admin/feedback) · 추적로그(/api/trace)
 * 원응답은 저장된 JSON 을 들여쓰기만 해서 그대로 보여 준다 — 응답 원문 검증용(R0). 가공·요약하지 않는다.
 */
import "./admin.css";
import { statusKo } from "@/lib/labels";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { ACCOUNTS } from "@/lib/config";
import { DEFAULT_BRIEFING, DEMO_DAY, DEMO_DAY_BRIEFING, fillText, libById, presetLines } from "@/lib/library";
import { PILOT_T3Q } from "@/lib/t3q/region";
import { SOURCE_LABEL, STATE_LABEL, isActive, type JobSource, type JobState, type JobSummary } from "@/lib/jobTypes";
import { SCN_ACCOUNT, SCN_DEFAULT_HOURS, SCN_DEFS, SCN_LABEL, SCN_MAX_HOURS, SCN_REGIONS, SCN_SOURCE, scenarioLive, type ScnRegion } from "@/lib/scenario";
import {
  WARM_REGIONS,
  type AdminAccountRow,
  type AdminScenarioResponse,
  type AdminFeedbackResponse,
  type AdminJobRow,
  type AdminJobsResponse,
  type DemoWarmItem,
  type DemoWarmResponse,
  type T3qHealth,
  type WarmItem,
  type WarmJob,
  type WarmRegion,
  type WarmResponse,
} from "@/lib/adminTypes";
import { Dialog, Portal } from "@/components/account/Dialog";

type Tab = "jobs" | "warm" | "demo" | "accounts" | "feedback" | "trace";
const TABS: [Tab, string][] = [["jobs", "질의 현황"], ["warm", "브리핑 예열"], ["demo", "시연 세트 예열"], ["accounts", "계정"], ["feedback", "답변 평가"], ["trace", "추적로그"]];
const STATES: JobState[] = ["QUEUED", "SUBMITTED", "RUNNING", "DONE", "FAILED", "CANCELLED", "LOST", "TIMEOUT"];
const STATE_TONE: Record<JobState, string> = { QUEUED: "neutral", SUBMITTED: "info", RUNNING: "info", DONE: "ok", FAILED: "danger", CANCELLED: "neutral", LOST: "warn", TIMEOUT: "danger" };
const ROLE_LABEL: Record<string, string> = { 지자체: "지자체", 중앙정부: "정부기관", 운영자: "운영자" };

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.");
const p2 = (n: number) => String(n).padStart(2, "0");
const toDate = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};
const fmtDT = (iso?: string | null) => {
  const d = toDate(iso);
  return d ? `${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}` : "—";
};
const fmtHM = (iso?: string | null) => {
  const d = toDate(iso);
  return d ? `${p2(d.getHours())}:${p2(d.getMinutes())}` : "—";
};
function fmtDur(ms?: number | null) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}초`;
  const m = Math.floor(ms / 60_000), s = Math.floor((ms % 60_000) / 1000);
  return s ? `${m}분 ${s}초` : `${m}분`;
}
const fmtBytes = (n: number) => (n < 1024 ? `${n}B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)}KB` : `${(n / 1024 / 1024).toFixed(2)}MB`);
/** 진행 중이면 접수부터 지금까지, 끝났으면 접수~완료 */
const respTime = (j: { state: JobState; created_at: string; elapsed_ms: number | null; cached_from: string | null }, now: number) => {
  if (isActive(j.state)) {
    const c = toDate(j.created_at)?.getTime();
    return `경과 ${fmtDur(c ? Math.max(0, now - c) : null)}`;
  }
  return j.cached_from ? "즉시(캐시)" : fmtDur(j.elapsed_ms);
};

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function Fact({ l, v, n, bad }: { l: string; v: React.ReactNode; n?: React.ReactNode; bad?: boolean }) {
  return (
    <div className={`fact ${bad ? "bad" : ""}`}>
      <div className="l">{l}</div>
      <div className="v">{v}</div>
      {n && <div className="n">{n}</div>}
    </div>
  );
}

/* ───────────────────────── 질의 현황 데이터 (모든 탭 공용) ───────────────────────── */

function useAdminJobs(enabled: boolean) {
  const [data, setData] = useState<AdminJobsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const dataRef = useRef(data);
  dataRef.current = data;

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const r = await api<AdminJobsResponse>("/api/admin/jobs");
      if (my === seq.current) {
        setData(r);
        setError(null);
      }
    } catch (e) {
      if (my === seq.current) setError(errMsg(e));
    }
  }, []);

  // 현황 — 10초마다
  useEffect(() => {
    if (!enabled) return;
    load();
    const t = setInterval(() => {
      if (!document.hidden) load();
    }, 10_000);
    return () => clearInterval(t);
  }, [enabled, load]);

  // 진행 중 작업 상태 조회 — 5초마다. 이 조회 때 서버가 T3Q 를 폴링(작업당 2.5초 스로틀)하고 대기열(QUEUED)을 슬롯이 나는 대로 제출한다.
  // 그래서 예열 문항은 지역 담당자가 접속하기 전에도 이 화면이 완료까지 진행시킨다.
  const activeKey = (data?.active ?? []).map((j) => j.id).join(",");
  useEffect(() => {
    if (!enabled || !activeKey) return;
    const ids = activeKey.split(",").slice(0, 12);
    let running = false;
    const tick = async () => {
      if (running || document.hidden) return;
      running = true;
      try {
        const got = await Promise.all(ids.map((id) => api<{ job: JobSummary }>(`/api/agent/jobs/${encodeURIComponent(id)}`).then((r) => r.job, () => null)));
        const before = new Map((dataRef.current?.active ?? []).map((j) => [j.id, j.state]));
        if (got.some((j) => j && before.get(j.id) !== j.state)) await load();
      } finally {
        running = false;
      }
    };
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
  }, [enabled, activeKey, load]);

  return { data, error, load };
}
type JobsHook = ReturnType<typeof useAdminJobs>;

/* ───────────────────────── 페이지 ───────────────────────── */

export default function AdminPage() {
  const { ready, account } = useSession();
  const op = account?.role === "운영자";
  const [tab, setTabState] = useState<Tab>("jobs");
  const [detail, setDetail] = useState<string | null>(null);
  const [warm, setWarm] = useState<WarmResponse | null>(null);
  const [demoWarm, setDemoWarm] = useState<DemoWarmResponse | null>(null);
  const jobs = useAdminJobs(op);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && TABS.some(([k]) => k === t)) setTabState(t as Tab);
  }, []);
  const setTab = (t: Tab) => {
    setTabState(t);
    const u = new URL(window.location.href);
    u.searchParams.set("tab", t);
    window.history.replaceState(window.history.state, "", u.toString());
  };
  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = TABS.findIndex(([k]) => k === tab);
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length][0];
    setTab(next);
    document.getElementById(`adm-tab-${next}`)?.focus();
  };

  if (!ready || !account) return null;
  if (!op)
    return (
      <div className="page">
        <div className="page-in">
          <div className="ph"><div><h1>운영관리</h1></div></div>
          <div className="notice danger" role="alert">운영관리는 시스템 운영자만 이용할 수 있습니다. 권한이 필요하면 시스템 운영자에게 문의하세요.</div>
        </div>
      </div>
    );

  const activeN = jobs.data?.active.length ?? 0;
  return (
    <div className="page adm">
      <div className="page-in">
        <div className="ph">
          <div>
            <h1>운영관리</h1>
            <p>질의 현황·강제 취소·원응답 검증, 브리핑 예열, 시연 세트 예열, 계정 잠금 해제, 답변 평가, 추적로그 (시스템 운영자 전용)</p>
          </div>
          <span className="sp" />
          <T3qPill h={jobs.data?.t3q} />
        </div>
        <div className="subtabs adm-tabs" role="tablist" aria-label="운영관리 메뉴" onKeyDown={onTabKey}>
          {TABS.map(([k, l]) => (
            <button
              key={k}
              id={`adm-tab-${k}`}
              role="tab"
              aria-selected={tab === k}
              aria-controls="adm-panel"
              tabIndex={tab === k ? 0 : -1}
              className={tab === k ? "on" : ""}
              onClick={() => setTab(k)}
            >
              {l}
              {k === "jobs" && activeN > 0 && <span className="cnt" aria-label={`진행 중 ${activeN}건`}>{activeN}</span>}
            </button>
          ))}
        </div>
        <div id="adm-panel" role="tabpanel" aria-labelledby={`adm-tab-${tab}`}>
          {tab === "jobs" && <JobsTab jobs={jobs} onOpen={setDetail} />}
          {tab === "warm" && <WarmTab jobs={jobs} warm={warm} setWarm={setWarm} onOpen={setDetail} />}
          {tab === "demo" && <DemoWarmTab jobs={jobs} warm={demoWarm} setWarm={setDemoWarm} onOpen={setDetail} />}
          {tab === "accounts" && <AccountsTab />}
          {tab === "feedback" && <FeedbackTab onOpen={setDetail} />}
          {tab === "trace" && <TraceTab />}
        </div>
      </div>
      {detail && <JobDetail id={detail} onClose={() => setDetail(null)} onOpen={setDetail} />}
    </div>
  );
}

function T3qPill({ h }: { h?: T3qHealth }) {
  const cls = h ? (h.ok ? "ok" : "bad") : "";
  const label = h ? (h.ok ? "정상" : "연결 불가") : "확인 중";
  return (
    <span className={`adm-pill ${cls}`} title={h?.detail ?? undefined} role="status">
      <i aria-hidden />
      에이전트 서버 {label}
      {h?.version ? ` · v${h.version}` : ""}
      {h?.mode === "replay" ? " · 녹화 재생" : ""}
    </span>
  );
}

/* ───────────────────────── 질의 현황 ───────────────────────── */

function JobsTab({ jobs, onOpen }: { jobs: JobsHook; onOpen: (id: string) => void }) {
  const { toast } = useSession();
  const now = useNow(5000);
  const [acc, setAcc] = useState("");
  const [st, setSt] = useState<"" | JobState>("");
  const [kw, setKw] = useState("");
  const [target, setTarget] = useState<AdminJobRow | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const d = jobs.data;

  const accounts = useMemo(() => Array.from(new Set([...ACCOUNTS.map((a) => a.id), ...(d?.recent ?? []).map((j) => j.account_id)])), [d]);
  const list = useMemo(() => {
    const k = kw.trim().toLowerCase();
    return (d?.recent ?? []).filter(
      (j) =>
        (!acc || j.account_id === acc) &&
        (!st || j.state === st) &&
        (!k || j.question_user.toLowerCase().includes(k) || j.id.toLowerCase().includes(k) || (j.t3q_request_id ?? "").toLowerCase().includes(k)),
    );
  }, [d, acc, st, kw]);

  const doCancel = async () => {
    if (!target) return;
    setCancelling(true);
    try {
      const r = await api<{ job: JobSummary }>(`/api/agent/jobs/${encodeURIComponent(target.id)}/cancel`, { method: "POST" });
      toast(r.job.state === "CANCELLED" ? "질의를 강제 취소했습니다." : `이미 끝난 질의입니다 (${STATE_LABEL[r.job.state] ?? r.job.state}).`);
      setTarget(null);
      await jobs.load();
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setCancelling(false);
    }
  };

  if (!d) return jobs.error ? <div className="notice danger" role="alert">{jobs.error}</div> : <p className="xs mute2">불러오는 중…</p>;
  const cnt = (s: JobState) => d.counts.find((c) => c.state === s);
  const sum = (f: "total" | "last24h") => d.counts.reduce((n, c) => n + c[f], 0);
  const processing = d.active.filter((j) => j.state !== "QUEUED").length;
  const t = d.timing;

  return (
    <>
      {jobs.error && <div className="notice danger" role="alert" style={{ marginBottom: 12 }}>{jobs.error} — 마지막으로 받은 값을 보여 줍니다.</div>}
      <div className="adm-kpis">
        <Fact
          l="에이전트 서버 연결"
          v={d.t3q.ok ? "정상" : "연결 불가"}
          bad={!d.t3q.ok}
          n={d.t3q.ok ? `${d.t3q.version ? `v${d.t3q.version} · ` : ""}${d.t3q.mode === "replay" ? "녹화 재생" : "실연동"} · ${fmtHM(d.t3q.checkedAt)} 확인` : d.t3q.detail ?? "상태 확인 실패"}
        />
        <Fact l="진행 중" v={<>{d.active.length}<small>건</small></>} n={`대기열 ${cnt("QUEUED")?.total ?? 0} · 처리 중 ${processing}`} />
        <Fact
          l="동시 처리 슬롯"
          v={<>{d.slots.running + d.slots.cooling}<small>/ {d.slots.global}</small></>}
          bad={d.slots.running + d.slots.cooling >= d.slots.global}
          n={`취소 후 120초 ${d.slots.cooling}건 포함 · 계정당 ${d.slots.perAccount}건`}
        />
        <Fact l="평균 응답 시간" v={fmtDur(t.avgMs)} n={`최근 ${t.windowDays}일 완료 ${t.n}건(캐시 제외) · 대기열 평균 ${fmtDur(t.avgWaitMs)}`} />
        <Fact l="중앙값 응답 시간" v={fmtDur(t.p50Ms)} n={`p90 ${fmtDur(t.p90Ms)} · 최대 ${fmtDur(t.maxMs)}`} />
        <Fact l="예상 대기" v={fmtDur(d.expectedMs)} n="최근 완료 20건 중앙값 · 질문 화면에 표시되는 값" />
      </div>

      <section className="adm-sec">
        <h2>상태별 개수</h2>
        <div className="adm-scroll" style={{ maxHeight: "none" }}>
          <table className="tbl adm-counts">
            <thead>
              <tr>
                <th>구분</th>
                {STATES.map((s) => <th key={s}>{STATE_LABEL[s]}</th>)}
                <th>합계</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>최근 24시간</td>
                {STATES.map((s) => <td key={s} className="num">{cnt(s)?.last24h ?? 0}</td>)}
                <td className="num b">{sum("last24h")}</td>
              </tr>
              <tr>
                <td>전체</td>
                {STATES.map((s) => <td key={s} className="num">{cnt(s)?.total ?? 0}</td>)}
                <td className="num b">{sum("total")}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="adm-sec">
        <h2>진행 중 <small>{d.active.length}건 · 5초마다 상태 확인</small></h2>
        <JobTable rows={d.active} now={now} onOpen={onOpen} onCancel={setTarget} empty="진행 중인 질의가 없습니다." />
      </section>

      <section className="adm-sec">
        <h2>
          최근 질의 <small>전체 계정 최근 {d.recent.length}건 중 {list.length}건 · {fmtHM(d.at)} 기준</small>
          <span className="sp" />
          <button type="button" className="btn sm" onClick={() => jobs.load()}>새로고침</button>
        </h2>
        <div className="adm-filter">
          <select className="select sm" value={acc} onChange={(e) => setAcc(e.target.value)} aria-label="계정">
            <option value="">계정 전체</option>
            {accounts.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className="select sm" value={st} onChange={(e) => setSt(e.target.value as "" | JobState)} aria-label="상태">
            <option value="">상태 전체</option>
            {STATES.map((s) => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}
          </select>
          <input className="input sm" placeholder="질문 · 작업 ID · 요청 ID 검색" value={kw} onChange={(e) => setKw(e.target.value)} aria-label="검색어" />
        </div>
        <JobTable rows={list} now={now} onOpen={onOpen} onCancel={setTarget} empty={d.recent.length ? "조건에 맞는 질의가 없습니다." : "아직 질의가 없습니다."} />
        <p className="adm-note">행을 누르면 에이전트 원응답·보낸 요청·자동 조회 데이터·위치 도형을 저장된 그대로(원본 데이터 형식) 봅니다.</p>
      </section>

      {target && (
        <Dialog
          title="질의를 강제 취소할까요?"
          desc="에이전트는 서버에서 잠시 더 처리할 수 있어, 취소 후 120초 동안 동시 처리 슬롯을 차지합니다."
          onClose={() => setTarget(null)}
          busy={cancelling}
          size="sm"
          footer={
            <>
              <button type="button" className="acm-btn" onClick={() => setTarget(null)} disabled={cancelling}>닫기</button>
              <button type="button" className="acm-btn danger" onClick={doCancel} disabled={cancelling}>{cancelling ? "취소 중…" : "강제 취소"}</button>
            </>
          }
        >
          <p className="acm-sub">
            <b>{target.account_id}</b> · {SOURCE_LABEL[target.source] ?? target.source} · {STATE_LABEL[target.state] ?? target.state}
            <br />
            {target.question_user}
          </p>
        </Dialog>
      )}
    </>
  );
}

function JobTable({ rows, now, onOpen, onCancel, empty }: { rows: AdminJobRow[]; now: number; onOpen: (id: string) => void; onCancel?: (j: AdminJobRow) => void; empty: string }) {
  return (
    <div className="adm-scroll">
      <table className="tbl adm-tbl">
        <thead>
          <tr>
            <th>접수</th>
            <th>계정</th>
            <th>출처</th>
            <th>질문</th>
            <th>상태</th>
            <th>응답 상태</th>
            <th>응답 시간</th>
            <th>비고</th>
            <th><span className="sr-only">동작</span></th>
          </tr>
        </thead>
        <tbody>
          {!rows.length && (
            <tr><td colSpan={9} className="adm-empty">{empty}</td></tr>
          )}
          {rows.map((j) => {
            const act = isActive(j.state);
            const notes = [j.cached_from && "캐시 적중", j.retry_of && "자동 재제출", j.error_code].filter(Boolean).join(" · ");
            return (
              <tr key={j.id} className="click" onClick={() => onOpen(j.id)}>
                <td className="num xs nowrap">{fmtDT(j.created_at)}</td>
                <td className="xs nowrap">{j.account_id}</td>
                <td className="xs nowrap">
                  {SOURCE_LABEL[j.source] ?? j.source}
                  {j.library_id && <div className="mute2">{j.library_id}</div>}
                </td>
                <td className="adm-q">
                  <span className="clamp" title={j.question_user}>{j.question_user}</span>
                  {j.sent_differs && <span className="badge sq neutral">실제 전송 질문 다름</span>}
                </td>
                <td className="nowrap"><span className={`badge ${STATE_TONE[j.state] ?? "neutral"}`}>{STATE_LABEL[j.state] ?? j.state}</span></td>
                <td className="xs nowrap">
                  {j.t3q_status ? statusKo(j.t3q_status) : "—"}
                  {j.http_status != null && <div className="mute2">HTTP {j.http_status}</div>}
                </td>
                <td className="num xs nowrap">{respTime(j, now)}</td>
                <td className="xs">{notes || "—"}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="adm-acts">
                    <button type="button" className="btn xs" onClick={() => onOpen(j.id)}>원문</button>
                    {act && onCancel && <button type="button" className="btn xs adm-danger" onClick={() => onCancel(j)}>강제 취소</button>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────────────────── 브리핑 예열 ───────────────────────── */

interface PlanRow { r: WarmRegion; libraryId: string; question: string; accountId: string }
/** 예열 문항 — 부산·인제·영천 × 기본 브리핑(DEFAULT_BRIEFING), 지역 이름을 채운 글 (서버 /api/admin/warm 과 같은 규칙) */
const PLAN: PlanRow[] = WARM_REGIONS.flatMap((r) =>
  DEFAULT_BRIEFING.flatMap((id) => {
    const q = libById(id);
    return q ? [{ r, libraryId: id, question: fillText(q, PILOT_T3Q[r].name), accountId: ACCOUNTS.find((a) => a.role === "지자체" && a.region === r)?.id ?? "—" }] : [];
  }),
);
const OUTCOME: Record<WarmItem["outcome"], [string, string]> = {
  CACHED: ["캐시 적중 · 즉시 표시", "ok"],
  JOINED: ["진행 중인 같은 질의에 합류", "info"],
  NEW: ["새로 접수", "info"],
  SKIPPED: ["미접수(시간 한도)", "warn"],
  ERROR: ["접수 실패", "danger"],
};

function WarmTab({ jobs, warm, setWarm, onOpen }: { jobs: JobsHook; warm: WarmResponse | null; setWarm: (w: WarmResponse) => void; onOpen: (id: string) => void }) {
  const { toast } = useSession();
  const now = useNow(5000);
  const [regions, setRegions] = useState<WarmRegion[]>(WARM_REGIONS);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t3qDown = jobs.data?.t3q.ok === false;
  const live = (id: string): AdminJobRow | WarmJob | undefined => jobs.data?.recent.find((j) => j.id === id) ?? jobs.data?.active.find((j) => j.id === id);

  const run = async () => {
    if (!regions.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<WarmResponse>("/api/admin/warm", { method: "POST", json: { regions, force } });
      setWarm(r);
      const n = (o: WarmItem["outcome"]) => r.items.filter((i) => i.outcome === o).length;
      const miss = n("SKIPPED") + n("ERROR");
      toast(`브리핑 예열 접수 — 새로 ${n("NEW")} · 캐시 ${n("CACHED")} · 합류 ${n("JOINED")}${miss ? ` · 미접수 ${miss}` : ""}`);
      await jobs.load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const states = (warm?.items ?? []).map((i) => (i.job ? (live(i.job.id) ?? i.job).state : null));
  const done = states.filter((s) => s === "DONE").length;
  const running = states.filter((s) => s && isActive(s)).length;
  const failed = states.filter((s) => s && !isActive(s) && s !== "DONE").length;

  return (
    <>
      <section className="panel">
        <h2 style={{ fontSize: 19 }}>브리핑 예열</h2>
        <p className="xs muted" style={{ margin: "6px 0 0", lineHeight: 1.7 }}>
          부산·인제·영천 × 기본 브리핑 {DEFAULT_BRIEFING.length}문항을 각 지역 담당자 계정 명의로 미리 질의합니다.{" "}
          <b>예열한 답은 24시간 동안 같은 질문에 즉시 표시됩니다.</b>
          <br />
          같은 질문 = 질문 글·브리핑 출처·기준지역·재난유형이 같고 특보 조건이 붙지 않은 질의입니다. 업무 시작·시연 전에 실행하세요.
        </p>
        <div className="adm-warm-ctl">
          <div className="grp" role="group" aria-label="예열 지역">
            {WARM_REGIONS.map((r) => (
              <label key={r} className="chk">
                <input
                  type="checkbox"
                  checked={regions.includes(r)}
                  onChange={(e) => setRegions((p) => (e.target.checked ? WARM_REGIONS.filter((x) => x === r || p.includes(x)) : p.filter((x) => x !== r)))}
                />
                {PILOT_T3Q[r].name}
              </label>
            ))}
          </div>
          <label className="chk">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            캐시 무시하고 새로 질의
          </label>
          <span className="sp" />
          <button type="button" className="btn pri" onClick={run} disabled={busy || !regions.length || t3qDown}>
            {busy ? "접수 중… (최대 1분)" : `브리핑 예열 시작 (${regions.length * DEFAULT_BRIEFING.length}건)`}
          </button>
        </div>
        {t3qDown && <div className="notice danger" style={{ marginTop: 12 }}>에이전트 서버 연결 불가 — {jobs.data?.t3q.detail ?? "상태 확인 실패"}. 연결이 돌아오면 예열하세요.</div>}
        {error && <div className="notice danger" role="alert" style={{ marginTop: 12 }}>{error}</div>}
        <p className="adm-note">
          에이전트 동시 처리 한도(전체 {jobs.data?.slots.global ?? 8}건·계정당 {jobs.data?.slots.perAccount ?? 4}건)를 넘는 문항은 대기열에 들어갑니다. 이 화면을 열어 두면 대기 문항을 차례로
          보내고 완료까지 상태를 확인합니다. 1문항에 보통 1~2분 걸립니다.
        </p>
      </section>

      <section className="adm-sec">
        <h2>
          예열 문항{" "}
          <small>{warm ? `${fmtHM(warm.at)} 실행 · 완료 ${done} · 진행 중 ${running}${failed ? ` · 실패·취소 ${failed}` : ""}` : "아직 실행하지 않았습니다"}</small>
        </h2>
        <div className="adm-scroll">
          <table className="tbl adm-tbl">
            <thead>
              <tr>
                <th>지역</th>
                <th>계정</th>
                <th>문항</th>
                <th>질문</th>
                <th>접수</th>
                <th>상태</th>
                <th>응답 시간</th>
                <th><span className="sr-only">동작</span></th>
              </tr>
            </thead>
            <tbody>
              {PLAN.map((p) => {
                const it = warm?.items.find((i) => i.region === p.r && i.libraryId === p.libraryId);
                const j = it?.job ? live(it.job.id) ?? it.job : null;
                return (
                  <tr key={`${p.r}-${p.libraryId}`} className={j ? "click" : ""} onClick={j ? () => onOpen(j.id) : undefined}>
                    <td className="xs nowrap">{PILOT_T3Q[p.r].name}</td>
                    <td className="xs nowrap">{p.accountId}</td>
                    <td className="xs nowrap">{p.libraryId}</td>
                    <td className="adm-q"><span className="clamp" title={p.question}>{p.question}</span></td>
                    <td className="xs">
                      {it ? <span className={`badge ${OUTCOME[it.outcome][1]}`}>{OUTCOME[it.outcome][0]}</span> : "—"}
                      {it?.error && <div className="mute2" style={{ marginTop: 4 }}>{it.error}</div>}
                    </td>
                    <td className="nowrap">{j ? <span className={`badge ${STATE_TONE[j.state] ?? "neutral"}`}>{STATE_LABEL[j.state] ?? j.state}</span> : "—"}</td>
                    <td className="num xs nowrap">{j ? respTime(j, now) : "—"}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {j && <div className="adm-acts"><button type="button" className="btn xs" onClick={() => onOpen(j.id)}>원문</button></div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* ───────────────────────── 시연 시나리오 특보 (R43) ───────────────────────── */

/** datetime-local 입력값(이 컴퓨터 시간대) */
const localInput = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
const fmtMDHM = (iso?: string | null) => {
  const d = toDate(iso);
  return d ? `${d.getMonth() + 1}.${d.getDate()}. ${p2(d.getHours())}:${p2(d.getMinutes())}` : "—";
};

/**
 * 시연 시나리오 특보 — 켜기(지역·끝나는 시각, 기본 SCN_DEFAULT_HOURS 시간 뒤)·끄기. 정의는 lib/scenario 고정(재사용 열쇠에 들어감).
 * 보이는 계정·만료 판단은 서버(/api/weather)가 한다 — 이 화면은 상태만 보이고 바꾼다
 */
function ScenarioPanel() {
  const { toast } = useSession();
  const now = useNow(15_000);
  const [d, setD] = useState<AdminScenarioResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [regions, setRegions] = useState<ScnRegion[]>(SCN_REGIONS);
  const [until, setUntil] = useState(() => localInput(Date.now() + SCN_DEFAULT_HOURS * 3_600_000));
  const show = (r: AdminScenarioResponse) => {
    setD(r);
    if (r.live && r.state.until) {
      setRegions(r.state.regions);
      setUntil(localInput(Date.parse(r.state.until)));
    }
  };
  useEffect(() => {
    api<AdminScenarioResponse>("/api/admin/scenario").then(show).catch((e) => setError(errMsg(e)));
  }, []);
  const live = !!d && scenarioLive(d.state, now);
  const save = async (on: boolean) => {
    if (busy) return;
    const u = Date.parse(until);
    if (on && !Number.isFinite(u)) return setError("끝나는 시각을 정하세요.");
    setBusy(true);
    setError(null);
    try {
      const r = await api<AdminScenarioResponse>("/api/admin/scenario", { method: "POST", json: on ? { on, until: new Date(u).toISOString(), regions } : { on } });
      show(r);
      toast(on ? (live ? "시연 시나리오 특보 설정을 바꿨습니다." : "시연 시나리오 특보를 켰습니다.") : "시연 시나리오 특보를 껐습니다.");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const st = d?.state;
  const name = (r: ScnRegion) => PILOT_T3Q[r].name;
  return (
    <section className="panel" aria-label="시연 시나리오 특보">
      <h2 style={{ fontSize: 19 }}>시연 시나리오 특보</h2>
      <p className="xs muted" style={{ margin: "6px 0 0", lineHeight: 1.7 }}>
        켜 둔 동안 시연 계정 셋에만 아래 가상 특보가 기상청 실시간 특보와 함께 보입니다(특보 줄·AI 모드·대응절차 단계 추천). 화면에는 「{SCN_LABEL}」, 에이전트 질의에는 출처 「{SCN_SOURCE}」로 표시됩니다.{" "}
        <b>끝나는 시각이 지나면 저절로 꺼집니다</b>(최대 {SCN_MAX_HOURS}시간). 다른 계정에는 보이지 않고, 재사용 기준(특보 발효 중이면 1시간)에도 들지 않습니다.
        <br />
        브리핑 세트는 시나리오 특보가 열쇠에 들어가므로 시나리오를 켠 상태에서 예열하세요. 계정 화면에는 1분 안에 반영됩니다.
      </p>
      <div className="adm-scn" role="status">
        <span className={`badge ${live ? "info" : "neutral"}`}>{!d ? "확인 중" : live ? "켜짐" : "꺼짐"}</span>
        <span className="xs">
          {!st
            ? ""
            : live
              ? `${st.regions.map(name).join(" · ")} · ${fmtMDHM(st.startedAt)} 켬 · ${fmtMDHM(st.until)}에 저절로 꺼짐${st.by ? ` · ${st.by}` : ""}`
              : st.on && st.until
                ? `끝나는 시각(${fmtMDHM(st.until)})이 지나 꺼졌습니다`
                : st.by
                  ? `${st.by}이(가) 껐습니다`
                  : ""}
        </span>
      </div>
      <div className="adm-scroll" style={{ marginTop: 10 }}>
        <table className="tbl adm-tbl">
          <thead>
            <tr>
              <th>켬</th>
              <th>지역</th>
              <th>계정</th>
              <th>특보</th>
              <th>구역</th>
              <th>특보 번호</th>
            </tr>
          </thead>
          <tbody>
            {SCN_REGIONS.map((r) => (
              <tr key={r}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`${name(r)} 시나리오 특보`}
                    checked={regions.includes(r)}
                    onChange={(e) => setRegions((p) => (e.target.checked ? SCN_REGIONS.filter((x) => x === r || p.includes(x)) : p.filter((x) => x !== r)))}
                  />
                </td>
                <td className="xs nowrap">{name(r)}</td>
                <td className="xs nowrap">{SCN_ACCOUNT[r]}</td>
                <td className="xs nowrap">{SCN_DEFS[r].type}{SCN_DEFS[r].level}</td>
                <td className="xs">{SCN_DEFS[r].area}</td>
                <td className="xs nowrap">{SCN_DEFS[r].key}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="adm-scn">
        <label className="xs">
          끝나는 시각 <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>
        <span className="sp" />
        {live && <button type="button" className="btn" onClick={() => save(false)} disabled={busy}>시나리오 끄기</button>}
        <button type="button" className="btn pri" onClick={() => save(true)} disabled={busy || !regions.length || !d}>
          {live ? "지역·끝나는 시각 저장" : "시나리오 켜기"}
        </button>
      </div>
      {error && <div className="notice warn" role="alert" style={{ marginTop: 12 }}>{error}</div>}
    </section>
  );
}

/* ───────────────────────── 시연 세트 예열 ───────────────────────── */

/** 예열 계정 = 그 지역 시연 계정(서버 lib/server/warmPlan demoAccountOf 와 같게) */
const accountOf = (r: WarmRegion) => SCN_ACCOUNT[r];
/** 새 표·패널은 빨강을 쓰지 않는다 — 실패 표지는 경고 계열로 */
const calm = (tone: string) => (tone === "danger" ? "warn" : tone);
type DemoRow = Pick<DemoWarmItem, "region" | "accountId" | "kind" | "itemId" | "scene" | "title" | "question">;
/** 예열하기 전 표 — 묶음 「재난담당자의 하루」 가운데 실시간이 아닌 항목(서버 lib/server/warmPlan 과 같은 규칙) + 브리핑 세트 자리 */
const DEMO_PLAN: DemoRow[] = WARM_REGIONS.flatMap((r) => [
  ...(DEMO_DAY_BRIEFING.includes(r) ? [{ region: r, accountId: accountOf(r), kind: "BRIEFING" as const, itemId: "—", scene: "2", title: "브리핑 세트", question: "이 계정의 「내 브리핑 항목」에서 체크한 항목 전부(예열할 때 읽음)" }] : []),
  ...DEMO_DAY.filter((d) => d.regions[0] === r && !d.live).map((d) => ({ region: r, accountId: accountOf(r), kind: "CHAIN" as const, itemId: d.id, scene: d.scene, title: d.title, question: d.text })),
]);
const DEMO_LIVE = DEMO_DAY.filter((d) => d.live);
const DEMO_BY_ID = new Map(DEMO_DAY.map((d) => [d.id, d]));

function DemoWarmTab({ jobs, warm, setWarm, onOpen }: { jobs: JobsHook; warm: DemoWarmResponse | null; setWarm: (w: DemoWarmResponse) => void; onOpen: (id: string) => void }) {
  const { toast } = useSession();
  const now = useNow(5000);
  const [regions, setRegions] = useState<WarmRegion[]>(WARM_REGIONS);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t3qDown = jobs.data?.t3q.ok === false;
  const live = (id: string): AdminJobRow | WarmJob | undefined => jobs.data?.recent.find((j) => j.id === id) ?? jobs.data?.active.find((j) => j.id === id);

  const run = async () => {
    if (!regions.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<DemoWarmResponse>("/api/admin/warm/demo", { method: "POST", json: { regions, force } });
      setWarm(r);
      const n = (o: DemoWarmItem["outcome"]) => r.items.filter((i) => i.outcome === o).length;
      const miss = n("SKIPPED") + n("ERROR");
      toast(`시연 세트 예열 접수 — 새로 ${n("NEW")} · 캐시 ${n("CACHED")} · 합류 ${n("JOINED")}${miss ? ` · 미접수 ${miss}` : ""}`);
      await jobs.load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  /** 한 항목만 — 예열 전에는 그 항목만 예열, 예열 뒤에는 캐시 무시하고 새로 질의(재사용 원본이 오래됐을 때 — 대본 §5.4 규칙 2) */
  const runOne = async (row: DemoRow) => {
    if (busy) return;
    const prev = warm?.items.find((x) => x.region === row.region && x.itemId === row.itemId);
    const fresh = !!prev || force;
    if (fresh && !window.confirm(`「${row.title}」을(를) 캐시 없이 새로 질의합니다. 보통 1~3분 걸립니다.`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<DemoWarmResponse>("/api/admin/warm/demo", { method: "POST", json: { regions: [row.region], ids: [row.itemId], force: fresh } });
      const got = r.items[0];
      if (got) {
        const same = (x: DemoRow) => x.region === got.region && x.itemId === got.itemId;
        const rest = (warm?.items ?? []).filter((x) => !same(x));
        setWarm({ at: warm?.at ?? r.at, items: [...rest, got] });
        toast(`「${got.title}」 — ${OUTCOME[got.outcome][0]}`);
      }
      await jobs.load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  // 표 = 예열 대상(정의 순서) 자리에 받은 결과를 채운 것 — 브리핑 세트 자리는 예열 때 읽은 항목들로
  const res = warm?.items ?? [];
  const rows: (DemoRow | DemoWarmItem)[] = [
    ...DEMO_PLAN.filter((p) => regions.includes(p.region) || res.some((x) => x.region === p.region)).flatMap((p) => {
      if (p.kind === "BRIEFING") {
        const got = res.filter((x) => x.region === p.region && x.kind === "BRIEFING");
        return got.length ? got : [p];
      }
      return [res.find((x) => x.region === p.region && x.itemId === p.itemId) ?? p];
    }),
    ...res.filter((x) => x.kind === "CHAIN" && !DEMO_BY_ID.has(x.itemId)),
  ];
  const states = (warm?.items ?? []).map((i) => (i.job ? (live(i.job.id) ?? i.job).state : null));
  const done = states.filter((s) => s === "DONE").length;
  const running = states.filter((s) => s && isActive(s)).length;
  const failed = states.filter((s) => s && !isActive(s) && s !== "DONE").length;

  return (
    <>
      <ScenarioPanel />
      <section className="panel">
        <h2 style={{ fontSize: 19 }}>시연 세트 예열</h2>
        <p className="xs muted" style={{ margin: "6px 0 0", lineHeight: 1.7 }}>
          질문 모음 「재난담당자의 하루」의 질문과 부산 시연 계정의 브리핑 세트를 각 지역 시연 계정 명의로, 화면에서 누를 때와 같은 질문 글·출처·조건·특보로 미리 질의합니다.{" "}
          <b>예열한 답은 24시간 동안 같은 질문에 즉시 표시됩니다</b>(그 기준지역에 기상청 특보가 발효 중이면 1시간).
          <br />
          브리핑 세트는 AI 모드를 켠 화면처럼 그 계정에 그때 보이는 발효 특보(시연 시나리오 특보 포함)를 함께 보냅니다. 시연 때와 같은 특보 상태에서 실행하세요.
        </p>
        <div className="adm-warm-ctl">
          <div className="grp" role="group" aria-label="예열 지역">
            {WARM_REGIONS.map((r) => (
              <label key={r} className="chk">
                <input
                  type="checkbox"
                  checked={regions.includes(r)}
                  onChange={(e) => setRegions((p) => (e.target.checked ? WARM_REGIONS.filter((x) => x === r || p.includes(x)) : p.filter((x) => x !== r)))}
                />
                {PILOT_T3Q[r].name}
              </label>
            ))}
          </div>
          <label className="chk">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            캐시 무시하고 새로 질의
          </label>
          <span className="sp" />
          <button type="button" className="btn pri" onClick={run} disabled={busy || !regions.length || t3qDown}>
            {busy ? "접수 중… (최대 1분)" : "시연 세트 예열 시작"}
          </button>
        </div>
        {t3qDown && <div className="notice warn" style={{ marginTop: 12 }}>에이전트 서버 연결 불가 — {jobs.data?.t3q.detail ?? "상태 확인 실패"}. 연결이 돌아오면 예열하세요.</div>}
        {error && <div className="notice warn" role="alert" style={{ marginTop: 12 }}>{error}</div>}
        <p className="adm-note">
          실시간으로 보일 질문은 예열하지 않습니다 — {DEMO_LIVE.map((d) => `${PILOT_T3Q[d.regions[0]].name} 「${d.title}」`).join(" · ")}. 시연 24시간 안에는 어느 계정으로도 이 질문을 보내지 마세요.
          이 화면을 열어 두면 대기 문항을 차례로 보내고 완료까지 상태를 확인합니다.
          <br />
          예열은 시연 계정 명의라 끝나기 전에는 그 계정의 무대 질의(AI 모드 점검 포함)가 차례를 기다릴 수 있습니다. 장면 전에 진행 중 0을 확인하세요.
        </p>
      </section>

      <section className="adm-sec">
        <h2>
          예열 항목{" "}
          <small>{warm ? `${fmtHM(warm.at)} 실행 · 완료 ${done} · 진행 중 ${running}${failed ? ` · 실패·취소 ${failed}` : ""}` : "아직 실행하지 않았습니다"}</small>
        </h2>
        <div className="adm-scroll">
          <table className="tbl adm-tbl">
            <thead>
              <tr>
                <th>지역</th>
                <th>단계</th>
                <th>항목</th>
                <th>계정</th>
                <th>접수</th>
                <th>상태</th>
                <th>제공처 상태</th>
                <th>처리 시간</th>
                <th><span className="sr-only">동작</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => {
                const it = "outcome" in p ? p : undefined;
                const j = it?.job ? live(it.job.id) ?? it.job : null;
                const d = p.kind === "CHAIN" ? DEMO_BY_ID.get(p.itemId) : undefined;
                return (
                  <tr key={`${p.region}-${p.itemId}-${i}`} className={j ? "click" : ""} onClick={j ? () => onOpen(j.id) : undefined}>
                    <td className="xs nowrap">{PILOT_T3Q[p.region].name}</td>
                    <td className="xs nowrap">{p.scene}</td>
                    <td className="adm-q">
                      <b className="xs">{p.title}</b>
                      <span className="clamp" title={p.question}>{p.question}</span>
                      {d && <div className="mute2">조건 · {presetLines(d.cond).join(" · ") || "없음"}{d.base ? ` · 기준지역 ${d.base.sido.name} ${d.base.sigungu?.name ?? ""}` : ""}</div>}
                      {it?.warnings && <div className="mute2">{it.warnings.length ? `특보 ${it.warnings.join(" · ")}` : "특보 없음"}</div>}
                    </td>
                    <td className="xs nowrap">{p.accountId}</td>
                    <td className="xs">
                      {it ? <span className={`badge ${calm(OUTCOME[it.outcome][1])}`}>{OUTCOME[it.outcome][0]}</span> : "—"}
                      {it?.outcome === "CACHED" && <div className="mute2" style={{ marginTop: 4 }}>원래 답 받은 시각 {fmtDT(it.sourceFinishedAt)}</div>}
                      {it?.error && <div className="mute2" style={{ marginTop: 4 }}>{it.error}</div>}
                    </td>
                    <td className="nowrap">{j ? <span className={`badge ${calm(STATE_TONE[j.state] ?? "neutral")}`}>{STATE_LABEL[j.state] ?? j.state}</span> : "—"}</td>
                    <td className="xs nowrap">{j?.t3q_status ? statusKo(j.t3q_status) : "—"}</td>
                    <td className="num xs nowrap">{j ? respTime(j, now) : "—"}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="adm-acts">
                        {j && <button type="button" className="btn xs" onClick={() => onOpen(j.id)}>원문</button>}
                        {p.itemId !== "—" && (!j || !isActive(j.state)) && (
                          <button type="button" className="btn xs" disabled={busy || t3qDown} onClick={() => runOne(p)}>{"outcome" in p ? "새로 질의" : "이 항목만 예열"}</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* ───────────────────────── 계정 ───────────────────────── */

function AccountsTab() {
  const { toast } = useSession();
  const [rows, setRows] = useState<AdminAccountRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ accounts: AdminAccountRow[] }>("/api/admin/accounts");
      setRows(r.accounts);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (!document.hidden) load();
    }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const unlock = async (a: AdminAccountRow) => {
    setBusyId(a.id);
    try {
      await api<{ ok: true }>("/api/admin/accounts/unlock", { method: "POST", json: { id: a.id } });
      toast(`${a.id} 계정의 잠금을 해제했습니다.`);
      await load();
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  const status = (a: AdminAccountRow): [string, string] =>
    !a.issued ? ["미발급", "neutral"] : a.status !== "ACTIVE" ? [`사용 중지 (${a.status ?? "—"})`, "neutral"] : a.locked ? [`잠김 · ${fmtHM(a.locked_until)}까지`, "danger"] : ["사용", "ok"];

  return (
    <>
      {error && <div className="notice danger" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
      <section className="adm-sec" style={{ marginTop: 0 }}>
        <h2>
          계정 <small>사전 발급 5계정 · 30초마다 갱신</small>
          <span className="sp" />
          <button type="button" className="btn sm" onClick={() => load()}>새로고침</button>
        </h2>
        <div className="adm-scroll">
          <table className="tbl adm-tbl">
            <thead>
              <tr>
                <th>계정 ID</th>
                <th>이름 · 소속</th>
                <th>역할</th>
                <th>상태</th>
                <th>연속 실패</th>
                <th>최근 로그인</th>
                <th>접속</th>
                <th><span className="sr-only">동작</span></th>
              </tr>
            </thead>
            <tbody>
              {!rows && <tr><td colSpan={8} className="adm-empty">{error ? "계정 목록을 불러오지 못했습니다." : "불러오는 중…"}</td></tr>}
              {rows?.map((a) => {
                const [label, tone] = status(a);
                const canUnlock = a.issued && (a.locked || a.failed_count > 0);
                return (
                  <tr key={a.id}>
                    <td className="nowrap"><code>{a.id}</code>{!a.known && <div className="xs mute2">설정에 없는 계정</div>}</td>
                    <td>{a.name}<div className="xs mute2">{a.org}{a.dept ? ` ${a.dept}` : ""}</div></td>
                    <td className="xs nowrap">{ROLE_LABEL[a.role] ?? a.role}</td>
                    <td className="nowrap"><span className={`badge ${tone}`}>{label}</span></td>
                    <td className="num xs">{a.issued ? `${a.failed_count}회` : "—"}</td>
                    <td className="num xs nowrap">{fmtDT(a.last_login_at)}</td>
                    <td className="xs nowrap">
                      {a.session_seen_at ? (
                        <>
                          <span className="badge ok">접속 중</span>
                          <div className="mute2">마지막 활동 {fmtHM(a.session_seen_at)}</div>
                        </>
                      ) : "—"}
                    </td>
                    <td>
                      <div className="adm-acts">
                        <button type="button" className="btn xs" disabled={!canUnlock || busyId === a.id} onClick={() => unlock(a)}>
                          {busyId === a.id ? "해제 중…" : "잠금 해제"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="adm-note">
          비밀번호를 5회 연속 잘못 입력하면 15분 동안 잠깁니다. [잠금 해제]는 잠금과 연속 실패 횟수를 함께 0으로 되돌립니다. 같은 계정으로 새로 로그인하면 기존 접속은 종료됩니다.
          <br />
          계정 발급·비밀번호 재설정은 운영 스크립트 <code>app/scripts/seed_accounts.mjs</code>(서버 SEED_SECRET 필요)로 합니다.
        </p>
      </section>
    </>
  );
}

/* ───────────────────────── 답변 평가 ───────────────────────── */

const RATING: Record<string, [string, string]> = { GOOD: ["좋아요", "ok"], BAD: ["아쉬워요", "danger"] };

function FeedbackTab({ onOpen }: { onOpen: (id: string) => void }) {
  const [d, setD] = useState<AdminFeedbackResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState("");

  const load = useCallback(async () => {
    try {
      setD(await api<AdminFeedbackResponse>("/api/admin/feedback"));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const n = (r: string) => d?.summary.find((s) => s.rating === r)?.n ?? 0;
  const total = (d?.summary ?? []).reduce((s, x) => s + x.n, 0);
  const rows = (d?.rows ?? []).filter((r) => !rating || r.rating === rating);

  return (
    <>
      {error && <div className="notice danger" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="adm-kpis">
        <Fact l="전체 평가" v={<>{total}<small>건</small></>} n="에이전트 평가 전송 + 서버 저장" />
        <Fact l="좋아요" v={<>{n("GOOD")}<small>건</small></>} n={total ? `${Math.round((n("GOOD") / total) * 100)}%` : "—"} />
        <Fact l="아쉬워요" v={<>{n("BAD")}<small>건</small></>} n={total ? `${Math.round((n("BAD") / total) * 100)}%` : "—"} />
      </div>
      <section className="adm-sec" style={{ marginTop: 0 }}>
        <h2>
          답변 평가 <small>최근 {d?.rows.length ?? 0}건</small>
          <span className="sp" />
          <select className="select sm" value={rating} onChange={(e) => setRating(e.target.value)} aria-label="평가">
            <option value="">평가 전체</option>
            <option value="GOOD">좋아요</option>
            <option value="BAD">아쉬워요</option>
          </select>
          <button type="button" className="btn sm" onClick={() => load()}>새로고침</button>
        </h2>
        <div className="adm-scroll">
          <table className="tbl adm-tbl">
            <thead>
              <tr>
                <th>평가 시각</th>
                <th>계정</th>
                <th>평가</th>
                <th>질문</th>
                <th>의견</th>
                <th>에이전트 전송</th>
                <th><span className="sr-only">동작</span></th>
              </tr>
            </thead>
            <tbody>
              {!d && <tr><td colSpan={7} className="adm-empty">{error ? "답변 평가를 불러오지 못했습니다." : "불러오는 중…"}</td></tr>}
              {d && !rows.length && <tr><td colSpan={7} className="adm-empty">{d.rows.length ? "조건에 맞는 평가가 없습니다." : "아직 답변 평가가 없습니다."}</td></tr>}
              {rows.map((r) => {
                const [label, tone] = RATING[r.rating] ?? [r.rating, "neutral"];
                return (
                  <tr key={r.job_id} className="click" onClick={() => onOpen(r.job_id)}>
                    <td className="num xs nowrap">{fmtDT(r.rated_at)}</td>
                    <td className="xs nowrap">{r.account_id}</td>
                    <td className="nowrap"><span className={`badge ${tone}`}>{label}</span></td>
                    <td className="adm-q">
                      <span className="clamp" title={r.question_user ?? undefined}>{r.question_user ?? "(질의 기록 없음)"}</span>
                      {r.source && <div className="xs mute2">{SOURCE_LABEL[r.source as JobSource] ?? r.source} · {fmtDT(r.asked_at)} 질의</div>}
                    </td>
                    <td className="xs" style={{ maxWidth: 320, whiteSpace: "pre-wrap" }}>{r.comment || "—"}</td>
                    <td className="xs nowrap">
                      {r.t3q_feedback_status ? <span className={`badge ${r.t3q_feedback_status === "SUCCESS" ? "ok" : "warn"}`}>{statusKo(r.t3q_feedback_status)}</span> : <span className="mute2">기록 없음</span>}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="adm-acts"><button type="button" className="btn xs" onClick={() => onOpen(r.job_id)}>원문</button></div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* ───────────────────────── 추적로그 (기존 /api/trace) ───────────────────────── */

interface TraceRow { at: string; account: string; api: string; intent: string; status: string; ms: number; q: string; requestId: string; datasets: string[] }
const mask = (q: string) => (q.length <= 6 ? "●●●" : q.slice(0, 4) + "●".repeat(Math.min(12, q.length - 6)) + q.slice(-2));

function TraceTab() {
  const [rows, setRows] = useState<TraceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<TraceRow | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api<TraceRow[]>("/api/trace"));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const list = useMemo(() => rows ?? [], [rows]);
  const stats = useMemo(
    () => ({
      ok: list.filter((t) => t.status === "ok").length,
      fail: list.filter((t) => t.status !== "ok" && t.status !== "clarify").length,
      avg: list.length ? Math.round(list.reduce((n, t) => n + (t.ms || 0), 0) / list.length) : null,
    }),
    [list],
  );

  return (
    <>
      {error && <div className="notice danger" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="adm-kpis">
        <Fact l="호출" v={<>{list.length}<small>건</small></>} n="최근 300건" />
        <Fact l="정상" v={<>{stats.ok}<small>건</small></>} />
        <Fact l="오류·지연" v={<>{stats.fail}<small>건</small></>} bad={stats.fail > 0} />
        <Fact l="평균 응답" v={fmtDur(stats.avg)} />
      </div>
      <div className={sel ? "adm-split" : ""}>
        <div className="adm-scroll">
          <table className="tbl adm-tbl">
            <thead>
              <tr>
                <th>시각</th>
                <th>계정</th>
                <th>API</th>
                <th>의도</th>
                <th>결과</th>
                <th>응답</th>
                <th>질의(마스킹)</th>
              </tr>
            </thead>
            <tbody>
              {!rows && <tr><td colSpan={7} className="adm-empty">{error ? "추적로그를 불러오지 못했습니다." : "불러오는 중…"}</td></tr>}
              {rows && !rows.length && <tr><td colSpan={7} className="adm-empty">추적로그가 없습니다.</td></tr>}
              {list.map((t, i) => (
                <tr key={`${t.requestId}-${i}`} className={`click ${sel === t ? "sel" : ""}`} onClick={() => setSel(t)}>
                  <td className="num xs nowrap">{fmtDT(t.at)}</td>
                  <td className="xs nowrap">{t.account}</td>
                  <td className="xs">{t.api}</td>
                  <td className="xs">{t.intent}</td>
                  <td className="nowrap"><span className={`badge ${t.status === "ok" ? "ok" : t.status === "clarify" ? "info" : "danger"}`}>{t.status}</span></td>
                  <td className="num xs nowrap">{fmtDur(t.ms)}</td>
                  <td className="xs">{mask(t.q ?? "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sel && (
          <div className="panel">
            <div className="row">
              <h3 style={{ fontSize: 16 }}>추적로그 상세</h3>
              <span className="sp" />
              <button type="button" className="btn xs ghost" onClick={() => setSel(null)}>닫기</button>
            </div>
            <dl className="kv" style={{ marginTop: 10 }}>
              <dt>요청 ID</dt><dd><code>{sel.requestId}</code></dd>
              <dt>시각</dt><dd>{toDate(sel.at)?.toLocaleString("ko-KR") ?? "—"}</dd>
              <dt>계정</dt><dd>{sel.account}</dd>
              <dt>API</dt><dd>{sel.api}</dd>
              <dt>결과</dt><dd>{sel.status}</dd>
              <dt>응답 시간</dt><dd>{sel.ms}ms</dd>
              <dt>질의 원문</dt><dd>{mask(sel.q ?? "")} <span className="xs mute2">(개인정보 마스킹)</span></dd>
              <dt>조회 데이터</dt><dd>{sel.datasets?.join(", ") || "—"}</dd>
            </dl>
          </div>
        )}
      </div>
      <p className="adm-note">
        ※ 서버 연계 추적로그 최근 300건입니다. 요청 ID로 서버 로그와 대조할 수 있습니다. 새 질의 경로의 작업 기록과 에이전트 원응답은 [질의 현황] 탭에서 확인합니다.
      </p>
    </>
  );
}

/* ───────────────────────── 원응답 서랍 ───────────────────────── */

interface FullJob {
  id: string;
  account_id: string;
  conv_id: string | null;
  turn_no: number | null;
  source: JobSource;
  library_id: string | null;
  question_user: string;
  question_sent: string;
  state: JobState;
  t3q_status: string | null;
  http_status: number | null;
  cached_from: string | null;
  retry_of: string | null;
  error_code: string | null;
  t3q_request_id: string | null;
  t3q_conversation_id: string | null;
  created_at: string;
  submitted_at: string | null;
  finished_at: string | null;
  elapsed_ms: number | null;
  request: unknown;
  raw: unknown;
  preview: unknown;
  geo: unknown;
}
type View = "raw" | "request" | "preview" | "geo";
const VIEWS: [View, string][] = [["raw", "원응답 raw"], ["request", "보낸 요청 request"], ["preview", "자동 조회 preview"], ["geo", "도형 geo"]];

function JobDetail({ id, onClose, onOpen }: { id: string; onClose: () => void; onOpen: (id: string) => void }) {
  const { toast } = useSession();
  const [job, setJob] = useState<FullJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("raw");
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const load = useCallback(async () => {
    try {
      const r = await api<{ job: FullJob }>(`/api/agent/jobs/${encodeURIComponent(id)}?full=1`);
      setJob(r.job);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [id]);
  useEffect(() => {
    setJob(null);
    setError(null);
    setView("raw");
    load();
  }, [load]);

  // Esc 로 닫기, 닫으면 초점을 원래 자리로
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (prev && prev.isConnected) prev.focus();
    };
  }, []);

  const text = useMemo(() => {
    const v = job?.[view];
    return v == null ? null : JSON.stringify(v, null, 2);
  }, [job, view]);
  const sizes = useMemo(() => {
    const enc = new TextEncoder();
    return Object.fromEntries(VIEWS.map(([k]) => [k, job?.[k] == null ? null : enc.encode(JSON.stringify(job[k])).length])) as Record<View, number | null>;
  }, [job]);

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast("JSON을 복사했습니다.");
    } catch {
      toast("복사하지 못했습니다. 직접 선택해 복사하세요.");
    }
  };
  const download = () => {
    if (!text || !job) return;
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${job.id}.${view}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Portal>
      <div className="ovl" onClick={onClose} />
      <aside className="drawer adm-drawer" role="dialog" aria-modal="true" aria-labelledby="adm-detail-t">
        <div className="hd">
          <h2 id="adm-detail-t">질의 원문</h2>
          <code>{id}</code>
          <span className="sp" />
          <button type="button" className="btn xs" onClick={() => load()}>새로고침</button>
          <button type="button" className="btn xs ghost" onClick={onClose} autoFocus>닫기 (Esc)</button>
        </div>
        <div className="bd">
          {error && <div className="notice danger" role="alert">{error}</div>}
          {!job && !error && <p className="xs mute2">불러오는 중…</p>}
          {job && (
            <>
              <dl className="kv two">
                <dt>계정</dt><dd>{job.account_id}</dd>
                <dt>출처</dt><dd>{SOURCE_LABEL[job.source] ?? job.source}{job.library_id ? ` · ${job.library_id}` : ""}</dd>
                <dt>상태</dt>
                <dd>
                  <span className={`badge ${STATE_TONE[job.state] ?? "neutral"}`}>{STATE_LABEL[job.state] ?? job.state}</span>
                  {job.error_code && <span className="xs mute2"> {job.error_code}</span>}
                </dd>
                <dt>응답 상태</dt><dd>{job.t3q_status ? statusKo(job.t3q_status) : "—"}{job.http_status != null ? ` · HTTP ${job.http_status}` : ""}</dd>
                <dt>요청 ID</dt><dd><code>{job.t3q_request_id ?? "—"}</code></dd>
                <dt>에이전트 대화 ID</dt><dd><code>{job.t3q_conversation_id ?? "—"}</code>{job.turn_no != null ? ` · ${job.turn_no}턴` : ""}</dd>
                <dt>접수</dt><dd>{fmtDT(job.created_at)}</dd>
                <dt>제출</dt><dd>{fmtDT(job.submitted_at)}</dd>
                <dt>완료</dt><dd>{fmtDT(job.finished_at)}</dd>
                <dt>응답 시간</dt><dd>{job.cached_from ? "즉시(캐시)" : fmtDur(job.elapsed_ms)}</dd>
                {job.cached_from && (
                  <>
                    <dt>캐시 원본</dt>
                    <dd><code>{job.cached_from}</code><button type="button" className="btn xs" onClick={() => onOpen(job.cached_from!)}>열기</button></dd>
                  </>
                )}
                {job.retry_of && (
                  <>
                    <dt>재제출 원본</dt>
                    <dd><code>{job.retry_of}</code><button type="button" className="btn xs" onClick={() => onOpen(job.retry_of!)}>열기</button></dd>
                  </>
                )}
              </dl>
              <p className="adm-qlb">사용자 질문</p>
              <div className="adm-qbox">{job.question_user}</div>
              {job.question_sent !== job.question_user && (
                <>
                  <p className="adm-qlb">실제 전송 질문</p>
                  <div className="adm-qbox">{job.question_sent}</div>
                </>
              )}
              <div className="adm-views" role="group" aria-label="원문 종류">
                {VIEWS.map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}>
                    {l}
                    <small>{sizes[k] == null ? "없음" : fmtBytes(sizes[k]!)}</small>
                  </button>
                ))}
                <span className="sp" />
                <button type="button" onClick={copy} disabled={!text}>복사</button>
                <button type="button" onClick={download} disabled={!text}>내려받기</button>
              </div>
              {text ? (
                <pre className="adm-pre" tabIndex={0} aria-label={`${VIEWS.find(([k]) => k === view)?.[1]} JSON`}>{text}</pre>
              ) : (
                <div className="adm-pre none">저장된 값이 없습니다 (null)</div>
              )}
              <p className="adm-note">
                ※ 저장된 값을 들여쓰기만 해서 그대로 보여 줍니다. 저장 방식 때문에 항목 순서는 응답 원문과 다를 수 있습니다(값은 같음).
              </p>
            </>
          )}
        </div>
      </aside>
    </Portal>
  );
}
