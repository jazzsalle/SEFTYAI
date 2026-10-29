# F. 자동 조회 데이터 응답 시간 — 시연 세트 실측

> 2026-10-28 21:50~21:51 (KST) 실측 · 2바퀴 · 스크립트 `app/harness/demo/probe_preview.mjs` · 원자료 `app/harness/recordings/demo_preview_2026-10-28T12-50-36-175Z.json`

## 잰 방법

- 대상: `app/harness/cq/demo_questions.json` 44문 가운데 자동 조회(`preview`)가 있는 43문, 문항 × 종류 62건/바퀴. 자동 조회 없는 문항: IJ-8.
- 요청: 종류마다 `app/src/lib/server/preview.ts` SPEC 과 같은 경로·본문. 지역은 문항 지역(부산광역시 SIDO · 강원특별자치도 인제군 SIGUNGU · 경상북도 영천시 SIGUNGU), 유사재난은 문항 query_context 전체(재난유형·기간·키워드·특보·조건, 조건 원소 source_type MANUAL).
- 복제 확인: preview.ts 의 SPEC 다섯 줄·지역 없을 때 거르는 줄·시간 제한 8초가 하네스(`app/harness/demo/demo_set.mjs`)와 글자 그대로 같다(실행 때 대조).
- 방식: 한 문항의 호출은 동시에(앱 `runPreview` 의 Promise.all), 문항은 하나씩 차례로(사이 0.3초), 같은 순서로 2바퀴. 시간 제한 8초(앱과 같음 — 넘으면 앱의 그 조회 카드는 오류 상태로 행 없이 뜬다). 매 호출 새 X-Request-Id(앱 클라이언트와 같음).
- ms = 이 PC 에서 보낸 때부터 응답 본문을 다 받은 때까지(앱 `t3q()` 의 ms 와 같은 재기). 「T3Q 처리」 = 응답 `meta.elapsed_ms`. 앱은 배포 서버에서 부르므로 네트워크 몫은 다를 수 있다.
- 같은 지역·종류의 목록 조회는 여러 문항이 같은 본문을 보낸다(아래 4장). 에이전트 질의(POST /agent/query)는 보내지 않았다.

## 1. 요약

| 항목 | 1차 | 2차 |
|---|---|---|
| 호출 | 62 | 62 |
| HTTP 200 · 그 밖 · 시간 초과/연결 실패 | 62 · 0 · 0 | 62 · 0 · 0 |
| 봉투 상태 | SUCCESS 62 | SUCCESS 62 |
| 호출 1회 ms 중앙값 · 최대 | 602 · 1,030 | 532 · 881 |
| T3Q 처리 ms 중앙값 · 최대 | 517 · 717 | 418 · 760 |
| 문항 기다림(그 문항 호출 가운데 가장 느린 것) 중앙값 · 최대 | 690 · 1,030 | 689 · 881 |
| 문항 기다림 ≤1초 · 1~2초 · 2초 넘음 | 42 · 1 · 0 | 43 · 0 · 0 |

### 종류별(모든 바퀴)

| 자동 조회 | 문항 수 | 호출 | ms 중앙값 | ms 최대 | T3Q 처리 ms 중앙값 | 건수(total_count) 범위 |
|---|---|---|---|---|---|---|
| RISK_AREA 위험·취약지역 목록(T3Q-05) | 23 | 46 | 712 | 1,030 | 622 | 644~1,790 |
| RISK_FACILITY 잠재 위험요소·취약시설 목록(T3Q-05) | 8 | 16 | 623 | 776 | 537 | 22~58 |
| FLOOD_TRACE 침수흔적 목록(T3Q-30) | 5 | 10 | 337 | 463 | 232 | 112~370 |
| SIMILAR_EVENT 유사재난 사례(T3Q-04) | 16 | 32 | 272 | 590 | 188 | 20~20 |
| PLAN 계획문서 목록(T3Q-06) | 10 | 20 | 192 | 248 | 95 | 4~5 |

## 2. 문항 × 자동 조회

