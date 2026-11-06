"use client";
import type { Advisory } from "./contract/agent";
import type { BaseRegion } from "./baseRegion";

/**
 * 특보 상세 창(머리줄 — components/wx/WxDetailModal) → 통합 탐색 화면(explore) 「이 특보로 질의」 다리.
 * 창은 모든 화면 위에 뜨고 질문은 통합 탐색이 보낸다. 통합 탐색이 떠 있으면 이벤트로 바로, 다른 화면이면 옮겨 간 뒤 처음 그릴 때 받아 간다(takeWxAsk).
 */
export interface WxAskRequest {
  adv: Advisory;
  /** 그 특보가 걸린 행정구역 — undefined 면 지금 기준지역 그대로(바다 구역 · 정할 수 없음) */
  base?: BaseRegion | null;
}

export const WX_ASK_EVENT = "sa:ask-wx";
let pending: WxAskRequest | null = null;

/** 보낼 것을 맡기고 알린다 — 받는 쪽이 takeWxAsk 로 한 번만 가져간다 */
export function requestWxAsk(r: WxAskRequest) {
  pending = r;
  window.dispatchEvent(new CustomEvent(WX_ASK_EVENT));
}

export function takeWxAsk(): WxAskRequest | null {
  const r = pending;
  pending = null;
  return r;
}

/** 「이 특보로 질의」 질문 글 — 개발 서버 SearchPage onAsk 와 같은 글(예비특보는 발효가 아니라 발표) */
export const wxAskQuestion = (a: Pick<Advisory, "type" | "level" | "area">) =>
  `현재 ${a.area}에 ${a.level === "예비특보" ? "발표된" : "발효 중인"} ${a.type}${a.level} 기준으로 위험·취약지역과 대응 사항을 알려줘`;
