import "server-only";
import raw from "@data/seed/sop_procedures.json";
import type { RegionId } from "../contract/agent";
import type { SopManual } from "../sop";

/** 행동매뉴얼 대응절차 (부산·영천·인제 풍수해) — scripts/sop/build_sop.py 산출물 */
export const SOP_MANUALS = (raw as unknown as { manuals: SopManual[] }).manuals;

export const sopByRegion = (r: RegionId): SopManual | undefined => SOP_MANUALS.find((m) => m.region === r);

/** 근거 원문 뷰어용: 이 쪽(PDF)에 걸친 행동카드와, 카드 없이 이 쪽(프로세스 표)에 근거를 둔 조치 */
export function sopOnPage(manualId: string, pdfPage: number) {
  const m = SOP_MANUALS.find((x) => x.manualId === manualId);
  if (!m) return null;
  const cards = m.cards.filter((c) => c.pdfPages.includes(pdfPage));
  const actions = m.actions.filter((a) => !a.card && a.pdfPage === pdfPage);
  return { m, cards, actions, actionsOf: (cardId: string) => m.actions.filter((a) => a.card === cardId) };
}
