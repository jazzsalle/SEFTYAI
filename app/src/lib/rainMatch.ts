/**
 * 「비가 이만큼 오면」 샘플 데이터(김인건 서기관 제안 2026-11-25 — components/map/RainSlider).
 *
 * 영천시 — 숫자와 글은 T3Q 에 물어 받은 답(2026-11-25) 그대로 옮겼다.
 *  · 119 신고 날짜·일강수량·1시간 최대·건수·위치: 「영천시에서 호우 때 119 풍수해 신고가 들어온 날마다 …」 답(일강수량 30mm 이상인 날만)
 *  · 임고면 피해: IG-YC-12·13 답(2017·2020·2024·2025 호우) · 임고면 신고 시각: 「영천시 임고면 … 119 신고 이력」 답
 * 강우는 영천 관측소(ASOS 281) 일강수량. 지도 핀은 T3Q 가 답에 붙인 법정리 코드(legal_dong_code)가 있는 곳만 — EXT-01 로 리 중심점을 받는다.
 * 샘플이다: 실제 서비스는 관측소 기후 극값·복구 이력·119 신고를 지점별로 DB 화해 이 꼴로 채워야 한다(서기관 지적).
 */
export interface RainPlace {
  /** 법정리 코드(T3Q refs map.value) */
  code: string;
  name: string;
}
export interface RainCase {
  id: string;
  /** 그날이 든 호우 사건 이름(T3Q display_name 그대로) — 없으면 날짜만 */
  name?: string;
  date: string;
  dayMm: number;
  hourMm?: number;
  totalMm?: number;
  /** 누적의 뜻(「2일 누적」 등) — 없으면 사건 기간 누적 */
  totalNote?: string;
  /** 그날 119 풍수해 신고 — 건수·위치는 답 글 그대로, 핀은 코드가 있는 곳만 */
  reports?: { count: number; places: string; pins: RainPlace[] };
  /** 그 호우 때 난 피해(임고면) */
  damages: { text: string; place?: RainPlace }[];
}
export interface RainSample {
  key: string;
  basis: string;
  /** 막대 끝(mm) */
  max: number;
  cases: RainCase[];
}

const RI = {
  양항리: { code: "4723037021", name: "임고면 양항리" },
  선원리: { code: "4723037022", name: "임고면 선원리" },
  삼매리: { code: "4723037024", name: "임고면 삼매리" },
  고천리: { code: "4723037032", name: "임고면 고천리" },
  양평리: { code: "4723037034", name: "임고면 양평리" },
} satisfies Record<string, RainPlace>;

