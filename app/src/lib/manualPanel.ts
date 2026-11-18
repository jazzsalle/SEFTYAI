"use client";
/**
 * 대응절차 탭 켜고 끄기 — 개발서버 usePanel.showManual 과 같게(2026-11-19 사용자 지시 「개발서버와 동일하게」).
 * 특보 줄 오른쪽 끝 [대응절차] 단추가 켜고 끈다. 켜면 우측 패널에 「대응절차」 탭이 생기고 그 탭으로 가며,
 * 다시 누르면 탭이 없어지고 한눈 요약(없으면 지도)으로 돌아간다. 처음에는 꺼져 있다.
 */
import { useSyncExternalStore } from "react";

let on = false;
const subs = new Set<() => void>();

export const manualPanel = {
  get: () => on,
  set(v: boolean) {
    if (on === v) return;
    on = v;
    subs.forEach((f) => f());
  },
  toggle() {
    manualPanel.set(!on);
  },
  subscribe(f: () => void) {
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  },
};

export function useManualPanel(): boolean {
  return useSyncExternalStore(manualPanel.subscribe, manualPanel.get, () => false);
}
