"use client";
/**
 * 로그인 (SCR-UNE-101001 기본·에러·세션 만료 후 진입 · R7·UFR-007)
 * - 아이디·비밀번호 → POST /api/auth/login (useSession().login). 오류 문구는 서버 메시지 그대로, 잠김(423)은 따로 안내
 * - 계정 카드는 아이디만 채운다 — 비밀번호는 직접 입력
 * - /login?expired=1 → 세션 만료 안내
 * - 다른 곳에서 같은 계정으로 접속 중이면(서버 409 AUTH_SESSION_EXISTS) 「기존 접속을 끊고 로그인하시겠습니까?」(SCR-UNE-101003, 개발서버 LoginPage — R53)
 *   취소하면 로그인하지 않고 비밀번호를 비운다, [기존 접속 종료 후 로그인]이면 force 로 다시 보낸다
 */
import "./login.css";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { ACCOUNTS, REGIONS, type Account } from "@/lib/config";
import { useSession } from "@/lib/session";
import { GovLogo, IcEye, IcEyeOff, IcX } from "@/components/Icons";
import { Dialog } from "@/components/account/Dialog";
import { SESSION_EXISTS } from "@/lib/heartbeat";
import GovMasthead from "@/components/GovMasthead";

/** 계정 카드 순서 — 부산·부산2·인제·영천·정부기관·운영자·계정 발급자 */
const CARD_IDS = ["busan", "busan2", "inje", "01000", "hang", "unes", "issuer"];
const CARDS = CARD_IDS.map((id) => ACCOUNTS.find((a) => a.id === id)).filter((a): a is Account => !!a);
const cardLabel = (a: Account) => (a.role === "지자체" ? REGIONS[a.region].short : a.role === "중앙정부" ? "정부기관" : "운영자");

interface Notice { tone: "danger" | "info"; title?: string; text: string; sub?: string }
// 화면설계 SCR-UNE-101001(세션 만료 후 진입)의 확정 문구(개발서버 LoginPage)
const EXPIRED: Notice = { tone: "danger", text: "일정 시간 동안 사용하지 않아 로그아웃되었습니다. 다시 로그인하세요." };
const expiredUrl = () => new URLSearchParams(window.location.search).get("expired") === "1";

