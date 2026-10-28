"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Advisory, DisasterType, RegionId, WeatherResponse } from "./contract/agent";
import { api, ApiError } from "./api";
import type { Account } from "./config";
import { isActive, type JobFull, type JobSource, type JobSummary } from "./jobTypes";

/** 지난 상황으로 보관할 때 함께 보내는 화면 정보 (조치 이름·단계 — 누가·언제는 서버 값) */
export interface CheckArchiveMeta { title?: string; note?: string; labels?: Record<string, { label: string; step: string }> }
export interface CheckHistory { id: string; title: string; note: string; startedAt: string | null; endedAt: string; by: string; items: { key: string; label: string; step: string; by: string; at: string }[] }

/** 대화의 한 턴 — 답은 작업(jobId)의 T3Q 원응답에서 읽는다(중복 저장 없음, DB 설계 §3) */
export interface Turn {
  id: string;
  /** 접수 전(보내는 중)·접수 실패면 빈 문자열 */
  jobId: string;
  /** 보내는 중(접수 응답 대기) */
  pending?: boolean;
  /** 접수 실패 문구 — 같은 내용으로 다시 보낼 수 있게 args 를 함께 둔다 */
  error?: string;
  args?: Omit<SubmitArgs, "convId" | "turnNo">;
  q: string;
  source: JobSource;
  libraryId?: string | null;
  at: string;
  /** 브리핑 세트로 함께 보낸 묶음 */
  group?: { id: string; no: number; total: number; title: string };
  refAdv?: { type: string; level: string; area: string; issuedAt: string };
}
export interface Conversation {
  id: string;
  title: string;
  region: RegionId;
  /** 대화를 시작할 때의 재난유형 조건(대화 이력 표시·필터, UFR-006-001-06) */
  disasterType?: string;
  createdAt: string;
  updatedAt: string;
  turns: Turn[];
  v?: 2;
}

/** 재난상황 조건 — 사용자가 고르거나 입력한 값만 (R6) */
export interface Cond {
  region: RegionId;
  sigungu?: string;
  sigunguName?: string;
  emd?: string;
  emdName?: string;
  disasterType?: DisasterType;
  referenceTime?: string;
  periodFrom?: string;
  periodTo?: string;
  warningKind?: string;
  warningLevel?: string;
  keywords?: string[];
  conditions?: { item: string; label?: string; value: number; unit?: string }[];
}

export interface SubmitArgs {
  question: string;
  source: JobSource;
  libraryId?: string | null;
  convId?: string | null;
  turnNo?: number;
  warnings?: Record<string, unknown> | null;
  briefing?: Record<string, unknown> | null;
  quickQueryId?: string | null;
  aiMode?: Record<string, unknown> | null;
  followUp?: { jobId: string; refs?: { display_name?: string | null; entity_type?: string | null }[] } | null;
  noCache?: boolean;
}

