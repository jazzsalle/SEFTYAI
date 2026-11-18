"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/session";
import { IcBell, IcChevR, IcDoc, IcPause, IcPlay } from "./Icons";
import "./appShell.css";
import DemoModePill from "./DemoModePill";
import { manualPanel, useManualPanel } from "@/lib/manualPanel";
import { Toast } from "./krds/Toast";
import type { Advisory } from "@/lib/contract/agent";
import { aimTone, wxLabel } from "@/lib/wxref";
import { wxCovers } from "@/lib/wxMatch";
import { baseName, baseTarget, baseWire } from "@/lib/baseRegion";
import { teamOf } from "@/lib/accountRules";
import { Dialog } from "./account/Dialog";
import { aimSupported } from "@/lib/aiMode";
import BasePicker from "./BasePicker";
import WxDetailModal from "./wx/WxDetailModal";
import { SopProvider } from "@/lib/sopState";
import SopBar from "./sop/SopBar";

const SHOW_SOPBAR = false;
import { openHelp } from "./HelpCenter";
import AiModeModal from "./explore/AiModeModal";
import { AUTODEMO_START_EVENT, autoDemoBus, useAutoDemoBus } from "@/lib/autoDemoBus";
import { useAskLock } from "@/lib/askLock";
import FontSize from "./FontSize";
import { takeNotice } from "./account/PasswordModal";
import SkipLink from "./SkipLink";
import { MyInfoModal } from "./account/MyInfoModal";
import { SessionExpiredModal } from "./account/SessionExpiredModal";
import { SessionCountdown } from "./account/SessionCountdown";
import { BriefingSettingsHost, openBriefingSettings } from "./briefing/BriefingSettingsModal";

const fmtT = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** 특보 줄 자동 넘김 간격 — 설계 ② 「간격 5초 이상」(개발 서버 AlertBanner RotateMs) */
export const WX_ROTATE_MS = 5_000;
/** 넘기는 특보 수 — 설계 ② 「최대 5건」. 나머지는 [모두 보기]·[특보 상세]로 본다 */
export const WX_ROTATE_MAX = 5;

/** 넘김 차례 — 설계 ② 「경보 먼저, 같으면 최근 발표 순」, 최대 5건(개발 서버 AlertBanner rotation) */
export function wxRotation(list: Advisory[]): Advisory[] {
  return [...list].sort((a, b) => Number(b.level === "경보") - Number(a.level === "경보") || b.issuedAt.localeCompare(a.issuedAt)).slice(0, WX_ROTATE_MAX);
}

/** 운영체제의 「움직임 줄이기」 — 켜져 있으면 저절로 넘기지 않는다(설계 ③) */
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    if (!mq) return;
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/**
 * 특보 줄 — 개발서버 AlertBanner(SCR-UNE-201006) 그대로(2026-11-19 「개발서버와 동일하게」)
 * 지금 기준지역을 덮는 특보만(R32 — lib/wxMatch). 전국이면 모든 특보. 시연 시나리오 특보(R43)도 표지 없이 진짜 특보처럼 보인다(개발서버 가상 특보 override 와 같이)
 *  · 받지 못함(아직 못 받음 포함) — 한 모양 「기상특보를 불러오지 못했습니다.」(role=alert, [특보 … 보기] 없음)
 *  · 특보 없음 — 「발효 중인 기상특보가 없습니다」 · 「기상청 HH:MM 갱신」 · [특보 현황 보기]
 *  · 1건 — 「{구역} {특보} 발효 중」(예비특보는 「발표」) · 여러 건 — 「특보 N건 발효 중 · {구역} {특보}」, 5초마다 한 건씩(경보 먼저·최근 순 최대 5건)
 *    [정지]/[다시 시작] · 「i / N」. 마우스를 올리거나 초점이 들어가면 멈추고, 움직임 줄이기 설정이면 돌지 않는다
 * 5초마다 바뀌는 자리라 aria-live 를 걸지 않는다. 줄 어디를 눌러도 상세(서랍)가 열린다
 */
