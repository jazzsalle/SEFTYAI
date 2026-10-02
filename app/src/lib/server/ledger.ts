import "server-only";
import raw from "@data/seed/disaster_ledger.json";

export interface LedgerRec {
  id: string;
  date_start: string;
  disaster_name: string;
  disaster_type: string;
  region: { sido: string; sigungu: string; emd?: string };
  lon: number;
  lat: number;
  coordApprox?: boolean;
  location_detail: string;
  facility: { 시설명?: string; 시설구분?: string };
  damage_summary: string;
  damage_amount_krw_thousand: number | null;
  recovery_cost_krw_thousand: number | null;
  source: { file?: string; sheet?: string; row?: number };
}
export const LEDGER = raw as unknown as LedgerRec[];

/** 시설명·위치·피해내용에 하천명이 들어간 재해대장 레코드 */
export function ledgerMentioning(name: string, regionTest: (r: LedgerRec) => boolean) {
  return LEDGER.filter((x) => regionTest(x) && `${x.facility?.시설명 ?? ""} ${x.location_detail} ${x.damage_summary}`.includes(name)).sort(
    (a, b) => (b.recovery_cost_krw_thousand ?? b.damage_amount_krw_thousand ?? 0) - (a.recovery_cost_krw_thousand ?? a.damage_amount_krw_thousand ?? 0),
  );
}
