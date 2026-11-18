"use client";
/**
 * 로그인 (SCR-UNE-101001 기본·에러·세션 만료 후 진입 · R7·UFR-007) — 개발서버 features/auth/pages/LoginPage 그대로(R61, 사용자 지시 「로그인 페이지도 동일하게」)
 * - 머리: 누리집 띠 + 한 줄 머리(로고 · 도움말 · 글자 크기) — 개발서버 GovHeader compact masthead. 맨 앞은 [본문 바로가기]
 * - 왼쪽 서비스 소개 배너(격자·빛 무리 장식), 오른쪽 로그인 폼. 칸 둘(아이디·비밀번호, 자리 글 「내용을 입력하세요」), 비밀번호 칸에 보기/숨기기
 * - 실패 안내는 칸에 붙이지 않고 폼 위에 한 덩어리로(서버 문구 그대로 — 어느 칸이 틀렸는지 알려주면 계정 존재 여부가 드러난다).
 *   실패하면 비밀번호만 비우고 아이디 칸으로 초점을 되돌린다
 * - /login?expired=1 → 「일정 시간 동안 사용하지 않아 로그아웃되었습니다. 다시 로그인하세요.」
 * - 다른 곳에서 같은 계정으로 접속 중이면(서버 409 AUTH_SESSION_EXISTS) 「기존 접속을 끊고 로그인하시겠습니까?」(SCR-UNE-101003, R53)
 *   취소하면 로그인하지 않고 비밀번호를 비운다, [기존 접속 종료 후 로그인]이면 force 로 다시 보낸다
 */
import "./login.css";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { GovLogo, IcEye, IcEyeOff } from "@/components/Icons";
import { Dialog } from "@/components/account/Dialog";
import { SESSION_EXISTS } from "@/lib/heartbeat";
import GovMasthead from "@/components/GovMasthead";
import FontSize from "@/components/FontSize";
import { openHelp } from "@/components/HelpCenter";
import SkipLink, { MAIN_ID } from "@/components/SkipLink";

// 화면설계 SCR-UNE-101001(세션 만료 후 진입)의 확정 문구(개발서버 LoginPage)
const EXPIRED_MSG = "일정 시간 동안 사용하지 않아 로그아웃되었습니다. 다시 로그인하세요.";
const expiredUrl = () => new URLSearchParams(window.location.search).get("expired") === "1";