건수 = 응답 `result.total_count`(전체 건수), 받은 행 = 이번에 받은 `items` 수(앱 쪽수 50·20). 목표 사건 순위 = 문항 `target_event.id` 가 유사재난 목록(20건)의 몇 번째인지(괄호는 설계 때 잰 순위 `rank_probe`).

| id | 지역 | preview | ms 1차 | ms 2차 | T3Q 처리 ms(1차) | 건수 | 받은 행 | 상태 | 목표 사건 순위 |
|---|---|---|---|---|---|---|---|---|---|
| BS-1 | 부산 | RISK_FACILITY | 776 | 637 | 545 | 58 | 50 | 200 SUCCESS |  |
| BS-1b | 부산 | RISK_FACILITY | 680 | 611 | 596 | 58 | 50 | 200 SUCCESS |  |
| BS-2 | 부산 | RISK_AREA | 731 | 721 | 643 | 1,790 | 50 | 200 SUCCESS |  |
| BS-2 | 부산 | PLAN | 208 | 175 | 95 | 4 | 4 | 200 SUCCESS |  |
| BS-2b | 부산 | RISK_AREA | 741 | 722 | 660 | 1,790 | 50 | 200 SUCCESS |  |
| BS-2b | 부산 | PLAN | 248 | 175 | 161 | 4 | 4 | 200 SUCCESS |  |
| BS-3 | 부산 | PLAN | 184 | 173 | 100 | 4 | 4 | 200 SUCCESS |  |
| BS-3b | 부산 | RISK_FACILITY | 673 | 647 | 525 | 58 | 50 | 200 SUCCESS |  |
| BS-4 | 부산 | FLOOD_TRACE | 315 | 311 | 226 | 370 | 50 | 200 SUCCESS |  |
| BS-4 | 부산 | SIMILAR_EVENT | 590 | 266 | 509 | 20 | 20 | 200 SUCCESS | 5위 (5) |
| BS-4b | 부산 | SIMILAR_EVENT | 263 | 269 | 181 | 20 | 20 | 200 SUCCESS | 5위 (5) |
| BS-5 | 부산 | SIMILAR_EVENT | 308 | 259 | 226 | 20 | 20 | 200 SUCCESS | 5위 (5) |
| BS-5b | 부산 | SIMILAR_EVENT | 271 | 265 | 188 | 20 | 20 | 200 SUCCESS | 5위 (5) |
| BS-6 | 부산 | RISK_FACILITY | 623 | 623 | 542 | 58 | 50 | 200 SUCCESS |  |
| BS-6 | 부산 | RISK_AREA | 852 | 721 | 717 | 1,790 | 50 | 200 SUCCESS |  |
| BS-6b | 부산 | RISK_FACILITY | 614 | 612 | 531 | 58 | 50 | 200 SUCCESS |  |
| BS-6b | 부산 | RISK_AREA | 731 | 724 | 649 | 1,790 | 50 | 200 SUCCESS |  |
| BS-7 | 부산 | FLOOD_TRACE | 311 | 463 | 229 | 370 | 50 | 200 SUCCESS |  |
| BS-7 | 부산 | SIMILAR_EVENT | 285 | 330 | 205 | 20 | 20 | 200 SUCCESS | 5위 (5) |
| BS-7b | 부산 | FLOOD_TRACE | 315 | 367 | 229 | 370 | 50 | 200 SUCCESS |  |
| BS-7b | 부산 | SIMILAR_EVENT | 312 | 326 | 227 | 20 | 20 | 200 SUCCESS | 5위 (5) |
| IJ-1 | 인제 | RISK_AREA | 701 | 701 | 619 | 847 | 50 | 200 SUCCESS |  |
| IJ-1b | 인제 | RISK_AREA | 794 | 881 | 644 | 847 | 50 | 200 SUCCESS |  |
| IJ-2 | 인제 | RISK_AREA | 711 | 741 | 627 | 847 | 50 | 200 SUCCESS |  |
| IJ-2 | 인제 | PLAN | 199 | 239 | 93 | 4 | 4 | 200 SUCCESS |  |
| IJ-2b | 인제 | RISK_AREA | 1,030 | 772 | 634 | 847 | 50 | 200 SUCCESS |  |
| IJ-2b | 인제 | PLAN | 244 | 227 | 94 | 4 | 4 | 200 SUCCESS |  |
| IJ-3 | 인제 | RISK_AREA | 683 | 701 | 616 | 847 | 50 | 200 SUCCESS |  |
| IJ-3b | 인제 | RISK_AREA | 699 | 701 | 622 | 847 | 50 | 200 SUCCESS |  |
| IJ-4 | 인제 | SIMILAR_EVENT | 483 | 268 | 377 | 20 | 20 | 200 SUCCESS | 2위 (2) |
| IJ-4b | 인제 | SIMILAR_EVENT | 389 | 272 | 308 | 20 | 20 | 200 SUCCESS | 2위 (2) |
| IJ-5 | 인제 | SIMILAR_EVENT | 289 | 256 | 204 | 20 | 20 | 200 SUCCESS | 14위 (14) |
| IJ-5 | 인제 | FLOOD_TRACE | 363 | 355 | 243 | 112 | 50 | 200 SUCCESS |  |
| IJ-5b | 인제 | FLOOD_TRACE | 346 | 328 | 238 | 112 | 50 | 200 SUCCESS |  |
| IJ-5b | 인제 | SIMILAR_EVENT | 269 | 275 | 189 | 20 | 20 | 200 SUCCESS | 14위 (14) |
| IJ-6 | 인제 | RISK_AREA | 726 | 811 | 625 | 847 | 50 | 200 SUCCESS |  |
| IJ-6b | 인제 | RISK_AREA | 710 | 695 | 631 | 847 | 50 | 200 SUCCESS |  |
| IJ-7 | 인제 | RISK_AREA | 709 | 700 | 622 | 847 | 50 | 200 SUCCESS |  |
| IJ-7b | 인제 | RISK_AREA | 692 | 704 | 611 | 847 | 50 | 200 SUCCESS |  |
| IJ-8 | 인제 | (없음) | - | - | - | - | - | 자동 조회 없음 | - |
| IJ-8b | 인제 | SIMILAR_EVENT | 269 | 303 | 186 | 20 | 20 | 200 SUCCESS | 14위 (14) |
| YC-1 | 영천 | RISK_AREA | 697 | 689 | 615 | 644 | 50 | 200 SUCCESS |  |
| YC-1 | 영천 | PLAN | 219 | 211 | 94 | 5 | 5 | 200 SUCCESS |  |
| YC-1b | 영천 | PLAN | 179 | 179 | 97 | 5 | 5 | 200 SUCCESS |  |
| YC-1b | 영천 | RISK_AREA | 698 | 760 | 614 | 644 | 50 | 200 SUCCESS |  |
| YC-2 | 영천 | RISK_AREA | 690 | 686 | 607 | 644 | 50 | 200 SUCCESS |  |
| YC-2 | 영천 | PLAN | 179 | 177 | 97 | 5 | 5 | 200 SUCCESS |  |
| YC-2b | 영천 | RISK_AREA | 694 | 734 | 614 | 644 | 50 | 200 SUCCESS |  |
| YC-2b | 영천 | PLAN | 177 | 225 | 96 | 5 | 5 | 200 SUCCESS |  |
| YC-3 | 영천 | RISK_FACILITY | 616 | 600 | 534 | 22 | 22 | 200 SUCCESS |  |
| YC-3b | 영천 | RISK_AREA | 687 | 728 | 608 | 644 | 50 | 200 SUCCESS |  |
| YC-4 | 영천 | SIMILAR_EVENT | 343 | 262 | 263 | 20 | 20 | 200 SUCCESS | 3위 (3) |
| YC-4b | 영천 | SIMILAR_EVENT | 278 | 322 | 193 | 20 | 20 | 200 SUCCESS | 3위 (3) |
| YC-5 | 영천 | SIMILAR_EVENT | 266 | 260 | 189 | 20 | 20 | 200 SUCCESS | 9위 (9) |
| YC-5b | 영천 | SIMILAR_EVENT | 263 | 320 | 185 | 20 | 20 | 200 SUCCESS | 9위 (9) |
| YC-6 | 영천 | RISK_FACILITY | 616 | 602 | 532 | 22 | 22 | 200 SUCCESS |  |
| YC-6 | 영천 | RISK_AREA | 714 | 750 | 608 | 644 | 50 | 200 SUCCESS |  |
| YC-6b | 영천 | RISK_FACILITY | 643 | 671 | 564 | 22 | 22 | 200 SUCCESS |  |
| YC-6b | 영천 | RISK_AREA | 700 | 713 | 614 | 644 | 50 | 200 SUCCESS |  |
| YC-7 | 영천 | RISK_AREA | 701 | 757 | 615 | 644 | 50 | 200 SUCCESS |  |
| YC-7 | 영천 | SIMILAR_EVENT | 261 | 268 | 177 | 20 | 20 | 200 SUCCESS | 3위 (3) |
| YC-7b | 영천 | PLAN | 230 | 175 | 95 | 5 | 5 | 200 SUCCESS |  |
| YC-7b | 영천 | RISK_AREA | 739 | 689 | 600 | 644 | 50 | 200 SUCCESS |  |

