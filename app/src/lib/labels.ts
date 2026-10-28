/**
 * 화면 표기 한국어 사전 (사용자 지시 2026-10-28 "화면에서 영어 쓰지 말고 한국어로")
 * - T3Q 응답의 **필드 이름·상태 코드·사유 코드**를 한국어로 보인다. 원래 이름은 툴팁(title)에만 둔다.
 * - **값(응답 내용)은 바꾸지 않는다** — 사건 이름·주소·숫자·에이전트 답 글은 원문 그대로(R0).
 */

/** T3Q API 이름 */
export const API_KO: Record<string, string> = {
  "T3Q-01": "에이전트 질의", "T3Q-03": "추천 질문", "T3Q-04": "유사사례 검색", "T3Q-05": "위험·취약 대상 목록", "T3Q-06": "계획문서 목록",
  "T3Q-10": "사건 상세", "T3Q-11": "유사도 근거", "T3Q-12": "사건 타임라인", "T3Q-13": "피해·대응", "T3Q-15": "위험·취약 대상 상세",
  "T3Q-16": "하천 계획지식", "T3Q-17": "계획문서 상세", "T3Q-18": "객체 관계", "T3Q-19": "근거 조회", "T3Q-30": "침수흔적 목록", "EXT-01": "위치 조회",
};

/** 봉투 상태 */
export const STATUS_KO: Record<string, string> = {
  SUCCESS: "정상", PARTIAL_SUCCESS: "일부 제공", NO_RESULT: "결과 없음", DATA_NOT_AVAILABLE: "데이터 없음", PROCESSING: "처리 중",
  UPSTREAM_ERROR: "연계 오류", TIMEOUT: "시간 초과", FORBIDDEN: "권한 없음", ERROR: "오류",
};
export const QUALITY_KO: Record<string, string> = { VERIFIED: "검증됨", UNDER_REVIEW: "검토 중" };
export const statusKo = (s?: string | null) => (s ? STATUS_KO[s] ?? s : "—");

