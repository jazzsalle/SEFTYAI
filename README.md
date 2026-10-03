# 재난안전 AI 데이터 구축 — 시범서비스 (유엔이)

> **이어서 작업할 때는 [`docs/HANDOFF.md`](docs/HANDOFF.md)부터 읽는다** — 현재 상태·동작 규칙·점검 방법·남은 일.
> 배포: https://safetyai-three.vercel.app (비공개 저장소, `main` 푸시 시 자동 배포)

행안부 · 부산광역시 · 영천시 · 인제군 풍수해 의사결정 지원 시범서비스.
승인 목업(`300. 시범서비스 화면설계 시연_261001`)의 화면 방향을 따르되, 발주처 의견(구체적 답변·대응절차·어디/왜/언제/무엇을·재난마스터 ID)을 기능으로 반영했다.

## 폴더
| 경로 | 내용 |
|---|---|
| `app/` | Next.js 15 서비스 (배포 루트) |
| `app/data/seed/` | 시드 데이터 (서버 전용) — 원본 가공본은 `data/seed/` |
| `app/public/data/` | 지도 GeoJSON (행정경계·하천·소하천구역) |
| `app/supabase/schema.sql` | Supabase 전환용 스키마 |
| `docs/design/` | **00_decisions.md (의사결정)**, **01_system_design.md (설계서)** |
| `docs/analysis/` | 요구사항·T3Q 상세항목·역량질문·데이터 인벤토리·매뉴얼·지자체 요구·GIS 분석 |
| `scripts/` | GIS·사건 데이터 가공 스크립트 |
| `seed_data/` | 발주처 수신 원천 자료 (수정 금지) |

## 실행
```bash
cd app
npm install
npm run dev            # http://localhost:3000
node scripts/golden.mjs  http://localhost:3000        # 골든 질문 22개 (AI 모드 켜짐 기준)
node scripts/wxref.mjs   http://localhost:3000        # 특보로 질문(참조 특보) 19개
node scripts/library.mjs http://localhost:3000 lib    # 추천 질문 · flow(연속 질의) · check(AI 점검)
```

## 환경변수 (선택 — 미설정 시 기본값/시연 응답 서버 사용)
| 변수 | 용도 |
|---|---|
| `NEXT_PUBLIC_VWORLD_KEY` | VWorld WMTS 키 (브라우저 노출 — **VWorld 콘솔에 서비스 도메인 등록 필요**) |
| `KMA_SERVICE_KEY` | 기상청 기상특보 조회서비스 키 (URL 인코딩된 일반 인증키) |
| `T3Q_AGENT_URL`, `T3Q_API_KEY` | 설정 시 `/api/agent/query`를 실 T3Q Agent로 프록시 |

## Vercel 배포
1. Vercel 프로젝트 Root Directory = `app`, Framework = Next.js (region은 `vercel.json`에서 `icn1`)
2. 환경변수 등록 (위 표)
3. 배포 도메인(예: `xxx.vercel.app`)을 **VWorld 인증키 서비스 URL에 추가** — 누락 시 지도가 OSM으로 자동 폴백되며 지도 좌상단에 안내 표시
4. 저장소가 **비공개**라 커밋 작성자 이메일이 GitHub 계정과 연결돼 있어야 배포된다 (이 저장소 git config: `183509977+jazzsalle@users.noreply.github.com`). 배포가 BLOCKED면 작성자 이메일부터 확인

## 시연 계정
로그인 화면에서 카드 클릭 : 행안부(검토용·전국) / 부산 bs_safety01 / 영천 yc_safety02 / 인제 ij_safety01
헤더의 녹색 **기상특보 데이터 [훈련 시나리오 | 실시간(기상청)]** 전환 — 기본은 훈련 시나리오(2026.10.2~ 호우, 가상), 실시간은 기상청 API 실연동.
