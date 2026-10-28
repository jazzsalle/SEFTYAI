"use client";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { api, ApiError } from "@/lib/api";

/**
 * T3Q 데이터 조회 받기 도구 — POST /api/t3q/data {api, id?, body?, query?} (src/app/api/t3q/data/route.ts)
 * - 봉투는 받은 그대로 돌려준다(고르거나 고치지 않음, R0). 봉투를 받았으면 그 status 가 무엇이든 state "ok".
 *   state "error" = 봉투를 받지 못함(로그인·형식 오류, 프록시 502, 연결 실패).
 * - 같은 조회(api·id·body·query 내용이 같으면 같은 열쇠, 객체 키 순서 무관)는 한 번만 보낸다:
 *   보내는 중이면 그 요청을 함께 기다리고, 받은 뒤에는 메모리에 둔다(2xx 봉투만 다시 씀, 10분).
 * - 기다리던 쪽이 그만둬도(화면에서 사라짐·AbortSignal) 공용 요청은 끝까지 받아 저장한다. 그만둔 쪽에는 알리지 않는다.
 * - 실패는 다시 쓰지 않는다 — 그 조회를 쓰는 화면이 새로 열리면 다시 보낸다.
 *
 * 화면: useT3qData(req) · useT3qDataMany(api, ids) — {state: "loading"|"ok"|"error", data(봉투), error(글)}
 * 직접: fetchT3qData(req, {signal}) → 봉투 · fetchT3qMany(api, ids, {signal}) → ids 순서대로 상태 배열(한 건 실패는 그 칸만 error)
 */

export interface T3qDataReq {
  /** 프록시가 받는 조회 번호 — "T3Q-10" 등 */
  api: string;
  /** T3Q 가 준 ID 그대로 */
  id?: string;
  body?: unknown;
  query?: Record<string, string>;
}

/** T3Q Data API 봉투 — result 모양은 조회마다 다르다 */
export interface T3qEnvelope<R = Record<string, unknown>> {
  schema_version?: string;
  request_id?: string;
  status?: string;
  result?: R | null;
  data_gaps?: { component: string; reason: string }[];
  warnings?: { code: string; message: string; retryable?: boolean }[];
  meta?: { base_time?: string; quality_status?: string; [k: string]: unknown };
  [k: string]: unknown;
}

/** 프록시 응답 — envelope 는 T3Q 봉투 그대로, http 는 T3Q 가 준 HTTP 상태 */
export interface T3qDataResponse<E = T3qEnvelope> {
  api: string;
  http: number;
  ms: number;
  envelope: E;
}

export type T3qDataState<E = T3qEnvelope> =
  | { state: "loading"; data: null; error: null }
  | { state: "ok"; data: E; error: null }
  | { state: "error"; data: null; error: string };

export type T3qFetcher = (req: T3qDataReq) => Promise<T3qDataResponse<unknown>>;

const LOADING = { state: "loading", data: null, error: null } as const;
const FAIL = "정보를 불러오지 못했습니다.";
/** 오류 글 — 우리 서버가 준 한국어 오류는 그대로, 그 밖(연결 끊김 등 브라우저 영문 오류)은 한 가지 글 */
const errText = (e: unknown) => (e instanceof ApiError && e.message ? e.message : FAIL);

/* ── 열쇠 ─────────────────────────────────────────── */

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object" && typeof (v as { toJSON?: unknown }).toJSON !== "function") {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) out[k] = sortKeys(o[k]);
    return out;
  }
  return v;
}
/** JSON 글자 — 객체 키를 정렬해 내용이 같으면 같은 글자(배열 순서는 그대로) */
export const stableJson = (v: unknown): string => JSON.stringify(sortKeys(v)) ?? "null";

/** 조회 열쇠 — api·id·body·query 내용이 같으면 같은 열쇠. 칸이 없는 것과 undefined 는 같다 */
export const t3qKey = (req: T3qDataReq): string => stableJson([req.api, req.id ?? null, req.body ?? null, req.query ?? null]);

/** 열쇠 → 보낼 요청. 없는 칸은 보내지 않는다(프록시는 body·query 가 없으면 없는 대로 처리) */
export function t3qReqOfKey(key: string): T3qDataReq {
  const [apiId, id, body, query] = JSON.parse(key) as [string, string | null, unknown, Record<string, string> | null];
  const req: T3qDataReq = { api: apiId };
  if (id !== null) req.id = id;
  if (body !== null) req.body = body;
  if (query !== null) req.query = query;
  return req;
}

/* ── 그만두기 ─────────────────────────────────────── */

export const isAbortError = (e: unknown) => (e as { name?: unknown } | null)?.name === "AbortError";
const abortErr = () => new DOMException("조회를 그만뒀습니다.", "AbortError");

/** 공용 요청 p 를 기다리되, signal 이 끊기면 이 쪽만 AbortError 로 빠진다(p 는 계속) */
function detach<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(abortErr());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortErr());
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

