# 개발서버 ↔ SEFTYAI 맞추기

- 개발서버: `kim-ji-woong/si-nia_ai-26-full` (.NET 백엔드 + Vite React 19 + Leaflet)
- SEFTYAI: 이 저장소 (Next.js 15 + Neon + OpenLayers)
- 방향(2026-11-06 결정): **좋은 기능은 유지하고 개발서버를 복제**한다. 응답 표시도 개발서버처럼 손본다.
- 기술 구성이 달라 코드 병합은 하지 않는다. 동작을 SEFTYAI 구조로 다시 구현한다.
- 기준 시점: 개발서버 main `32b0d17`(2026-11-04), kjw 브랜치 `998facb`(2026-11-05) → **2026-11-18 부터 `dev` 브랜치만 기준**(개인 브랜치는 보지 않음). 11/18 동기화 = `998facb..origin/dev`(`6ff5b1d`, R61~R63) → 11/24 동기화 = `6ff5b1d..origin/dev`(`38f179b`) — 근거문서 패널(Figma 208000)·쪽 글 규칙·데이터군 탭·상세 탭 정리·지도 말풍선·침수흔적 상세(T3Q-30)·특보 참조·기상정보문·observed_at·AI 모드 10분·접속 종료 모달·배포 후 새로고침. 다르게 둔 것: 질문 모음 DB(코드 유지)·같은 질문 답 재사용(R52 시연 모드 재사용 유지, 결정 대기)·weather_warnings 칸 이름(명세 v0.9)·기상정보문 상시 수집(질의 때만)·행정경계 색(WMS)
- 개발서버의 운영 규칙(AGENTS.md·Missions·.github CI·배포 스크립트)은 가져오지 않는다. 개발서버 저장소·DB·서버는 건드리지 않고 읽기만 한다

문서

| 파일 | 내용 |
|---|---|
| [comparison.md](comparison.md) | 화면·기능 대비표와 이식 차수 |
| [ours-better.md](ours-better.md) | **SEFTYAI가 더 나은 점** — 개발서버 역반영 검토용 |
