"use client";
/**
 * 내 권한정보 모달 (SCR-UNE-101007 · FUN-UNE-703001) — 계정·기관·역할·기준지역·메뉴 권한
 * 메뉴 권한은 실제 화면 규칙에서 계산한다: 대응절차 = 지자체(lib/sopState), 연락망·상황전파 = lib/contactsCore, 운영관리 = 운영자.
 * 사용: {open && <MyInfoModal onClose={() => setOpen(false)} />}
 */
import { useSession } from "@/lib/session";
import type { Account } from "@/lib/config";
import { baseName, defaultBase } from "@/lib/baseRegion";
import { canSend } from "@/lib/contactsCore";
import { Dialog } from "./Dialog";

const USER_TYPE: Record<Account["role"], string> = {
  지자체: "지자체 공무원",
  중앙정부: "정부기관 공무원 (행정안전부·NIA 공용)",
  운영자: "시스템 운영자",
};

/** 기본 기준지역(R32 — 지자체 = 소속 지역, 그 밖 = 전국). 어느 계정이든 머리줄에서 전국 어디로든 바꿀 수 있다 */
function regionText(a: Account): [string, string] {
  if (a.role === "운영자") return [baseName(defaultBase(a)), "운영 확인용으로 지역을 바꿔 볼 수 있습니다."];
  return [baseName(defaultBase(a)), "머리줄 기준지역에서 시·도·시·군·구·읍·면·동으로 바꿔 질의할 수 있습니다."];
}

function menus(a: Account): { name: string; level: string; on: boolean }[] {
  const local = a.role === "지자체";
  const op = a.role === "운영자";
  const send = canSend(a);
  return [
    { name: "통합 탐색 · AI 질의", level: "사용", on: true },
    { name: "대화 이력", level: "사용 (본인 대화)", on: true },
    { name: "행동매뉴얼 대응절차", level: local ? "사용 (소속 지역)" : "없음 (지자체 전용)", on: local },
    { name: "연락망", level: op ? "전체 기관 조회" : "소속 기관 조회·관리", on: true },
    { name: "상황전파", level: send ? "소속 기관 발송·이력" : "이력 조회만", on: send },
    { name: "운영관리", level: op ? "사용" : "없음 (시스템 운영자 전용)", on: op },
  ];
}

export function MyInfoModal({ onClose }: { onClose: () => void }) {
  const { account } = useSession();
  if (!account) return null;
  const [region, regionNote] = regionText(account);

  return (
    <Dialog
      title="내 권한정보"
      desc="권한 변경은 시스템 운영자에게 문의하세요."
      onClose={onClose}
      closeOnBackdrop
      footer={<button type="button" className="acm-btn pri" onClick={onClose}>닫기</button>}
    >
      <dl className="acm-kv">
        <div>
          <dt>계정</dt>
          <dd><code>{account.id}</code><small>{account.name}</small></dd>
        </div>
        <div>
          <dt>소속기관</dt>
          <dd>{account.org}<small>{account.dept}</small></dd>
        </div>
        <div>
          <dt>사용자 유형</dt>
          <dd>{USER_TYPE[account.role]}</dd>
        </div>
        <div>
          <dt>기본 기준지역</dt>
          <dd>{region}<small>{regionNote}</small></dd>
        </div>
        <div>
          <dt>메뉴 권한</dt>
          <dd>
            <ul className="acm-perm">
              {menus(account).map((m) => (
                <li key={m.name} className={m.on ? "on" : "off"}>
                  <span className="nm">{m.name}</span>
                  <span className="lv">{m.level}</span>
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt>원문 내려받기 범위</dt>
          <dd>공개 등급 문서</dd>
        </div>
      </dl>
    </Dialog>
  );
}

export default MyInfoModal;