/** 필드 이름 — 여러 API 에 같은 이름이 쓰이므로 하나의 사전 */
export const FIELD_KO: Record<string, string> = {
  // 공통·목록
  object_id: "대상 ID", spatial_object_id: "위치 ID", data_group: "데이터군", category: "분류", type: "유형", source_subtype: "세부 유형",
  name: "이름", grade: "등급", value: "값", status: "상태", address: "주소", admin_code: "행정코드", admin_name: "행정구역", has_geometry: "위치 정보",
  disclosure_level: "공개 등급", total_count: "전체 건수", items: "항목", page: "쪽", size: "건수",
  // 사건·유사사례
  event_master_id: "사건 ID", display_name: "사건", disaster_types: "재난유형", disaster_type_code: "재난유형 코드", source_disaster_type_text: "원천 재난유형",
  lifecycle_status: "진행 상태", started_at: "시작", ended_at: "종료", time_precision: "시각 단위", time_profile: "기간", source_timezone: "원천 시간대",
  source_time_raw: "원천 시각", start: "시작", end: "종료", similarity: "유사도", rank: "순위", score: "점수", scale: "척도", algorithm_version: "산식 판",
  coverage: "비교에 쓴 요인 비율", representative_admin_area: "대표지역", affected_admin_areas: "관련 시도", affected_admin_areas_more: "관련 시도 더 있음",
  crisis_alert_level: "위기경보 단계", cdb_stage: "중대본 단계", lead_agency: "주관", event_summary: "요약", available_sections: "제공 항목",
  evidence_refs: "근거", evidence_ref: "근거", report: "보고서", evidence: "근거", satellite: "위성영상", timeline: "타임라인", damage_response: "피해·대응",
  // 유사도 근거
  contributions: "요인군 기여", factor_group: "요인군", factor_key: "요인 키", factor: "요인", unit: "단위", current_value: "현재 조건", past_value: "과거 사례",
  match: "일치도", weight_used: "가중치", contribution: "기여도", contribution_points: "기여 점수", contribution_pct: "기여 비율", weights: "가중치",
  by_group: "요인군별", weight: "가중치", weight_stage: "가중치 기준", similarity_reasons: "유사 이유", factor_groups_not_provided: "제공되지 않은 요인군",
  disclaimer: "유의 사항", disaster_type: "재난유형",
  // 타임라인
  seq: "순번", occurred_at: "시각", elapsed_hours: "경과(시간)", description: "내용", agency: "기관", record_type: "기록 종류", source_ref: "원천 번호",
  relation_basis: "연결 근거", time_origin: "시간 기준", origin_at: "기준 시각", note: "비고",
  // 피해·대응
  damage: "피해", human: "인명", text: "내용", dead: "사망", missing: "실종", injured: "부상", displaced: "이재민", property: "재산",
  property_damage_krw: "재산피해(원)", houses: "주택", facilities: "시설", public: "공공시설", private: "사유시설", record_count: "건수",
  damage_amount_krw: "피해액(원)", by_category: "시설유형별", recovery: "복구", report_level: "보고 단계", item_count: "항목 수", recovery_cost_krw: "복구비(원)",
  damage_registers: "재해대장", disaster_id: "재해 번호", disaster_year: "연도", response: "대응", road_control_count: "도로 통제", evacuation: "대피",
  persons: "인원", actions: "조치",
  // 침수흔적
  flood_trace_id: "침수흔적 ID", district_name: "지구명", flood_event: "침수 사건", flood_event_id: "침수 사건 ID", flood_grade: "침수 등급",
  max_depth_m: "최대 침수심(m)", avg_flood_depth_raw: "평균 침수심(원천값)", avg_flood_depth_unit: "침수심 단위", avg_flood_level_m: "평균 침수위(m)",
  area_m2: "면적(㎡)", flood_hours: "침수 시간", cause: "원인", flood_year: "침수 연도", started_on: "시작일", ended_on: "종료일",
  // 계획
  plan_id: "계획 ID", plan_type: "계획 종류", scope_type: "범위", target_area: "대상 지역", target_admin_codes: "대상 행정코드", target_rivers: "대상 하천",
  plan_period: "계획 기간", base_year: "기준 연도", approval: "승인", version: "판", other_versions: "다른 판", linked_risk_area_count: "연결된 위험지구 수",
  river_plan_summary: "하천계획 요약", summary: "요약",
  // 위험·취약 대상 상세(자주 쓰는 것)
  risk_grade: "위험 등급", designated_at: "지정일", released_at: "해제일", inspection: "점검", inspections: "점검 이력", latest: "최근", result: "결과",
  manager: "관리기관", location: "위치", sigungu: "시군구", emd: "읍면동",
  region: "지역", level: "단위",
  // 위험·취약 대상 상세(T3Q-15)
  category_counts: "분류별 건수", count: "건수", admin_area: "행정구역", risk: "위험", designation_reason: "지정 사유", key_risk_condition: "주요 위험 조건",
  expected_damage: "예상 피해", vulnerability: "취약성", risk_score_detail: "위험도 세부 점수", designation_no: "지정 번호", area_or_length: "면적·길이",
  attributes: "속성", key: "구분", label: "항목", management: "관리", department: "담당 부서", contact: "연락처", contains_pii: "개인정보 포함",
  basis: "근거", designation_basis: "지정 근거", related_plans: "관련 계획", past_events: "과거 사건", related_documents: "관련 문서", title: "제목",
  source: "출처", table: "원천 표", row_no: "행 번호", as_of: "기준일",
  // 하천·계획(T3Q-06·16·17)
  river_code: "하천 코드", river_name: "하천명", river_id: "하천 ID", design_frequency_yr: "설계 빈도(년)", design_flood_cms: "계획홍수량(㎥/s)",
  reference_station_no: "기준 측점", river_basic: "하천 기본정보", river_type: "하천 등급", passing_admin_areas: "지나는 행정구역", managing_agency: "관리기관",
  water_system: "수계", basin_code: "유역 코드", parent_river: "상위 하천", tributary_order: "지류 차수", river_length_km: "하천 길이(km)", catchment_km2: "유역면적(㎢)",
  designation: "지정", plan: "계획", notice: "고시", probable_rainfall: "확률강우량", design_flood: "계획홍수량", value_cms: "유량(㎥/s)", station_no: "측점",
  return_period_yr: "재현기간(년)", freeboard_required_m: "필요 여유고(m)", vertical_datum: "높이 기준", other_plans: "다른 계획", stations: "측점",
  cum_dist_m: "누가거리(m)", design_flood_level_elm: "계획홍수위(EL.m)", levee_left_elm: "좌안 제방고(EL.m)", levee_right_elm: "우안 제방고(EL.m)",
  plan_width_m: "계획 하폭(m)", thalweg_elm: "최심하상고(EL.m)", freeboard_m: "여유고(m)", freeboard_ok: "여유고 적정", station_total: "전체 측점 수",
  facility_items: "시설", facility_type: "시설 종류", scope: "범위", management_state: "관리 상태", risk_sections: "위험 구간", mitigation_measures: "저감 대책",
  knowledge_type: "지식 종류", content: "내용", plan_summary: "계획 요약", risk_causes: "위험 원인", related_passage: "관련 문단", type_specific_items: "종류별 항목",
  section: "절", linked_risk_area_ids: "연결된 위험지구", document_id: "문서 ID", quality_status: "검증 상태",
  // 관계·근거(T3Q-18·19)
  nodes: "대상", id: "ID", entity_type: "대상 종류", edges: "관계", source_id: "출발 대상", relation_type: "관계 종류", target_id: "도착 대상", group_counts: "종류별 건수",
  passage_id: "문단 ID", short_title: "짧은 제목", document_type: "문서 종류", published_at: "발행일", total_pages: "전체 쪽수", section_path: "절 경로",
  section_title: "절 제목", pdf_page: "쪽", paragraphs: "문단", quote_type: "인용 종류", ocr_status: "글자 인식 상태", source_availability: "원문 제공 여부",
  download_allowed: "내려받기 허용", related_object_ids: "관련 대상", source_row: "원천 행", caption: "설명", head: "머리행", rows: "행", highlighted_row: "강조 행",
  totals: "합계", public_record_count: "공공시설 건수", public_damage_amount_krw: "공공시설 피해액(원)", private_record_count: "사유시설 건수",
  private_damage_amount_krw: "사유시설 피해액(원)", coverage_note: "범위 안내",
};
/** 필드 이름 → 한국어(모르는 이름은 원래 이름 그대로) */
export const fieldKo = (k: string) => FIELD_KO[k] ?? k;

