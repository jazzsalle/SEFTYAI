# 개발서버 ↔ SEFTYAI 맞추기

- 개발서버: `kim-ji-woong/si-nia_ai-26-full` (.NET 백엔드 + Vite React 19 + Leaflet)
- SEFTYAI: 이 저장소 (Next.js 15 + Neon + OpenLayers)
- 방향(2026-11-06 결정): **좋은 기능은 유지하고 개발서버를 복제**한다. 응답 표시도 개발서버처럼 손본다.
- 기술 구성이 달라 코드 병합은 하지 않는다. 동작을 SEFTYAI 구조로 다시 구현한다.
- 기준 시점: 개발서버 main `32b0d17`(2026-11-04), kjw 브랜치 `998facb`(2026-11-05)

문서

| 파일 | 내용 |
|---|---|
| [comparison.md](comparison.md) | 화면·기능 대비표와 이식 차수 |
| [ours-better.md](ours-better.md) | **SEFTYAI가 더 나은 점** — 개발서버 역반영 검토용 |
