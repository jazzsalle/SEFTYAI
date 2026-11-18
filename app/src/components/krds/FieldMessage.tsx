"use client";
/**
 * 입력 칸에 딸리는 한 줄 메시지(KRDS InputMessage · @une-front/krds) — 개발서버 shared/components/FieldMessage 그대로(R64, 개발서버 7f428c4)
 * 시안(760:12 · 760:13)은 칸 하나에 메시지 자리를 둘 둔다 — 안내는 칸 위(레이블 바로 아래), 오류는 칸 아래.
 * 자리가 다르니 둘은 서로를 밀어내지 않고 함께 보일 수 있다.
 * 우리는 루트 글자가 16px 이라 패키지의 portable 번들(1rem 대신 10px 단위)을 쓴다 — 개발서버(루트 62.5%)와 같은 크기로 나온다.
 */
import { InputMessage } from "@une-front/krds/portable/inputmessage";

/** 칸 위의 안내. 입력하기 전에 읽어야 뜻이 있으므로 칸보다 먼저 나온다. */
export function FieldGuide({ id, children }: { id: string; children: React.ReactNode }) {
  return <InputMessage id={id}>{children}</InputMessage>;
}

/** 칸 아래의 오류. 색만으로 알리지 않는다 — 칸 테두리도 함께 바뀌고 aria-invalid 가 붙는다(부르는 컴포넌트가 붙인다). */
export function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <InputMessage id={id} variant="error">
      {children}
    </InputMessage>
  );
}
