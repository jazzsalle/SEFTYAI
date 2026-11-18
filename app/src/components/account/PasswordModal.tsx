"use client";
/**
 * 비밀번호 변경 모달 (SCR-UNE-101002 초기 · 101006 변경 · UFR-007) — 개발서버 features/auth/pages/PasswordChangePage 그대로(R64)
 *  · 칸 셋(KRDS PasswordField — components/krds). 「새 비밀번호」 칸 위에 규칙 안내 한 줄. 세 칸이 다 차기 전에는 [변경]을 누를 수 없다
 *  · 화면에서 보는 것은 「새 비밀번호」와 「확인」이 같은지 하나뿐 — 규칙은 서버가 보고 그 문구를 칸 아래에 띄운다
 *  · 서버 오류는 코드로 칸을 고른다(AUTH_PASSWORD_MISMATCH → 첫 칸, AUTH_PASSWORD_RULE·SAME → 새 비밀번호, 모르는 코드 → 첫 칸)
 *  · 응답이 없는 실패(통신 장애)는 칸 오류가 아니라 실패 토스트(⑮)
 *  · 첫 로그인 강제(forced)는 첫 칸 「초기 비밀번호」, 나가는 길은 [로그아웃]뿐(✕·Esc 없음)
 * 띄우는 곳: /password 화면(app/password — 개발서버 router /password). 로그인 뒤 mustChangePw 면 그리로 가고(forced),
 * 사용자 메뉴 「비밀번호 변경」도 그리로 간다(개발서버 UserMenu go('/password')). 창을 닫거나 바꾸면 /explore 로 돌아간다
 */
import { useEffect, useRef, useState } from "react";
import "@/components/krds/fields.css";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { PasswordField } from "@/components/krds/PasswordField";
import { Dialog } from "./Dialog";

/** 어느 칸에 오류를 붙일지 */
type Field = "cur" | "next" | "confirm";
/** 서버 오류 코드 → 칸(개발서버 FieldByErrorCode) — 메시지 글자가 아니라 코드로 가른다 */
const FIELD_BY_CODE: Record<string, Field> = {
  AUTH_PASSWORD_MISMATCH: "cur",
  AUTH_PASSWORD_RULE: "next",
  AUTH_PASSWORD_SAME: "next",
};

/** 변경 완료·통신 실패 토스트(SCR-UNE-101006 ⑭⑮ — 개발서버 PasswordChangePage 글자 그대로, R61) */
export const PW_DONE_MSG = "비밀번호를 변경했습니다.";
export const PW_FAIL_MSG = "비밀번호가 변경되지 않았습니다. 잠시 후 다시 시도하세요.";

/** 화면을 새로 띄운 뒤에 띄울 알림 — 첫 로그인 변경은 끝나면 화면을 다시 불러오므로 알림을 넘겨 둔다(개발서버 navigate state.notice) */
const NOTICE_KEY = "sa-notice";
function stashNotice(m: string) {
  try {
    window.sessionStorage.setItem(NOTICE_KEY, m);
  } catch {
    /* 저장소를 못 쓰면 알림만 빠진다 */
  }
}
/** 넘겨 둔 알림을 한 번 꺼낸다(꺼내면 지운다 — 새로고침해도 다시 뜨지 않게) */
export function takeNotice(): string | null {
  try {
    const m = window.sessionStorage.getItem(NOTICE_KEY);
    if (m !== null) window.sessionStorage.removeItem(NOTICE_KEY);
    return m;
  } catch {
    return null;
  }
}

