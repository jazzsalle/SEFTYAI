"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/session";
import { IcBell, IcChevR, IcDoc, IcPause, IcPlay } from "./Icons";
import DemoModePill from "./DemoModePill";
import { useSopOptional } from "@/lib/sopState";
import { manualPanel, useManualPanel } from "@/lib/manualPanel";
import { Toast } from "./krds/Toast";
import type { Advisory } from "@/lib/contract/agent";
import { aimTone, wxLabel } from "@/lib/wxref";
import { SCN_CUT_LABEL, SCN_LABEL } from "@/lib/scenario";
import { wxCovers } from "@/lib/wxMatch";
import { baseName, baseTarget, baseWire } from "@/lib/baseRegion";
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
import { PasswordModal, takeNotice } from "./account/PasswordModal";
import SkipLink from "./SkipLink";
import { MyInfoModal } from "./account/MyInfoModal";
import { SessionExpiredModal } from "./account/SessionExpiredModal";
import { SessionCountdown } from "./account/SessionCountdown";
import { BriefingSettingsHost, openBriefingSettings } from "./briefing/BriefingSettingsModal";

/** 시연 시나리오 특보 표지(R43) — 특보 이름 옆에. 기상청 특보가 아님을 보이는 것이라 좁은 화면에서도 숨기지 않는다 */
export const ScnTag = ({ a }: { a: Pick<Advisory, "scenario"> }) => (a.scenario ? <span className="scn-tag">{SCN_LABEL}</span> : null);

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
 * 특보 바 (목업 SCR-UNE-101001 : 긴급 · 지역 특보 발효 중 · 발표/갱신 · 특보로 질문)
 * 지금 기준지역을 덮는 특보만(R32 — lib/wxMatch). 기준지역이 바뀌면 그 지역으로 다시 보인다(특보 참조는 setBase 가 뗀다). 전국이면 모든 특보
 * 시연 시나리오 특보(R43 — 서버가 시연 계정에만 줌)는 이름 옆에 「시연 시나리오」, 시각은 켠 시각. 켠 동안 그 계정은 기상청 실시간 특보를 받지 않아(R45)
 * 갱신 칸은 「HH:MM 켬 · 기상청 실시간 특보 끊음」, 기준지역이 시나리오 구역 밖이면 「실시간 끊음」 꼬리표(회색)·갱신 칸 「기상청 실시간 특보 끊음」 — 「특보 없음」이라 하지 않는다
 * 2건 이상이면 5초마다 한 건씩 넘긴다(개발 서버 AlertBanner, 사용자 결정 2026-11-06 「개발서버대로」) — 경보 먼저·최근 발표 순 최대 5건,
 * 「특보 N건 발효 중 · 구역 특보」 · 「i / N」 · [정지]/[다시 시작]. 마우스를 올리거나 초점이 들어가면 멈추고, 움직임 줄이기 설정이면 돌지 않는다.
 * 특보가 줄어 보던 자리가 목록 밖이면 첫 건으로. 5초마다 바뀌는 자리라 aria-live 를 걸지 않는다(낭독기가 읽던 것을 끊음) — 낱낱은 [모두 보기]에서
 */
