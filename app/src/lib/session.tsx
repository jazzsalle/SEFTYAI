"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Advisory, DisasterType, RegionId, WeatherResponse } from "./contract/agent";
import { api, ApiError } from "./api";
import type { Account } from "./config";
import { isActive, locksBase, sourceLocksBase, type JobFull, type JobSource, type JobSummary } from "./jobTypes";
import { basePilot, baseWire, defaultBase, type BaseRegion } from "./baseRegion";
import { presetCondition, wireCondition, type CondPreset } from "./library";

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
  refAdv?: { type: string; level: string; area: string; issuedAt: string; scenario?: boolean };
}
export interface Conversation {
  id: string;
  title: string;
  /** 시범 지역 id(기준지역에서 끌어낸 값 — lib/baseRegion basePilot) */
  region: RegionId;
  /** 대화를 시작할 때의 기준지역 이름(R32 — 대화 이력 표시). 예전 대화에는 없다 */
  baseName?: string;
  /** 대화를 시작할 때의 재난유형 조건(대화 이력 표시·필터, UFR-006-001-06) */
  disasterType?: string;
  createdAt: string;
  updatedAt: string;
  turns: Turn[];
  v?: 2;
}

/** 재난상황 조건 — 사용자가 고르거나 입력한 값만 (R6) */
export interface Cond {
  /** 기준지역(R32) — 시·도 → 시·군·구 → 읍·면·동(브이월드 이름·코드 그대로). null = 전국. 바꿀 때는 setBase 로만 */
  base: BaseRegion | null;
  /** 시범 지역 id — base 에서 끌어낸 값(질문 모음·시작 화면·지도 첫 화면·대화 이력). 직접 바꾸지 않는다 */
  region: RegionId;
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
  /** 질문별 조건 프리셋(질문 모음 「재난담당자의 하루」) — 이 질문 요청에만 싣는다. 세션 조건은 바꾸지 않는다 */
  cond?: CondPreset | null;
}

/**
 * 질의 접수 본문(POST /api/agent/jobs) — 세션 조건을 함께 싣는다. 기준지역(R32)은 가장 아래 단계 하나(코드·시·도부터 이은 이름·단계), 전국이면 null.
 * 프리셋(a.cond)이 있으면 기준지역만 세션 값, 나머지 조건은 프리셋 값만 — 세션 조건(c)은 읽기만 한다
 */
export function submitBody(c: Cond, a: SubmitArgs) {
  const { cond: preset, ...rest } = a;
  return { ...rest, condition: preset ? presetCondition(baseWire(c.base), preset) : wireCondition(baseWire(c.base), c) };
}