export function WxBar() {
  const { weather, account, cond } = useSession();
  const manualOn = useManualPanel();
  // 자동 시연의 가상 특보(R54 — 개발서버 AlertBanner override)가 있으면 특보 줄은 그것만
  const demoWx = useAutoDemoBus().warnings;
  // 기상특보 상세 서랍(components/wx/WxDetailModal)
  const [detail, setDetail] = useState(false);
  // 자동 넘김 — 담당자가 멈춘 것(stopped)과 잠깐 올려 둔 것(hover)은 다르다: 손을 떼면 다시 돈다
  const [at, setAt] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [hover, setHover] = useState(false);
  const reduced = useReducedMotion();
  const target = baseTarget(cond.base);
  const mine = (demoWx ?? weather?.advisories ?? []).filter((a) => a.status !== "해제" && a.status !== "변경" && wxCovers(a.area, target));
  const items = wxRotation(mine);
  const n = items.length;
  const rolling = n > 1 && !stopped && !hover && !reduced;
  // 특보가 줄면 보던 자리가 목록 밖으로 나갈 수 있다 — 첫 건으로
  useEffect(() => {
    setAt((i) => (i >= n ? 0 : i));
  }, [n]);
  useEffect(() => {
    if (!rolling) return;
    const id = window.setInterval(() => setAt((i) => (i + 1) % n), WX_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [rolling, n]);
  if (!account) return null;

  const open = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, a, [role=dialog]")) return;
    setDetail(true);
  };
  // [대응절차](개발서버 ManualButton — 통합 탐색에서 늘 줄 오른쪽 끝)
  const trailing = (
    <>
      <span className="sp" />
      <button type="button" className={`wxsop ${manualOn ? "on" : ""}`} aria-pressed={manualOn} onClick={() => manualPanel.toggle()}>
        <IcDoc size={16} /> 대응절차
      </button>
    </>
  );
  const modal = detail && <WxDetailModal mine={mine} onClose={() => setDetail(false)} />;
  const updated = weather?.status.fetchedAt ? `기상청 ${fmtT(weather.status.fetchedAt)} 갱신` : "";

  // 받지 못함 — 「특보 없음」과 섞지 않는다(개발서버 FAILED·NOT_COLLECTED)
  if (!demoWx && (!weather || !weather.status.ok)) {
    return (
      <div className="wxbar fail" role="alert" onClick={open}>
        <span className="tag fail"><IcBell size={16} /> 특보</span>
        <p className="tit">기상특보를 불러오지 못했습니다.</p>
        {/* 설계 ② 안내 본문 — 우리 응답에는 마지막으로 받은 때가 없다(실패 응답의 시각은 시도한 때)라 「최종 갱신」은 적지 않는다 */}
        <p className="meta">자동으로 다시 확인합니다.</p>
        {trailing}
        {modal}
      </div>
    );
  }

  if (!n) {
    return (
      <div className="wxbar" role="region" aria-label="기상특보 현황" onClick={open}>
        <span className="tag none" aria-hidden="true">특보 없음</span>
        <p className="tit">발효 중인 기상특보가 없습니다</p>
        <p className="meta">{updated}</p>
        <button type="button" className="wxmore" onClick={() => setDetail(true)} aria-haspopup="dialog">
          특보 현황 보기 <IcChevR size={16} />
        </button>
        {trailing}
        {modal}
      </div>
    );
  }

  const single = n === 1;
  const top = items[Math.min(at, n - 1)];
  const alarm = top.level === "경보";
  const pre = top.level === "예비특보";
  const meta = [`${fmtT(top.issuedAt)} ${pre ? "발표" : "발효"}`, updated].filter(Boolean).join(" · ");
  return (
    <div
      className={`wxbar ${items.some((a) => a.level === "경보") ? "danger" : ""}`}
      role="region"
      aria-label="기상특보 현황"
      onClick={open}
      // 설계 ② 「마우스를 올리거나 초점이 들어가면 넘김 멈춤」
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setHover(true)}
      onBlurCapture={() => setHover(false)}
    >
      {/* 위기경보 단계 이름 — 경보 「경계」, 주의보·예비특보 「주의」. 아이콘은 장식 */}
      <span className={`tag ${alarm ? "" : "warn"}`} aria-hidden="true"><IcBell size={16} /> {alarm ? "경계" : "주의"}</span>
      {!single && (
        <>
          <button type="button" className="wxstop" aria-pressed={stopped} onClick={() => setStopped((v) => !v)}>
            {stopped ? <IcPlay size={14} /> : <IcPause size={14} />}
            <span className="sr-only">{stopped ? "자동 넘김 다시 시작" : "자동 넘김 정지"}</span>
          </button>
          {/* 설계 ④ 「위치 i / N」 */}
          <span className="wxat">{Math.min(at, n - 1) + 1} / {n}</span>
        </>
      )}
      <p className="tit">
        {single ? (
          <><b>{top.area} {wxLabel(top)}</b>{pre ? " 발표" : " 발효 중"}</>
        ) : (
          <><b>특보 {mine.length}건 발효 중</b><span className="wxsep" aria-hidden="true">·</span>{top.area} {wxLabel(top)}</>
        )}
      </p>
      <p className="meta">{meta}</p>
      <button type="button" className="wxmore" onClick={() => setDetail(true)} aria-haspopup="dialog">
        {single ? "특보 상세 보기" : `특보 ${mine.length}건 목록 보기`} <IcChevR size={16} />
      </button>
      {trailing}
      {modal}
    </div>
  );
}

