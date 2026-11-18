"use client";
/**
 * 비밀번호 변경 화면 /password (SCR-UNE-101002 초기 · 101006 변경) — 개발서버 router /password · features/auth/pages/PasswordChangePage 그대로.
 *  · 배경: 누리집 띠 + 접은 한 줄 머리(로고 · 도움말 · 글자 크기) + 빈 본문 — inert 라 창이 떠 있는 동안 마우스로도 보조기기로도 닿지 않는다
 *  · 그 위에 비밀번호 변경 창(components/account/PasswordModal)
 *  · 초기 비밀번호(mustChangePw): 창 이름 「초기 비밀번호 변경」, 나가는 길은 [로그아웃]뿐. 바꾸면 /explore 로 가며 「비밀번호를 변경했습니다.」
 *  · 스스로 바꾸러 들어옴(사용자 메뉴 「비밀번호 변경」): ✕·[취소]면 /explore 로 돌아간다. 바꾸면 /explore 로 가며 같은 알림
 *  · 로그인 전이면 /login
 */
import "./password.css";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { PasswordModal } from "@/components/account/PasswordModal";
import GovMasthead from "@/components/GovMasthead";
import FontSize from "@/components/FontSize";
import { openHelp } from "@/components/HelpCenter";
import { Toast } from "@/components/krds/Toast";

export default function PasswordPage() {
  const { ready, account, toastMsg } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (ready && !account) router.replace("/login");
  }, [ready, account, router]);

  if (!ready || !account) return null;
  const initial = !!account.mustChangePw;

  return (
    <>
      {/* 시안의 배경은 통합 탐색 메인 화면이다(개발서버도 아직 빈 본문). inert — 창 뒤쪽은 닿지 않는다 */}
      <div className="screen-behind" inert>
        <header className="pwc-header">
          <GovMasthead />
          <div className="gh one">
            <span className="logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="gov-logo-img" src="/mois_logo.svg" alt="행정안전부" width={111} height={32} />
              <small>재난안전 AI데이터 활용 서비스</small>
            </span>
            <span className="sp" />
            <button type="button" className="hbtn" onClick={() => openHelp()}>도움말</button>
            <FontSize />
          </div>
        </header>
        <main className="screen-behind-body" />
      </div>

      {initial ? (
        // 바꾸지 않고는 빠져나갈 수 없다 — [로그아웃]뿐(창 안에서 처리). 바꾸면 계정 상태를 새로 받도록 다시 불러오며 /explore 로(알림은 창이 넘겨 둔다)
        <PasswordModal forced onClose={() => {}} onDone={() => window.location.replace("/explore")} />
      ) : (
        // 스스로 바꾸러 들어온 경우 — 닫거나 바꾸면 통합 탐색으로 돌아간다(완료 알림은 창이 띄운다)
        <PasswordModal onClose={() => router.replace("/explore")} />
      )}

      {/* 통신 장애 알림(⑮) — 이 화면은 앱 틀(AppShell) 밖이라 여기서 띄운다 */}
      {toastMsg && <Toast message={toastMsg} durationMs={2600} onDone={() => {}} />}
    </>
  );
}
