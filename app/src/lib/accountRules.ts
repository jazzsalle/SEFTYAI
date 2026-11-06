import type { RegionId } from "./contract/agent";
import type { Account } from "./config";

/**
 * 계정 발급 규칙(R55) — 개발서버 계정 발급 사이트(nia_ai-account · kjw `998facb`)의 등급·소속·ID 규칙 그대로
 *  · 등급 = 개발서버 acc_grad / GradeLevel: 0 계정 발급자 · 1 시스템 관리자 · 2 정부기관 · 3 지자체
 *  · 소속 = 개발서버 co_team(DB 내려받기 2026-11-06 의 계정에 쓰인 소속 — 유엔이·행안부·부산·영천·인제). 번호(sn)는 우리가 매김(개발서버 번호는 내려받기에 없음)
 *  · 등급 → 쓸 수 있는 소속(AccountRules.AllowedTeams): 시스템 관리자 = 운영사(0) 하나 · 정부기관 = 관할 구역이 없는 기관(운영사 빼고) · 지자체 = 관할 구역이 있는 기관
 *  · 우리 역할: 계정 발급자·시스템 관리자 → 운영자, 정부기관 → 중앙정부, 지자체 → 지자체. 계정 발급 화면은 등급 0 만
 * 화면·서버가 같이 쓴다(비밀번호 만들기는 서버 lib/server/accounts.ts).
 */
export type GradeSn = 0 | 1 | 2 | 3;
export const GRADE_ISSUER: GradeSn = 0;

export const GRADES: { sn: GradeSn; name: string; role: Account["role"] }[] = [
  { sn: 0, name: "계정 발급자", role: "운영자" },
  { sn: 1, name: "시스템 관리자", role: "운영자" },
  { sn: 2, name: "정부기관", role: "중앙정부" },
  { sn: 3, name: "지자체", role: "지자체" },
];
export const gradeName = (sn: number | null | undefined) => GRADES.find((g) => g.sn === sn)?.name ?? "—";
export const isGrade = (sn: unknown): sn is GradeSn => GRADES.some((g) => g.sn === sn);

export interface Team {
  sn: number;
  /** co_team.team_name 그대로 */
  name: string;
  /** 관할 구역(co_team.admin_code) — 없으면 중앙기관·운영사 */
  adminCode: string | null;
  /** 우리 기준지역 */
  region: RegionId;
  /** 화면에 쓰는 기관 이름 */
  org: string;
  color: string;
  initial: string;
}

/** 운영사(유엔이) — 개발서버 co_team.team_sn 0. 화면에서 고르는 소속이 아니다(시스템 관리자면 저절로) */
export const OPERATOR_TEAM_SN = 0;
export const TEAMS: Team[] = [
  { sn: 0, name: "유엔이", adminCode: null, region: "national", org: "유엔이 운영지원", color: "#575d66", initial: "운영" },
  { sn: 1, name: "행안부", adminCode: null, region: "national", org: "행정안전부", color: "#063a74", initial: "중앙" },
  { sn: 2, name: "부산", adminCode: "2600000000", region: "busan", org: "부산광역시", color: "#256ef4", initial: "부산" },
  { sn: 3, name: "영천", adminCode: "4723000000", region: "yeongcheon", org: "경상북도 영천시", color: "#0f9d8a", initial: "영천" },
  { sn: 4, name: "인제", adminCode: "5181000000", region: "inje", org: "강원특별자치도 인제군", color: "#6f4bd8", initial: "인제" },
];
export const teamOf = (sn: number | null | undefined) => TEAMS.find((t) => t.sn === sn);

/** 화면에서 발급할 수 있는 등급 — 계정 발급자(0)는 발급 대상이 아니다(개발서버 IsIssuableGrade) */
export const isIssuableGrade = (sn: number) => sn !== GRADE_ISSUER;

/** 등급으로 쓸 수 있는 소속(개발서버 AllowedTeams) */
export function allowedTeams(grade: number): Team[] {
  if (grade === 1) return TEAMS.filter((t) => t.sn === OPERATOR_TEAM_SN);
  if (grade === 2) return TEAMS.filter((t) => t.sn !== OPERATOR_TEAM_SN && t.adminCode === null);
  if (grade === 3) return TEAMS.filter((t) => t.adminCode !== null);
  return [];
}
export const isAllowedTeam = (grade: number, team: number) => allowedTeams(grade).some((t) => t.sn === team);

export const ID_MIN = 4;
/** 개발서버 acc_user.user_id varchar(50) */
export const ID_MAX = 50;
export const ID_PATTERN = "^[A-Za-z0-9_\\-]{4,50}$";
export const ID_PATTERN_TEXT = "영문 대소문자·숫자와 '_' '-'";
export const PW_MIN = 9;
export const PW_RULE_TEXT = "9자 이상이며 영문·숫자·특수문자를 모두 포함";
export const MEMO_MAX = 1000;
/** 한 번에 발급할 수 있는 줄 수(개발서버 RequestAccountIssue MaxLength) */
export const ISSUE_MAX = 200;
/** 우리 시스템 계정(AI 모드 점검 `SYS-AIM-…` 등)과 겹치지 않게 이 앞머리는 쓰지 못한다 */
export const RESERVED_PREFIX = /^sys-/i;

/** ID 가 규칙에 맞는가 — 맞지 않으면 사유(개발서버 AccountRules.ValidateId 문구) */
export function validateId(id: string | null | undefined): string | null {
  if (!id || !id.trim()) return "ID를 입력하십시오.";
  if (id.length < ID_MIN) return `ID는 ${ID_MIN}글자 이상이어야 합니다.`;
  if (id.length > ID_MAX) return `ID는 ${ID_MAX}글자를 넘을 수 없습니다.`;
  if (!new RegExp(ID_PATTERN).test(id)) return `ID는 ${ID_PATTERN_TEXT} 만 쓸 수 있습니다.`;
  if (RESERVED_PREFIX.test(id)) return "'SYS-' 로 시작하는 ID는 시스템이 쓰므로 발급할 수 없습니다.";
  return null;
}

/** 발급한 계정(sa_accounts 의 grade·team_sn) → 우리 계정. 등급·소속을 모르면 null(로그인 안 됨) */
export function issuedAccount(id: string, grade: number | null | undefined, teamSn: number | null | undefined): Account | null {
  const g = GRADES.find((x) => x.sn === grade);
  const t = teamOf(teamSn);
  if (!g || !t) return null;
  return {
    id,
    // 개발서버는 이름을 받지 않고 ID 와 같게 둔다(AccountService.IssueAsync UserName = userId)
    name: id,
    org: t.org,
    dept: "",
    role: g.role,
    roleLabel: `${g.name} · ${t.org}`,
    region: t.region,
    color: t.color,
    initial: g.sn === GRADE_ISSUER ? "발급" : t.initial,
    grade: g.sn,
  };
}
