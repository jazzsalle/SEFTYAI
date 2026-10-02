"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { REGIONS } from "@/lib/config";
import type { RegionId } from "@/lib/contract/agent";
import { GovLogo, IcChevR, IcRefresh, IcSiren } from "./Icons";

const NAV = [
  { href: "/explore", label: "통합 탐색" },
  { href: "/events", label: "재난사건" },
  { href: "/manual", label: "대응 매뉴얼" },
  { href: "/catalog", label: "데이터 출처" },
  { href: "/history", label: "대화 이력" },
];

const fmtT = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const fmtD = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${fmtT(iso)}`;
};

export function WxBar() {
  const { weather, mode, setMode, account, reloadWeather, cond } = useSession();
  const router = useRouter();
  if (!account) return null;
  const region = cond.region;
  const mine = (weather?.advisories ?? []).filter((a) => a.status !== "해제" && (region === "national" || a.regionId === region));
  const top = [...mine].sort((a, b) => (a.level === "경보" ? -1 : 1) - (b.level === "경보" ? -1 : 1))[0];
  const openWx = () => router.push("/explore?panel=wx");

  let tag: React.ReactNode, title: React.ReactNode, meta: string;
  if (!weather) {
    tag = <span className="tag fail">조회 중</span>;
    title = "기상특보를 확인하고 있습니다";
    meta = "";
  } else if (!weather.status.ok) {
    tag = <span className="tag fail">조회 실패</span>;
    title = "기상특보를 불러오지 못했습니다 (미발효와 구분)";
    meta = `${weather.status.message} · 최종 시도 ${fmtT(weather.status.fetchedAt)}`;
  } else if (top) {
    tag = (
      <span className={`tag ${top.level === "경보" ? "" : "warn"}`}>
        <IcSiren size={16} /> {top.level === "경보" ? "긴급" : "주의"}
      </span>
    );
    title = (
      <>
        {top.area} {top.type}
        {top.level} {top.status === "발효" ? "발효 중" : top.status}
      </>
    );
    meta = `${fmtD(top.issuedAt)} 발표 · 기상청 ${fmtT(weather.status.fetchedAt)} 갱신`;
  } else {
    tag = <span className="tag none">특보 없음</span>;
    title = region === "national" ? "현재 발효 중인 기상특보가 없습니다" : `${REGIONS[region].name}에 발효 중인 기상특보가 없습니다`;
    meta = `${weather.status.message} · 조회 ${fmtT(weather.status.fetchedAt)}`;
  }
  const others = mine.length - (top ? 1 : 0);

  return (
    <div className={`wxbar ${top && top.level === "경보" ? "danger" : ""}`}>
      {tag}
      <span className="tit">{title}</span>
      {others > 0 && <span className="more">외 {others}건</span>}
      <span className="meta">{meta}</span>
      <span className="sp" />
      {mode === "scenario" && weather?.scenario && <span className="scenTag">시나리오 · {weather.scenario.label}</span>}
      <div className="modeSw" role="group" aria-label="기상 모드">
        <button className={mode === "scenario" ? "on" : ""} onClick={() => setMode("scenario")}>사건 재현</button>
        <button className={mode === "live" ? "on" : ""} onClick={() => setMode("live")}>실시간(KMA)</button>
      </div>
      <button className="iconbtn" title="다시 조회" onClick={reloadWeather}><IcRefresh /></button>
      <button className="btn ghost sm" onClick={openWx}>특보 상세 <IcChevR size={14} /></button>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, account, logout, cond, setCond, toastMsg } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [sgg, setSgg] = useState<{ name: string }[]>([]);

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

  if (!ready || !account) return null;

  return (
    <div className="app">
      <div className="nuri">
        <svg className="flag" viewBox="0 0 36 24"><rect width="36" height="24" fill="#fff" /><circle cx="18" cy="12" r="6" fill="#cd2e3a" /><path d="M12 12a6 6 0 0 0 12 0 3 3 0 0 0-6 0 3 3 0 0 1-6 0" fill="#0047a0" /></svg>
        이 누리집은 대한민국 공식 전자정부 누리집입니다.
        <span className="sp" />
        <span className="mute2">재난안전 AI 데이터 구축 · 시범서비스 (시연판)</span>
      </div>
      <header className="gh">
        <Link href="/explore" className="logo">
          <GovLogo />
          행정안전부
          <small>재난안전 AI</small>
        </Link>
        <nav className="gnav">
          {[...NAV, ...(account.role === "운영자" ? [{ href: "/admin", label: "운영관리" }] : [])].map((n) => (
            <Link key={n.href} href={n.href} className={pathname.startsWith(n.href) ? "on" : ""}>
              {n.label}
            </Link>
          ))}
        </nav>
        <span className="sp" />
        <div className="scope">
          기준지역
          <select className="select sm" value={cond.region} onChange={(e) => setCond({ region: e.target.value as RegionId, sigungu: undefined })} aria-label="기준지역" title="기본값은 소속 지역 · 조회 지역 제한 없음 (v1.71)">
            {(["national", "busan", "yeongcheon", "inje"] as RegionId[]).map((r) => (
              <option key={r} value={r}>{REGIONS[r].name}{r === account.region ? " (소속)" : ""}</option>
            ))}
          </select>
          {cond.region !== "national" && (
            <select className="select sm" value={cond.sigungu ?? ""} onChange={(e) => setCond({ sigungu: e.target.value || undefined })} aria-label="시군구">
              <option value="">시·군·구 전체</option>
              {sgg.map((s) => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
        <span className="ai-pill"><i /> AI 모드</span>
        <div className="user">
          <button onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
            {account.org.replace("강원특별자치도 ", "").replace("경상북도 ", "")} · {account.id} ▾
          </button>
          {menu && (
            <div className="menu" onMouseLeave={() => setMenu(false)}>
              <div className="mh">
                <b className="s">{account.name}</b>
                <div className="xs muted">{account.org} {account.dept}</div>
                <div className="xs mute2">권한 : {account.roleLabel}</div>
              </div>
              <Link href="/history" onClick={() => setMenu(false)}>대화 이력</Link>
              <Link href="/settings/briefing" onClick={() => setMenu(false)}>내 브리핑 항목 설정</Link>
              <Link href="/settings/me" onClick={() => setMenu(false)}>내 권한 정보</Link>
              <button onClick={() => { logout(); router.push("/login"); }}>로그아웃</button>
            </div>
          )}
        </div>
      </header>
      <WxBar />
      {children}
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  );
}
