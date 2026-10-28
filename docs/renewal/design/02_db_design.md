# DB 설계서 — Neon Postgres (`sa_*`)

작성 2026-10-28 · 기존 표는 `app/src/lib/server/db.ts`의 `ensureSchema()`에 있다(보존). 신규 표도 같은 방식(`create table if not exists`)으로 추가한다. 시간은 모두 `timestamptz`.

## 1. 보존 표 (변경 없음)
| 표 | 용도 |
|---|---|
| `sa_contact_orgs` · `sa_contact_units` · `sa_contacts` · `sa_contact_groups` | 연락망 |
| `sa_dispatches` · `sa_dispatch_to` | 상황전파 발송·결과 |
| `sa_conversations` | 대화 이력(jsonb, 계정당 최대 60) — 턴은 `job_id` 참조로 바꾼다(아래 §3) |
| `sa_kv` | 계정·기관 설정(브리핑 세트, SOP 수정본 등) |
| `sa_checks` · `sa_check_history` | 대응절차 체크·지난 상황(30일) |
| `sa_trace` · `sa_audit` | 연계 추적로그·관리로그 |

**삭제**: `sa_conv_accounts`(시연 대화 시딩 표시) — 더 이상 쓰지 않는다. 표는 남겨 두고 코드만 제거한다.

## 2. 신규 표

### 2.1 `sa_accounts` — 계정 (R7)
| 열 | 형 | 설명 |
|---|---|---|
| id | text pk | `bs_safety01` 등 |
| name | text | 표시 이름 |
| org | text | busan · inje · yeongcheon · central · ops |
| role | text | LOCAL_GOV · CENTRAL_GOV · OPERATOR |
| admin_code | text | 기본 기준지역(10자리) · 전국은 null |
| pw_hash | text | `scrypt$N$r$p$salt$hash` |
| must_change_pw | boolean | |
| failed_count | int | 연속 실패 |
| locked_until | timestamptz | 5회 실패 시 +15분 |
| status | text | ACTIVE · DISABLED |
| created_at · last_login_at | timestamptz | |

### 2.2 `sa_sessions`
| 열 | 형 | 설명 |
|---|---|---|
| sid | text pk | 32바이트 랜덤(hex) |
| account_id | text | |
| created_at · last_seen_at · expires_at | timestamptz | 유휴 30분 슬라이딩, 절대 12시간 |
| revoked_at | timestamptz | 같은 계정 새 로그인·로그아웃 |
| ua_hash | text | |

### 2.3 `sa_agent_jobs` — 질의 작업 (R1)
| 열 | 형 | 설명 |
|---|---|---|
| id | text pk | 우리 작업 ID(uuid) |
| account_id | text | |
| conv_id | text | 우리 대화 ID(`sa_conversations`) |
| turn_no | int | |
| t3q_request_id | text | 매 제출마다 새 32hex = X-Request-Id |
| t3q_conversation_id | text | 완료 응답의 conversation_id |
| source | text | USER · BRIEFING · QUICK · SUGGEST · LIBRARY · FOLLOW_UP · AI_MODE (T3Q로는 enum 매핑) |
| library_id | text | 정의된 질문 ID(있으면) |
| question_user | text | 사용자가 본 질문 |
| question_sent | text | 실제 전송 질문 |
| request | jsonb | T3Q로 보낸 요청 본문 전체 |
| cache_key | text | idx |
| state | text | QUEUED · SUBMITTED · RUNNING · DONE · FAILED · CANCELLED · LOST · TIMEOUT |
| t3q_status | text | 봉투 status(SUCCESS 등) |
| http_status | int | |
| raw | jsonb | **T3Q 최종 봉투 원문(무가공)** |
| preview | jsonb | 자동 조회 Data API 원응답 배열 `[{api, path, request, response, ms}]` |
| geo | jsonb | EXT-01 FeatureCollection 원문 |
| cached_from | text | 캐시 적중 시 원작업 id |
| retry_of | text | LOST 자동 재제출 시 이전 작업 id |
| error_code | text | |
| created_at · submitted_at · last_polled_at · finished_at | timestamptz | |
| elapsed_ms | int | 접수~완료 |

인덱스: `(account_id, created_at desc)`, `(state) where state in ('QUEUED','SUBMITTED','RUNNING')`, `(cache_key, finished_at desc)`.
보존: 180일 후 `raw`·`preview`·`geo`를 비우는 정리 작업(운영자 화면 버튼과 크론).

### 2.4 `sa_feedback` — 답변 평가 (R12)
`job_id pk · account_id · response_id · rating(GOOD|BAD) · comment · t3q_result · rated_at`

### 2.5 `sa_ai_checks` — AI 모드 점검 이력 (R6)
`check_id pk · account_id · region_code · trigger(START|INTERVAL|WARNING_CHANGE) · warnings_snapshot jsonb(기상청 원문) · job_id · checked_at`

### 2.6 `sa_t3q_health`
`sa_kv`의 `sys:t3q_health` 키에 `{ok, version, checked_at}`를 저장한다(별도 표 없음).

## 3. 대화 이력 연결
- `sa_conversations.data.turns[]`는 이제 `{jobId, questionUser, source, createdAt}`만 담는다. 답은 `sa_agent_jobs.raw`에서 읽는다(중복 저장 없음).
- 이전 형식(구 AgentResponse를 담은 턴)은 "이전 버전 대화 — 표시 불가"로 표시하고 삭제만 허용한다(가정 응답이었으므로 마이그레이션하지 않음).

## 4. 용량 추정
답 1건 5~15KB + preview 5~30KB + geo 0~200KB(refs가 많을 때). 하루 300건이면 약 30~60MB/월. Neon 무료 0.5GB는 수개월 버틴다. 180일 정리로 상한을 관리한다.