const YEONGCHEON: RainSample = {
  key: "yeongcheon",
  basis: "영천시 · 영천 관측소 일강수량 · 119 풍수해 신고·임고면 피해 · T3Q 답 숫자 그대로",
  max: 170,
  cases: [
    { id: "2024-07-02", date: "2024-07-02", dayMm: 30.4, hourMm: 15.0, reports: { count: 2, places: "망정동, 고경면 도암리", pins: [] }, damages: [] },
    { id: "2024-06-30", date: "2024-06-30", dayMm: 32.6, hourMm: 11.0, reports: { count: 1, places: "신녕면 완전리", pins: [] }, damages: [] },
    { id: "2025-06-21", date: "2025-06-21", dayMm: 45.8, hourMm: 11.2, reports: { count: 1, places: "신녕면 매양리", pins: [] }, damages: [] },
    { id: "2025-07-14", date: "2025-07-14", dayMm: 48.8, hourMm: 12.4, reports: { count: 2, places: "북안면 고지리, 화남면 금호리", pins: [] }, damages: [] },
    {
      id: "2025-07-19", name: "2025년 7.16.~7.20. 호우", date: "2025-07-19", dayMm: 80.8, hourMm: 24.7,
      reports: { count: 15, places: "대전동, 오미동, 오수동, 고경면 가수리, 금호읍 교대리·오계리·원제리, 신녕면 부산리·연정리, 청통면 계포리·대평리·신덕리·우천리·죽정리", pins: [] },
      damages: [],
    },
    {
      id: "2024-07-10", name: "2024년 7.8.~19. 호우", date: "2024-07-10", dayMm: 96.1, hourMm: 46.9,
      reports: {
        count: 78,
        places: "도동, 서산동, 성내동, 쌍계동, 야사동, 언하동, 오미동, 완산동, 작산동, 창구동, 화룡동, 고경면 단포리·대의리·도암리·상리리·용전리·창하리, 금호읍 교대리·냉천리·덕성리·삼호리·석섬리·성천리·신대리·신월리, 북안면 서당리, 신녕면 부산리·완전리·왕산리·치산리·화남리, 임고면 고천리·선원리·양평리·양항리, 청통면 계지리·계포리·대평리·송천리·신원리·신학리·용천리·우천리, 화남면 귀호리·신호리·온천리·죽곡리, 화북면 오산리, 화산면 가상리·대안리·화산리",
        pins: [RI.선원리, RI.양평리, RI.고천리, RI.양항리],
      },
      damages: [],
    },
    {
      id: "2025-07-17", name: "2025년 7.16.~7.20. 호우", date: "2025-07-17", dayMm: 96.4, hourMm: 35.6, totalMm: 200.9,
      reports: { count: 2, places: "도남동, 신녕면 연정리", pins: [] },
      damages: [{ text: "선원천 삼매제·선원천 제방 유실(7.20.)", place: RI.삼매리 }],
    },
    { id: "2017-07-14", name: "2017년 7.14~16 호우", date: "2017-07-14", dayMm: 96.5, hourMm: 55.5, damages: [{ text: "임고면 및 영천 북부권 급경사지·도로 사면 토사유출" }] },
    { id: "2020-08-08", name: "2020년 7.28.~8.11. 호우", date: "2020-08-08", dayMm: 110.6, damages: [{ text: "농경지 및 저수지·하천 제방 세굴 및 산지 침식" }] },
    { id: "2024-09-21", date: "2024-09-21", dayMm: 112.0, hourMm: 16.8, reports: { count: 3, places: "고경면 창하리, 화산면 당곡리·연계리", pins: [] }, damages: [] },
    {
      // 신고 표에는 「2024-09-09」로 적혔으나 같은 답 본문과 다른 답(관측 극값·IG-YC-13)이 모두 7월 9일 158.8mm 라 7월 9일로 둔다
      id: "2024-07-09", name: "2024년 7.8.~19. 호우", date: "2024-07-09", dayMm: 158.8, hourMm: 57.2, totalMm: 254.9, totalNote: "9~10일 누적",
      reports: { count: 21, places: "봉동, 오수동, 고경면 덕정리·상덕리, 금호읍 구암리·남성리·냉천리·신대리·오계리, 대창면 직천리, 북안면 고지리·신촌리·유상리·임포리·자포리, 화산면 용평리", pins: [] },
      damages: [
        { text: "임고서원 일원 구거 옹벽 파손(L=75m)", place: RI.양항리 },
        { text: "금대리·효리·사리 금대제 호안 유실, 세천 옹벽 파손, 담곡천 제방 유실" },
      ],
    },
  ],
};

const SAMPLES: Record<string, RainSample> = { yeongcheon: YEONGCHEON };

/** 그 지역 샘플(없으면 막대를 띄우지 않는다) */
export const rainSampleFor = (region: string): RainSample | null => SAMPLES[region] ?? null;

/** 이 비(일강수량)보다 적게 와도 신고·피해가 있었던 날 — 적게 온 것부터 */
export const matchCases = (cases: RainCase[], mm: number): RainCase[] =>
  cases.filter((c) => c.dayMm <= mm).sort((a, b) => a.dayMm - b.dayMm);

/** 맞는 날들의 119 신고 합 */
export const reportTotal = (cases: RainCase[]): number => cases.reduce((a, c) => a + (c.reports?.count ?? 0), 0);
