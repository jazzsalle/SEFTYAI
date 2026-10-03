import type { Advisory } from "./contract/agent";

/** [특보로 질문] 빠른질의 (목업 QQ-01~03) — 참조 특보와 함께 전송, presetKey 로 의도 고정 */
export const WX_QQ = [
  { k: "qq-risk", nm: "위험·취약지역", q: "현재 특보에서 우선 확인해야 할 위험·취약지역은?" },
  { k: "qq-case", nm: "과거 유사사례", q: "현재 상황과 유사한 과거 재난사례는?" },
  { k: "qq-act", nm: "행동매뉴얼 대응절차", q: "이 상황에서 행동매뉴얼상 확인해야 할 대응절차는?" },
] as const;
/** 시작 화면 4번째 카드 : 특보 자체 (기준·경과) */
export const WX_INFO_Q = { k: "advisory", nm: "특보 기준·경과", q: "이 특보는 어떤 기준이고 언제 격상됐나요?" };

export const advLabel = (a: { type: string; level: string }) => `${a.type}${a.level}`;
export const advTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()}. ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
export const advTone = (a: { level: string }) => (a.level === "경보" ? "w" : a.level === "주의보" ? "a" : "p");