## 3. 문항별 기다림

기다림 = 그 문항의 자동 조회 호출 가운데 가장 느린 것(앱 `runPreview` 는 모두 받은 뒤 한꺼번에 돌려준다). 앱은 이 자동 조회와 작업 접수(DB 기록 + T3Q 제출, 재사용이면 DB 조회만)를 함께 기다린 뒤 접수 응답에 실어 보낸다(`app/src/app/api/agent/jobs/route.ts` 58~66행) — 화면에 뜨는 때는 이 표의 기다림보다 조금 늦을 수 있다.

질문 모음 = `library_id`. 앱은 질문 모음(`app/src/lib/library.ts`) 문항으로 보낸 질문에만 자동 조회를 붙인다(`route.ts` 57~58행, 2026-10-28 소스) — 「—」 문항은 질문 모음에 넣기 전에는 앱에서 자동 조회가 뜨지 않는다.

| id | 장면 | 역할 | 질문 모음 | 자동 조회 | 기다림 1차(ms) | 기다림 2차(ms) |
|---|---|---|---|---|---|---|
| BS-1 | ② 09:00 오늘 점검 대상 | main | — | RISK_FACILITY | 776 | 637 |
| BS-1b | ② 09:00 오늘 점검 대상 | alt | BS-01 | RISK_FACILITY | 680 | 611 |
| BS-2 | ③ 10:00 위험지구 지정 사유·정비계획 | main | — | RISK_AREA·PLAN | 731 | 721 |
| BS-2b | ③ 10:00 위험지구 지정 사유·정비계획 | alt | — | RISK_AREA·PLAN | 741 | 722 |
| BS-3 | ④ 11:00 통제·대피 기준 | main | — | PLAN | 184 | 173 |
| BS-3b | ④ 11:00 통제·대피 기준 | alt | — | RISK_FACILITY | 673 | 647 |
| BS-4 | ⑤ 13:30 과거 침수 이력과 근거 쪽 | main | — | FLOOD_TRACE·SIMILAR_EVENT | 590 | 311 |
| BS-4b | ⑤ 13:30 과거 침수 이력과 근거 쪽 | alt | — | SIMILAR_EVENT | 263 | 269 |
| BS-5 | ⑥ 14:30 그때의 피해·당시 조치 | main | — | SIMILAR_EVENT | 308 | 259 |
| BS-5b | ⑥ 14:30 그때의 피해·당시 조치 | alt | — | SIMILAR_EVENT | 271 | 265 |
| BS-6 | ⑦ 16:00 호우경보 가정 점검 | main | — | RISK_FACILITY·RISK_AREA | 852 | 721 |
| BS-6b | ⑦ 16:00 호우경보 가정 점검 | alt | LB-WARN-01 | RISK_FACILITY·RISK_AREA | 731 | 724 |
| BS-7 | ⑧ 17:30 퇴근 전 우선 점검 구역 | main | — | FLOOD_TRACE·SIMILAR_EVENT | 311 | 463 |
| BS-7b | ⑧ 17:30 퇴근 전 우선 점검 구역 | alt | — | FLOOD_TRACE·SIMILAR_EVENT | 315 | 367 |
| IJ-1 | ② 09:00 오늘 점검 대상 | main | IJ-02 | RISK_AREA | 701 | 701 |
| IJ-1b | ② 09:00 오늘 점검 대상 | alt | IJ-01 | RISK_AREA | 794 | 881 |
| IJ-2 | ③ 10:00 위험지구 지정 사유·정비계획 | main | — | RISK_AREA·PLAN | 711 | 741 |
| IJ-2b | ③ 10:00 위험지구 지정 사유·정비계획 | alt | — | RISK_AREA·PLAN | 1,030 | 772 |
| IJ-3 | ④ 11:00 통제·대피 판단 근거 | main | — | RISK_AREA | 683 | 701 |
| IJ-3b | ④ 11:00 통제·대피 판단 근거 | alt | LB-SLOPE-01 | RISK_AREA | 699 | 701 |
| IJ-4 | ⑤ 13:30 과거 피해 이력과 근거 쪽 | main | — | SIMILAR_EVENT | 483 | 268 |
| IJ-4b | ⑤ 13:30 과거 피해 이력과 근거 쪽 | alt | — | SIMILAR_EVENT | 389 | 272 |
| IJ-5 | ⑥ 14:30 그때의 피해·당시 조치 | main | — | SIMILAR_EVENT·FLOOD_TRACE | 363 | 355 |
| IJ-5b | ⑥ 14:30 그때의 피해·당시 조치 | alt | — | FLOOD_TRACE·SIMILAR_EVENT | 346 | 328 |
| IJ-6 | ⑦ 16:00 호우경보 가정 점검 | main | — | RISK_AREA | 726 | 811 |
| IJ-6b | ⑦ 16:00 호우경보 가정 점검 | alt | — | RISK_AREA | 710 | 695 |
| IJ-7 | ⑧ 17:30 퇴근 전 우선 점검 구역 | main | — | RISK_AREA | 709 | 700 |
| IJ-7b | ⑧ 17:30 퇴근 전 우선 점검 구역 | alt | — | RISK_AREA | 692 | 704 |
| IJ-8 | ⑥ 14:30 그때의 피해·당시 조치 | main | — | (없음) | - | - |
| IJ-8b | ⑥ 14:30 그때의 피해·당시 조치 | alt | — | SIMILAR_EVENT | 269 | 303 |
| YC-1 | ② 09:00 오늘 점검 대상 | main | — | RISK_AREA·PLAN | 697 | 689 |
| YC-1b | ② 09:00 오늘 점검 대상 | alt | LB-PLAN-01 | PLAN·RISK_AREA | 698 | 760 |
| YC-2 | ③ 10:00 위험지구 지정 사유·정비계획 | main | — | RISK_AREA·PLAN | 690 | 686 |
| YC-2b | ③ 10:00 위험지구 지정 사유·정비계획 | alt | — | RISK_AREA·PLAN | 694 | 734 |
| YC-3 | ④ 11:00 통제·대피 기준 | main | — | RISK_FACILITY | 616 | 600 |
| YC-3b | ④ 11:00 통제·대피 기준 | alt | YC-03 | RISK_AREA | 687 | 728 |
| YC-4 | ⑤ 13:30 과거 피해 이력과 근거 쪽 | main | — | SIMILAR_EVENT | 343 | 262 |
| YC-4b | ⑤ 13:30 과거 피해 이력과 근거 쪽 | alt | — | SIMILAR_EVENT | 278 | 322 |
| YC-5 | ⑥ 14:30 그때의 피해·당시 조치 | main | — | SIMILAR_EVENT | 266 | 260 |
| YC-5b | ⑥ 14:30 그때의 피해·당시 조치 | alt | — | SIMILAR_EVENT | 263 | 320 |
| YC-6 | ⑦ 16:00 호우경보 가정 점검 | main | — | RISK_FACILITY·RISK_AREA | 714 | 750 |
| YC-6b | ⑦ 16:00 호우경보 가정 점검 | alt | LB-WARN-01 | RISK_FACILITY·RISK_AREA | 700 | 713 |
| YC-7 | ⑧ 17:30 퇴근 전 우선 점검 구역 | main | — | RISK_AREA·SIMILAR_EVENT | 701 | 757 |
| YC-7b | ⑧ 17:30 퇴근 전 우선 점검 구역 | alt | — | PLAN·RISK_AREA | 739 | 689 |