/* ── 저장소 ───────────────────────────────────────── */

interface Entry {
  /** 화면에 주는 상태 — 바뀔 때만 새 객체(같으면 같은 참조) */
  snap: T3qDataState<unknown>;
  res: T3qDataResponse<unknown> | null;
  /** res 를 받은 때(ms) */
  at: number;
  /** 2xx 봉투 → 다시 씀 */
  reusable: boolean;
  inflight: Promise<T3qDataResponse<unknown>> | null;
}

export interface T3qDataStore {
  /** 지금 상태(받기 시작 안 함). 없으면 loading */
  peek(key: string): T3qDataState<unknown>;
  /** 받기 — 저장된 값·보내는 중인 요청을 함께 쓴다 */
  load(req: T3qDataReq, opt?: { signal?: AbortSignal }): Promise<T3qDataResponse<unknown>>;
  /** 여러 ID 동시에 — ids 순서대로 상태. 한 건 실패는 그 칸만 error, 그만두면 AbortError */
  loadMany(apiId: string, ids: readonly string[], opt?: { signal?: AbortSignal }): Promise<T3qDataState<unknown>[]>;
  /** 받은 값이 없거나 다시 받아야 하면 보낸다(결과는 subscribe 로) */
  ensure(key: string): void;
  subscribe(keys: readonly string[], cb: () => void): () => void;
  /** 시험용 — 저장한 값을 모두 버린다 */
  clear(): void;
  size(): number;
}

export interface T3qDataStoreOptions {
  /** 2xx 봉투를 다시 쓰는 시간(ms) — 기본 10분. 지나면 다음 사용 때 다시 받고, 받는 동안은 앞의 값을 그대로 보인다 */
  ttlMs?: number;
  /** 저장 개수 상한 — 넘으면 오래된 것부터 버린다(보는 중·보내는 중인 것은 두고) */
  maxEntries?: number;
  now?: () => number;
}

export function createT3qDataStore(fetcher: T3qFetcher, opt: T3qDataStoreOptions = {}): T3qDataStore {
  const ttl = opt.ttlMs ?? 10 * 60_000;
  const max = opt.maxEntries ?? 300;
  const now = opt.now ?? Date.now;
  const entries = new Map<string, Entry>();
  const subs = new Map<string, Set<() => void>>();

  const emit = (key: string) => subs.get(key)?.forEach((cb) => cb());
  const fresh = (e: Entry) => e.reusable && e.res !== null && now() - e.at < ttl;
  /** 최근에 쓴 것을 뒤로 — 버릴 때 앞(오래된 것)부터 */
  const touch = (key: string, e: Entry) => {
    entries.delete(key);
    entries.set(key, e);
  };
  const prune = () => {
    for (const [k, e] of entries) {
      if (entries.size <= max) return;
      if (!e.inflight && !subs.has(k)) entries.delete(k);
    }
  };

  function start(key: string, req: T3qDataReq): Promise<T3qDataResponse<unknown>> {
    const e: Entry = entries.get(key) ?? { snap: LOADING, res: null, at: 0, reusable: false, inflight: null };
    touch(key, e);
    let p: Promise<T3qDataResponse<unknown>>;
    try {
      p = fetcher(req);
    } catch (err) {
      p = Promise.reject(err);
    }
    /** 봉투가 없는 응답은 받지 못한 것으로 — state "ok" 이면 data 는 늘 봉투 객체 */
    const checked = (res: T3qDataResponse<unknown>) => {
      if (!res || typeof res !== "object" || !res.envelope || typeof res.envelope !== "object") throw new ApiError(502, FAIL, res);
      return res;
    };
    const onOk = (res: T3qDataResponse<unknown>) => {
      e.inflight = null;
      e.res = res;
      e.at = now();
      e.reusable = res.http >= 200 && res.http < 300;
      e.snap = { state: "ok", data: res.envelope, error: null };
      if (entries.get(key) === e) {
        emit(key);
        prune();
      }
      return res;
    };
    const onErr = (err: unknown): never => {
      e.inflight = null;
      e.reusable = false;
      // 앞서 받은 값이 있으면 그 값을 그대로 둔다(다시 받기 실패)
      if (e.snap.state !== "ok") e.snap = { state: "error", data: null, error: errText(err) };
      if (entries.get(key) === e) {
        emit(key);
        prune();
      }
      throw err;
    };
    const done = p.then(checked).then(onOk, onErr);
    done.catch(() => {}); // 기다리는 쪽이 모두 그만둬도 처리 안 된 거부로 남지 않게
    e.inflight = done;
    if (e.snap.state === "error") {
      e.snap = LOADING; // 실패했던 조회를 다시 받는 중
      emit(key);
    }
    prune();
    return done;
  }

  function load(req: T3qDataReq, o: { signal?: AbortSignal } = {}) {
    if (o.signal?.aborted) return Promise.reject(abortErr());
    const key = t3qKey(req);
    const e = entries.get(key);
    let p: Promise<T3qDataResponse<unknown>>;
    if (e?.inflight) p = e.inflight;
    else if (e && e.res && fresh(e)) {
      touch(key, e);
      p = Promise.resolve(e.res);
    } else p = start(key, req);
    return detach(p, o.signal);
  }

  function loadMany(apiId: string, ids: readonly string[], o: { signal?: AbortSignal } = {}) {
    return Promise.all(
      ids.map((id) =>
        load({ api: apiId, id }, o).then(
          (res): T3qDataState<unknown> => ({ state: "ok", data: res.envelope, error: null }),
          (err: unknown): T3qDataState<unknown> => {
            if (isAbortError(err)) throw err;
            return { state: "error", data: null, error: errText(err) };
          },
        ),
      ),
    );
  }

  function ensure(key: string) {
    const e = entries.get(key);
    if (e && (e.inflight || fresh(e))) touch(key, e);
    else start(key, t3qReqOfKey(key));
  }

  function subscribe(keys: readonly string[], cb: () => void) {
    for (const k of keys) {
      let s = subs.get(k);
      if (!s) subs.set(k, (s = new Set()));
      s.add(cb);
    }
    return () => {
      for (const k of keys) {
        const s = subs.get(k);
        if (!s) continue;
        s.delete(cb);
        if (!s.size) subs.delete(k);
      }
      prune();
    };
  }

  return {
    peek: (key) => entries.get(key)?.snap ?? LOADING,
    load,
    loadMany,
    ensure,
    subscribe,
    clear: () => {
      entries.clear();
      for (const k of [...subs.keys()]) emit(k);
    },
    size: () => entries.size,
  };
}

