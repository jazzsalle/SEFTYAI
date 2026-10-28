// 자유 질문 → Data API 규칙 분류기 (LLM 없음, 2차 후보 — R2). 확신이 없으면 기권(빈 배열)한다.
// 원칙: 정밀도 우선. 공간 연산(반경·버퍼·겹침·면적)·특보/문자/관측소·계획 본문 질문은 Data API 로 답이 안 나오므로 기권.
const ABSTAIN = /(\d+\s*m\s*(안|이내|내)|반경|버퍼|겹치|중첩|면적|침수심|침수지도|도시침수|하천범람|관측소|수위|특보|재난문자|문자|발령|홍수통제소|발표|해제까지|지속시간|저감대책|사업 내용|건축물|주택|숙박|야영장|필지)/;
const RULES = [
  { api: "T3Q-05", group: "RISK_FACTOR_FACILITY", re: /지하차도/ },
  { api: "T3Q-05", group: "RISK_AREA", re: /(급경사지|붕괴위험|산사태\s*취약|산사태취약|위험지구|개선지구|홍수취약|위험저수지|사면재해|재해위험)/ },
  { api: "T3Q-30", group: "FLOOD_TRACE", re: /(침수\s*흔적|침수흔적|과거에?\s*침수|침수됐던|침수\s*이력)/ },
  { api: "T3Q-04", group: "SIMILAR_EVENT", re: /(유사|비슷한)\s*.*(사례|사건|호우|태풍)/ },
];
export function classify(question) {
  if (ABSTAIN.test(question)) return [];
  const hits = RULES.filter((r) => r.re.test(question));
  // 두 갈래 이상이 동시에 걸리면 질문 의도가 섞인 것 — 기권
  const apis = [...new Set(hits.map((h) => h.api))];
  return apis.length === 1 ? hits.filter((h) => h.api === apis[0]) : [];
}