## 4. 응답 내용(1차, 같은 본문끼리 묶음 — 응답 글자 그대로)

- **부산 · RISK_FACILITY** (BS-1·BS-1b·BS-3b·BS-6·BS-6b) — 건수 58 · 받은 행 50 · ms 776·680·673·623·614
  - 분류별: 지하차도(취약시설) 58
- **부산 · RISK_AREA** (BS-2·BS-2b·BS-6·BS-6b) — 건수 1,790 · 받은 행 50 · ms 731·741·852·731
  - 분류별: 자연재해위험개선지구 69 · 풍수해생활권 종합정비지구 3 · 붕괴위험지역(정비 중기계획) 24 · 홍수취약지구 59 · 급경사지 1,243 · 산사태취약지역 392
- **부산 · PLAN** (BS-2·BS-2b·BS-3) — 건수 4 · 받은 행 4 · ms 208·248·184
  - 계획: 자연재해위험개선지구 중기정비계획 · 풍수해생활권 종합정비 중기계획 · 붕괴위험지역 정비 중기계획(’26~’30) · 홍수취약지구 현황(2026)
  - warnings: REGION_NOT_APPLICABLE «하천기본계획은 152 에 행정구역 연결이 없어 지역으로 거르지 않았습니다 — river_code 로 고르세요.»