interface SessionState {
  ready: boolean;
  account: Account | null;
  login: (id: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  sessionExpired: boolean;
  cond: Cond;
  /** 기준지역 밖의 조건(재난유형·기준시각·상황 상세정보) */
  setCond: (c: Partial<Omit<Cond, "base" | "region">>) => void;
  /** 기준지역 바꾸기 — 질의·응답이 진행 중이면(asking 과 같은 기준 — AI 모드 점검은 빼고, R44) 바꾸지 않고 false. 바꾸면 특보 참조를 뗀다 */
  setBase: (b: BaseRegion | null) => boolean;
  /**
   * 이 계정의 질의·응답이 진행 중(보내는 중이거나 작업이 대기·제출·답변 생성 중) — 기준지역을 바꿀 수 없다.
   * AI 모드 점검(AI_MODE)은 세지 않는다(R44 — jobTypes locksBase · sourceLocksBase)
   */
  asking: boolean;
  /** 통합 탐색 화면에 질문이 하나라도 있는 대화가 열려 있는가(그 화면이 알려 준다) — 기준지역을 바꾸면 새 대화로 시작할지 묻는다 */
  convOpen: boolean;
  setConvOpen: (v: boolean) => void;
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
/** 화면 쪽 특보 조회 실패(fetch 실패·2xx 아님·계정 다름)로 만든 응답 — 서버가 답한 조회 실패와 가른다(참조 특보 떼기) */
const LOCAL_WX_FAIL = new WeakSet<WeatherResponse>();
/** 로그인·세션 복원 때의 조건 — 기준지역은 계정 기본(지자체 = 자기 지역, 그 밖 = 전국), 나머지 조건은 비움 */
const condFor = (acc: Account): Cond => {
  const base = defaultBase(acc);
  return { base, region: basePilot(base) };
};
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
  const [cond, setCondS] = useState<Cond>({ base: null, region: "national" });
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
  /** 접수 응답을 기다리는 질문 수(보내는 중인 턴 — AI 모드 점검 접수는 세지 않음, R44) — 화면용 값과 바로 읽는 값 */
  const [sending, setSending] = useState(0);
  const sendingRef = useRef(0);
  const [convOpen, setConvOpen] = useState(false);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const asking = sending > 0 || Object.values(jobs).some(locksBase);

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
        setCondS(condFor(r.account));
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
    setCondS(condFor(r.account));
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

  // 기상특보 — 기상청 실시간(시연 시나리오를 켠 시연 계정은 시나리오 특보만 — 서버가 정함, R45), 60초마다. 2xx 가 아니면(세션 끊김 401 등) 오류 본문을 특보로 두지 않고 조회 실패로 — 401 은 세션 만료도 알린다(api() 와 같게).
  // 응답 계정이 이 화면 계정과 다르면(같은 브라우저 다른 창에서 다른 계정으로 로그인해 쿠키가 바뀜) 특보를 버리고 세션 만료로 — 시연 시나리오 특보(R43)가 다른 계정 화면에 보이지 않게
  useEffect(() => {
    if (!account) return;
    let alive = true;
    const failed = (): WeatherResponse => {
      const w: WeatherResponse = { mode: "live", status: { ok: false, fetchedAt: new Date().toISOString(), message: "기상특보 조회 실패" }, advisories: [], preliminary: [] };
      LOCAL_WX_FAIL.add(w);
      return w;
    };
    const load = () =>
      fetch("/api/weather")
        .then((r) => {
          if (r.status === 401) window.dispatchEvent(new Event("sa:session-expired"));
          return r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`));
        })
        .then((j: WeatherResponse) => {
          if (!alive) return;
          if (j.accountId && j.accountId !== account.id) {
            window.dispatchEvent(new Event("sa:session-expired"));
            return setWeather(failed());
          }
          setWeather(j);
        })
        .catch(() => alive && setWeather(failed()));
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [account, wxTick]);

  // [특보로 질문] 참조 특보가 특보 목록에서 사라지면(해제 · 시연 시나리오 끔·끝나는 시각 지남) 뗀다 — 「참조 중」 표지가 남지 않게.
  // 기상청 조회 실패로 목록이 비었을 때는 기상청 특보 참조를 그대로 둔다(보낼 때 다시 확인 — explore askText).
  // 시나리오 특보는 끊긴 응답(R45 — 늘 ok)에만 있으므로, 서버가 답한 조회 실패(끊지 않는 응답)면 시나리오가 꺼진 것이라 떼고, 화면 쪽 조회 실패(LOCAL_WX_FAIL)면 모르니 그대로 둔다
  useEffect(() => {
    if (!wxRef || !weather) return;
    if (!weather.status.ok && (!wxRef.scenario || LOCAL_WX_FAIL.has(weather))) return;
    if (weather.advisories.some((a) => a.id === wxRef.id && a.status !== "해제")) return;
    setWxRef(null);
    // 시나리오 특보는 해제가 아니라 끔·끝나는 시각 지남, 끊긴 계정(R45)의 기상청 특보 참조는 끊김으로 떨어진다
    toast(
      wxRef.scenario
        ? "시연 시나리오 특보가 끝나 특보 참조를 뗐습니다."
        : weather.realtimeCut
          ? "기상청 실시간 특보를 끊어 특보 참조를 뗐습니다."
          : "참조한 특보가 해제되어 특보 참조를 뗐습니다.",
    );
  }, [weather, wxRef, toast]);

  // T3Q 연결 상태 (30초)
  useEffect(() => {
    if (!account) return;
    const load = () => fetch("/api/t3q/health").then((r) => r.json()).then((j: { ok: boolean }) => setT3qOk(j.ok)).catch(() => setT3qOk(false));
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [account]);

  const setCond = useCallback((c: Partial<Omit<Cond, "base" | "region">>) => setCondS((p) => ({ ...p, ...c })), []);
  const setBase = useCallback((b: BaseRegion | null) => {
    if (sendingRef.current > 0 || Object.values(jobsRef.current).some(locksBase)) return false;
    setCondS((p) => ({ ...p, base: b, region: basePilot(b) }));
    setWxRef(null);
    return true;
  }, []);

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
    // 바로 읽는 값도 함께(화면을 다시 그리기 전에 기준지역 변경을 막을 수 있게 — setBase)
    jobsRef.current = { ...jobsRef.current, [j.id]: { ...jobsRef.current[j.id], ...j } };
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
      // AI 모드 점검 접수는 보내는 중으로 세지 않는다 — 기준지역을 잠그지 않음(R44)
      const lock = sourceLocksBase(a.source);
      if (lock) {
        sendingRef.current += 1;
        setSending(sendingRef.current);
      }
      try {
        const r = await api<{ job: JobSummary }>("/api/agent/jobs", { method: "POST", json: submitBody(c, a) });
        putJob(r.job);
        return r.job;
      } finally {
        if (lock) {
          sendingRef.current -= 1;
          setSending(sendingRef.current);
        }
      }
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
      ready, account, login, logout, sessionExpired, cond, setCond, setBase, asking, convOpen, setConvOpen, weather,
      reloadWeather: () => setWxTick((t) => t + 1),
      convs, saveConv, deleteConvs, checks, checkInfo, toggleCheck, resetChecks, toast, toastMsg, aimOn, setAimOn, wxRef, setWxRef,
      jobs, jobOrder, medianMs, submit, cancel, full, loadFull, watch, t3qOk,
    }),
    [ready, account, login, logout, sessionExpired, cond, setCond, setBase, asking, convOpen, weather, convs, saveConv, deleteConvs, checks, checkInfo, toggleCheck, resetChecks, toast, toastMsg, aimOn, setAimOn, wxRef, setWxRef, jobs, jobOrder, medianMs, submit, cancel, full, loadFull, watch, t3qOk],
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
