"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/session";
import { GovLogo, IcChevR, IcSiren } from "./Icons";
import type { Advisory } from "@/lib/contract/agent";
import { advLabel, advTime, advTone } from "@/lib/wxref";
import { wxCovers } from "@/lib/wxMatch";
import { baseKey, baseName, baseTarget } from "@/lib/baseRegion";
import BasePicker from "./BasePicker";
import { SopProvider } from "@/lib/sopState";
import SopBar from "./sop/SopBar";
import { openHelp } from "./HelpCenter";
import AiModeModal from "./explore/AiModeModal";
import FontSize from "./FontSize";
import { PasswordModal } from "./account/PasswordModal";
import { MyInfoModal } from "./account/MyInfoModal";
import { SessionExpiredModal } from "./account/SessionExpiredModal";

const fmtT = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/**
 * 특보 바 (목업 SCR-UNE-101001 : 긴급 · 지역 특보 발효 중 · 발표/갱신 · 특보로 질문)
 * 지금 기준지역을 덮는 특보만(R32 — lib/wxMatch). 기준지역이 바뀌면 그 지역으로 다시 보인다(특보 참조는 setBase 가 뗀다). 전국이면 모든 특보
 */
export function WxBar() {
  const { weather, account, cond, wxRef, setWxRef, aimOn } = useSession();
  const router = useRouter();
  // 펼친 목록 — "ask" = [특보로 질문] 고르기, "all" = [모두 보기] 발효 특보 전체
  const [pop, setPop] = useState<"ask" | "all" | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const bk = baseKey(cond.base);
  const national = !cond.base;
  const target = baseTarget(cond.base);
  const mine = (weather?.advisories ?? []).filter((a) => a.status !== "해제" && a.status !== "변경" && wxCovers(a.area, target));
  // 기준지역이 바뀌면 열려 있던 특보 목록을 닫는다(이전 지역 목록이 남지 않게).
  // 특보가 1건 이하·조회 실패가 되어 목록이 없어져도 닫는다(다시 늘어날 때 저절로 펼쳐지지 않게)
  useEffect(() => setPop(null), [bk]);
  const many = mine.length > 1;
  useEffect(() => {
    if (!many) setPop(null);
  }, [many]);
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
  const top = [...mine].sort((a, b) => (b.level === "경보" ? 1 : 0) - (a.level === "경보" ? 1 : 0))[0];
  // 나머지 특보는 지역·전국 모두 받은 이름 그대로, 받은 순서대로 · 로 잇는다(유엔이가 센 「외 n건」 없음, R25·R40). 길면 한 줄 말줄임, [모두 보기] = 전체 목록
  // 이름은 첫 특보와 같이 「구역 + 특보」 — 특보 이름만 이으면 구역이 다른 특보가 「강풍주의보 · 강풍주의보」로 같아 보인다
  const rest = top ? mine.filter((a) => a !== top) : [];
  const restText = rest.map((a) => `${a.area} ${advLabel(a)}`).join(" · ");
  let tag: React.ReactNode, title: React.ReactNode, meta = "";
  if (!weather) {
    tag = <span className="tag fail">조회 중</span>;
    title = "기상특보를 확인하고 있습니다";
  } else if (!weather.status.ok) {
    tag = <span className="tag fail">조회 실패</span>;
    title = "기상특보를 불러오지 못했습니다";
    meta = `${weather.status.message} · 최종 시도 ${fmtT(weather.status.fetchedAt)}`;
  } else if (top) {
    tag = <span className={`tag ${top.level === "경보" ? "" : "warn"}`}><IcSiren size={16} /> {top.level === "경보" ? "긴급" : "주의"}</span>;
    title = <>{top.area} {top.type}{top.level} 발효 중</>;
    meta = `${fmtT(top.issuedAt)} 발표 · 기상청 ${fmtT(weather.status.fetchedAt)} 갱신`;
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
    <div ref={barRef} className={`wxbar ${top && top.level === "경보" ? "danger" : ""}`}>
      {tag}
      <span className="tit">{title}</span>
      {rest.length > 0 && (
        <>
          <span className="more" title={restText}>· {restText}</span>
          <span className="wxall">
            <button type="button" className="lnk xs" onClick={() => setPop((v) => (v === "all" ? null : "all"))} aria-expanded={pop === "all"}>모두 보기</button>
            {pop === "all" && (
              <div className="wxpick" role="list" aria-label="발효 중인 특보">
                <div className="hd">발효 중인 특보</div>
                {/* 받은 순서 그대로(경보 먼저 정렬은 [특보로 질문] 고르기에만) */}
                {mine.map((a) => (
                  <div key={a.id} role="listitem" className="row">
                    {/* 읽기만 하는 목록 — 단계 색(빨강) 없이 받은 이름 그대로 */}
                    <span className="lvb">{advLabel(a)}</span>
                    <span className="ar">{a.area}</span>
                    <span className="t">{advTime(a.issuedAt)} 발표</span>
                  </div>
                ))}
              </div>
            )}
          </span>
        </>
      )}
      <span className="meta">{meta}</span>
      <span className="sp" />
      <div className="wxask">
        <button
          className={`btn ghost sm ${wxRef ? "on" : ""}`}
          onClick={onAsk}
          disabled={aimOn}
          title={aimOn ? "AI 모드에서는 현재 특보가 질문에 자동으로 반영됩니다. AI 모드를 끄면 특보를 참조로 걸어 질문할 수 있습니다." : undefined}
          aria-haspopup={cands.length > 1}
          aria-expanded={pop === "ask"}
        >
          {aimOn ? "AI 모드 · 특보 자동 반영" : wxRef ? `참조 중 · ${advLabel(wxRef)}` : "특보로 질문"} {!aimOn && !wxRef && <IcChevR size={14} />}
        </button>
        {wxRef && !aimOn && <button className="lnk xs" onClick={() => setWxRef(null)} aria-label="특보 참조 해제" title="특보 참조 해제">해제 ×</button>}
        {pop === "ask" && (
          <div className="wxpick" role="menu">
            <div className="hd">질문에 참조할 특보를 고르세요</div>
            {cands.map((a) => (
              <button key={a.id} role="menuitem" className={wxRef?.id === a.id ? "on" : ""} onClick={() => attach(a)}>
                <span className={`lvb ${advTone(a)}`}>{advLabel(a)}</span>
                <span className="ar">{a.area}</span>
                <span className="t">{advTime(a.issuedAt)} 발표</span>
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

  useEffect(() => {
    if (ready && !account) router.replace("/login");
  }, [ready, account, router]);

  if (!ready || !account) return null;
  // AI 모드 단추 색 — 지금 기준지역을 덮는 발효 특보로(R32)
  const target = baseTarget(cond.base);
  const mine = (weather?.advisories ?? []).filter((a) => a.status === "발효" && wxCovers(a.area, target));
  const st = !aimOn ? "" : weather && !weather.status.ok ? "gray" : mine.some((a) => a.level === "경보") ? "red" : mine.length ? "yellow" : "green";
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
        </nav>
        <span className="sp" />
        <BasePicker />
        <button className="hbtn" onClick={() => openHelp()}>도움말</button>
        <FontSize />
        <button className={`ai-pill ${aimOn ? "on st-" + st : ""}`} onClick={() => { setAimOn(!aimOn); if (!path?.startsWith("/explore")) router.push("/explore"); }} aria-pressed={aimOn} title="AI 모드 — 기상특보 기반 상황 점검">
          <i /> {aimOn ? "AI 모드 실행 중" : "AI 모드"}
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
              <Link href="/settings/briefing" onClick={() => setMenu(false)}>내 브리핑 항목</Link>
              <button onClick={() => { setMenu(false); setModal("me"); }}>내 권한 정보</button>
              <button onClick={() => { setMenu(false); setModal("pw"); }}>비밀번호 변경</button>
              <button onClick={async () => { await logout(); router.push("/login"); }}>로그아웃</button>
            </div>
          )}
        </div>
      </header>
      {t3qOk === false && <div className="sysbar">에이전트 서버에 연결할 수 없습니다. 새 질문은 연결되면 처리되고, 이전 답변은 대화 이력에서 볼 수 있습니다.</div>}
      <WxBar />
      <SopBar />
      {/* AI 모드 — 접으면 이 자리(내용 맨 위)에 띠로 남고 아래 내용이 그만큼 내려간다. 펼친 창은 화면 위에 뜬다 */}
      {aimOn && <AiModeModal />}
      {children}
      {modal === "pw" && <PasswordModal onClose={() => setModal(null)} />}
      {account.mustChangePw && modal !== "pw" && <PasswordModal forced onClose={() => {}} onDone={() => window.location.reload()} />}
      {modal === "me" && <MyInfoModal onClose={() => setModal(null)} />}
      <SessionExpiredModal />
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
    </SopProvider>
  );
}