export function WxBar() {
  const { weather, account, cond } = useSession();
  // 대응절차 단추(개발서버 ManualButton) — 이 계정 지역에 매뉴얼이 있을 때만
  const sopOn = !!useSopOptional()?.enabled;
  const manualOn = useManualPanel();
  // 자동 시연의 가상 특보(R54 — 개발서버 AlertBanner override)가 있으면 특보 줄은 그것만
  const demoWx = useAutoDemoBus().warnings;
  const router = useRouter();
  // 기상특보 상세 창(components/wx/WxDetailModal — 발효 특보·상태 이력·전국·통보문, [조건에 반영]·[이 특보로 질의])
  const [detail, setDetail] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  // 자동 넘김 — 담당자가 멈춘 것(stopped)과 잠깐 올려 둔 것(hover)은 다르다: 손을 떼면 다시 돈다
  const [at, setAt] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [hover, setHover] = useState(false);
  const reduced = useReducedMotion();
  const national = !cond.base;
  const target = baseTarget(cond.base);
  const mine = (demoWx ?? weather?.advisories ?? []).filter((a) => a.status !== "해제" && a.status !== "변경" && wxCovers(a.area, target));
  const many = mine.length > 1;
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
  // 지금 보이는 특보 — 1건이면 그것, 여럿이면 넘김 차례의 i 번째. [모두 보기] = 발효 특보 전체(받은 순서)
  const top = n ? items[Math.min(at, n - 1)] : undefined;
  const anyAlarm = items.some((a) => a.level === "경보");
  // 시연 시나리오를 켠 시연 계정(R45) — 서버가 기상청 실시간을 부르지 않고 시나리오 특보만 준다. 기상청 시각 자리에 끊음을 알리고 「특보 없음」이라 하지 않는다
  const cut = !!weather?.realtimeCut;
  let tag: React.ReactNode, title: React.ReactNode, meta = "";
  if (!weather) {
    tag = <span className="tag fail"><IcBell size={16} /> 특보</span>;
    title = "기상특보를 확인하고 있습니다";
  } else if (!weather.status.ok && !top) {
    tag = <span className="tag fail"><IcBell size={16} /> 특보</span>;
    title = "기상특보를 불러오지 못했습니다.";
    meta = weather.status.fetchedAt ? `최종 갱신 ${fmtT(weather.status.fetchedAt)} · 자동으로 다시 확인합니다.` : "자동으로 다시 확인합니다.";
  } else if (top) {
    tag = <span className={`tag ${top.level === "경보" ? "" : "warn"}`} aria-hidden="true"><IcBell size={16} /> {top.level === "경보" ? "경계" : "주의"}</span>;
    title = many ? (
      <><b>특보 {mine.length}건 발효 중</b> · {top.area} {wxLabel(top)}{top.scenario && <> <ScnTag a={top} /></>}</>
    ) : (
      <>{top.area} {wxLabel(top)} 발효 중{top.scenario && <> <ScnTag a={top} /></>}</>
    );
    meta = [
      `${fmtT(top.issuedAt)} ${top.scenario ? "켬" : "발표"}`,
      cut ? SCN_CUT_LABEL : weather.status.ok ? `기상청 ${fmtT(weather.status.fetchedAt)} 갱신` : `${weather.status.message} · 최종 시도 ${fmtT(weather.status.fetchedAt)}`,
    ].join(" · ");
  } else if (cut) {
    // 기준지역이 시나리오 구역 밖 — 실시간을 확인한 것이 아니므로 「발효 중인 기상특보가 없습니다」라고 하지 않는다(회색)
    tag = <span className="tag fail">실시간 끊음</span>;
    title = national ? `${SCN_LABEL} 특보가 없습니다` : `${baseName(cond.base)}에는 ${SCN_LABEL} 특보가 없습니다`;
    meta = SCN_CUT_LABEL;
  } else {
    tag = <span className="tag none">특보 없음</span>;
    title = "발효 중인 기상특보가 없습니다";
    meta = `기상청 ${fmtT(weather.status.fetchedAt)} 갱신`;
  }
  // 오른쪽 단추 하나(개발서버 alert-banner-more) — 없음 「특보 현황 보기」 · 1건 「특보 상세 보기」 · 여러 건 「특보 N건 목록 보기」. 줄 어디를 눌러도 상세가 열린다
  const moreLabel = !top ? "특보 현황 보기" : many ? `특보 ${mine.length}건 목록 보기` : "특보 상세 보기";
  return (
    <div
      ref={barRef}
      className={`wxbar ${anyAlarm ? "danger" : ""} ${!weather || (!weather.status.ok && !top) ? "fail" : ""}`}
      role="region"
      aria-label="기상특보 현황"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, a, [role=dialog]")) return;
        setDetail(true);
      }}
      // 설계 ② 「마우스를 올리거나 초점이 들어가면 넘김 멈춤」
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setHover(true)}
      onBlurCapture={() => setHover(false)}
    >
      {tag}
      {many && top && (
        <>
          <button type="button" className="wxstop" aria-pressed={stopped} onClick={() => setStopped((v) => !v)} aria-label={stopped ? "자동 넘김 다시 시작" : "자동 넘김 정지"} title={stopped ? "자동 넘김 다시 시작" : "자동 넘김 정지"}>
            {stopped ? <IcPlay size={14} /> : <IcPause size={14} />}
          </button>
          {/* 설계 ④ 「위치 i / N」 */}
          <span className="wxat">{Math.min(at, n - 1) + 1} / {n}</span>
        </>
      )}
      <span className="tit">{title}</span>
      <span className="meta">{meta}</span>
      <button type="button" className="wxmore" onClick={() => setDetail(true)} aria-haspopup="dialog">
        {moreLabel} <IcChevR size={16} />
      </button>
      {detail && <WxDetailModal mine={mine} onClose={() => setDetail(false)} />}
      <span className="sp" />
      {/* 대응절차 켜고 끄기(개발서버 ManualButton — 특보 줄 오른쪽 끝) */}
      {sopOn && (
        <button type="button" className={`wxsop ${manualOn ? "on" : ""}`} aria-pressed={manualOn} onClick={() => { if (!location.pathname.startsWith("/explore")) { manualPanel.set(true); router.push("/explore"); } else manualPanel.toggle(); }}>
          <IcDoc size={16} /> 대응절차
        </button>
      )}
    </div>
  );
}

