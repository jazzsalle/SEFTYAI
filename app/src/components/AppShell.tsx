"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { REGIONS } from "@/lib/config";
import type { RegionId } from "@/lib/contract/agent";
import { GovLogo, IcChevR, IcSiren } from "./Icons";
import type { Advisory } from "@/lib/contract/agent";
import { advLabel, advTime, advTone } from "@/lib/wxref";
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

/** 특보 바 (목업 SCR-UNE-101001 : 긴급 · 지역 특보 발효 중 · 발표/갱신 · 특보로 질문) */
export function WxBar() {
  const { weather, account, cond, wxRef, setWxRef, aimOn } = useSession();
  const router = useRouter();
  const [pick, setPick] = useState(false);
  if (!account) return null;
  const region = cond.region;
  const mine = (weather?.advisories ?? []).filter((a) => a.status !== "해제" && a.status !== "변경" && (region === "national" || a.regionId === region));
  const top = [...mine].sort((a, b) => (b.level === "경보" ? 1 : 0) - (a.level === "경보" ? 1 : 0))[0];
  // 지역 화면은 나머지 특보를 이름 그대로(유엔이가 센 건수는 보이지 않음, R25). 전국 화면만 건수
  const rest = top ? mine.filter((a) => a !== top) : [];
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
    title = region === "national" ? "발효 중인 기상특보가 없습니다" : `${REGIONS[region].name}에 발효 중인 기상특보가 없습니다`;
    meta = `${weather.status.message} · 조회 ${fmtT(weather.status.fetchedAt)}`;
  }
  // [특보로 질문] = 특보를 채팅 입력창에 참조로 건다 (1건이면 바로, 여러 건이면 고르기 · 한 번에 하나)
  const cands = [...mine].sort((a, b) => (b.level === "경보" ? 1 : 0) - (a.level === "경보" ? 1 : 0) || b.issuedAt.localeCompare(a.issuedAt));
  const attach = (a: Advisory) => {
    setWxRef(a);
    setPick(false);
    if (!location.pathname.startsWith("/explore")) router.push("/explore");
    setTimeout(() => (document.querySelector(".composer textarea") as HTMLTextAreaElement | null)?.focus(), 80);
  };
  const onAsk = () => {
    if (aimOn) return;
    if (!cands.length) return;
    if (cands.length === 1) return attach(cands[0]);
    setPick((v) => !v);
  };
  return (
    <div className={`wxbar ${top && top.level === "경보" ? "danger" : ""}`}>
      {tag}
      <span className="tit">{title}</span>
      {rest.length > 0 && <span className="more">외 {region === "national" ? `${rest.length}건` : rest.map(advLabel).join(" · ")}</span>}
      <span className="meta">{meta}</span>
      <span className="sp" />
      <div className="wxask">
        <button
          className={`btn ghost sm ${wxRef ? "on" : ""}`}
          onClick={onAsk}
          disabled={aimOn}
          title={aimOn ? "AI 모드에서는 현재 특보가 질문에 자동으로 반영됩니다. AI 모드를 끄면 특보를 참조로 걸어 질문할 수 있습니다." : undefined}
          aria-haspopup={cands.length > 1}
          aria-expanded={pick}
        >
          {aimOn ? "AI 모드 · 특보 자동 반영" : wxRef ? `참조 중 · ${advLabel(wxRef)}` : "특보로 질문"} {!aimOn && !wxRef && <IcChevR size={14} />}
        </button>
        {wxRef && !aimOn && <button className="lnk xs" onClick={() => setWxRef(null)} aria-label="특보 참조 해제" title="특보 참조 해제">해제 ×</button>}
        {pick && (
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
  const { ready, account, logout, cond, setCond, toastMsg, aimOn, setAimOn, weather, t3qOk, setWxRef } = useSession();
  const router = useRouter();
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState<"pw" | "me" | null>(null);
  // 기준지역 선택지(시·군·구 이름·코드, 읍·면·동 이름) — 사용자가 고르는 보기일 뿐 화면에 자료로 보이지 않는다
  const [sgg, setSgg] = useState<{ code: string; name: string }[]>([]);
  const [emds, setEmds] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (ready && !account) router.replace("/login");
  }, [ready, account, router]);
  useEffect(() => {
    if (cond.region === "national") return setSgg([]);
    fetch("/data/regions.json")
      .then((r) => r.json())
      .then((j) => setSgg(j.regions.find((x: { id: string }) => x.id === cond.region)?.sigungu ?? []))
      .catch(() => setSgg([]));
  }, [cond.region]);
  useEffect(() => {
    fetch("/data/emd_index.json").then((r) => r.json()).then(setEmds).catch(() => {});
  }, []);

  if (!ready || !account) return null;
  const mine = (weather?.advisories ?? []).filter((a) => a.status === "발효" && (cond.region === "national" || a.regionId === cond.region));
  const st = !aimOn ? "" : weather && !weather.status.ok ? "gray" : mine.some((a) => a.level === "경보") ? "red" : mine.length ? "yellow" : "green";
  const sggName = cond.sigunguName ?? (sgg.length === 1 ? sgg[0].name : undefined);
  const emdList = sggName ? emds[sggName] ?? [] : [];
  const local = account.role === "지자체";
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
        <div className="scope">
          <span className="xs muted">기준지역</span>
          <select className="select sm" value={cond.region} disabled={local} title={local ? "지자체 계정은 관할 지역이 기준지역입니다" : undefined}
            onChange={(e) => { setWxRef(null); setCond({ region: e.target.value as RegionId, sigungu: undefined, sigunguName: undefined, emd: undefined, emdName: undefined }); }} aria-label="기준지역">
            {(["national", "busan", "yeongcheon", "inje"] as RegionId[]).map((r) => (
              <option key={r} value={r}>{r === "national" ? "전국" : REGIONS[r].name.replace(/^(경상북도|강원특별자치도)\s/, "")}</option>
            ))}
          </select>
          {cond.region !== "national" && sgg.length > 1 && (
            <select className="select sm" value={cond.sigungu ?? ""} onChange={(e) => {
              const o = sgg.find((x) => x.code === e.target.value);
              setCond({ sigungu: o?.code, sigunguName: o?.name, emd: undefined, emdName: undefined });
            }} aria-label="시군구">
              <option value="">시·군·구 전체</option>
              {sgg.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
            </select>
          )}
          {emdList.length > 0 && (
            <select className="select sm" value={cond.emdName ?? ""} onChange={(e) => setCond({ emdName: e.target.value || undefined, ...(sgg.length === 1 ? { sigungu: e.target.value ? sgg[0].code : undefined, sigunguName: e.target.value ? sgg[0].name : undefined } : {}) })} aria-label="읍면동">
              <option value="">읍·면·동 전체</option>
              {emdList.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          )}
        </div>
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
      {children}
      {aimOn && <AiModeModal />}
      {modal === "pw" && <PasswordModal onClose={() => setModal(null)} />}
      {account.mustChangePw && modal !== "pw" && <PasswordModal forced onClose={() => {}} onDone={() => window.location.reload()} />}
      {modal === "me" && <MyInfoModal onClose={() => setModal(null)} />}
      <SessionExpiredModal />
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
    </SopProvider>
  );
}