export default function LoginPage() {
  const { ready, account, login } = useSession();
  const router = useRouter();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [caps, setCaps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [fieldErr, setFieldErr] = useState<{ id?: string; pw?: string }>({});
  // 같은 계정이 다른 곳에서 접속 중 — 비밀번호는 맞았다. 끊는 일은 되돌릴 수 없으므로 사람이 한 번 고른다
  const [confirming, setConfirming] = useState(false);
  const idRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const leaving = useRef(false);

  useEffect(() => {
    if (expiredUrl()) setNotice(EXPIRED);
  }, []);

  // 이미 로그인한 상태면 통합 탐색으로 (세션 만료로 온 경우는 다시 로그인하게 둔다)
  useEffect(() => {
    if (!ready || !account || leaving.current || expiredUrl()) return;
    leaving.current = true;
    router.replace("/explore");
  }, [ready, account, router]);

  const pick = (a: Account) => {
    setId(a.id);
    setFieldErr({});
    setNotice((n) => (n?.tone === "danger" ? null : n));
    pwRef.current?.focus();
  };

  const onCaps = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState("CapsLock"));

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const uid = id.trim();
    const fe = { id: uid ? undefined : "아이디를 입력하세요.", pw: pw ? undefined : "비밀번호를 입력하세요." };
    setFieldErr(fe);
    if (fe.id) return idRef.current?.focus();
    if (fe.pw) return pwRef.current?.focus();
    setNotice(null);
    await signIn(uid, false);
  };

  /** 로그인 한 번. force 면 기존 접속을 끊고 들어간다 */
  const signIn = async (uid: string, force: boolean) => {
    setBusy(true);
    try {
      await login(uid, pw, force);
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
      setPw("");
      setShowPw(false);
      if (err instanceof ApiError)
        setNotice(err.status === 423 ? { tone: "danger", title: "계정이 잠겼습니다", text: err.message } : { tone: "danger", text: err.message });
      else setNotice({ tone: "danger", text: "서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요." });
      setBusy(false);
      // 비밀번호만 비우고 아이디 칸으로 초점을 되돌린다(개발서버 LoginPage)
      window.setTimeout(() => idRef.current?.focus(), 0);
    }
  };

  /** 되물었다가 그만둔다 — 로그인하지 않는다. 비밀번호는 비운다 */
  const cancelConfirm = () => {
    setConfirming(false);
    setPw("");
    window.setTimeout(() => idRef.current?.focus(), 0);
  };

  return (
    <main className="lgn">
      {/* 공식 누리집 띠 — 개발서버 LoginPage GovHeader masthead(R57) */}
      <GovMasthead />
      <header className="lgn-hd">
        <span className="brand">
          <GovLogo size={34} />
          행정안전부
        </span>
        <span className="bar" aria-hidden />
        <span className="svc">재난안전 AI데이터 활용 서비스</span>
      </header>

      <div className="lgn-body">
        <section className="lgn-intro" aria-label="서비스 소개">
          <p className="lgn-eyebrow">행정안전부 · 한국지능정보사회진흥원</p>
          <h1>
            재난안전 AI데이터
            <br />
            활용 서비스
          </h1>
          <p className="lgn-lead">
            재난상황 조건을 정하고 물어보면,
            <br />
            유사 재난사례와 법정 위험지구·계획지식을
            <br />
            근거와 함께 찾아 드립니다.
          </p>
          <div className="lgn-foot">
            <p><b>재난안전 업무 담당자 전용 서비스입니다.</b></p>
            <p><b>계정 문의</b>소속 기관 재난안전 담당 부서</p>
          </div>
        </section>

        <section className="lgn-main">
          <form className="lgn-form" onSubmit={submit} noValidate aria-labelledby="lgn-title">
            <h2 id="lgn-title">로그인</h2>
            <p className="lgn-desc">기관에서 발급받은 아이디와 비밀번호를 입력하세요.</p>

            {notice && (
              <div className={`lgn-alert ${notice.tone}`} role={notice.tone === "danger" ? "alert" : "status"}>
                <i className="ic" aria-hidden>{notice.tone === "danger" ? "!" : "i"}</i>
                <div>
                  {notice.title && <b>{notice.title}</b>}
                  <p>{notice.text}</p>
                  {notice.sub && <p className="sub">{notice.sub}</p>}
                </div>
              </div>
            )}

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
                  placeholder="아이디를 입력하세요"
                  value={id}
                  maxLength={64}
                  onChange={(e) => {
                    setId(e.target.value);
                    if (fieldErr.id) setFieldErr((f) => ({ ...f, id: undefined }));
                  }}
                  aria-invalid={!!fieldErr.id}
                  aria-describedby={fieldErr.id ? "lgn-id-err" : undefined}
                />
                {id && (
                  <button type="button" className="lgn-ib clear" onClick={() => { setId(""); idRef.current?.focus(); }} aria-label="아이디 지우기">
                    <span><IcX size={12} /></span>
                  </button>
                )}
              </div>
              {fieldErr.id && <p id="lgn-id-err" className="lgn-ferr">{fieldErr.id}</p>}
            </div>

            <div className="lgn-field">
              <label htmlFor="lgn-pw">비밀번호</label>
              <div className="lgn-input">
                <input
                  id="lgn-pw"
                  ref={pwRef}
                  type={showPw ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  placeholder="비밀번호를 입력하세요"
                  value={pw}
                  maxLength={128}
                  onChange={(e) => {
                    setPw(e.target.value);
                    if (fieldErr.pw) setFieldErr((f) => ({ ...f, pw: undefined }));
                  }}
                  onKeyDown={onCaps}
                  onKeyUp={onCaps}
                  onBlur={() => setCaps(false)}
                  aria-invalid={!!fieldErr.pw}
                  aria-describedby={[fieldErr.pw ? "lgn-pw-err" : "", caps ? "lgn-caps" : ""].join(" ").trim() || undefined}
                />
                <button
                  type="button"
                  className="lgn-ib"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 보기"}
                  aria-pressed={showPw}
                  aria-controls="lgn-pw"
                >
                  {showPw ? <IcEyeOff size={20} /> : <IcEye size={20} />}
                </button>
              </div>
              {fieldErr.pw && <p id="lgn-pw-err" className="lgn-ferr">{fieldErr.pw}</p>}
              {caps && <p id="lgn-caps" className="lgn-caps">Caps Lock이 켜져 있습니다.</p>}
            </div>

            <button type="submit" className="lgn-submit" disabled={busy}>
              {busy ? "확인 중…" : "로그인"}
            </button>
            <p className="lgn-note">
              비밀번호를 5회 잘못 입력하면 15분 동안 로그인할 수 없습니다.
            </p>

            <div className="lgn-accts">
              <h3 id="lgn-accts-t">계정 선택</h3>
              <p>누르면 아이디만 입력됩니다. 비밀번호는 직접 입력하세요.</p>
              <ul aria-labelledby="lgn-accts-t">
                {CARDS.map((a) => (
                  <li key={a.id}>
                    <button type="button" className="lgn-acct" aria-pressed={id.trim() === a.id} onClick={() => pick(a)} title={`${a.org} ${a.dept}`}>
                      <span className="av" style={{ background: a.color }} aria-hidden>{a.initial}</span>
                      <span className="tx">
                        <span className="nm">{cardLabel(a)}</span>
                        <span className="id">{a.id}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </form>
        </section>
      </div>
      {confirming && (
        <Dialog
          title="기존 접속을 끊고 로그인하시겠습니까?"
          desc="다른 곳에서 이 계정으로 접속 중입니다. 로그인하면 그 접속은 종료됩니다."
          onClose={cancelConfirm}
          busy={busy}
          footer={
            <>
              <button type="button" className="acm-btn" onClick={cancelConfirm}>취소</button>
              <button type="button" className="acm-btn pri" disabled={busy} onClick={() => void signIn(id.trim(), true)}>기존 접속 종료 후 로그인</button>
            </>
          }
        />
      )}
    </main>
  );
}