/**
 * 공통 헤더 — 개발서버 GovHeader(compact 한 줄 56px)·SearchPage·ConversationListPage 대로(2026-11-19 「개발서버와 동일하게」).
 * 로고 · 주 메뉴(통합 탐색·대화 이력) · 기준지역 · 도움말 · 글자 크기 · AI 모드 · 사용자. 운영관리(/admin)·계정 발급(/accounts)은 메뉴에 두지 않는다(주소로만).
 * 통합 탐색이 아닌 화면(대화 이력 등)은 AI 모드 단추·시연 모드·자동 시연·특보 줄을 두지 않고, 사용자 메뉴의 브리핑 설정은 막는다(개발서버 ConversationListPage).
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, account, logout, cond, toast, toastMsg, aimOn, setAimOn, weather, expiresAt, renew } = useSession();
  const router = useRouter();
  const path = usePathname();
  const explore = !!path?.startsWith("/explore");
  const [menu, setMenu] = useState(false);
  const [permOpen, setPermOpen] = useState(false);
  /** AI 모드 창 — [확인]·✕ 는 창만 닫고 AI 모드는 켜 둔다(개발서버 SearchPage aiModeOpen, R52) */
  const [aimOpen, setAimOpen] = useState(false);
  /** 이 기준지역으로는 AI 모드를 쓸 수 없다(전국·시·도가 아닌 곳) — 개발서버 aiModeDenied */
  const [aimDenied, setAimDenied] = useState(false);
  /** 자동 시연(R54) — 가상 특보로 받아 둔 AI 모드 점검·창 열림 */
  const demo = useAutoDemoBus();
  // 질문 칸이 막혀 있으면(개별 넷·브리핑 중) 자동 시연도 시작하지 않는다(개발서버 SearchPage — R57)
  const askLocked = useAskLock().locked;
  // 사용자 메뉴 — 바깥 누름·Escape 로 닫는다(Escape 면 손잡이로 초점, 개발서버 UserMenu)
  const userRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!userRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenu(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  useEffect(() => {
    if (ready && !account) router.replace("/login");
  }, [ready, account, router]);
  // 첫 로그인·재설정 뒤 비밀번호를 바꿔야 하면 비밀번호 변경 화면으로(개발서버 /password)
  const mustChangePw = !!account?.mustChangePw;
  useEffect(() => {
    if (mustChangePw) router.replace("/password");
  }, [mustChangePw, router]);
  // 앞 화면에서 끝낸 일의 알림(첫 로그인 비밀번호 변경 완료 — 화면이 바뀐 뒤 뜬다, 개발서버 SearchPage location.state.notice · R61). 한 번 읽고 지운다
  const signedIn = !!account;
  useEffect(() => {
    if (!signedIn) return;
    const n = takeNotice();
    if (n) toast(n);
  }, [signedIn, toast]);

  if (!ready || !account) return null;
  // AI 모드 단추 색 — 지금 기준지역을 덮는 발효 특보로(R32, lib/wxref aimTone)
  const target = baseTarget(cond.base);
  const mine = (weather?.advisories ?? []).filter((a) => a.status === "발효" && wxCovers(a.area, target));
  const st = !aimOn ? "" : aimTone(weather, mine);
  // 손잡이 소속 — 개발서버 teamName(짧은 소속 「부산」) 그대로. 소속이 없으면 소속·「·」를 숨긴다
  const team = teamOf(account.teamSn)?.name ?? "";
  const nav: [string, string][] = [["/explore", "통합 탐색"], ["/history", "대화 이력"]];

  return (
    <SopProvider>
    <div className="app">
      <header className="gh one">
        {/* 첫 초점 요소 — [본문 바로가기](FUN-UFR-908009, R61) */}
        <SkipLink />
        {/* 개발서버 GovHeader MoisLogo — 그림 한 장(상징 + 「행정안전부」) + 서비스 이름 알약. 링크가 아니다(개발서버와 같음, R64) */}
        <span className="logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="gov-logo-img" src="/mois_logo.svg" alt="행정안전부" width={111} height={32} />
          <small>재난안전 AI데이터 활용 서비스</small>
        </span>
        <nav className="gnb" aria-label="주 메뉴">
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className={path?.startsWith(href) ? "on" : ""}>{label}</Link>
          ))}
          {/* 시연 모드(개발서버 DemoModeButton)·자동 시연(R54) — 통합 탐색에서만 */}
          {explore && (
            <>
              <DemoModePill />
              <button type="button" className="demo-mode-btn gnb-demo" disabled={demo.running || askLocked} onClick={() => window.dispatchEvent(new CustomEvent(AUTODEMO_START_EVENT))}>
                자동 시연
              </button>
            </>
          )}
        </nav>
        <span className="sp" />
        <BasePicker />
        <button className="hbtn" onClick={() => openHelp()}>도움말</button>
        <FontSize />
        {explore && (
          <button
            className={`ai-pill ${aimOn ? "on st-" + st : ""}`}
            // 특보를 받기 전(개발서버 !aiMode.ready)에는 막는다. 쓸 수 없는 기준지역이면 눌리게 두고 까닭을 말한다(설계 202001 「전국 실행 불가」)
            disabled={!weather}
            onClick={() => {
              if (!aimSupported(baseWire(cond.base))) return setAimDenied(true);
              if (!aimOn) setAimOn(true);
              setAimOpen(true);
            }}
            aria-pressed={aimOn}
          >
            <i /> {aimOn || demo.aim ? "AI 모드 실행 중" : "AI 모드"}
          </button>
        )}
        <div className="user" ref={userRef}>
          <button ref={triggerRef} className="user-trigger" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="menu" aria-label={`내 정보 — ${team || "소속 없음"} ${account.id}`}>
            {/* 개발서버 UserMenu — 사람 아이콘 + 소속(회색) · 아이디(남색 굵게), ▾ 없음 */}
            <PersonIcon />
            {team && (
              <>
                <span className="user-team">{team}</span>
                <span className="user-sep" aria-hidden="true">·</span>
              </>
            )}
            <span className="user-id">{account.id}</span>
          </button>
          {/* 개발서버 UserMenu 그대로 — 이름·남은 시간 / 내 권한정보·비밀번호 변경·브리핑 설정 / 로그아웃 */}
          {menu && (
            <div className="user-menu-panel" role="menu" aria-label="내 정보">
              <span className="user-menu-arrow" aria-hidden="true" />
              <div className="user-menu-top">
                <p className="user-menu-name">{account.name || account.id}님</p>
                <SessionCountdown expiresAt={expiresAt} onExtend={renew} />
              </div>
              <div className="user-menu-list">
                <button type="button" role="menuitem" className="user-menu-item" onClick={() => { setMenu(false); setPermOpen(true); }}>내 권한정보</button>
                <button type="button" role="menuitem" className="user-menu-item" onClick={() => { setMenu(false); router.push("/password"); }}>비밀번호 변경</button>
                {/* 브리핑 설정은 통합 탐색 화면 안의 창이라 그 밖에서는 막아 둔다(개발서버 UserMenu onOpenBriefingSettings 없음) */}
                <button type="button" role="menuitem" className="user-menu-item" disabled={!explore} title={explore ? undefined : "준비 중입니다"} onClick={() => { setMenu(false); openBriefingSettings(); }}>브리핑 설정</button>
              </div>
              <div className="user-menu-bottom">
                <button type="button" role="menuitem" className="user-menu-logout" onClick={async () => { setMenu(false); await logout(); router.replace("/login"); }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M8 3.5H4.5v13H8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /><path d="M11.5 6.8 14.7 10l-3.2 3.2M14.2 10H8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  로그아웃
                </button>
              </div>
            </div>
          )}
        </div>
      </header>
      {explore && <WxBar />}
      {/* 대응 단계 바 — 2026-11-03 사용자 지시로 숨김(되살리려면 SHOW_SOPBAR = true) */}
      {SHOW_SOPBAR && <SopBar />}
      {/* AI 모드 — 켜 둔 동안 점검 결과를 읽고(창을 닫아도), 창은 머리줄 단추로 다시 연다(R52) */}
      {(aimOn || demo.aim) && <AiModeModal open={aimOpen || demo.aimOpen} onClose={() => { setAimOpen(false); autoDemoBus.set({ aimOpen: false }); }} demo={demo.aim} />}
      {aimDenied && (
        // 화면설계 SCR-UNE-202001 「전국 실행 불가」의 확정 문구(개발서버 SearchPage aiModeDenied Modal — ✕·Escape·[확인])
        <Dialog
          title="AI 모드를 실행할 수 없습니다"
          desc={cond.base ? `기준지역이 ${baseName(cond.base)}이면 AI 모드를 쓸 수 없습니다. 위쪽 기준지역에서 시·도를 고르세요.` : "기준지역이 전국이면 AI 모드를 쓸 수 없습니다. 위쪽 기준지역에서 시·도를 고르세요."}
          onClose={() => setAimDenied(false)}
          footer={<button type="button" className="acm-btn pri" onClick={() => setAimDenied(false)}>확인</button>}
        />
      )}
      {children}
      {permOpen && <MyInfoModal onClose={() => setPermOpen(false)} />}
      <SessionExpiredModal />
      <BriefingSettingsHost />
      {/* 토스트는 KRDS Toast(개발서버 shared/components/Toast — 3초). 지우는 때도 session.toast 가 3초로 정한다 */}
      {toastMsg && <Toast message={toastMsg} durationMs={3000} onDone={() => {}} />}
    </div>
    </SopProvider>
  );
}

/** 개발서버 UserMenu PersonIcon 그대로 */
function PersonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="5" r="2.6" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <path d="M2.8 14c0-2.7 2.3-4.4 5.2-4.4s5.2 1.7 5.2 4.4" stroke="currentColor" strokeWidth="1.3" fill="none" />
    </svg>
  );
}