/**
 * 공통 헤더 (Figma 102001 기반, 사용자 지시 10) — Figma 의 3단(공식 배너·유틸리티·메인 메뉴, 200px)을 한 줄(56px)로 합쳤다.
 * 로고 · 메인 메뉴 · 기준지역 · 도움말 · 글자 크기 · AI 모드 · 사용자. KRDS 공식 배너 띠는 생략(허용됨).
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, account, logout, cond, toast, toastMsg, aimOn, setAimOn, weather, t3qOk, expiresAt, renew } = useSession();
  const router = useRouter();
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState<"pw" | "me" | null>(null);
  /** AI 모드 창 — [확인]·✕ 는 창만 닫고 AI 모드는 켜 둔다(개발서버 SearchPage aiModeOpen, R52) */
  const [aimOpen, setAimOpen] = useState(false);
  /** 이 기준지역으로는 AI 모드를 쓸 수 없다(전국·시·도가 아닌 곳) — 개발서버 aiModeDenied */
  const [aimDenied, setAimDenied] = useState(false);
  /** 자동 시연(R54) — 가상 특보로 받아 둔 AI 모드 점검·창 열림 */
  const demo = useAutoDemoBus();
  // 질문 칸이 막혀 있으면(개별 넷·브리핑 중) 자동 시연도 시작하지 않는다(개발서버 SearchPage — R57)
  const askLocked = useAskLock().locked;

  useEffect(() => {
    if (ready && !account) router.replace("/login");
  }, [ready, account, router]);
  // 앞 화면에서 끝낸 일의 알림(첫 로그인 비밀번호 변경 완료 — 화면이 바뀐 뒤 뜬다, 개발서버 SearchPage location.state.notice · R61). 한 번 읽고 지운다
  const signedIn = !!account;
  useEffect(() => {
    if (!signedIn) return;
    const n = takeNotice();
    if (n) toast(n);
  }, [signedIn, toast]);

  if (!ready || !account) return null;
  // AI 모드 단추 색 — 지금 기준지역을 덮는 발효 특보로(R32). 기상청 실시간이 끊긴 계정(R45)에 덮는 특보가 없으면 녹색(특보 없음)이 아니라 회색(lib/wxref aimTone)
  const target = baseTarget(cond.base);
  const mine = (weather?.advisories ?? []).filter((a) => a.status === "발효" && wxCovers(a.area, target));
  const st = !aimOn ? "" : aimTone(weather, mine);
  // 연락망·상황전파는 사용자 메뉴로 옮김(사용자 지시 2026-10-28). 계정 발급(R55)은 계정 발급자(등급 0)만
  const nav: [string, string][] = [["/explore", "통합 탐색"], ["/history", "대화 이력"], ...(account.role === "운영자" ? ([["/admin", "운영관리"]] as [string, string][]) : []), ...(account.grade === 0 ? ([["/accounts", "계정 발급"]] as [string, string][]) : [])];

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
        <nav className="gnb" aria-label="메인 메뉴">
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className={path?.startsWith(href) ? "on" : ""}>{label}</Link>
          ))}
          {/* 자동 시연(개발서버 머리 메뉴 [자동 시연] — R54) — 질문 모음을 열지 않고 통합 탐색에서 대본대로 돈다 */}
          {/* 시연 모드 — 개발서버처럼 메뉴 끝에 흐린 알약(운영자만 켜고 끔, 다른 계정은 표시만) */}
          <DemoModePill operator={account.role === "운영자"} />
          <button type="button" className="demo-mode-btn gnb-demo" disabled={demo.running || askLocked} onClick={() => (path?.startsWith("/explore") ? window.dispatchEvent(new CustomEvent(AUTODEMO_START_EVENT)) : router.push("/explore?autodemo=1"))}>
            자동 시연
          </button>
        </nav>
        <span className="sp" />
        <BasePicker />
        <button className="hbtn" onClick={() => openHelp()}>도움말</button>
        <FontSize />
        <button
          className={`ai-pill ${aimOn ? "on st-" + st : ""}`}
          onClick={() => {
            // 쓸 수 없을 때도 눌리게 두고 까닭을 말한다(설계 202001 「전국 실행 불가」). 켜져 있으면 창을 다시 연다 — 끄기는 창의 [AI 모드 종료]
            if (!aimSupported(baseWire(cond.base))) return setAimDenied(true);
            if (!aimOn) setAimOn(true);
            setAimOpen(true);
            if (!path?.startsWith("/explore")) router.push("/explore");
          }}
          aria-pressed={aimOn}
          title="AI 모드 — 기상특보 기반 상황 점검"
        >
          <i /> {aimOn || demo.aim ? "AI 모드 실행 중" : "AI 모드"}
        </button>
        <div className="user">
          <button className="user-trigger" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="menu" aria-label={`내 정보 — ${account.org} ${account.id}`}>
            {/* 개발서버 UserMenu — 사람 아이콘 + 소속(회색) · 아이디(남색 굵게), ▾ 없음 */}
            <PersonIcon />
            <span className="user-team">{account.org.replace("강원특별자치도 ", "").replace("경상북도 ", "")}</span>
            <span className="user-sep" aria-hidden="true">·</span>
            <span className="user-id">{account.id}</span>
          </button>
          {/* 개발서버 UserMenu 그대로 — 이름·남은 시간 / 내 권한정보·비밀번호 변경·브리핑 설정 / 로그아웃(2026-11-19 「개발서버와 동일하게」, 연락망 메뉴 뺌) */}
          {menu && (
            <div className="user-menu-panel" role="menu" aria-label="내 정보" onMouseLeave={() => setMenu(false)}>
              <span className="user-menu-arrow" aria-hidden="true" />
              <div className="user-menu-top">
                <p className="user-menu-name">{account.name || account.id}님</p>
                <SessionCountdown expiresAt={expiresAt} onExtend={renew} />
              </div>
              <div className="user-menu-list">
                <button type="button" role="menuitem" className="user-menu-item" onClick={() => { setMenu(false); setModal("me"); }}>내 권한정보</button>
                <button type="button" role="menuitem" className="user-menu-item" onClick={() => { setMenu(false); setModal("pw"); }}>비밀번호 변경</button>
                <button type="button" role="menuitem" className="user-menu-item" onClick={() => { setMenu(false); openBriefingSettings(); }}>브리핑 설정</button>
              </div>
              <div className="user-menu-bottom">
                <button type="button" role="menuitem" className="user-menu-logout" onClick={async () => { await logout(); router.push("/login"); }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M8 3.5H4.5v13H8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /><path d="M11.5 6.8 14.7 10l-3.2 3.2M14.2 10H8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  로그아웃
                </button>
              </div>
            </div>
          )}
        </div>
      </header>
      {t3qOk === false && <div className="sysbar">에이전트 서버에 연결할 수 없습니다. 새 질문은 연결되면 처리되고, 이전 답변은 대화 이력에서 볼 수 있습니다.</div>}
      <WxBar />
      {/* 대응 단계 바 — 2026-11-03 사용자 지시로 숨김(되살리려면 SHOW_SOPBAR = true) */}
      {SHOW_SOPBAR && <SopBar />}
      {/* AI 모드 — 켜 둔 동안 점검 결과를 읽고(창을 닫아도), 창은 머리줄 단추로 다시 연다(R52) */}
      {(aimOn || demo.aim) && <AiModeModal open={aimOpen || demo.aimOpen} onClose={() => { setAimOpen(false); autoDemoBus.set({ aimOpen: false }); }} demo={demo.aim} />}
      {aimDenied && (
        <div className="modal-bg" role="dialog" aria-modal="true" aria-label="AI 모드를 실행할 수 없습니다">
          <div className="modal" style={{ width: 480 }}>
            <div className="modal-h"><h2>AI 모드를 실행할 수 없습니다</h2></div>
            <p>{cond.base ? `기준지역이 ${baseName(cond.base)}이면 AI 모드를 쓸 수 없습니다. 위쪽 기준지역에서 시·도를 고르세요.` : "기준지역이 전국이면 AI 모드를 쓸 수 없습니다. 위쪽 기준지역에서 시·도를 고르세요."}</p>
            <div className="modal-f"><span className="sp" /><button className="btn primary" onClick={() => setAimDenied(false)}>확인</button></div>
          </div>
        </div>
      )}
      {children}
      {modal === "pw" && <PasswordModal onClose={() => setModal(null)} />}
      {account.mustChangePw && modal !== "pw" && <PasswordModal forced onClose={() => {}} onDone={() => window.location.reload()} />}
      {modal === "me" && <MyInfoModal onClose={() => setModal(null)} />}
      <SessionExpiredModal />
      <BriefingSettingsHost />
      {/* 토스트는 KRDS Toast(개발서버 shared/components/Toast — R64). 지우는 때는 session.toast 가 정한다(2.6초) */}
      {toastMsg && <Toast message={toastMsg} durationMs={2600} onDone={() => {}} />}
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
