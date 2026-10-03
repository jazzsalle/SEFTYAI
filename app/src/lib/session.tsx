"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Advisory, AgentResponse, QueryContext, RegionId, WeatherMode, WeatherResponse, DisasterType } from "./contract/agent";
import { ACCOUNTS, type Account } from "./config";

export interface Turn {
  id: string;
  q: string;
  at: string;
  presetKey?: string;
  /** 이 질문에 참조로 건 특보 (말풍선 위 표시) */
  refAdv?: { type: string; level: string; area: string; issuedAt: string };
  res?: AgentResponse;
  /** 보낸 질의 원본 (내부용 정합성 검증 ① : 받은 질의 echo 와 대조) */
  req?: { question: string; presetKey?: string; context: QueryContext };
  pending?: boolean;
  failed?: string;
}
export interface Conversation {
  id: string;
  title: string;
  region: RegionId;
  disasterType?: DisasterType;
  createdAt: string;
  updatedAt: string;
  turns: Turn[];
  refEntity?: QueryContext["refEntity"];
}

export interface Cond {
  region: RegionId;
  sigungu?: string;
  emd?: string;
  /** 선택하지 않을 수 있음 (조건 없는 일반 질의) */
  disasterType?: DisasterType;
  baseTime?: string; // 비우면 특보/시나리오 기준
  endTime?: string;
  hydro?: QueryContext["hydro"];
  keywords?: string[];
  situationKind?: QueryContext["situationKind"];
  scenarioId?: string;
  scenarioTitle?: string;
}

