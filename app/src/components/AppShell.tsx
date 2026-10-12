"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { REGIONS } from "@/lib/config";
import type { RegionId } from "@/lib/contract/agent";
import { GovLogo, IcChevR, IcSiren } from "./Icons";
import type { Advisory } from "@/lib/contract/agent";
import { advLabel, advTime, advTone } from "@/lib/wxref";
import { SopProvider } from "@/lib/sopState";
import SopBar from "./sop/SopBar";

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
  const others = mine.length - (top ? 1 : 0);
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
    meta = `${fmtT(top.issuedAt)} 발표 · 기상청 ${fmtT(weather.status.fetchedAt)} 갱신${weather.mode === "scenario" ? " · 훈련 시나리오" : ""}`;
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
    if (!cands.length) return router.push("/explore?panel=wx");
    if (cands.length === 1) return attach(cands[0]);
    setPick((v) => !v);
  };
  return (
    <div className={`wxbar ${top && top.level === "경보" ? "danger" : ""}`}>
      {tag}
      <span className="tit">{title}</span>
      {others > 0 && <span className="more">외 {others}건</span>}
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
          {aimOn ? "AI 모드 · 특보 자동 반영" : wxRef ? `참조 중 · ${advLabel(wxRef)}` : "특보로 질문"} {!aimOn && <IcChevR size={14} />}
        </button>
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

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, account, logout, cond, setCond, toastMsg, aimOn, setAimOn, mode, setMode, weather } = useSession();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [sgg, setSgg] = useState<{ name: string }[]>([]);
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
  // 신호등 상태 (헤더 버튼 색)
  const mine = (weather?.advisories ?? []).filter((a) => a.status === "발효" && (cond.region === "national" || a.regionId === cond.region));
  const st = !aimOn ? "" : weather && !weather.status.ok ? "gray" : mine.some((a) => a.level === "경보") ? "red" : mine.length ? "yellow" : "green";
  const emdList = cond.sigungu ? emds[cond.sigungu] ?? [] : [];

  return (
    <SopProvider>
    <div className="app">
      <div className="nuri">
        <svg className="flag" viewBox="0 0 36 24"><rect width="36" height="24" fill="#fff" /><circle cx="18" cy="12" r="6" fill="#cd2e3a" /><path d="M12 12a6 6 0 0 0 12 0 3 3 0 0 0-6 0 3 3 0 0 1-6 0" fill="#0047a0" /></svg>
        이 누리집은 대한민국 공식 전자정부 누리집입니다.
      </div>
      <header className="gh">
        <Link href="/explore?new=1" className="logo">
          <GovLogo />
          행정안전부
        </Link>
        <span className="sp" />
        {/* 시연 데이터 전환 — 배포 주소를 받은 사람도 바로 알아보고 바꿀 수 있게 헤더에 노출 */}
        <span className="demoLb">기상특보 데이터</span>
        <div className="demoSw" role="group" aria-label="기상특보 데이터 (시연 모드)" title="훈련 시나리오 = 가상의 호우 상황(특보·강우·119 신고) · 실시간 = 기상청 실제 특보">
          <button className={mode === "scenario" ? "on" : ""} onClick={() => setMode("scenario")} aria-pressed={mode === "scenario"}>훈련 시나리오</button>
          <button className={mode === "live" ? "on" : ""} onClick={() => setMode("live")} aria-pressed={mode === "live"}>실시간(기상청)</button>
        </div>
        <div className="scope">
          기준지역
          <select className="select sm" value={cond.region} onChange={(e) => setCond({ region: e.target.value as RegionId, sigungu: undefined, emd: undefined })} aria-label="기준지역">
            {(["national", "busan", "yeongcheon", "inje"] as RegionId[]).map((r) => (
              <option key={r} value={r}>{r === "national" ? "전국" : REGIONS[r].name.replace(/^(경상북도|강원특별자치도)\s/, "")}</option>
            ))}
          </select>
          {cond.region !== "national" && (
            <select className="select sm" value={cond.sigungu ?? ""} onChange={(e) => setCond({ sigungu: e.target.value || undefined, emd: undefined })} aria-label="시군구">
              <option value="">시·군·구 전체</option>
              {sgg.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          )}
          {cond.sigungu && emdList.length > 0 && (
            <select className="select sm" value={cond.emd ?? ""} onChange={(e) => setCond({ emd: e.target.value || undefined })} aria-label="읍면동">
              <option value="">읍·면·동 전체</option>
              {emdList.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
        <button className={`ai-pill ${aimOn ? "on st-" + st : ""}`} onClick={() => { setAimOn(!aimOn); router.push("/explore"); }} aria-pressed={aimOn} title="AI 모드 — 기상특보 기반 상황 점검 전광판">
          <i /> {aimOn ? "AI 모드 작동 중" : "AI 모드"}
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
              <Link href="/history" onClick={() => setMenu(false)}>대화 이력</Link>
              <Link href="/settings/briefing" onClick={() => setMenu(false)}>내 브리핑 항목</Link>
              <Link href="/settings/me" onClick={() => setMenu(false)}>내 권한 정보</Link>
              {account.role === "운영자" && <Link href="/admin" onClick={() => setMenu(false)}>운영관리</Link>}
              <button onClick={() => { logout(); router.push("/login"); }}>로그아웃</button>
            </div>
          )}
        </div>
      </header>
      <WxBar />
      {/* 행동매뉴얼 대응 단계 바 — 지자체 계정에만 모든 화면 고정 */}
      <SopBar />
      {children}
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
    </SopProvider>
  );
}
