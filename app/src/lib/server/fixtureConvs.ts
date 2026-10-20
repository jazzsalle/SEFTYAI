import "server-only";
import type { Account } from "../config";
import type { DisasterType, RegionId } from "../contract/agent";
import { answer } from "./agent";
import { SCENARIO } from "./events";

/** 첫 로그인 시 주입하는 시연용 대화 이력 — 실제 응답 서버로 생성해 화면과 일관 */
const QS: Record<RegionId, [string, DisasterType, number][]> = {
  busan: [["부산 지하차도 침수 이력과 통제 기준", "침수", 1], ["시간당 60mm 안팎일 때 과거 부산 어디가 침수됐나요?", "호우", 2], ["태풍 힌남노 때 부산 피해는?", "태풍", 6], ["온천천 하상도로는 언제 통제해야 하나요?", "호우", 9]],
  yeongcheon: [["영천 위험저수지는 어디 있고 왜 위험한가요?", "호우", 1], ["금호강 주변 위험지역과 과거 피해는?", "홍수", 3], ["영천 급경사지는 어디고 왜 위험한가요?", "산사태", 7]],
  inje: [["인제 계곡 야영장 중 먼저 철수시킬 곳은 어디인가요?", "호우", 1], ["2013년 7월 인제 호우 때 어떤 피해가 있었나요?", "호우", 4], ["인제 산사태 취약지역은 어디고 언제 대피해야 하나요?", "산사태", 8]],
  national: [["시범 3개 지역 급경사지 현황을 비교해 주세요", "산사태", 1], ["2020년 7월 23일 부산 호우 때 무슨 일이 있었나요?", "호우", 2], ["태풍 힌남노 때 시범지역 피해는?", "태풍", 5]],
};

export function fixtureConversations(acc: Account) {
  const now = Date.now();
  const list = QS[acc.region].map(([q, dt, daysAgo], i) => {
    const at = new Date(now - daysAgo * 864e5 - i * 37 * 6e4).toISOString();
    const res = answer({ sessionId: `fx${i}`, question: q, context: { region: acc.region, disasterType: dt, baseTime: SCENARIO[acc.region === "national" ? "busan" : acc.region].baseTime, mode: "scenario" } });
    return {
      id: `fx-${acc.id}-${i}`,
      title: res.title,
      region: acc.region,
      disasterType: dt,
      createdAt: at,
      updatedAt: at,
      turns: [{ id: `fx-t${i}`, q, at, res: { ...res, answeredAt: at } }],
    };
  });
  return list;
}
