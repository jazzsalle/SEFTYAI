"use client";
/**
 * 비밀번호 입력 — 칸 안쪽 오른쪽에 보기/숨기기 단추(시안 760:9). 개발서버 shared/components/PasswordField 그대로(R64, 개발서버 7f428c4·548ad7f)
 * 보기 단추는 「입력한 값을 확인한다」는 편의이므로 기본은 숨김이고, 상태를 aria-pressed 로 알린다.
 * 다른 점: id 를 줄 수 있다(없으면 useId) — 화면 시험(harness/e2e)이 #lgn-pw 로 칸을 찾는다. 칸 아래에 덧붙일 것(children)을 받는다.
 */
import "./fields.css";
import { useId, useState } from "react";
import { Input } from "@une-front/krds/portable/input";
import { FieldError, FieldGuide } from "./FieldMessage";

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string | null;
  autoComplete?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  id?: string;
  /** 칸과 오류 사이에 둘 것(비밀번호 규칙 표시 등) */
  children?: React.ReactNode;
  /** React 19 는 함수 컴포넌트에도 ref 를 그냥 prop 으로 넘길 수 있다(forwardRef 불필요). */
  ref?: React.Ref<HTMLInputElement>;
}

export function PasswordField({ label, value, onChange, placeholder, hint, error, autoComplete, autoFocus, disabled, id: given, children, ref }: PasswordFieldProps) {
  const auto = useId();
  const id = given ?? auto;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const [shown, setShown] = useState(false);

  return (
    <div className="form-group">
      <div className="form-tit">
        <label htmlFor={id}>{label}</label>
      </div>
      {hint && <FieldGuide id={hintId}>{hint}</FieldGuide>}
      <div className={`form-conts has-trailing${error ? " is-error" : ""}`}>
        <Input
          ref={ref}
          // 칸 치수(높이·안쪽 여백·글자)는 .krds-input 규칙이 정한다. 패키지 Input 은 이 클래스를 달지 않아 직접 단다(개발서버 548ad7f).
          className="krds-input"
          id={id}
          type={shown ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          disabled={disabled}
          invalid={!!error}
          aria-describedby={[hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="field-trailing-btn"
          aria-label={shown ? "비밀번호 숨기기" : "비밀번호 보기"}
          aria-pressed={shown}
          aria-controls={id}
          disabled={disabled}
          onClick={() => setShown((v) => !v)}
        >
          <EyeIcon off={shown} />
        </button>
      </div>
      {children}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}

/** KRDS 아이콘은 CSS 배경으로 들어와 색·크기를 맞추기 번거로워 인라인 SVG 로 둔다(개발서버 그대로). */
function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.6" />
      {off && <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}