/** forced = 첫 로그인·재설정 후 비밀번호 변경 강제(101002) — 닫기·취소 없음 */
export function PasswordModal({ onClose, onDone, forced }: { onClose: () => void; onDone?: () => void; forced?: boolean }) {
  const { account, toast, logout } = useSession();
  const router = useRouter();
  // 초기 비밀번호를 아직 쓰는 중이면 화면도 그렇게 부른다(서버 문구와 같은 규칙)
  const currentLabel = forced ? "초기 비밀번호" : "현재 비밀번호";
  const refs = { cur: useRef<HTMLInputElement>(null), next: useRef<HTMLInputElement>(null), confirm: useRef<HTMLInputElement>(null) };
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [busy, setBusy] = useState(false);
  const [focusField, setFocusField] = useState<Field | null>(null);

  // 세 칸이 다 차기 전에는 누를 수 없다(시안 기본 상태의 변경 버튼이 비활성이다)
  const ready = current !== "" && next !== "" && confirm !== "";

  // 초점은 다시 그린 뒤에 옮긴다 — 처리 중에는 칸을 잠가 두는데, 서버 오류는 그 잠금이 풀리기 전에 들어온다
  useEffect(() => {
    if (!focusField) return;
    refs[focusField].current?.focus();
    setFocusField(null);
    // refs 는 useRef 묶음이라 바뀌지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusField]);

  const fail = (field: Field, message: string) => {
    setErrors({ [field]: message });
    setFocusField(field);
  };

  const signOut = async () => {
    await logout();
    router.push("/login");
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy || !ready) return;
    setErrors({});
    // 두 칸이 같은지는 화면에서 본다 — 서버까지 갈 일이 아니다
    if (next !== confirm) return fail("confirm", "새 비밀번호가 일치하지 않습니다.");

    setBusy(true);
    try {
      await api<{ ok: true }>("/api/auth/password", { method: "POST", json: { current, next } });
      // 완료 토스트(⑭)는 이 창이 사라진 뒤에 뜬다 — 첫 로그인 변경은 화면을 다시 불러오므로 넘겨 두고, 평소 변경은 창을 닫으며 띄운다
      if (forced) stashNotice(PW_DONE_MSG);
      else toast(PW_DONE_MSG);
      onDone?.();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        // 아는 코드면 해당 칸에, 모르는 코드(서버 장애 등)면 첫 칸에 서버 문구 그대로
        const code = (err.body as { code?: string } | null)?.code ?? "";
        fail(FIELD_BY_CODE[code] ?? "cur", err.message);
      } else {
        // 응답이 없는 실패(통신 장애)는 칸 오류가 아니라 실패 토스트로 알린다(SCR-UNE-101006 ⑮)
        toast(PW_FAIL_MSG);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={forced ? "초기 비밀번호 변경" : "비밀번호 변경"}
      desc={forced ? "새 비밀번호를 설정해야 서비스를 이용할 수 있습니다." : "현재 비밀번호와 새 비밀번호를 입력하세요."}
      onClose={forced ? undefined : onClose}
      onSubmit={submit}
      busy={busy}
      footer={
        <>
          {forced ? (
            <button type="button" className="acm-btn" onClick={signOut} disabled={busy}>로그아웃</button>
          ) : (
            <button type="button" className="acm-btn" onClick={onClose} disabled={busy}>취소</button>
          )}
          <button type="submit" className="acm-btn pri" disabled={busy || !ready}>{busy ? "변경 중…" : "변경"}</button>
        </>
      }
    >
      {/* 비밀번호 관리자가 어느 계정의 비밀번호인지 알 수 있게 */}
      <input type="text" name="username" autoComplete="username" value={account?.id ?? ""} readOnly hidden />
      <div className="modal-fields acm-fields">
        <PasswordField
          id="acm-pw-cur"
          ref={refs.cur}
          label={currentLabel}
          value={current}
          onChange={setCurrent}
          placeholder={`${currentLabel}를 입력하세요`}
          error={errors.cur}
          autoComplete="current-password"
          disabled={busy}
        />
        <PasswordField
          id="acm-pw-next"
          ref={refs.next}
          label="새 비밀번호"
          value={next}
          onChange={setNext}
          placeholder="새 비밀번호를 입력하세요"
          hint={`영문·숫자·특수문자를 모두 넣어 9자 이상, ${currentLabel}와 다르게 입력하세요.`}
          error={errors.next}
          autoComplete="new-password"
          disabled={busy}
        />
        <PasswordField
          id="acm-pw-confirm"
          ref={refs.confirm}
          label="새 비밀번호 확인"
          value={confirm}
          onChange={setConfirm}
          placeholder="새 비밀번호를 한 번 더 입력하세요"
          error={errors.confirm}
          autoComplete="new-password"
          disabled={busy}
        />
      </div>
    </Dialog>
  );
}

export default PasswordModal;
