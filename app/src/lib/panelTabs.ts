/**
 * 우측 패널 상세 탭 정리(UFR-006-001-02 · FUN-UFR-305004) — 개발서버 features/panel/lib/panelTabs(96c419a) 이식.
 * 상세 탭 = 닫을 수 있는 탭(대상 상세·근거 문서·매뉴얼 원문). 붙박이 탭(지도·한눈 요약·대응절차)은 세지도 닫지도 않는다.
 */
import type { PanelTab } from "@/components/explore/ExploreCtx";

/** 한꺼번에 열어 두는 상세 탭의 최대 수 — 넘치면 가장 먼저 연 것부터 닫는다 */
export const MAX_DETAIL_TABS = 8;

/** 닫을 수 있는 탭인가 — 붙박이(지도·한눈 요약·대응절차)가 아닌 것 */
export const isClosable = (t: Pick<PanelTab, "kind" | "pinned">): boolean =>
  !t.pinned && (t.kind === "detail" || t.kind === "doc" || t.kind === "evidence");

/**
 * 상세 탭을 최대 수 안으로 줄인다 — 앞(오래된 것)부터 버린다. 붙박이 탭은 세지 않고 남긴다.
 * keepKey(막 연 탭)는 오래됐어도 남긴다 — 막 연 탭이 바로 닫히면 안 된다.
 */
export function capDetailTabs(list: PanelTab[], keepKey?: string | null, max = MAX_DETAIL_TABS): PanelTab[] {
  let over = list.filter(isClosable).length - max;
  if (over <= 0) return list;
  return list.filter((t) => {
    if (over > 0 && isClosable(t) && t.key !== keepKey) {
      over -= 1;
      return false;
    }
    return true;
  });
}

/** 탭 이름 뒤에 붙일 객체 갈래 이름. 모르는 갈래는 내보이지 않는다(상류 코드가 화면에 비치지 않게) */
const KIND_LABELS: Record<string, string> = {
  REGION: "위험·취약지역",
  RISK_AREA: "위험·취약지역",
  RISK_FACTOR: "잠재 위험요소·취약시설",
  RISK_FACTOR_FACILITY: "잠재 위험요소·취약시설",
  FLOOD_TRACE: "침수흔적",
  EVENT: "유사재난 사례",
  PLAN: "계획지식",
  MANUAL: "행동매뉴얼",
};

/** 대상 상세 탭이면 그 갈래·객체 ID(개발서버 entity.entity_type · entity_id) */
function entityOf(t: PanelTab): { type?: string; id?: string } | null {
  const d = t.detail;
  if (!d || (d.api !== "T3Q-15" && d.api !== "T3Q-30")) return null;
  const fromCtx = typeof d.ctx?.entityType === "string" ? d.ctx.entityType : undefined;
  return { type: d.entityType ?? fromCtx, id: d.id?.trim() || undefined };
}

/**
 * 탭에 적을 이름 — 이름이 같은 탭이 둘 이상이면 갈래를 붙여 가른다. 갈래로도 갈리지 않으면 T3Q 가 준 객체 ID 를 붙인다.
 * 이름이 하나뿐인 탭은 그대로 둔다. 돌려주는 것: 탭 열쇠 → 화면에 적을 이름
 */
export function tabTitles(tabs: PanelTab[]): Map<string, string> {
  const count = new Map<string, number>();
  for (const t of tabs) count.set(t.title, (count.get(t.title) ?? 0) + 1);

  const first = new Map<string, string>();
  for (const t of tabs) {
    const type = entityOf(t)?.type;
    const kind = type ? KIND_LABELS[type] : undefined;
    first.set(t.key, (count.get(t.title) ?? 0) > 1 && kind ? `${t.title} · ${kind}` : t.title);
  }

  // 갈래를 붙여도 같으면 객체 ID 로 한 번 더 가른다
  const again = new Map<string, number>();
  for (const v of first.values()) again.set(v, (again.get(v) ?? 0) + 1);

  const out = new Map<string, string>();
  for (const t of tabs) {
    const v = first.get(t.key) ?? t.title;
    const id = entityOf(t)?.id;
    out.set(t.key, (again.get(v) ?? 0) > 1 && id ? `${v} · ${id}` : v);
  }
  return out;
}
