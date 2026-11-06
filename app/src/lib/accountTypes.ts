/** 계정 발급 화면·API 주고받는 꼴(R55) — 개발서버 nia_ai-account web features/account/types 그대로(번호 userSn 대신 아이디로 가리킴) */
export interface AccountSummary {
  userId: string;
  userName: string;
  gradSn: number | null;
  gradName: string;
  teamSn: number | null;
  teamName: string;
  memo: string | null;
  createdAt: string;
  /** 발급한 사람 아이디 — 고정 계정·스크립트 발급은 null */
  createdBy: string | null;
  mustChangePassword: boolean;
  isLocked: boolean;
  loginFailCount: number;
  /** 고정 7계정(폐기·재발급 막음) — 우리에게만 있는 칸 */
  fixed: boolean;
  /** 사용 중(status ACTIVE) */
  active: boolean;
}

export interface GradeItem {
  gradSn: number;
  gradName: string;
  /** 이 등급으로 쓸 수 있는 소속. 하나뿐이면 화면이 저절로 정하고 고르지 못하게 한다 */
  teamSns: number[];
}

export interface TeamItem {
  teamSn: number;
  teamName: string;
  adminCode: string | null;
}

export interface AccountRuleInfo {
  idMinLength: number;
  idMaxLength: number;
  idPattern: string;
  idPatternText: string;
  passwordMinLength: number;
  passwordRuleText: string;
}

export interface AccountMeta {
  grades: GradeItem[];
  teams: TeamItem[];
  rules: AccountRuleInfo;
}

export interface IssueItem {
  gradSn: number;
  userId: string;
  teamSn: number;
  memo: string | null;
}

/** 발급 결과 한 건 — password 는 이 응답에서만 볼 수 있다(저장된 것은 해시뿐) */
export interface IssuedAccount {
  row: number;
  userId: string;
  ok: boolean;
  password: string | null;
  error: string | null;
}

export interface IssueResponse {
  issued: number;
  failed: number;
  results: IssuedAccount[];
}
