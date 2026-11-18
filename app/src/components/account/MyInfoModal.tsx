"use client";
/**
 * 내 권한정보 (SCR-UNE-101007) — 개발서버 PermissionModal 그대로(2026-11-19 「개발서버와 동일하게」)
 * 조회 전용. 세 줄 — 소속기관(정식 이름) · 사용자 유형 · 기본 기준지역. 바꾸려면 운영자를 찾아가야 한다는 안내만 제목 밑에.
 * 사용: {open && <MyInfoModal onClose={() => setOpen(false)} />}
 */
import { useSession } from "@/lib/session";
import type { Account } from "@/lib/config";
import { baseName, defaultBase } from "@/lib/baseRegion";
import { gradeName, teamOf } from "@/lib/accountRules";
import { Dialog } from "./Dialog";

/** 소속 짧은 이름 → 정식 이름(개발서버 OrgNames). 표에 없으면 그대로 */
const ORG_NAMES: Record<string, string> = { 행안부: "행정안전부", 부산: "부산광역시", 영천: "영천시", 인제: "인제군" };
/** 등급 이름 → 사용자 유형(개발서버 UserTypes). 공무원인 두 등급에만 붙인다 */
const USER_TYPES: Record<string, string> = { 정부기관: "정부기관 공무원", 지자체: "지자체 공무원" };
/** 등급을 모르는 계정 — 역할로 */
const ROLE_TYPES: Record<Account["role"], string> = { 중앙정부: "정부기관 공무원", 지자체: "지자체 공무원", 운영자: "시스템 관리자" };

export function MyInfoModal({ onClose }: { onClose: () => void }) {
  const { account } = useSession();
  if (!account) return null;
  const team = teamOf(account.teamSn)?.name;
  const org = team ? ORG_NAMES[team] ?? team : account.org;
  const type = account.grade !== undefined ? USER_TYPES[gradeName(account.grade)] ?? gradeName(account.grade) : ROLE_TYPES[account.role];

  return (
    <Dialog
      title="내 권한정보"
      desc="권한 변경은 시스템 운영자에게 문의하세요."
      onClose={onClose}
      footer={<button type="button" className="acm-btn pri" onClick={onClose}>닫기</button>}
    >
      <dl className="perm-list">
        <Row label="소속기관" value={org} />
        <Row label="사용자 유형" value={type} />
        {/* 관할이 없는 소속(유엔이·행안부)은 전국 */}
        <Row label="기본 기준지역" value={baseName(defaultBase(account))} />
      </dl>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="perm-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default MyInfoModal;
