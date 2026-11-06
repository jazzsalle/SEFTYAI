"use client";
import { useSyncExternalStore } from "react";
import type { Advisory } from "./contract/agent";
import type { AimView } from "./aiMode";

/**
 * 자동 시연(개발서버 features/demoMode — R54)이 머리줄·특보 줄·AI 모드 창에 얹는 것.
 * 진행기는 통합 탐색(explore)에 살고 특보 줄·AI 모드 창은 AppShell 에 있어, 둘 사이를 이 작은 저장소로 잇는다.
 *  · aim — 가상 특보로 받아 둔 AI 모드 점검(개발서버 SearchPage demoAiMode). 있으면 AI 모드 창이 서버 점검 대신 이것을 그린다
 *  · aimOpen — AI 모드 창을 연다(실제 AI 모드는 켜지 않는다 — 개발서버와 같음)
 *  · warnings — 특보 줄을 이 가상 특보로 덮는다(개발서버 AlertBanner override). 실제 특보 표·AI 모드에는 섞이지 않는다
 *  · running — 자동 시연이 도는 중(머리줄 [자동 시연] 단추를 막는다)
 */
export interface AutoDemoState {
  aim: AimView | null;
  aimOpen: boolean;
  warnings: Advisory[] | null;
  running: boolean;
}

const EMPTY: AutoDemoState = { aim: null, aimOpen: false, warnings: null, running: false };
let state: AutoDemoState = EMPTY;
const subs = new Set<() => void>();

export const autoDemoBus = {
  get: () => state,
  set(patch: Partial<AutoDemoState>) {
    state = { ...state, ...patch };
    subs.forEach((f) => f());
  },
  /** 가상 특보·AI 모드 창을 걷는다(running 은 그대로) */
  clear() {
    autoDemoBus.set({ aim: null, aimOpen: false, warnings: null });
  },
  subscribe(f: () => void) {
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  },
};

export function useAutoDemoBus(): AutoDemoState {
  return useSyncExternalStore(autoDemoBus.subscribe, autoDemoBus.get, () => EMPTY);
}

/** 머리줄 [자동 시연] — 통합 탐색이 받아 시작한다(다른 화면이면 /explore?autodemo=1 로 옮겨 시작) */
export const AUTODEMO_START_EVENT = "sa:autodemo";
