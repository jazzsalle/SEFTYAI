"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/session";
import { GovLogo, IcChevR, IcPause, IcPlay, IcSiren } from "./Icons";
import type { Advisory } from "@/lib/contract/agent";
import { advName, advTime, advTone, aimTone, wxLabel } from "@/lib/wxref";
import { SCN_CUT_LABEL, SCN_LABEL } from "@/lib/scenario";
import { wxCovers } from "@/lib/wxMatch";
import { baseKey, baseName, baseTarget, baseWire } from "@/lib/baseRegion";
import { aimSupported } from "@/lib/aiMode";
import BasePicker from "./BasePicker";
import WxDetailModal from "./wx/WxDetailModal";
import { SopProvider } from "@/lib/sopState";
import SopBar from "./sop/SopBar";

const SHOW_SOPBAR = false;
import { openHelp } from "./HelpCenter";
import AiModeModal from "./explore/AiModeModal";
import { AUTODEMO_START_EVENT, autoDemoBus, useAutoDemoBus } from "@/lib/autoDemoBus";
import FontSize from "./FontSize";
import { PasswordModal } from "./account/PasswordModal";
import { MyInfoModal } from "./account/MyInfoModal";
import { SessionExpiredModal } from "./account/SessionExpiredModal";
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
  const { weather, account, cond, wxRef, setWxRef, aimOn } = useSession();
  // 자동 시연의 가상 특보(R54 — 개발서버 AlertBanner override)가 있으면 특보 줄은 그것만
  const demoWx = useAutoDemoBus().warnings;
  const router = useRouter();
  // 펼친 목록 — "ask" = [특보로 질문] 고르기, "all" = [모두 보기] 발효 특보 전체
  const [pop, setPop] = useState<"ask" | "all" | null>(null);
  // 기상특보 상세 창(components/wx/WxDetailModal — 발효 특보·상태 이력·전국·통보문, [조건에 반영]·[이 특보로 질의])
  const [detail, setDetail] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  // 자동 넘김 — 담당자가 멈춘 것(stopped)과 잠깐 올려 둔 것(hover)은 다르다: 손을 떼면 다시 돈다
  const [at, setAt] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [hover, setHover] = useState(false);
  const reduced = useReducedMotion();
  const bk = baseKey(cond.base);
  const national = !cond.base;
  const target = baseTarget(cond.base);
  const mine = (demoWx ?? weather?.advisories ?? []).filter((a) => a.status !== "해제" && a.status !== "변경" && wxCovers(a.area, target));
  // 기준지역이 바뀌면 열려 있던 특보 목록을 닫는다(이전 지역 목록이 남지 않게).
  // 특보가 1건 이하·조회 실패가 되어 목록이 없어져도 닫는다(다시 늘어날 때 저절로 펼쳐지지 않게)
  useEffect(() => setPop(null), [bk]);
  const many = mine.length > 1;
  useEffect(() => {
    if (!many) setPop(null);
  }, [many]);
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
  // 펼친 목록은 바깥을 누르거나 Esc 로 닫는다
  useEffect(() => {
    if (!pop) return;
    const down = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setPop(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPop(null);
    };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [pop]);
  if (!account) return null;
  // 지금 보이는 특보 — 1건이면 그것, 여럿이면 넘김 차례의 i 번째. [모두 보기] = 발효 특보 전체(받은 순서)
  const top = n ? items[Math.min(at, n - 1)] : undefined;
  const anyAlarm = items.some((a) => a.level === "경보");
  // 시연 시나리오를 켠 시연 계정(R45) — 서버가 기상청 실시간을 부르지 않고 시나리오 특보만 준다. 기상청 시각 자리에 끊음을 알리고 「특보 없음」이라 하지 않는다
  const cut = !!weather?.realtimeCut;
  let tag: React.ReactNode, title: React.ReactNode, meta = "";
  if (!weather) {
    tag = <span className="tag fail">조회 중</span>;
    title = "기상특보를 확인하고 있습니다";
  } else if (!weather.status.ok && !top) {
    tag = <span className="tag fail">조회 실패</span>;
    title = "기상특보를 불러오지 못했습니다";
    meta = `${weather.status.message} · 최종 시도 ${fmtT(weather.status.fetchedAt)}`;
  } else if (top) {
    tag = <span className={`tag ${top.level === "경보" ? "" : "warn"}`}><IcSiren size={16} /> {top.level === "경보" ? "긴급" : "주의"}</span>;
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
    title = national ? "발효 중인 기상특보가 없습니다" : `${baseName(cond.base)}에 발효 중인 기상특보가 없습니다`;
    meta = `${weather.status.message} · 조회 ${fmtT(weather.status.fetchedAt)}`;
  }
  // [특보로 질문] = 특보를 채팅 입력창에 참조로 건다 (1건이면 바로, 여러 건이면 고르기 · 한 번에 하나)
  const cands = [...mine].sort((a, b) => (b.level === "경보" ? 1 : 0) - (a.level === "경보" ? 1 : 0) || b.issuedAt.localeCompare(a.issuedAt));
  const attach = (a: Advisory) => {
    setWxRef(a);
    setPop(null);
    if (!location.pathname.startsWith("/explore")) router.push("/explore");
    setTimeout(() => (document.querySelector(".composer textarea") as HTMLTextAreaElement | null)?.focus(), 80);
  };
  const onAsk = () => {
    if (aimOn) return;
    if (!cands.length) return;
    if (cands.length === 1) return attach(cands[0]);
    setPop((v) => (v === "ask" ? null : "ask"));
  };
  return (
    <div
      ref={barRef}
      className={`wxbar ${anyAlarm ? "danger" : ""}`}
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
      {many && (
        <>
          <span className="wxall">
            <button type="button" className="lnk xs" onClick={() => setPop((v) => (v === "all" ? null : "all"))} aria-expanded={pop === "all"}>모두 보기</button>
            {pop === "all" && (
              <div className="wxpick" role="list" aria-label="발효 중인 특보">
                <div className="hd">발효 중인 특보</div>
                {/* 받은 순서 그대로(경보 먼저 정렬은 [특보로 질문] 고르기에만) */}
                {mine.map((a) => (
                  <div key={a.id} role="listitem" className="row">
                    {/* 읽기만 하는 목록 — 단계 색(빨강) 없이 받은 이름 그대로 */}
                    <span className="lvb">{wxLabel(a)}</span>
                    <span className="ar">{a.area}{a.scenario && <> <ScnTag a={a} /></>}</span>
                    <span className="t">{advTime(a.issuedAt)} {a.scenario ? "켬" : "발표"}</span>
                  </div>
                ))}
              </div>
            )}
          </span>
        </>
      )}
      <span className="meta">{meta}</span>
      <span className="sp" />
      <button type="button" className="btn ghost sm wxdetail" onClick={() => { setPop(null); setDetail(true); }} aria-haspopup="dialog">특보 상세</button>
      {detail && <WxDetailModal mine={mine} onClose={() => setDetail(false)} />}
      <div className="wxask">
        <button
          className={`btn ghost sm ${wxRef ? "on" : ""}`}
          onClick={onAsk}
          disabled={aimOn}
          // R46 — AI 모드에서 특보가 함께 가는 것은 브리핑 질문(과 AI 모드 점검)뿐이다. 직접 쓴 질문·질문 목록·시연 묶음에는 붙지 않는다(explore askText·askLib·askDemo)
          title={aimOn ? "AI 모드에서는 브리핑 질문에 현재 특보가 함께 전달됩니다. 직접 쓴 질문에 특보를 걸려면 AI 모드를 끄고 [특보로 질문]을 쓰세요." : undefined}
          aria-haspopup={cands.length > 1}
          aria-expanded={pop === "ask"}
        >
          {aimOn ? "AI 모드 · 브리핑에 특보 반영" : wxRef ? `참조 중 · ${advName(wxRef)}` : "특보로 질문"} {!aimOn && !wxRef && <IcChevR size={14} />}
        </button>
        {wxRef && !aimOn && <button className="lnk xs" onClick={() => setWxRef(null)} aria-label="특보 참조 해제" title="특보 참조 해제">해제 ×</button>}
        {pop === "ask" && (
          <div className="wxpick" role="menu">
            <div className="hd">질문에 참조할 특보를 고르세요</div>
            {cands.map((a) => (
              <button key={a.id} role="menuitem" className={wxRef?.id === a.id ? "on" : ""} onClick={() => attach(a)}>
                <span className={`lvb ${advTone(a)}`}>{wxLabel(a)}</span>
                <span className="ar">{a.area}{a.scenario && <> <ScnTag a={a} /></>}</span>
                <span className="t">{advTime(a.issuedAt)} {a.scenario ? "켬" : "발표"}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 공통 헤더 (Figma 102001 기반, 사용자 지시 10) — Figma 의 3단(공식 배너·유틸리티·메인 메뉴, 200px)을 한 줄(56px)로 합쳤다.
 * 로고 · 메인 메뉴 · 기준지역 · 도움말 · 글자 크기 · AI 모드 · 사용자. KRDS 공식 배너 띠는 생략(허용됨).
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, account, logout, cond, toastMsg, aimOn, setAimOn, weather, t3qOk } = useSession();
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

  useEffect(() => {
    if (ready && !account) router.replace("/login");
  }, [ready, account, router]);

  if (!ready || !account) return null;
  // AI 모드 단추 색 — 지금 기준지역을 덮는 발효 특보로(R32). 기상청 실시간이 끊긴 계정(R45)에 덮는 특보가 없으면 녹색(특보 없음)이 아니라 회색(lib/wxref aimTone)
  const target = baseTarget(cond.base);
  const mine = (weather?.advisories ?? []).filter((a) => a.status === "발효" && wxCovers(a.area, target));
  const st = !aimOn ? "" : aimTone(weather, mine);
  // 연락망·상황전파는 사용자 메뉴로 옮김(사용자 지시 2026-10-28)
  const nav: [string, string][] = [["/explore", "통합 탐색"], ["/history", "대화 이력"], ...(account.role === "운영자" ? ([["/admin", "운영관리"]] as [string, string][]) : [])];

  return (
    <SopProvider>
    <div className="app">
      <header className="gh one">
        <Link href="/explore" className="logo">
          <GovLogo />
          <span>행정안전부 <small>재난안전 AI</small></span>
        </Link>
        <nav className="gnb" aria-label="메인 메뉴">
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className={path?.startsWith(href) ? "on" : ""}>{label}</Link>
          ))}
          {/* 자동 시연(개발서버 머리 메뉴 [자동 시연] — R54) — 질문 모음을 열지 않고 통합 탐색에서 대본대로 돈다 */}
          <button type="button" className="gnb-demo" disabled={demo.running} onClick={() => (path?.startsWith("/explore") ? window.dispatchEvent(new CustomEvent(AUTODEMO_START_EVENT)) : router.push("/explore?autodemo=1"))}>
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
          <button onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
            {account.org.replace("강원특별자치도 ", "").replace("경상북도 ", "")} · {account.id} ▾
          </button>
          {menu && (
            <div className="menu" onMouseLeave={() => setMenu(false)}>
              <div className="mh">
                <b className="s">{account.name}</b>
                <div className="xs muted">{account.org} {account.dept}</div>
              </div>
              <Link href="/contacts" onClick={() => setMenu(false)}>연락망·상황전파</Link>
              <button onClick={() => { setMenu(false); openBriefingSettings(); }}>브리핑 설정</button>
              <button onClick={() => { setMenu(false); setModal("me"); }}>내 권한 정보</button>
              <button onClick={() => { setMenu(false); setModal("pw"); }}>비밀번호 변경</button>
              <button onClick={async () => { await logout(); router.push("/login"); }}>로그아웃</button>
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
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
    </SopProvider>
  );
}
