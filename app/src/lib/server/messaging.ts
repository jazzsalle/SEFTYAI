import "server-only";
import { randomUUID } from "crypto";
import type { Channel } from "../contactsCore";

/**
 * 문자·이메일 발송 모듈 연결부 — 모듈은 요청을 받으면 메시지 ID를 돌려주고, 결과(성공·실패)는 나중에
 * 결과 알림(POST /api/dispatch/result)으로 알려 준다고 가정한다. 실제 모듈이 정해지면 이 파일의 provider만 바꾼다.
 *
 * 지금은 모의 모듈(mock) — 실제로 보내지 않고 아래 규칙으로 결과를 만든다 (테스트용, 몇 초 뒤 결과 반영)
 *  · 문자: 휴대전화 끝자리 9 → 발송 실패(결번·수신 불가) / 끝자리 8 → 결과 알림 없음(→ 결과 미확인) / 그 외 → 발송 성공
 *  · 이메일: 주소에 fail 이 들어가면 발송 실패(수신 서버 거부) / 그 외 → 발송 성공
 */
export interface SendItem { key: string; channel: Channel; to: string; subject?: string; text: string }
export interface SendAck { key: string; accepted: boolean; providerMsgId?: string; reason?: string }
export interface Provider { name: string; send(items: SendItem[]): Promise<SendAck[]> }

const mock: Provider = {
  name: "mock",
  async send(items) {
    return items.map((it) => ({ key: it.key, accepted: true, providerMsgId: `mock-${randomUUID()}` }));
  },
};

export function provider(): Provider {
  // 실제 모듈 연결 시: process.env.MESSAGING_PROVIDER 로 골라 쓰게 확장
  return mock;
}

/** 모의 모듈 결과가 반영되기까지 (초) · 결과 알림이 끝내 오지 않으면 결과 미확인으로 보는 시간 (초) */
export const MOCK_RESULT_SEC = 5;
export const RESULT_TIMEOUT_SEC = { mock: 30, real: 600 } as const;
