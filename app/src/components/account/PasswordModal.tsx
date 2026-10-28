"use client";
/**
 * 비밀번호 변경 모달 (SCR-UNE-101006 · UFR-007) — POST /api/auth/password {current, next}
 * 규칙(서버 pwRule 과 같음): 9자 이상 + 영문·숫자·특수문자. 서버 오류 문구는 그대로 보여 준다.
 * 사용: {open && <PasswordModal onClose={() => setOpen(false)} />}
 */
import { useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { IcEye, IcEyeOff } from "@/components/Icons";
import { Dialog } from "./Dialog";

const RULES: [string, (pw: string) => boolean][] = [
  ["9자 이상", (p) => p.length >= 9],
  ["영문", (p) => /[A-Za-z]/.test(p)],
  ["숫자", (p) => /\d/.test(p)],
  ["특수문자", (p) => /[^A-Za-z0-9]/.test(p)],
];
/** 서버 lib/server/auth.ts pwRule 과 같은 규칙 */
export const pwRuleOk = (pw: string) => RULES.every(([, ok]) => ok(pw));

type Field = "cur" | "next" | "confirm";
const FIELDS: Field[] = ["cur", "next", "confirm"];
const LABEL: Record<Field, string> = { cur: "현재 비밀번호", next: "새 비밀번호", confirm: "새 비밀번호 확인" };
const PLACEHOLDER: Record<Field, string> = { cur: "현재 비밀번호를 입력하세요", next: "새 비밀번호를 입력하세요", confirm: "새 비밀번호를 한 번 더 입력하세요" };
const AUTOCOMPLETE: Record<Field, string> = { cur: "current-password", next: "new-password", confirm: "new-password" };

/** forced = 첫 로그인·재설정 후 비밀번호 변경 강제(Figma 101002) — 닫기·취소 없음 */
export function PasswordModal({ onClose, onDone, forced }: { onClose: () => void; onDone?: () => void; forced?: boolean }) {
  const { account, toast } = useSession();
  const [v, setV] = useState<Record<Field, string>>({ cur: "", next: "", confirm: "" });
  const [show, setShow] = useState<Record<Field, boolean>>({ cur: false, next: false, confirm: false });
  const [err, setErr] = useState<Partial<Record<Field | "form", string>>>({});
  const [busy, setBusy] = useState(false);
  const refs = { cur: useRef<HTMLInputElement>(null), next: useRef<HTMLInputElement>(null), confirm: useRef<HTMLInputElement>(null) };
  const filled = !!(v.cur && v.next && v.confirm);

  const set = (k: Field, val: string) => {
    setV((p) => ({ ...p, [k]: val }));
    if (err[k] || err.form) setErr((p) => ({ ...p, [k]: undefined, form: undefined }));
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const fe: Partial<Record<Field, string>> = {};
    if (!v.cur) fe.cur = "현재 비밀번호를 입력하세요.";
    if (!v.next) fe.next = "새 비밀번호를 입력하세요.";
    else if (!pwRuleOk(v.next)) fe.next = "새 비밀번호는 9자 이상이며 영문·숫자·특수문자를 모두 포함해야 합니다.";
    else if (v.next === v.cur) fe.next = "현재 비밀번호와 다르게 입력하세요.";
    if (!fe.next && v.confirm !== v.next) fe.confirm = v.confirm ? "새 비밀번호가 일치하지 않습니다." : "새 비밀번호를 한 번 더 입력하세요.";
    const first = FIELDS.find((k) => fe[k]);
    setErr(fe);
    if (first) return refs[first].current?.focus();

    setBusy(true);
    try {
      await api<{ ok: true }>("/api/auth/password", { method: "POST", json: { current: v.cur, next: v.next } });
      toast("비밀번호를 변경했습니다.");
      onDone?.();
      onClose();
    } catch (e2) {
      // 서버 문구 그대로 — 해당 칸 아래에, 그 밖의 오류는 위 알림으로
      const m = e2 instanceof ApiError ? e2.message : "서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.";
      const at: Field | "form" = e2 instanceof ApiError && e2.status === 400 ? (m.startsWith("현재 비밀번호") ? "cur" : m.startsWith("새 비밀번호") ? "next" : "form") : "form";
      setErr({ [at]: m });
      if (at !== "form") refs[at].current?.focus();
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={forced ? "초기 비밀번호 변경" : "비밀번호 변경"}
      desc={forced ? "처음 로그인하셨거나 비밀번호가 재설정되었습니다. 계속 쓰려면 새 비밀번호로 바꾸세요." : "현재 비밀번호와 새 비밀번호를 입력하세요."}
      onClose={forced ? undefined : onClose}
      onSubmit={submit}
      busy={busy}
      footer={
        <>
          {!forced && <button type="button" className="acm-btn" onClick={onClose} disabled={busy}>취소</button>}
          <button type="submit" className="acm-btn pri" disabled={!filled || busy}>{busy ? "변경 중…" : "변경"}</button>
        </>
      }
    >
      {/* 비밀번호 관리자가 어느 계정의 비밀번호인지 알 수 있게 */}
      <input type="text" name="username" autoComplete="username" value={account?.id ?? ""} readOnly hidden />
      {err.form && <div className="acm-alert" role="alert">{err.form}</div>}
      {FIELDS.map((k) => {
        const id = `acm-pw-${k}`;
        const desc = [k === "next" ? `${id}-hint ${id}-rules` : "", err[k] ? `${id}-err` : ""].join(" ").trim() || undefined;
        return (
          <div className="acm-field" key={k}>
            <label htmlFor={id}>{LABEL[k]}</label>
            {k === "next" && <p id={`${id}-hint`} className="acm-hint">영문·숫자·특수문자를 모두 넣어 9자 이상, 현재 비밀번호와 다르게 입력하세요.</p>}
            <div className="acm-pw">
              <input
                id={id}
                ref={refs[k]}
                type={show[k] ? "text" : "password"}
                name={k === "cur" ? "current-password" : k === "next" ? "new-password" : "confirm-password"}
                autoComplete={AUTOCOMPLETE[k]}
                placeholder={PLACEHOLDER[k]}
                value={v[k]}
                onChange={(e) => set(k, e.target.value)}
                aria-invalid={!!err[k]}
                aria-describedby={desc}
                maxLength={128}
              />
              <button
                type="button"
                className="acm-eye"
                onClick={() => setShow((p) => ({ ...p, [k]: !p[k] }))}
                aria-label={`${LABEL[k]} ${show[k] ? "숨기기" : "보기"}`}
                aria-pressed={show[k]}
                aria-controls={id}
              >
                {show[k] ? <IcEyeOff size={20} /> : <IcEye size={20} />}
              </button>
            </div>
            {k === "next" && (
              <ul id={`${id}-rules`} className="acm-rules" aria-label="비밀번호 규칙">
                {RULES.map(([label, ok]) => (
                  <li key={label} className={v.next && ok(v.next) ? "ok" : ""}>{label}</li>
                ))}
              </ul>
            )}
            {err[k] && <p id={`${id}-err`} className="acm-err" role="alert">{err[k]}</p>}
          </div>
        );
      })}
    </Dialog>
  );
}

export default PasswordModal;