interface SessionState {
  ready: boolean;
  account: Account | null;
  login: (id: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  sessionExpired: boolean;
  cond: Cond;
  setCond: (c: Partial<Cond>) => void;
  weather: WeatherResponse | null;
  reloadWeather: () => void;
  convs: Conversation[];
  saveConv: (c: Conversation) => void;
  deleteConvs: (ids: string[]) => void;
  checks: Record<string, boolean>;
  checkInfo: Record<string, { by: string; at: string }>;
  toggleCheck: (k: string) => void;
  resetChecks: (prefix?: string, meta?: CheckArchiveMeta) => Promise<number>;
  toast: (m: string) => void;
  toastMsg: string | null;
  aimOn: boolean;
  setAimOn: (v: boolean) => void;
  wxRef: Advisory | null;
  setWxRef: (a: Advisory | null) => void;
  /** 질문 큐 (R2) */
  jobs: Record<string, JobSummary>;
  jobOrder: string[];
  medianMs: number | null;
  submit: (a: SubmitArgs) => Promise<JobSummary>;
  cancel: (jobId: string) => Promise<void>;
  /** 완료 작업의 원응답(raw·preview·geo) — 한 번 받으면 기억 */
  full: Record<string, JobFull>;
  loadFull: (jobId: string) => Promise<JobFull | null>;
  watch: (jobId: string) => void;
  t3qOk: boolean | null;
}

const Ctx = createContext<SessionState | null>(null);
const LS = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : d;
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* 저장 불가 환경에서도 화면은 동작 */
    }
  },
};

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [sessionExpired, setExpired] = useState(false);
  const [cond, setCondS] = useState<Cond>({ region: "national" });
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [checkInfo, setCheckInfo] = useState<Record<string, { by: string; at: string }>>({});
  const checks = useMemo(() => Object.fromEntries(Object.keys(checkInfo).map((k) => [k, true])), [checkInfo]);
  const [toastMsg, setToast] = useState<string | null>(null);
  const [wxTick, setWxTick] = useState(0);
  const [aimOn, setAimOnS] = useState(false);
  const [wxRef, setWxRef] = useState<Advisory | null>(null);
  const [jobs, setJobs] = useState<Record<string, JobSummary>>({});
  const [jobOrder, setJobOrder] = useState<string[]>([]);
  const [medianMs, setMedian] = useState<number | null>(null);
  const [full, setFull] = useState<Record<string, JobFull>>({});
  const [t3qOk, setT3qOk] = useState<boolean | null>(null);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const toast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const setAimOn = useCallback((v: boolean) => {
    LS.set("sa.aim", v);
    setAimOnS(v);
    if (v) setWxRef(null);
  }, []);

  // 세션 확인 — 쿠키 세션(서버)이 정본
  useEffect(() => {
    api<{ account: Account }>("/api/auth/me")
      .then((r) => {
        setAccount(r.account);
        setCondS({ region: r.account.region });
        setAimOnS(LS.get<boolean>("sa.aim", false));
      })
      .catch(() => setAccount(null))
      .finally(() => setReady(true));
    const onExpired = () => setExpired(true);
    window.addEventListener("sa:session-expired", onExpired);
    return () => window.removeEventListener("sa:session-expired", onExpired);
  }, []);

  const login = useCallback(async (id: string, password: string) => {
    const r = await api<{ account: Account }>("/api/auth/login", { method: "POST", json: { id, password } });
    setAccount(r.account);
    setExpired(false);
    setCondS({ region: r.account.region });
  }, []);

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    setAccount(null);
    setWeather(null);
    setWxRef(null);
    setJobs({});
    setJobOrder([]);
    setFull({});
  }, []);

  // 대화 이력 (서버 저장, 새 형식 v2 만)
  useEffect(() => {
    if (!account) return setConvs([]);
    api<Conversation[]>("/api/conversations").then(setConvs).catch(() => setConvs([]));
  }, [account]);

  // 기상특보 — 기상청 실시간, 60초마다. 2xx 가 아니면(세션 끊김 401 등) 오류 본문을 특보로 두지 않고 조회 실패로 — 401 은 세션 만료도 알린다(api() 와 같게)
  useEffect(() => {
    if (!account) return;
    let alive = true;
    const load = () =>
      fetch("/api/weather")
        .then((r) => {
          if (r.status === 401) window.dispatchEvent(new Event("sa:session-expired"));
          return r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`));
        })
        .then((j: WeatherResponse) => alive && setWeather(j))
        .catch(() => alive && setWeather({ mode: "live", status: { ok: false, fetchedAt: new Date().toISOString(), message: "기상특보 조회 실패" }, advisories: [], preliminary: [] }));
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [account, wxTick]);

  // T3Q 연결 상태 (30초)
  useEffect(() => {
    if (!account) return;
    const load = () => fetch("/api/t3q/health").then((r) => r.json()).then((j: { ok: boolean }) => setT3qOk(j.ok)).catch(() => setT3qOk(false));
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [account]);

  const setCond = useCallback((c: Partial<Cond>) => setCondS((p) => ({ ...p, ...c })), []);

  const saveConv = useCallback(
    (c: Conversation) => {
      const v = { ...c, v: 2 as const };
      setConvs((prev) => [v, ...prev.filter((x) => x.id !== c.id)].slice(0, 60));
      if (account) api("/api/conversations", { method: "PUT", json: { convs: [v] } }).catch(() => toast("대화 이력을 서버에 저장하지 못했습니다."));
    },
    [account, toast],
  );
  const deleteConvs = useCallback(
    (ids: string[]) => {
      setConvs((prev) => prev.filter((x) => !ids.includes(x.id)));
      if (account) api("/api/conversations", { method: "DELETE", json: { ids } }).catch(() => toast("대화 이력을 지우지 못했습니다."));
    },
    [account, toast],
  );

  // 체크 — 서버(기관 공용), 20초마다
  useEffect(() => {
    if (!account) return setCheckInfo({});
    const load = () => api<Record<string, { by: string; at: string }>>("/api/checks").then(setCheckInfo).catch(() => {});
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [account]);
  const toggleCheck = useCallback(
    (k: string) => {
      const done = !checkInfo[k];
      setCheckInfo((p) => {
        const n = { ...p };
        if (done) n[k] = { by: account?.name ?? "", at: new Date().toISOString() };
        else delete n[k];
        return n;
      });
      api<Record<string, { by: string; at: string }>>("/api/checks", { method: "POST", json: { key: k, done } })
        .then(setCheckInfo)
        .catch(() => toast("체크를 서버에 저장하지 못했습니다."));
    },
    [account, checkInfo, toast],
  );
  const resetChecks = useCallback(async (prefix?: string, meta?: CheckArchiveMeta) => {
    const r = await api<{ cleared: number }>("/api/checks", { method: "DELETE", json: { prefix, ...meta } });
    setCheckInfo(await api<Record<string, { by: string; at: string }>>("/api/checks"));
    return r.cleared;
  }, []);

  // ── 질문 큐 (R1·R2) ──
  const putJob = useCallback((j: JobSummary) => {
    setJobs((p) => ({ ...p, [j.id]: { ...p[j.id], ...j } }));
    setJobOrder((o) => (o.includes(j.id) ? o : [j.id, ...o]));
  }, []);

  // 로그인 직후 — 최근 작업으로 큐 복원(새로고침·다른 기기)
  useEffect(() => {
    if (!account) return;
    api<{ jobs: JobSummary[]; medianMs: number | null }>("/api/agent/jobs?limit=40")
      .then((r) => {
        setJobs(Object.fromEntries(r.jobs.map((j) => [j.id, j])));
        setJobOrder(r.jobs.map((j) => j.id));
        setMedian(r.medianMs);
      })
      .catch(() => {});
  }, [account]);

  // 진행 중 작업 폴링 — 3초, 5분 지나면 6초 (R1). 앞선 조회가 아직 안 끝난 작업은 건너뛴다(조회가 쌓이지 않게)
  const inflight = useRef(new Set<string>());
  useEffect(() => {
    if (!account) return;
    let stop = false;
    const tick = async () => {
      const act = Object.values(jobsRef.current).filter((j) => isActive(j.state) && !inflight.current.has(j.id));
      await Promise.all(
        act
          .filter((j) => Date.now() - new Date(j.created_at).getTime() < 5 * 60_000 || Math.floor(Date.now() / 3000) % 2 === 0)
          .map((j) => {
            inflight.current.add(j.id);
            return api<{ job: JobSummary }>(`/api/agent/jobs/${j.id}`)
              .then((r) => {
                if (!stop) putJob(r.job);
              })
              .catch((e) => {
                if (e instanceof ApiError && e.status === 404) setJobs((p) => ({ ...p, [j.id]: { ...p[j.id], state: "LOST" } }));
              })
              .finally(() => inflight.current.delete(j.id));
          }),
      );
    };
    const t = setInterval(tick, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [account, putJob]);

  const submit = useCallback(
    async (a: SubmitArgs) => {
      const c = cond;
      const r = await api<{ job: JobSummary }>("/api/agent/jobs", {
        method: "POST",
        json: {
          ...a,
          condition: {
            region: c.region,
            // 읍·면·동 코드는 없으므로 시·군·구 코드 + 이름에 읍·면·동을 붙여 보낸다
            sub: c.sigungu ? { code: c.sigungu, name: [c.sigunguName, c.emdName].filter(Boolean).join(" ") } : null,
            disasterTypes: c.disasterType && c.disasterType !== "전체" ? [c.disasterType] : [],
            referenceTime: c.referenceTime || null,
            period: c.periodFrom || c.periodTo ? { from: c.periodFrom || null, to: c.periodTo || null } : null,
            warningKind: c.warningKind || null,
            warningLevel: c.warningLevel || null,
            keywords: c.keywords ?? [],
            conditions: c.conditions ?? [],
          },
        },
      });
      putJob(r.job);
      return r.job;
    },
    [cond, putJob],
  );

  const cancel = useCallback(
    async (jobId: string) => {
      const r = await api<{ job: JobSummary }>(`/api/agent/jobs/${jobId}/cancel`, { method: "POST" });
      putJob(r.job);
    },
    [putJob],
  );

  const fullRef = useRef(full);
  fullRef.current = full;
  const loadFull = useCallback(async (jobId: string) => {
    const have = fullRef.current[jobId];
    if (have && !isActive(have.state) && (have.raw || have.state !== "DONE")) return have;
    try {
      const r = await api<{ job: JobFull }>(`/api/agent/jobs/${jobId}?full=1`);
      setFull((p) => ({ ...p, [jobId]: r.job }));
      putJob(r.job);
      return r.job;
    } catch {
      return null;
    }
  }, [putJob]);

  /** 대화에 있는 작업을 큐에 올려 상태를 따라가게 함(이력에서 연 대화 등) */
  const watch = useCallback(
    (jobId: string) => {
      if (jobsRef.current[jobId]) return;
      api<{ job: JobSummary }>(`/api/agent/jobs/${jobId}`).then((r) => putJob(r.job)).catch(() => {});
    },
    [putJob],
  );

  const value = useMemo<SessionState>(
    () => ({
      ready, account, login, logout, sessionExpired, cond, setCond, weather,
      reloadWeather: () => setWxTick((t) => t + 1),
      convs, saveConv, deleteConvs, checks, checkInfo, toggleCheck, resetChecks, toast, toastMsg, aimOn, setAimOn, wxRef, setWxRef,
      jobs, jobOrder, medianMs, submit, cancel, full, loadFull, watch, t3qOk,
    }),
    [ready, account, login, logout, sessionExpired, cond, setCond, weather, convs, saveConv, deleteConvs, checks, checkInfo, toggleCheck, resetChecks, toast, toastMsg, aimOn, setAimOn, wxRef, setWxRef, jobs, jobOrder, medianMs, submit, cancel, full, loadFull, watch, t3qOk],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("SessionProvider 누락");
  return v;
}

export const uid = (p = "") => p + Math.random().toString(36).slice(2, 10);

/** 연계 추적로그 — 운영관리 */
export interface TraceRow { at: string; account: string; api: string; intent: string; status: string; ms: number; q: string; requestId: string; datasets: string[] }
export async function readTrace(): Promise<TraceRow[]> {
  try {
    return await api<TraceRow[]>("/api/trace");
  } catch {
    return [];
  }
}