/** data_gaps 사유 */
export const GAP_KO: Record<string, string> = {
  NOT_IN_SOURCE: "원자료에 없음", NOT_YET_BUILT: "구축 전", SOURCE_NOT_COLLECTED: "수집 안 됨", CONNECTION_FAILED: "연결 실패", INPUT_NOT_PROVIDED: "질의 조건에 없음",
};
/** data_gaps 의 component 이름 조각 */
const COMPONENT_KO: Record<string, string> = {
  rain: "강우", warning: "특보", factors: "요인", manual: "행동매뉴얼", agent: "에이전트",
  document_store: "원문 문서 보관", page_image: "쪽 그림", reports: "보고 기록", spatial_object: "공간 객체",
};
const partKo = (p: string) => COMPONENT_KO[p] ?? FIELD_KO[p] ?? p;
/**
 * 정보 부족 이름 — 「끝 이름(소속)」, 목록 항목이면 「각 소속의 끝 이름」. 경로에 「·」를 쓰지 않는다(시각 설계 §0.2)
 * 예 similarity.factors.rain → 강우(유사도 요인) · items[].max_depth_m → 각 항목의 최대 침수심(m) · document_store → 원문 문서 보관
 */
export const gapName = (c: string) => {
  const parts = c.split(".");
  const last = parts.pop()!.replace(/\[\]$/, "");
  if (!parts.length) return c.endsWith("[]") ? `각 ${partKo(last)}` : partKo(last);
  const owner = parts.map((p) => partKo(p.replace(/\[\]$/, ""))).join(" ");
  return parts[parts.length - 1].endsWith("[]") ? `각 ${owner}의 ${partKo(last)}` : `${partKo(last)}(${owner})`;
};

/** 값이 코드인 칸 — 값 자체는 두고 뜻을 덧붙일 때만 쓴다 */
export const VALUE_KO: Record<string, string> = { CLOSED: "종료", ONGOING: "진행 중", DATE: "날짜", MINUTE: "분", ACTUAL: "실제 기록", TIME_REGION_OVERLAP: "기간·지역 겹침" };
