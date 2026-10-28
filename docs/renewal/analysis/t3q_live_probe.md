# T3Q 실서버 실측 (2026-10-28 00:43 KST, 개발 서버 v0.3.0)

원 기록: `app/harness/recordings/probe_2026-10-27T15-44-38-726Z.json` (하네스 `harness/t3q/probe_async.mjs`)

## 1. 응답 시간
| 호출 | 결과 | 시간 |
|---|---|---|
| `GET /health` | ok 0.3.0 | <1s |
| `POST /similar-events/search` (Data API) | SUCCESS | 0.6s(서버 elapsed) / 0.9s(왕복) |
| `GET /suggested-questions` | 6건 | 0.28s |
| Agent ASYNC × 3 **동시** (부산·인제·영천) | 3건 모두 SUCCESS | 78s · 96s · 127s (전체 127s) |

→ **동시 3건은 직렬화되지 않고 병렬로 처리된다**(합 301s 대비 전체 127s). 1건당 1~2분이 기본값이다.

## 2. Agent 응답 실제 모습
- `result` 키: `response_id, question, question_source, answer, answer_format(MARKDOWN), entities, result_groups, evidence_refs, follow_up_questions, refs, conversation_title, limitations, context_used`
- 봉투 최상위에 `conversation_id`(`CONV-YYYYMMDD-xxxxxx`), `turn_no`
- **`entities` · `result_groups` · `evidence_refs` · `follow_up_questions` 는 3건 모두 빈 배열** → 구조화 데이터는 사실상 `answer`(마크다운)와 `refs` 뿐
- `limitations` 는 고정 문구 `["유사사례는 예측·위험판단이 아닌 참고 정보"]`
- `context_used` 는 빈 값 → 조건이 어떻게 반영됐는지 응답으로는 알 수 없음
- `refs`: 위치 대상이 있는 답(인제 급경사지)만 17건, `#ref:` 표지 27회(고유 17) — 표지 수와 `refs` 가 정확히 일치. 나머지 두 답은 `refs` 0
- `answer` 는 1,900~3,400자 마크다운. `### 결론` 으로 시작하는 경향이 있으나 번호 붙임·제목은 답마다 다르다(구조가 일정하지 않음 → 절 단위 파싱·재배치 금지 근거)
- 표(GFM table), 굵게, 인용(`>`), 목록, `---` 구분선, 인라인 코드(`disaster.recovery_item` 같은 DB 표 이름) 포함

## 3. 설계에 주는 함의
1. 스트리밍이 없고 1~2분이 걸린다 → **대기 경험 설계가 핵심**(질문 큐·병렬 질의·완료순 표시·Data API 선표출·캐시).
2. 응답 구조칸이 비어 있으므로 화면은 **마크다운 원문 렌더 + refs 칩/지도**를 중심으로 한다. 구조칸이 채워지면 그대로 추가로 보여 준다.
3. Data API 는 1초 안팎·결정론적이다 → 질문 유형을 확정할 수 있을 때 먼저 보여 줄 수 있다(단, 에이전트 답과 섞지 않고 출처를 분리).
4. `T3Q-03` 추천 질문은 지역 무관 고정 6건 → 부산·인제·영천용 질문은 우리가 역량질문 패턴으로 만들어 제공해야 한다.