/* ── 화면 공용 ────────────────────────────────────── */

const store = createT3qDataStore((req) => api<T3qDataResponse<unknown>>("/api/t3q/data", { method: "POST", json: req }));

/** 한 건 받기 → 봉투 그대로. 봉투를 못 받으면 ApiError 등으로 거부, signal 이 끊기면 AbortError(isAbortError) */
export function fetchT3qData<E = T3qEnvelope>(req: T3qDataReq, opt?: { signal?: AbortSignal }): Promise<E> {
  return store.load(req, opt).then((r) => r.envelope as E);
}

/** 여러 ID 동시에 → ids 순서대로 상태 배열(한 건 실패는 그 칸만 error). signal 이 끊기면 AbortError */
export function fetchT3qMany<E = T3qEnvelope>(apiId: string, ids: readonly string[], opt?: { signal?: AbortSignal }): Promise<T3qDataState<E>[]> {
  return store.loadMany(apiId, ids, opt) as Promise<T3qDataState<E>[]>;
}

const NO_UNSUB = () => {};
const serverLoading = () => LOADING;

/** 한 건 — req 가 없으면 보내지 않고 loading. req 는 매번 새 객체여도 내용이 같으면 다시 보내지 않는다 */
export function useT3qData<E = T3qEnvelope>(req: T3qDataReq | null | undefined): T3qDataState<E> {
  const key = req ? t3qKey(req) : null;
  const subscribe = useCallback((cb: () => void) => (key === null ? NO_UNSUB : store.subscribe([key], cb)), [key]);
  const get = useCallback((): T3qDataState<unknown> => (key === null ? LOADING : store.peek(key)), [key]);
  const snap = useSyncExternalStore(subscribe, get, serverLoading);
  useEffect(() => {
    if (key !== null) store.ensure(key);
  }, [key]);
  return snap as T3qDataState<E>;
}

/**
 * 여러 ID 를 한꺼번에 동시에 — ids 순서대로 상태 배열. 칸마다 따로 도착·실패한다.
 * ids 배열은 매번 새로 만들어도 내용이 같으면 다시 보내지 않는다. 아무것도 바뀌지 않으면 같은 배열을 돌려준다.
 */
export function useT3qDataMany<E = T3qEnvelope>(apiId: string, ids: readonly string[]): T3qDataState<E>[] {
  const sig = JSON.stringify([apiId, ids]);
  const sel = useMemo(() => {
    const [a, list] = JSON.parse(sig) as [string, string[]];
    const keys = list.map((id) => t3qKey({ api: a, id }));
    const server: T3qDataState<unknown>[] = keys.map(() => LOADING);
    let last = server;
    return {
      keys,
      subscribe: (cb: () => void) => store.subscribe(keys, cb),
      get: () => {
        const next = keys.map((k) => store.peek(k));
        if (next.some((s, i) => s !== last[i])) last = next;
        return last;
      },
      server: () => server,
    };
  }, [sig]);
  const snaps = useSyncExternalStore(sel.subscribe, sel.get, sel.server);
  useEffect(() => {
    for (const k of sel.keys) store.ensure(k);
  }, [sel]);
  return snaps as T3qDataState<E>[];
}
