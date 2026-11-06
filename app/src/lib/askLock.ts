"use client";
import { useSyncExternalStore } from "react";

/**
 * 질문 칸 잠금(개발서버 SearchPage askLocked — 사용자 결정 2026-11-07 「개발서버대로」, R57).
 *  · 개별 질문은 넷까지 함께 돈다(개발서버 useConversation MaxParallel = 4). 넷이 다 돌면 더 받지 않는다
 *  · 브리핑 세트가 돌고 있는 동안은 개별 질문을 받지 않는다 — 브리핑 세트가 이미 넷을 한꺼번에 던져 두었다
 * 계산은 통합 탐색(explore)이 하고, 특보 상세 창·머리줄 [자동 시연](AppShell)은 이 작은 저장소로 읽는다.
 */
export const MAX_PARALLEL = 4;
const RUNNING = ["QUEUED", "SUBMITTED", "RUNNING"];

interface TurnLike {
  jobId?: string;
  pending?: boolean;
  error?: string;
  group?: unknown;
}

/** 이 대화에서 아직 도는 턴 수 — 개별(브리핑 세트 묶음이 아닌 것)과 브리핑 세트 묶음을 따로 센다. 작업 상태를 아직 모르는 턴은 돌지 않는 것으로 본다 */
export function countRunning(turns: readonly TurnLike[], stateOf: (jobId: string) => string | undefined): { single: number; briefing: number } {
  let single = 0;
  let briefing = 0;
  for (const t of turns) {
    if (t.error) continue;
    const st = t.jobId ? stateOf(t.jobId) : undefined;
    const live = t.pending || (st !== undefined && RUNNING.includes(st));
    if (!live) continue;
    if (t.group) briefing++;
    else single++;
  }
  return { single, briefing };
}

export interface AskLock {
  /** 개별 질문이 하나라도 도는 중(개발서버 agent.running) */
  running: boolean;
  /** 브리핑 세트가 도는 중(개발서버 briefingRunning) */
  briefingRunning: boolean;
  /** 질문 칸·질문 모음·「이 특보로 질의」·[자동 시연]을 막는다(개발서버 askLocked = agent.full || briefingRunning) */
  locked: boolean;
  /** 개별 질문을 더 보낼 수 있는 수 */
  free: number;
}

export function askLockOf(n: { single: number; briefing: number }): AskLock {
  const briefingRunning = n.briefing > 0;
  return { running: n.single > 0, briefingRunning, locked: n.single >= MAX_PARALLEL || briefingRunning, free: Math.max(0, MAX_PARALLEL - n.single) };
}

const OPEN: AskLock = { running: false, briefingRunning: false, locked: false, free: MAX_PARALLEL };
let state: AskLock = OPEN;
const subs = new Set<() => void>();

export const askLockBus = {
  get: () => state,
  set(next: AskLock) {
    if (next.running === state.running && next.briefingRunning === state.briefingRunning && next.locked === state.locked && next.free === state.free) return;
    state = next;
    subs.forEach((f) => f());
  },
  reset: () => askLockBus.set(OPEN),
  subscribe(f: () => void) {
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  },
};

export function useAskLock(): AskLock {
  return useSyncExternalStore(askLockBus.subscribe, askLockBus.get, () => OPEN);
}