- **부산 · FLOOD_TRACE** (BS-4·BS-7·BS-7b) — 건수 370 · 받은 행 50 · ms 315·311·315
  - data_gaps: items[].max_depth_m NOT_IN_SOURCE
- **부산 · SIMILAR_EVENT** (BS-4·BS-4b·BS-7·BS-7b) — 건수 20 · 받은 행 20 · ms 590·263·285·312
  - 조건: {"region":{"admin_code":"2600000000","level":"SIDO","name":"부산광역시"},"disaster_types":["호우"],"period":{"from":"2020-07-23","to":"2020-07-25"},"detail":{"keywords":["2020년"]}}
  - 앞 3건: 2016년 7.31~8.1 호우(T10107-20160731-0001) · 2021년 08.25~08.25 호우(T10107-20210825-0001) · 2020년 7.10. 호우(T10107-20200710-0001)
  - 목표 사건 T10107-20200723-0001: 5위
  - data_gaps: similarity.factors.rain NOT_IN_SOURCE · similarity.factors.warning NOT_IN_SOURCE
  - warnings: SIMILARITY_NOTE «질의에 없는 요인(점수에서 빠짐): ['피해 규모', '인명피해', '기간']»
- **부산 · SIMILAR_EVENT** (BS-5·BS-5b) — 건수 20 · 받은 행 20 · ms 308·271
  - 조건: {"region":{"admin_code":"2600000000","level":"SIDO","name":"부산광역시"},"disaster_types":["호우"],"period":{"from":"2023-09-16","to":"2023-09-16"},"detail":{"keywords":["2023년"]}}
  - 앞 3건: 2021년 08.25~08.25 호우(T10107-20210825-0001) · 2016년 7.31~8.1 호우(T10107-20160731-0001) · 2017년 9.11~12 호우(T10107-20170911-0001)
  - 목표 사건 T10107-20230821-0001: 5위
  - data_gaps: similarity.factors.rain NOT_IN_SOURCE · similarity.factors.warning NOT_IN_SOURCE
  - warnings: SIMILARITY_NOTE «질의에 없는 요인(점수에서 빠짐): ['피해 규모', '인명피해', '기간']»
