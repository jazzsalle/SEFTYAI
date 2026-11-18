"use client";
/**
 * KRDS Input·InputMessage(@une-front/krds) 를 조합한 텍스트 입력 — 개발서버 shared/components/TextField 그대로(R64, 개발서버 7f428c4·548ad7f)
 * 다른 점: id 를 줄 수 있다(없으면 useId) — 화면 시험(harness/e2e)이 #lgn-id 로 칸을 찾는다.
 */
import "./fields.css";
import { useId } from "react";
import { Input } from "@une-front/krds/portable/input";
import { FieldError, FieldGuide } from "./FieldMessage";

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "password";
  placeholder?: string;
  hint?: string;
  error?: string | null;
  autoComplete?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  id?: string;
  /** React 19 는 함수 컴포넌트에도 ref 를 그냥 prop 으로 넘길 수 있다(forwardRef 불필요). */
  ref?: React.Ref<HTMLInputElement>;
}

export function TextField({ label, value, onChange, type = "text", placeholder, hint, error, autoComplete, autoFocus, disabled, id: given, ref }: TextFieldProps) {
  const auto = useId();
  const id = given ?? auto;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div className="form-group">
      <div className="form-tit">
        <label htmlFor={id}>{label}</label>
      </div>
      {hint && <FieldGuide id={hintId}>{hint}</FieldGuide>}
      <div className={`form-conts${error ? " is-error" : ""}`}>
        <Input
          ref={ref}
          // 칸 치수(높이·안쪽 여백·글자)는 .krds-input 규칙이 정한다. 패키지 Input 은 이 클래스를 달지 않아 직접 단다(개발서버 548ad7f).
          className="krds-input"
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          disabled={disabled}
          invalid={!!error}
          aria-describedby={[hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}
