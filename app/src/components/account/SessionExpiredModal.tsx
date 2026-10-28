"use client";
/**
 * 세션 만료 안내 (SCR-UNE-101005 · 101004) — useSession().sessionExpired(서버 API 401)이면 띄운다.
 * 서버는 유휴 4시간·절대 12시간 만료와 다른 곳의 새 로그인(기존 세션 종료)을 구분하지 않으므로 두 경우를 함께 안내한다.
 * [로그인 화면으로] → 쿠키 정리(/api/auth/logout) 후 /login?expired=1 로 새로 읽는다(남은 화면 상태를 모두 비움).
 * 사용: 헤더(AppShell)에 <SessionExpiredModal /> 한 번.
 */
import { useState } from "react";
import { useSession } from "@/lib/session";
import { Dialog } from "./Dialog";

export function SessionExpiredModal() {
  const { sessionExpired, account } = useSession();
  const [leaving, setLeaving] = useState(false);
  if (!sessionExpired || !account) return null;

  const go = async () => {
    setLeaving(true);
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store" }).catch(() => {});
    window.location.replace("/login?expired=1");
  };

  return (
    <Dialog
      role="alertdialog"
      size="sm"
      title="로그인 세션이 만료되었습니다"
      desc="일정 시간 동안 사용하지 않았거나 다른 곳에서 이 계정으로 로그인해 접속이 종료되었습니다. 다시 로그인하세요."
      busy={leaving}
      footer={
        <button type="button" className="acm-btn pri" onClick={go} disabled={leaving}>
          {leaving ? "이동 중…" : "로그인 화면으로"}
        </button>
      }
    >
      <p className="acm-sub">진행 중이던 질의는 다시 로그인하면 질문 큐에서 이어서 확인할 수 있습니다.</p>
    </Dialog>
  );
}

export default SessionExpiredModal;