- **인제 · RISK_AREA** (IJ-1·IJ-1b·IJ-2·IJ-2b·IJ-3·IJ-3b·IJ-6·IJ-6b·IJ-7·IJ-7b) — 건수 847 · 받은 행 50 · ms 701·794·711·1,030·683·699·726·710·709·692
  - 분류별: 자연재해위험개선지구 21 · 풍수해생활권 종합정비지구 2 · 붕괴위험지역(정비 중기계획) 64 · 자연재해저감 종합계획 위험지구 138 · 급경사지 311 · 산사태취약지역 311
- **인제 · PLAN** (IJ-2·IJ-2b) — 건수 4 · 받은 행 4 · ms 199·244
  - 계획: 자연재해위험개선지구 중기정비계획 · 풍수해생활권 종합정비 중기계획 · 붕괴위험지역 정비 중기계획(’26~’30) · 자연재해저감 종합계획 시행계획(강원)
  - warnings: REGION_NOT_APPLICABLE «하천기본계획은 152 에 행정구역 연결이 없어 지역으로 거르지 않았습니다 — river_code 로 고르세요.»
- **인제 · SIMILAR_EVENT** (IJ-4·IJ-4b) — 건수 20 · 받은 행 20 · ms 483·389
  - 조건: {"region":{"admin_code":"5181000000","level":"SIGUNGU","name":"강원특별자치도 인제군"},"disaster_types":["태풍"],"period":{"from":"2023-08-09","to":"2023-08-11"},"detail":{"keywords":["2023년"]}}
  - 앞 3건: 2016년 12.21~24 태풍(T10105-20161221-0001) · 2023년 08.09.~08.11. 태풍(T10105-20230809-0001) · 2018년 8.6~7 호우(T10107-20180806-0001)
  - 목표 사건 T10105-20230809-0001: 2위
  - data_gaps: similarity.factors.rain NOT_IN_SOURCE · similarity.factors.warning NOT_IN_SOURCE
  - warnings: SIMILARITY_NOTE «질의에 없는 요인(점수에서 빠짐): ['피해 규모', '인명피해', '기간']»