export default function LoginPage() {
  const { ready, account, login } = useSession();
  const router = useRouter();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  // 같은 계정이 다른 곳에서 접속 중 — 비밀번호는 맞았다. 끊는 일은 되돌릴 수 없으므로 사람이 한 번 고른다
  const [confirming, setConfirming] = useState(false);
  const idRef = useRef<HTMLInputElement>(null);
  const leaving = useRef(false);

  useEffect(() => {
    if (expiredUrl()) setExpired(true);
  }, []);

  // 이미 로그인한 상태면 통합 탐색으로 (세션 만료로 온 경우는 다시 로그인하게 둔다)
  useEffect(() => {
    if (!ready || !account || leaving.current || expiredUrl()) return;
    leaving.current = true;
    router.replace("/explore");
  }, [ready, account, router]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    await signIn(false);
  };

  /** 로그인 한 번. force 면 기존 접속을 끊고 들어간다 */
  const signIn = async (force: boolean) => {
    setBusy(true);
    try {
      await login(id.trim(), pw, force);
      setConfirming(false);
      leaving.current = true;
      router.replace("/explore");
    } catch (err) {
      // 다른 곳에서 접속 중이다 — 틀린 것이 아니므로 폼 위 알림이 아니라 확인 창으로 묻는다
      if (err instanceof ApiError && (err.body as { code?: string } | null)?.code === SESSION_EXISTS) {
        setConfirming(true);
        setBusy(false);
        return;
      }
      setConfirming(false);
      setError(err instanceof ApiError ? err.message : "로그인하지 못했습니다.");
      // 비밀번호만 비우고 아이디 칸으로 초점을 되돌린다(개발서버 LoginPage — 시안 주석)
      setPw("");
      setShowPw(false);
      setBusy(false);
      window.setTimeout(() => idRef.current?.focus(), 0);
    }
  };

  /** 되물었다가 그만둔다 — 로그인하지 않는다. 비밀번호는 비운다 */
  const cancelConfirm = () => {
    setConfirming(false);
    setPw("");
    window.setTimeout(() => idRef.current?.focus(), 0);
  };

  // 실패 안내가 있으면 그것을, 없으면 만료 안내를 폼 위에 하나만
  const alert = error ?? (expired ? EXPIRED_MSG : null);

  return (
    <div className="lgn">
      {/* 머리 — 개발서버 GovHeader compact masthead: [본문 바로가기] · 누리집 띠 · 한 줄(로고 · 도움말 · 글자 크기) */}
      <header className="lgn-header">
        <SkipLink />
        <GovMasthead />
        <div className="gh one">
          <span className="logo">
            <GovLogo />
            <span>행정안전부 <small>재난안전 AI데이터 활용 서비스</small></span>
          </span>
          <span className="sp" />
          <button type="button" className="hbtn" onClick={() => openHelp()}>도움말</button>
          <FontSize />
        </div>
      </header>

      <main id={MAIN_ID} tabIndex={-1} className="lgn-body">
        <section className="lgn-banner" aria-labelledby="lgn-service-title">
          {/* 장식용 배경. 보조기술에는 읽히지 않는다. */}
          <div className="banner-grid" aria-hidden="true" />
          <div className="banner-glow" aria-hidden="true" />

          <div className="banner-intro">
            <p className="banner-owner">행정안전부 · 한국지능정보사회진흥원</p>
            <h1 id="lgn-service-title" className="banner-title">
              재난안전 AI데이터
              <br />
              활용 서비스
            </h1>
            <p className="banner-desc">
              재난상황 조건을 정하고 물어보면,
              <br />
              유사 재난사례와 법정 위험지구·계획지식을
              <br />
              근거와 함께 찾아 드립니다.
            </p>
          </div>

          <div className="banner-notice">
            <div className="banner-divider" aria-hidden="true" />
            <p className="notice-head">재난안전 업무 담당자 전용 서비스입니다.</p>
            <dl className="notice-list">
              <div>
                <dt>계정 문의</dt>
                <dd>소속 기관 재난안전 담당 부서</dd>
              </div>
              <div>
                <dt>기술지원</dt>
                <dd>확정 후 기재</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="lgn-panel">
          <form className="lgn-form" onSubmit={submit} noValidate>
            <div className="lgn-head">
              <h2>로그인</h2>
              <p className="lgn-guide">기관에서 발급받은 아이디와 비밀번호를 입력하세요.</p>
            </div>

            {alert && (
              <div className="lgn-alert" role="alert">
                <span className="lgn-alert-icon" aria-hidden="true">!</span>
                <p>{alert}</p>
              </div>
            )}

            <div className="lgn-fields">
              <div className="lgn-field">
                <label htmlFor="lgn-id">아이디</label>
                <div className="lgn-input">
                  <input
                    id="lgn-id"
                    ref={idRef}
                    name="username"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    autoFocus
                    placeholder="내용을 입력하세요"
                    value={id}
                    maxLength={64}
                    disabled={busy}
                    onChange={(e) => setId(e.target.value)}
                  />
                </div>
              </div>

              <div className="lgn-field">
                <label htmlFor="lgn-pw">비밀번호</label>
                {/* 칸 안쪽 오른쪽에 보기/숨기기 단추(개발서버 PasswordField) — 기본은 숨김, 상태는 aria-pressed */}
                <div className="lgn-input has-trailing">
                  <input
                    id="lgn-pw"
                    type={showPw ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    placeholder="내용을 입력하세요"
                    value={pw}
                    maxLength={128}
                    disabled={busy}
                    onChange={(e) => setPw(e.target.value)}
                  />
                  <button
                    type="button"
                    className="lgn-trailing"
                    aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 보기"}
                    aria-pressed={showPw}
                    aria-controls="lgn-pw"
                    disabled={busy}
                    onClick={() => setShowPw((v) => !v)}
                  >
                    {showPw ? <IcEyeOff size={24} /> : <IcEye size={24} />}
                  </button>
                </div>
              </div>
            </div>

            <button type="submit" className="lgn-submit" disabled={busy}>
              {busy ? "확인 중…" : "로그인"}
            </button>
          </form>
        </section>
      </main>
      {confirming && (
        <Dialog
          title="기존 접속을 끊고 로그인하시겠습니까?"
          desc="다른 곳에서 이 계정으로 접속 중입니다. 로그인하면 그 접속은 종료됩니다."
          onClose={cancelConfirm}
          busy={busy}
          footer={
            <>
              <button type="button" className="acm-btn" onClick={cancelConfirm}>취소</button>
              <button type="button" className="acm-btn pri" disabled={busy} onClick={() => void signIn(true)}>기존 접속 종료 후 로그인</button>
            </>
          }
        />
      )}
    </div>
  );
}
