"use client";
import "./updateNotice.css";
import { useEffect, useState } from "react";
import { isUpdatePending, onPendingChange, registerBusyGuard, reloadNow, startUpdateWatcher } from "@/lib/appUpdate";
import { askLockBus } from "@/lib/askLock";
import { autoDemoBus } from "@/lib/autoDemoBus";

/**
 * 새 판이 올라왔는데 하던 일 때문에 아직 새로고침하지 못했을 때 띄우는 알림(개발서버 core/update/UpdateNotice · f668628).
 * 하던 일이 끝나면 저절로 새로고침되므로 사람이 할 일은 없다 — 바로 받고 싶은 사람을 위해 [지금 새로고침]. 감시도 여기서 한 번 건다
 */
export default function UpdateNotice() {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    startUpdateWatcher();
    setPending(isUpdatePending());
    // 질문 답을 기다리거나 브리핑이 도는 동안은 미룬다(개발서버 useUpdateGuard(agent.running || briefingRunning) — 질문 칸 잠금과 같은 셈, lib/askLock)
    // 자동 시연이 도는 동안도 미룬다(우리 기능 — 시연 중 화면이 새로 그려지지 않게)
    const offBusy = registerBusyGuard(() => {
      const l = askLockBus.get();
      return l.running || l.briefingRunning || autoDemoBus.get().running;
    });
    const off = onPendingChange(setPending);
    return () => {
      offBusy();
      off();
    };
  }, []);
  if (!pending) return null;
  return (
    <div className="update-notice" role="status" aria-live="polite">
      <span>새 버전이 배포되었습니다. 하던 일이 끝나면 화면이 자동으로 새로고침됩니다.</span>
      <button type="button" className="update-notice-btn" onClick={() => reloadNow(true)}>
        지금 새로고침
      </button>
    </div>
  );
}

/** 하던 일이 있는 동안(busy) 자동 새로고침을 미룬다 — 답 대기·브리핑 진행·질문 입력(개발서버 useUpdateGuard) */
export function useUpdateGuard(busy: boolean) {
  useEffect(() => {
    if (!busy) return;
    return registerBusyGuard(() => true);
  }, [busy]);
}
