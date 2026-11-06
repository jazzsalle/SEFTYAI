/**
 * 브리핑 세트 (UFR-006-001-05) — 개발서버와 같게(R51, 2026-11-06 「기존 브리핑 세트 전부 삭제 · 개발서버 내용 그대로 복제」).
 *  · 시스템 항목 = 개발서버 ai_briefing_item 8행 그대로(item_id · item_label · question · sort_no · is_default · is_active).
 *    쓰는 것은 is_active 인 항목만, sort_no → item_sn 순(개발서버 BriefingCatalogRepository.ListActiveAsync)
 *  · 저장한 적 없는 사람 = 시스템 항목, is_default 인 것만 체크(개발서버 BriefingSetService.ToItems)
 *  · 사용자 세트 = 항목 id · 이름 · 질의문 · 체크를 놓인 순서대로(순서 = 실행 순서). 개발서버 acc_optn(optn_cl BRIEFING) → 우리 sa_kv(scope acct:<계정>, key briefing)
 *  · 「(기본)」 표시는 저장하지 않고 시스템 항목 is_default 를 보고 매긴다
 *  · 규칙(개발서버 BriefingRules) — 4개 이상 체크해야 저장 · 최대 8개 · 이름 50자 · 질의문 500자. 화면과 서버(api/kv)가 같은 검사를 한다
 *  · 브리핑에 나가는 것 = 체크한 항목 전부, 위에서부터(시작 화면 [브리핑 시작] · 질의 줄 메뉴 · AI 모드 모두 같은 목록)
 *  · 시작 화면 타일 = 등록 항목 전부(체크하지 않은 것도)
 */
export interface BriefingItem {
  id: string;
  label: string;
  question: string;
  checked: boolean;
  /** 시스템이 디폴트로 정한 항목인지(저장하지 않는다 — 시스템 항목 is_default 로 매김) */
  isDefault?: boolean;
}

/** 개발서버 ai_briefing_item 8행(2026-11-06 내려받음) — 칸 이름만 우리 꼴로 */
export const BRIEFING_CATALOG = [
  { itemSn: 1, id: "risk-area", label: "위험·취약지역", question: "우리 지역에서 먼저 점검해야 할 위험·취약지역은 어디인가요?", sortNo: 1, isDefault: true, isActive: true },
  { itemSn: 2, id: "past-damage", label: "과거 피해 이력", question: "위험·취약지역 중 과거 재난 때 실제로 피해가 났던 곳과 피해 내용은?", sortNo: 2, isDefault: true, isActive: true },
  { itemSn: 3, id: "evacuation", label: "통제·대피 대상", question: "통제하거나 주민 대피가 필요할 수 있는 도로·지하차도·인명피해 우려지역은?", sortNo: 3, isDefault: true, isActive: true },
  { itemSn: 4, id: "manual", label: "행동매뉴얼", question: "현장조치 행동매뉴얼상 지금 단계에서 해야 할 일은?", sortNo: 4, isDefault: true, isActive: true },
  { itemSn: 5, id: "flood-history", label: "침수 이력", question: "기준지역의 최근 침수 이력을 알려줘", sortNo: 5, isDefault: false, isActive: false },
  { itemSn: 6, id: "steep-slope", label: "급경사지 위험", question: "우리 지역의 급경사지 붕괴위험지역은?", sortNo: 6, isDefault: false, isActive: false },
  { itemSn: 7, id: "response-case", label: "대응조치 사례", question: "2020년 7월 23일 집중호우 때 어떤 대응조치를 했나요?", sortNo: 7, isDefault: false, isActive: false },
  { itemSn: 8, id: "manual-check", label: "행동매뉴얼 확인", question: "이 상황에서 행동매뉴얼상 확인해야 할 절차는?", sortNo: 8, isDefault: false, isActive: false },
] as const;

/** 개발서버 BriefingRules */
export const BRIEFING_RULES = { title: "현재 상황 브리핑", minChecked: 4, maxItems: 8, maxLabelLength: 50, maxQuestionLength: 500 } as const;

/** sa_kv 키(scope acct:<계정>) — 옛 「내 브리핑 항목」(key brief)은 R51 에서 지웠다 */
export const BRIEFING_KV_KEY = "briefing";

const activeCatalog = () => [...BRIEFING_CATALOG].filter((x) => x.isActive).sort((a, b) => a.sortNo - b.sortNo || a.itemSn - b.itemSn);
const isDefaultId = (id: string) => BRIEFING_CATALOG.some((x) => x.id === id && x.isActive && x.isDefault);

/** 기본 항목 — 저장한 적 없는 사람·[기본 항목으로 되돌리기] */
export function briefingDefaults(): BriefingItem[] {
  return activeCatalog().map((x) => ({ id: x.id, label: x.label, question: x.question, checked: x.isDefault, isDefault: x.isDefault }));
}

/** 저장해 둔 값 → 항목(이름·질의문이 빈 자리는 버림 · 「(기본)」을 매김). 남는 것이 없으면 null(= 기본 항목을 쓴다) */
export function briefingFromStored(v: unknown): BriefingItem[] | null {
  if (!Array.isArray(v)) return null;
  const items = v.flatMap((x) => {
    const o = x as Partial<BriefingItem> | null;
    const label = typeof o?.label === "string" ? o.label : "";
    const question = typeof o?.question === "string" ? o.question : "";
    if (!label || !question) return [];
    const id = typeof o?.id === "string" ? o.id : "";
    return [{ id, label, question, checked: o?.checked === true, isDefault: isDefaultId(id) }];
  });
  return items.length ? items : null;
}

/** 저장 전 검사(개발서버 BriefingSetService.Validate 와 같은 규칙) — 어긋나면 그 까닭을 던진다. 통과하면 저장할 모양(isDefault 없음) */
export function validateBriefing(items: unknown): Omit<BriefingItem, "isDefault">[] {
  if (!Array.isArray(items)) throw new Error("브리핑 항목 형식이 맞지 않습니다.");
  if (items.length > BRIEFING_RULES.maxItems) throw new Error(`브리핑 항목은 최대 ${BRIEFING_RULES.maxItems}건까지 등록할 수 있습니다.`);
  const seen = new Set<string>();
  const out = items.map((x, i) => {
    const o = (x ?? {}) as Partial<BriefingItem>;
    const label = (typeof o.label === "string" ? o.label : "").trim();
    const question = (typeof o.question === "string" ? o.question : "").trim();
    if (!label || label.length > BRIEFING_RULES.maxLabelLength) throw new Error("항목명을 입력하세요.");
    if (!question || question.length > BRIEFING_RULES.maxQuestionLength) throw new Error("질의문을 입력하세요.");
    // 번호가 겹치면 새로 매긴다(개발서버와 같이 — 저장할 때 서로 덮어쓰지 않게)
    let id = (typeof o.id === "string" ? o.id : "").trim();
    if (!id || seen.has(id)) id = `u${Date.now().toString(36)}${i}`;
    seen.add(id);
    return { id, label, question, checked: o.checked === true };
  });
  if (out.filter((x) => x.checked).length < BRIEFING_RULES.minChecked) throw new Error(`브리핑 세트에 넣을 항목을 ${BRIEFING_RULES.minChecked}개 이상 고르세요.`);
  return out;
}