- **인제 · SIMILAR_EVENT** (IJ-5·IJ-5b·IJ-8b) — 건수 20 · 받은 행 20 · ms 289·269·269
  - 조건: {"region":{"admin_code":"5181000000","level":"SIGUNGU","name":"강원특별자치도 인제군"},"disaster_types":["호우"],"period":{"from":"2020-07-28","to":"2020-08-11"},"detail":{"keywords":["2020년"]}}
  - 앞 3건: 2021년 07.09~07.09 호우(T10107-20210709-0001) · 2021년 07.15~07.15 호우(T10107-20210715-0001) · 2016년 7.31~8.1 호우(T10107-20160731-0001)
  - 목표 사건 T10107-20200728-0001: 14위
  - data_gaps: similarity.factors.rain NOT_IN_SOURCE · similarity.factors.warning NOT_IN_SOURCE
  - warnings: SIMILARITY_NOTE «질의에 없는 요인(점수에서 빠짐): ['피해 규모', '인명피해', '기간']»
- **인제 · FLOOD_TRACE** (IJ-5·IJ-5b) — 건수 112 · 받은 행 50 · ms 363·346
  - data_gaps: items[].max_depth_m NOT_IN_SOURCE
- **영천 · RISK_AREA** (YC-1·YC-1b·YC-2·YC-2b·YC-3b·YC-6·YC-6b·YC-7·YC-7b) — 건수 644 · 받은 행 50 · ms 697·698·690·694·687·714·700·701·739
  - 분류별: 자연재해위험개선지구 16 · 풍수해생활권 종합정비지구 3 · 붕괴위험지역(정비 중기계획) 5 · 홍수취약지구 6 · 급경사지 330 · 산사태취약지역 284
- **영천 · PLAN** (YC-1·YC-1b·YC-2·YC-2b·YC-7b) — 건수 5 · 받은 행 5 · ms 219·179·179·177·230
  - 계획: 자연재해위험개선지구 중기정비계획 · 풍수해생활권 종합정비 중기계획 · 붕괴위험지역 정비 중기계획(’26~’30) · 홍수취약지구 현황(2026) · 재해위험저수지 정비계획(’26~’30)
  - warnings: REGION_NOT_APPLICABLE «하천기본계획은 152 에 행정구역 연결이 없어 지역으로 거르지 않았습니다 — river_code 로 고르세요.»