interface SessionState {
  ready: boolean;
  account: Account | null;
  login: (id: string) => void;
  logout: () => void;
  mode: WeatherMode;
  setMode: (m: WeatherMode) => void;
  cond: Cond;
  setCond: (c: Partial<Cond>) => void;
  weather: WeatherResponse | null;
  reloadWeather: () => void;
  convs: Conversation[];
  saveConv: (c: Conversation) => void;
  deleteConvs: (ids: string[]) => void;
  checks: Record<string, boolean>;
  toggleCheck: (k: string) => void;
  toast: (m: string) => void;
  toastMsg: string | null;
  aimOn: boolean;
  setAimOn: (v: boolean) => void;
  /** [특보로 질문] 참조 특보 — 해제(×)하기 전까지 이후 질문에 함께 전달 */
  wxRef: Advisory | null;
  setWxRef: (a: Advisory | null) => void;
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
      /* 저장 불가 환경(시크릿 등)에서도 화면은 동작 */
    }
  },
};

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [mode, setModeS] = useState<WeatherMode>("scenario");
  const [cond, setCondS] = useState<Cond>({ region: "national" });
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [toastMsg, setToast] = useState<string | null>(null);
  const [wxTick, setWxTick] = useState(0);
  const [aimOn, setAimOnS] = useState(false);
  const [wxRef, setWxRef] = useState<Advisory | null>(null);
  const setAimOn = useCallback((v: boolean) => {
    LS.set("sa.aim", v);
    setAimOnS(v);
    if (v) setWxRef(null); // AI 모드 중에는 [특보로 질문] 불가 (현재 특보가 자동 전달되므로 혼선 방지)
  }, []);

  useEffect(() => {
    const id = LS.get<string | null>("sa.account", null);
    const acc = ACCOUNTS.find((a) => a.id === id) ?? null;
    setAccount(acc);
    setModeS(LS.get<WeatherMode>("sa.mode", "scenario"));
    setAimOnS(LS.get<boolean>("sa.aim", false));
    if (acc) {
      setCondS({ region: acc.region });
      setConvs(LS.get<Conversation[]>(`sa.convs.${acc.id}`, []));
      setChecks(LS.get(`sa.checks.${acc.id}`, {}));
    }
    setReady(true);
  }, []);

  // 기상특보 (시나리오/라이브)
  useEffect(() => {
    if (!account) return;
    let alive = true;
    const region = account.region;
    fetch(`/api/weather?mode=${mode}&region=${region}`)
      .then((r) => r.json())
      .then((j: WeatherResponse) => alive && setWeather(j))
      .catch(() =>
        alive &&
        setWeather({
          mode,
          status: { ok: false, fetchedAt: new Date().toISOString(), message: "기상특보 조회 실패" },
          advisories: [],
          preliminary: [],
        }),
      );
    return () => {
      alive = false;
    };
  }, [account, mode, wxTick]);

  const login = useCallback((id: string) => {
    const acc = ACCOUNTS.find((a) => a.id === id);
    if (!acc) return;
    LS.set("sa.account", id);
    setAccount(acc);
    setCondS({ region: acc.region });
    const saved = LS.get<Conversation[] | null>(`sa.convs.${acc.id}`, null);
    if (saved) setConvs(saved);
    else {
      // 첫 로그인 : 시연용 대화 이력 주입 (다른 PC에서도 이력 화면이 비지 않도록)
      fetch(`/api/fixtures/conversations?account=${acc.id}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((list: Conversation[]) => {
          setConvs(list);
          LS.set(`sa.convs.${acc.id}`, list);
        })
        .catch(() => setConvs([]));
    }
    setChecks(LS.get(`sa.checks.${acc.id}`, {}));
  }, []);

  const logout = useCallback(() => {
    LS.set("sa.account", null);
    setAccount(null);
    setWeather(null);
    setWxRef(null);
  }, []);

  const setMode = useCallback((m: WeatherMode) => {
    LS.set("sa.mode", m);
    setModeS(m);
  }, []);

  const setCond = useCallback((c: Partial<Cond>) => setCondS((p) => ({ ...p, ...c })), []);

  const saveConv = useCallback(
    (c: Conversation) =>
      setConvs((prev) => {
        const next = [c, ...prev.filter((x) => x.id !== c.id)].slice(0, 60);
        if (account) LS.set(`sa.convs.${account.id}`, next);
        return next;
      }),
    [account],
  );
  const deleteConvs = useCallback(
    (ids: string[]) =>
      setConvs((prev) => {
        const next = prev.filter((x) => !ids.includes(x.id));
        if (account) LS.set(`sa.convs.${account.id}`, next);
        return next;
      }),
    [account],
  );
  const toggleCheck = useCallback(
    (k: string) =>
      setChecks((p) => {
        const n = { ...p, [k]: !p[k] };
        if (account) LS.set(`sa.checks.${account.id}`, n);
        return n;
      }),
    [account],
  );
  const toast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      ready, account, login, logout, mode, setMode, cond, setCond, weather,
      reloadWeather: () => setWxTick((t) => t + 1),
      convs, saveConv, deleteConvs, checks, toggleCheck, toast, toastMsg, aimOn, setAimOn, wxRef, setWxRef,
    }),
    [ready, account, login, logout, mode, setMode, cond, setCond, weather, convs, saveConv, deleteConvs, checks, toggleCheck, toast, toastMsg, aimOn, setAimOn, wxRef, setWxRef],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("SessionProvider 누락");
  return v;
}

export const uid = (p = "") => p + Math.random().toString(36).slice(2, 10);

/** 연계 추적로그 (FUN-UNE-803004) — 시연판은 브라우저 보관, 질의 원문은 운영 화면에서 마스킹 */
export interface TraceRow { at: string; account: string; api: string; intent: string; status: string; ms: number; q: string; requestId: string; datasets: string[] }
export function logTrace(r: TraceRow) {
  try {
    const l: TraceRow[] = JSON.parse(localStorage.getItem("sa.trace") || "[]");
    localStorage.setItem("sa.trace", JSON.stringify([r, ...l].slice(0, 200)));
  } catch {}
}
export function readTrace(): TraceRow[] {
  try {
    return JSON.parse(localStorage.getItem("sa.trace") || "[]");
  } catch {
    return [];
  }
}
