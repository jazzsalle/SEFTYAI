"use client";
/**
 * 접속이 끝났을 때 (개발서버 httpClient·SessionTakenOverModal 그대로, R53)
 *  · 다른 곳에서 같은 계정으로 로그인해 끊겼으면(sessionTaken) 쓰던 화면 위에 「접속이 종료되었습니다」(SCR-UNE-101004) — ✕ 없음, 두 단추 모두 로그인 화면으로
 *  · 시간이 지나 끝났으면(sessionExpired) 안내 창 없이 로그인 화면으로 — 로그인 화면이 「일정 시간 동안 사용하지 않아 로그아웃되었습니다」를 띄운다(/login?expired=1)
 *  · 나갈 때 쿠키를 지우고(/api/auth/logout) 새로 읽는다(남은 화면 상태를 모두 비움)
 * 사용: 헤더(AppShell)에 <SessionExpiredModal /> 한 번.
 */
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { Dialog } from "./Dialog";

const leave = async (to: string) => {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store" }).catch(() => {});
  window.location.replace(to);
};

export function SessionExpiredModal() {
  const { sessionExpired, sessionTaken, account } = useSession();
  const [leaving, setLeaving] = useState(false);
  const goExpired = !!account && sessionExpired && !sessionTaken;
  useEffect(() => {
    if (goExpired && window.location.pathname !== "/login") void leave("/login?expired=1");
  }, [goExpired]);
  if (!sessionTaken || !account) return null;

  const go = () => {
    setLeaving(true);
    void leave("/login");
  };

  return (
    <Dialog
      role="alertdialog"
      size="sm"
      title="접속이 종료되었습니다"
      desc="다른 곳에서 이 계정으로 로그인했습니다. 다시 로그인하세요."
      busy={leaving}
      footer={
        <>
          <button type="button" className="acm-btn" onClick={go} disabled={leaving}>닫기</button>
          <button type="button" className="acm-btn pri" onClick={go} disabled={leaving}>로그인 화면으로</button>
        </>
      }
    />
  );
}

export default SessionExpiredModal;
