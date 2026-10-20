"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Advisory, AgentResponse, QueryContext, RegionId, WeatherMode, WeatherResponse, DisasterType } from "./contract/agent";
import { api } from "./api";
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
  /** 대응절차·답변 체크 — 기관 공용(서버 D39), 운영자는 개인 */
  checks: Record<string, boolean>;
  /** 체크한 사람·시각 */
  checkInfo: Record<string, { by: string; at: string }>;
  toggleCheck: (k: string) => void;
  /** 새 상황으로 시작 — 기관 체크 비움 (prefix 를 주면 그 매뉴얼 것만) */
  resetChecks: (prefix?: string) => Promise<number>;
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
  const [checkInfo, setCheckInfo] = useState<Record<string, { by: string; at: string }>>({});
  const checks = useMemo(() => Object.fromEntries(Object.keys(checkInfo).map((k) => [k, true])), [checkInfo]);
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
    }
    setReady(true);
  }, []);

  // 대화 이력 — 서버 저장 (D38). 이 브라우저에 남아 있던 이력은 처음 한 번 서버로 옮기고 지움
  const loadConvs = useCallback(async (acc: Account) => {
    try {
      const old = LS.get<Conversation[]>(`sa.convs.${acc.id}`, []);
      if (old.length) {
        await api("/api/conversations", { method: "PUT", json: { convs: old.slice(0, 100) } });
        try {
          localStorage.removeItem(`sa.convs.${acc.id}`);
        } catch {}
      }
      setConvs(await api<Conversation[]>("/api/conversations"));
    } catch {
      setConvs([]);
      setToast("대화 이력을 서버에서 불러오지 못했습니다.");
      window.setTimeout(() => setToast(null), 2400);
    }
  }, []);
  useEffect(() => {
    if (account) loadConvs(account);
    else setConvs([]);
  }, [account, loadConvs]);

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
    // 대화 이력·체크는 계정이 바뀌면 서버에서 읽음 (처음 조회하는 계정은 서버가 시연용 대화로 채움)
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

  const saveFail = useCallback(() => {
    setToast("대화 이력을 서버에 저장하지 못했습니다. 네트워크를 확인하세요.");
    window.setTimeout(() => setToast(null), 3000);
  }, []);
  const saveConv = useCallback(
    (c: Conversation) => {
      setConvs((prev) => [c, ...prev.filter((x) => x.id !== c.id)].slice(0, 60));
      if (account) api("/api/conversations", { method: "PUT", json: { convs: [c] } }).catch(saveFail);
    },
    [account, saveFail],
  );
  const deleteConvs = useCallback(
    (ids: string[]) => {
      setConvs((prev) => prev.filter((x) => !ids.includes(x.id)));
      if (account) api("/api/conversations", { method: "DELETE", json: { ids } }).catch(saveFail);
    },
    [account, saveFail],
  );
  // 체크 — 서버(기관 공용). 같은 기관 담당자가 체크한 것도 보이도록 20초마다 새로 읽음
  const loadChecks = useCallback(async (acc: Account) => {
    try {
      const old = LS.get<Record<string, boolean>>(`sa.checks.${acc.id}`, {});
      const keys = Object.keys(old).filter((k) => old[k]);
      if (keys.length) {
        // 이 브라우저에 남아 있던 체크는 처음 한 번 서버로 옮김
        for (const key of keys.slice(0, 300)) await api("/api/checks", { method: "POST", json: { key, done: true } });
        try {
          localStorage.removeItem(`sa.checks.${acc.id}`);
        } catch {}
      }
      setCheckInfo(await api<Record<string, { by: string; at: string }>>("/api/checks"));
    } catch {}
  }, []);
  useEffect(() => {
    if (!account) return setCheckInfo({});
    loadChecks(account);
    const t = setInterval(() => api<Record<string, { by: string; at: string }>>("/api/checks").then(setCheckInfo).catch(() => {}), 20000);
    return () => clearInterval(t);
  }, [account, loadChecks]);
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
        .catch(() => {
          setToast("체크를 서버에 저장하지 못했습니다.");
          window.setTimeout(() => setToast(null), 2400);
          if (account) loadChecks(account);
        });
    },
    [account, checkInfo, loadChecks],
  );
  const resetChecks = useCallback(
    async (prefix?: string) => {
      const r = await api<{ cleared: number }>("/api/checks", { method: "DELETE", json: { prefix } });
      setCheckInfo(await api<Record<string, { by: string; at: string }>>("/api/checks"));
      return r.cleared;
    },
    [],
  );
  const toast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      ready, account, login, logout, mode, setMode, cond, setCond, weather,
      reloadWeather: () => setWxTick((t) => t + 1),
      convs, saveConv, deleteConvs, checks, checkInfo, toggleCheck, resetChecks, toast, toastMsg, aimOn, setAimOn, wxRef, setWxRef,
    }),
    [ready, account, login, logout, mode, setMode, cond, setCond, weather, convs, saveConv, deleteConvs, checks, checkInfo, toggleCheck, resetChecks, toast, toastMsg, aimOn, setAimOn, wxRef, setWxRef],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("SessionProvider 누락");
  return v;
}

export const uid = (p = "") => p + Math.random().toString(36).slice(2, 10);

/** 연계 추적로그 (FUN-UNE-803004) — 에이전트 API가 서버 DB에 기록(D39), 운영관리에서 조회. 질의 원문은 운영 화면에서 한 번 더 마스킹 */
export interface TraceRow { at: string; account: string; api: string; intent: string; status: string; ms: number; q: string; requestId: string; datasets: string[] }
export async function readTrace(): Promise<TraceRow[]> {
  try {
    return await api<TraceRow[]>("/api/trace");
  } catch {
    return [];
  }
}