- **영천 · RISK_FACILITY** (YC-3·YC-6·YC-6b) — 건수 22 · 받은 행 22 · ms 616·616·643
  - 분류별: 지하차도(취약시설) 2 · 재해위험저수지 20
- **영천 · SIMILAR_EVENT** (YC-4·YC-4b·YC-7) — 건수 20 · 받은 행 20 · ms 343·278·261
  - 조건: {"region":{"admin_code":"4723000000","level":"SIGUNGU","name":"경상북도 영천시"},"disaster_types":["태풍"],"period":{"from":"2022-09-03","to":"2022-09-07"},"detail":{"keywords":["2022년"]}}
  - 앞 3건: 2022년 09.17.~09.19. 태풍(T10105-20220917-0001) · 2022년 08.30.~08.31. 호우(T10107-20220830-0001) · 2022년 09.03.~09.07. 태풍(T10105-20220903-0001)
  - 목표 사건 T10105-20220903-0001: 3위
  - data_gaps: similarity.factors.rain NOT_IN_SOURCE · similarity.factors.warning NOT_IN_SOURCE
  - warnings: SIMILARITY_NOTE «질의에 없는 요인(점수에서 빠짐): ['피해 규모', '인명피해', '기간']»
- **영천 · SIMILAR_EVENT** (YC-5·YC-5b) — 건수 20 · 받은 행 20 · ms 266·263
  - 조건: {"region":{"admin_code":"4723000000","level":"SIGUNGU","name":"경상북도 영천시"},"disaster_types":["호우"],"period":{"from":"2024-07-08","to":"2024-07-10"},"detail":{"keywords":["2024년"]}}
  - 앞 3건: 2016년 7.31~8.1 호우(T10107-20160731-0001) · 2022년 08.30.~08.31. 호우(T10107-20220830-0001) · 2022년 11.22.~11.23. 호우(T10107-20221122-0001)
  - 목표 사건 T10107-20240708-0001: 9위
  - data_gaps: similarity.factors.rain NOT_IN_SOURCE · similarity.factors.warning NOT_IN_SOURCE
  - warnings: SIMILARITY_NOTE «질의에 없는 요인(점수에서 빠짐): ['피해 규모', '인명피해', '기간']»

## 5. demo_questions.json 모양 검사

| 구분 | 규칙 | 결과 |
|---|---|---|
| 필수 | id 중복 없음 | 통과 |
| 필수 | 질문 글 있음 | 통과 |
| 필수 | 지역 코드·이름 맞음(region ↔ query_context_draft.region, app/src/lib/t3q/region.ts PILOT_T3Q) | 통과 |
| 필수 | alt_of 가 있는 id 를 가리킴 | 통과 |
| 필수 | 조건 item = RAIN_1H·RAIN_3H·RAIN_24H·WATER_LEVEL·WIND_SPEED | 통과 |
| 참고 | id 앞자리 = 지역(BS·IJ·YC) | 통과 |
| 참고 | 자동 조회 종류 = preview.ts 5종 | 통과 |
| 참고 | 초안·detail 칸 = 앱이 보내는 칸만(빠지는 칸 없음) | 통과 |
| 참고 | 조건 이름·단위 = 조건 편집 창, 값 = 0 이상 수 | 통과 |
| 참고 | 재난유형 0~1개(조건 편집 창은 하나만 고른다) | 통과 |
| 참고 | 특보 단계 = 주의보·경보(조건 편집 창 선택지) | 통과 |
| 참고 | 기간 = YYYY-MM-DD(조건 편집 창 날짜 칸), 시작 ≤ 끝 | 통과 |
| 참고 | 역할 — main 은 alt_of 없음, alt 는 같은 지역·장면의 main 을 가리킴 | 통과 |
| 참고 | 질문 모음 문항(library_id) — library.ts 에 있고 지역·글·재난유형·자동 조회가 같음 | 통과 |

문항 44개 · id 는 모두 다름.
