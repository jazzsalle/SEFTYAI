"use client";
import { useSession } from "@/lib/session";
import { REGIONS } from "@/lib/config";

/** 내 권한 정보 (FUN-UNE-703001) */
export default function MePage() {
  const { account } = useSession();
  if (!account) return null;
  const rows: [string, string][] = [
    ["계정 ID", account.id],
    ["소속", `${account.org} ${account.dept}`],
    ["사용자 유형", account.role === "지자체" ? "지자체 공무원" : account.role === "운영자" ? "시스템 운영자" : "검토용 계정 (v1.71 사용자유형 외)"],
    ["기본 기준지역", REGIONS[account.region].name],
    ["조회 가능 지역", "제한 없음 (v1.71 · 기본값은 소속 지역)"],
    ["조회 가능 데이터", "공무원용 전체 (개인정보 항목 포함, 대국민 미제공 항목 표시)"],
    ["원문 내려받기", "공개 등급 문서만 (매뉴얼·계획문서) · 내부전용 문서는 열람만"],
    ["운영관리 메뉴", account.role === "운영자" ? "사용" : "사용 불가 (시스템 운영자 전용)"],
    ["세션", "30분 무활동 시 만료 안내 (연장/로그아웃)"],
  ];
  return (
    <div className="page">
      <div className="page-in narrow">
        <div className="ph"><div><h1>내 권한 정보</h1><p>권한 변경은 시스템 운영자에게 요청하세요.</p></div></div>
        <dl className="kv panel" style={{ gridTemplateColumns: "180px 1fr" }}>
          {rows.map(([k, v]) => (<div key={k} style={{ display: "contents" }}><dt>{k}</dt><dd>{v}</dd></div>))}
        </dl>
      </div>
    </div>
  );
}
