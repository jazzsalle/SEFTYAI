# 02. Figma 디자인 시스템 분석 — 「26_과기부_nia_ai기반 안전관리분야 디지털트윈.fig」

> 원본: `seed_data/26_과기부_nia_ai기반 안전관리분야 디지털트윈.fig` (3.9MB, 디자이너 작업 중 파일, 2026-10-02 20:53Z export)
> 원본은 수정하지 않았고, 스크래치 복사본만 디코딩했습니다. 기계 판독용 토큰은 [`02_figma_tokens.json`](./02_figma_tokens.json)에 있습니다.
> 디코딩 방법: ZIP(`canvas.fig`, `meta.json`, `thumbnail.png`, `images/` 7개) → `canvas.fig`(`fig-kiwi` 헤더, 2청크, raw-deflate) → `kiwi-schema` + `pako` → `nodeChanges` 17,615개.
> 변수 별칭(alias) 체인은 라이브러리 key로 끝까지 따라가 최종 hex/px 값으로 풀었습니다.

## 0. 요약

- **KRDS 기반인가?** 예. 화면에서 쓰는 색 변수 5,361건 중 **5,219건(97%)이 KRDS 라이브러리**(`lk-210acbd3…`)를 가리킵니다. 이 라이브러리에는 KRDS 컬렉션(`primitive`·`mode`(light/high-contrast)·`semantic`·`responsive`)이 들어 있고, 공식 헤더 컴포넌트(`masthead__pc`, `header__pc`, `main_menu_*`)와 KRDS 텍스트 스타일도 함께 들어 있습니다. primary/50은 `#256EF4`, secondary/70은 `#063A74`, point는 `#D63D4A`입니다.
- **보조 라이브러리 "LibB"**(`lk-a6210c29…`, Spoqa Han Sans Neo 폰트, light-blue `#3C69FC`)도 연결되어 있습니다. 다만 Button·Input·Badge·Avatar·Checkbox·Table cell 마스터와 지도 마커 아이콘 색(success `#1D792B`, warning `#FC6B19`)에만 쓰이고, **화면 본문은 KRDS를 따릅니다**.
- **폰트:** 화면 텍스트 1,722개가 Pretendard입니다(Regular 400과 Bold 700 두 굵기만 사용). 줄높이는 1.5, 자간은 0입니다.
- **규모:**
  - 페이지(Canvas) 8개: 콘텐츠 7개와 `Internal Only Canvas` 1개
  - Section 17개
  - 화면 프레임 39개(모두 1920×1080)
  - 컴포넌트 변형(SYMBOL) 1,840개, 컴포넌트 세트 58개(로컬 컴포넌트는 4개)
  - 인스턴스 6,273개, 변수 532개(14개 컬렉션), 스타일 43개(텍스트 34, 채우기 7, 효과 1, 기타)

![thumbnail](./figma_assets/thumbnail.png)

## 1. 페이지 / 섹션 / 화면 인벤토리

| 페이지 | 섹션 | 화면 프레임 (1920×1080) |
|---|---|---|
| **100000 통합 탐색** | 1. 재난상황 조건 설정 | SCR-UNE-101001 기준지역 설정 패널_기본 · [데이터 변형] 조건 적용 후 · 101002 상황 상세정보 모달_기본 · 101003 기상·수문 관측값 영역_기본 |
| | 2. Agent 대화 | 102001 Agent 대화 패널_기본 / _응답 대기 / _데이터없음 · 102002 추천 질문 영역 · 102003 Agent 참조대상 관리 영역_기본 / _데이터없음 · 102004 답변 평가 사유 선택 팝오버 · 102005 적용조건 요약 팝오버 |
| | 3. 지도 뷰어 | 103001 지도 뷰어_기본 / _로딩 / _에러 · 103002 조회결과 레이어 제어 패널_기본 / _데이터없음 |
| **200000 조회결과 목록** | 1. 데이터군별 조회결과 | 201001 데이터군별 조회결과 패널 · 201002 유사사례 목록 (기본/로딩/데이터없음/에러/필터 0건/정렬·필터 펼침) · 201003 법정·계획상 위험·취약지역 목록 (기본/데이터없음) · 201004 잠재 위험요소·취약시설 목록 (기본/데이터없음) · 201005 계획지식 목록 (기본/데이터없음) — 섹션 밖에 301001 사본 1개와 참조 이미지 `image 3`가 있음 |
| **300000 상세 조회** | 1. 재난사건 상세 | 301001 재난사건 상세 패널 · 301003 사건 이력정보 · 301004 상황보고서 요약 · 301005 재난사건 연관 객체 (주석 라벨에 "유사도 근거·영향요인 비교 패널"이 있으나 프레임은 없음) |
| | 2. 위험·취약 객체 상세 | *(주석 라벨만 있고 프레임 없음)* |
| | 3. 계획지식 상세 | *(라벨만 있음: 계획지식 상세 패널, 계획지식 근거 패널)* |
| **400000 근거·영상** | 1. 근거문서 | 401001 근거문서 목록 패널_기본 / _답변 근거 · 401002 근거문서 원문 뷰어 |
| | 2. 위성영상 | 402001 위성영상 비교 뷰어 |
| **500000 대화·질문세트 관리** | 1. 대화 이력 · 2. 질문세트 | *(라벨만 있음: 대화 이력 목록/상세, 질문세트 목록·등록수정 모달·실행 결과 패널)* |
| **600000 계정·인증** | 1. 로그인 · 2. 계정 발급 · 3. 계정 관리 | *(라벨만 있음: 로그인, 초기 비밀번호 변경 모달, 계정 신청 목록, 계정 발급 모달, 계정 목록/상세/관리이력)* |
| **700000 운영·공통** | 1. 연계 추적로그 · 2. 공통 프레임·상태 · 3. 접근성·웹표준 | *(라벨만 있음: 추적로그 목록/상세, 공통 GNB·세션, 요청·데이터 상태 공통, 연계 오류 안내 모달, 온라인 도움말, 접근성/웹표준·보안)* |
| Internal Only Canvas | — | 로컬 컴포넌트(`modal__form` 760×296, `본문/상황 상세정보` 680×562, `본문/빈 슬롯`), 변수와 스타일 정의 |

화면 ID 규칙은 `SCR-UNE-{페이지}{섹션}{순번}_{화면명}_{상태}`이고, 상태는 기본/로딩/데이터없음/에러/응답 대기입니다. 실제 프레임이 있는 페이지는 **100–400번대**뿐이고, 500–700번대는 아직 와이어 단계 전입니다(WIP).
팝오버 프레임 이름에 "평가 사유 선택 [미정 2건 — 확인 필요]"가 남아 있어, 디자이너가 확인해야 할 미결 사항이 있습니다.

## 2. 핵심 레이아웃 (모든 화면 공통 셸)

```
┌ masthead__pc 1920×32  (#EEF2F7, 좌우 패딩 24) ── KRDS "이 누리집은 대한민국 공식 전자정부 누리집입니다"
├ header__pc   1920×76  (#FFFFFF, 패딩 12/24, 우측 "홍길동님 환영합니다" 17px)      → 헤더 합계 108px
│ (main_menu 56px 바와 312px 펼침 메뉴는 헤더 프레임 밖에 숨김 처리)
└ 워크스페이스 1920×972 (#F4F5F6, 가로 배치)
   ├ LNB 패널(대화 목록) 280px  #FFFFFF, 패딩 16/20
   │   ├ [새 대화] 버튼 239×48, r6 (홈: secondary-fill #ECF2FE / 대화 중: primary #256EF4)
   │   ├ 목록 제목 "최근 대화" 66px(위 패딩 32) → ListItem 48px × n
   │   └ 목록 제목 "질문세트" → ListItem 48px × n
   ├ 좌측 본문(대화) 838px, 패딩 12/24, 간격 12
   │   ├ 대화 헤더 57px (제목 · 참조대상)
   │   ├ 대화 스크롤 영역 (간격 16) — 사용자 말풍선 #ECF2FE r12, 최대 560px, 패딩 12/16
   │   └ 질의 입력 바 790×162, #FFFFFF r12, 패딩 24, 간격 12
   └ 우측 패널(분리형) 800px, 위아래 패딩 12
       └ 조회결과 패널 784×942, #FFFFFF r12, 그림자 0 4 16 rgba(15,20,28,.10)
           ├ 탭 바 48px (tab__closable 114~217px: "지도" 고정 탭 + 동적 결과 탭, 각 탭 닫기 가능, 우측 전체화면 버튼 24×32)
           └ 지도 캔버스 782×852 (#EEF2F7 / 임시 배경지도 #EFF1F3)
```

- **홈(101001 "AI 질문 시작"):** 1640px 영역 가운데에 1240px 컬럼이 있습니다(상단 패딩 40, 간격 20). 인트로("어떤 재난상황을 살펴볼까요?" 32–36px Bold)가 있고, 그 아래 "조건과 질문 · 통합 입력" 카드(1240×474, r12, 그림자 0 6 24 rgba(38,89,166,.12)), 출처 안내, 추천 질문(242px) 순서로 놓입니다.
- **지도 팔레트(임시 배경지도):**

  | 요소 | 색 |
  |---|---|
  | 산지 | `#E3ECE0` / `#D6E4D2` |
  | 시가지 | `#F4F0E8` |
  | 수계 | `#B0CEE5` (라벨 `#6E94B4`) |
  | 지명 라벨 | `#6C757F` 11px, 시 단위 `#4E565F` 14px |
  | 도로 라벨 | `#A07C3C` 9.5px |

  마커는 선택 `#256EF4` 26px(강조 링 48px), 위험 `#DE3412` 18px, 주의 `#FC6B19`, 정상 `#1D792B`이고, 그림자는 0 1 3 rgba(0,0,0,.18)입니다. 마커 라벨은 흰 배경, r4, 패딩 2/8, 13px입니다.
- **지도 컨트롤(확대/축소/레이어 버튼, 기준지역 라벨):** 그림자 0 2 6 rgba(0,0,0,.10). 선택 객체 카드는 0 2 8 rgba(0,0,0,.12), 레이어 제어 패널과 팝오버는 0 6 20 rgba(38,89,166,.16)입니다.
- **근거문서 패널 참조 이미지(`image 3`):** 탭 바 아래에 문서 제목(24 Bold)과 아웃라인 배지가 있고, "인용 근거 N건" 섹션, 페이지 태그(p.142, primary 아웃라인), 인용문 박스(#F4F5F6), "원문 보기 ↗" 3차 버튼, "해당 쪽 보기 >" 링크가 이어집니다.

  ![근거문서 패널 참조](./figma_assets/ref_evidence_panel_1122x1402.png)

- 기타 자산: [`logo_une_512.png`](./figma_assets/logo_une_512.png)(U&E 회사 로고, LNB/로고 자리 표시용), `ref_evidence_panel_281x351.png`(같은 참조 이미지의 축소본). 라이브러리 Avatar 자리 이미지(만화 캐릭터) 2장과 4096px 중복 로고는 대표성이 없어 복사하지 않았습니다.

## 3. 컴포넌트

| 라이브러리 | 컴포넌트 세트 (변형 수) |
|---|---|
| **KRDS** | `button` (120: Type primary/secondary/tertiary/text × Size × State), `badge` (108), `button_link` (45), `icon` (42), `ListItem` (30, selected · size lg(56) · state), `icon_size` (18), `selectbox` (18), `text_input` (18), `tag` (18), `button_text` (16), `tab__atomic` (15, primary/line), `pagination__atomic` (14), `checkbox__item` (12), `select_text` (9), `chip__multi` (9), `input_message__atomic` (8), `accordion` (8), `alert` (8), `text_area` (6), `header_menu__atomic` (6), `header__pc` (6), `progress_bar` (6), `main_menu_bar__atomic__pc` (4), `card` (4), `main_menu_open_*` (7), `spinner` (3), `tag__list` (3), `Slot` (3), `Empty(빈 화면)` (3), `Skeleton` (3), `masthead__pc` (2), `badge__dot` (2), `header_utility_small__atomic` (2), `logo`, `slogan`, `bullet`, `dummy-image` |
| **LibB (Spoqa)** | `Button` (300: variant fill/outline/ghost × color × size md(40)… × state), `Icon Button` (300), `Badge` (300: solid-pastel 등 × shape × intent × size), `Input` (112), `Avatar` (48), `Checkbox` (45), `Header cell` (36), `Body cell` (6), `Avatar Edit Button` (16), `Icon` (15), `가변 아이콘` (8), `DotBadge` (8), `Body/Header Slot` |
| 아이콘 라이브러리 | `icon20` (51) |
| **로컬** | `tab__closable (임시 · 닫기 가능한 탭)` 114×48, `modal__form` 760×296, `본문/상황 상세정보` 680×562, `본문/빈 슬롯` 880×24 |

인스턴스 사용량 상위는 `가변 아이콘`(1,370), `main_menu_open_last_depth`(1,170), `button`(607), `ListItem`(312), `DotBadge`(300), `main_menu_bar`(287), `icon_size`(188)입니다.

## 4. 디자인 토큰

### 4.1 색상 — KRDS primitive (light)

| 계열 | 5 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 95 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| gray (0=#FFFFFF, 100=#000000) | #F4F5F6 | #E6E8EA | #CDD1D5 | #B1B8BE | #8A949E | #6D7882 | #58616A | #464C53 | #33363D | #1E2124 | #131416 |
| primary | #ECF2FE | #D8E5FD | #B1CEFB | | | **#256EF4** | #0B50D0 | #083891 | | | |
| secondary | #EEF2F7 | #D6E0EB | | | | | | **#063A74** | #052B57 | | |
| point | #FBEFF0 | | | | | #D63D4A | #AB2B36 | | | | |
| danger | #FDEFEC | #FCDFD9 | | | | #DE3412 | #BD2C0F | | | | |
| warning | #FFF3DB | #FFE0A3 | | #FFB114 | | #9E6A00 | #8A5C00 | | | | |
| success | #EAF6EC | #D8EEDD | | | | #228738 | #267337 | | | | |
| information | #E7F4FE | #D3EBFD | | | | #0B78CB | #096AB3 | | | | |

high-contrast 모드 팔레트도 함께 정의되어 있습니다(JSON의 `krds.primitiveHighContrast`, `semanticColor[*].highContrast` 참고).

### 4.2 색상 — KRDS semantic (화면 사용 빈도순)

| 토큰 | 값 | 사용 |
|---|---|---|
| color/action/secondary | transparent | 1,640 |
| color/text/subtle | #464C53 (gray/70) | 649 |
| color/surface/white | #FFFFFF | 645 |
| color/text/basic | #1E2124 (gray/90) | 562 |
| color/button/tertiary-fill | transparent | 431 |
| color/text/primary | #0B50D0 (primary/60) | 146 |
| color/icon/danger | #DE3412 | 142 |
| color/surface/secondary-subtler | #EEF2F7 | 97 |
| color/divider/gray-light | #CDD1D5 | 91 |
| color/button/secondary-fill | #ECF2FE | 81 |
| color/border/primary | #256EF4 | 79 |
| color/button/primary-fill (hover #0B50D0 · pressed #083891) | #256EF4 | 74 |
| color/surface/primary-subtler | #ECF2FE | 57 |
| color/surface/gray-subtler · background/gray-subtler | #F4F5F6 | 88 |
| color/action/secondary-active (선택 탭·활성 상태) | **#063A74** | 43 |
| color/text/bolder | #131416 | 23 |
| color/input/border | #58616A | (테두리 437) |
| color/border/gray · disabled | #B1B8BE | |
| color/text/disabled · disabled-on | #8A949E · #6D7882 | |
| color/text/danger · warning · success · information · point | #BD2C0F · #8A5C00 · #267337 · #096AB3 · #AB2B36 | |
| color/element/warning (아이콘·배지 채움) | #FFB114 | |
| color/link/visited | #5917B8 | |
| color/element/logo-text | #575756 | |

가장 많이 쓰인 테두리 색은 `#CDD1D5`(514), `#58616A`(437), `#256EF4`(180), `#B1B8BE`(48)입니다.

### 4.3 타이포그래피 (KRDS 텍스트 스타일, Pretendard, 줄높이 1.5, 자간 0)

| 스타일 | size / weight | 화면 사용 |
|---|---|---|
| heading/large | 32 / 700 (자간 1px) | 5 |
| heading/medium · navigation/title-medium | 24 / 700 | – |
| heading/small · navigation/title-small | 19 / 700 | 49 |
| heading/xsmall · navigation/depth-medium-bold · body/medium-bold | 17 / 700 | 245 + 37 |
| body/large · label/large | 19 / 400 | – |
| body/medium · label/medium · navigation/depth-medium | 17 / 400 | 54 |
| body/small · label/small | 15 / 400 | 225 + 95 |
| body/small-bold | 15 / 700 | 150 |
| body/xsmall · label/xsmall | 13 / 400 | **518** + 24 |
| underline/large·medium·small·xsmall | 19·17·15·13 / 400 + 밑줄 | – |

- 반응형(pc/mobile) 값: heading/large는 32→24, heading/medium은 24→22로 줄고, 나머지는 같습니다.
- 스타일 밖 크기: 12px(발신자명, 문서 메타 등)과 9.5–14px(지도 라벨만)이 있습니다.
- 실제 화면의 굵기는 Regular 400(1,143)과 Bold 700(579) **두 가지뿐**입니다.
- LibB 스타일(Spoqa Han Sans Neo, 자간 -3%, px 줄높이: 32/48, 24/36, 20/32, 16/24, 14/20, 12/18)은 라이브러리 컴포넌트 안에서만 쓰입니다.

### 4.4 Radius / Spacing / Size / Border

| 구분 | 내용 |
|---|---|
| radius (KRDS semantic) | xsmall 2 · small 4 · medium1·2 6 · medium3·4 8 · large2 10 · xlarge 12 · max 1000 |
| radius 실사용 빈도 | **6 (1,883)** › 4 (1,296) › 8 (962) › pill 1000 (724) › 12 (213) › 2 (158) › 16 (10) |
| spacing scale (number) | 2 · 4 · 6 · 8 · 10 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 56 · 64 |
| gap 실사용 | 4 (2,754) · 8 (2,745) · 2 (705) · 16 (433) · 12 (368) · 24 (76) · 40 (32) |
| padding 실사용 | 8/10 · 12/0 · 16/0 · 16/12 · 12/8 · 24/24 · 24/12 · 20/16 |
| size-height (컨트롤 높이) | 20 · 24 · 32 · 40 · 48 · 56 · 64 (ListItem lg 56, LNB 항목 48, 버튼 xlarge 56 / large 48) |
| 카드 패딩 (responsive) | medium 32/24 · small 24/20 |
| 이미지·텍스트 간격 | 24/20 |
| border-width | 1 (2,409) · 2 (306). high-contrast 모드에서 variable-regular 1→2, variable-medium 2→3 |

### 4.5 그림자 / 효과

| 이름 (용도) | 값 |
|---|---|
| marker | `0 1px 3px rgba(0,0,0,.18)` |
| map control | `0 2px 6px rgba(0,0,0,.10)` |
| overlay card | `0 2px 8px rgba(0,0,0,.12)` |
| side panel | `0 4px 16px rgba(15,20,28,.10)` |
| popover / layer panel | `0 6px 20px rgba(38,89,166,.16)` |
| hero 입력 카드 | `0 6px 24px rgba(38,89,166,.12)` |
| focus (LibB) | `0 0 0 2px #C2D3FF` |

### 4.6 그리드

- 5단 stretch 그리드(gutter 20, margin 0)가 22개 프레임에 적용되어 있습니다.
- 8단 min 그리드(컬럼 64, gutter 24, offset 40)가 3개 프레임에 적용되어 있습니다.
- 화면 셸은 그리드 대신 280 / 838 / 800 고정 폭 분할을 씁니다.

### 4.7 참고: 쓰이지 않는 레거시 로컬 채우기 스타일

`primary-50 #246BEB`, `primary-60 #1D56BC`, `primary-5 #EFF5FF`, `secondary-50 #003675`, `gray-80 #2D2D2D`, `gray-20 #E4E4E4`가 남아 있습니다. 구 KRDS 초안 값으로 보이며, 화면은 KRDS 변수를 쓰고 있어 무시해도 됩니다.

## 5. 앱 반영 권고 (`app/src/app/globals.css` :root 대비)

| 앱 토큰 | 현재 | Figma (KRDS) | 판정 | 권고 |
|---|---|---|---|---|
| --c-primary | #256ef4 | primary/50 #256EF4 | ✅ 일치 | 유지 |
| --c-primary-dk | #0b50d0 | primary/60 #0B50D0 | ✅ | 유지. `--c-primary-dkr: #083891;`(pressed) 추가 |
| --c-primary-sub | #ecf2fe | primary/5 #ECF2FE | ✅ | 유지 |
| --c-primary-bd | #b9cff9 | primary/20 #B1CEFB (primary/10 #D8E5FD = border/primary-light) | ❌ | `--c-primary-bd: #d8e5fd;` (연한 테두리 용도). 진한 테두리가 필요하면 `#b1cefb` |
| **--c-navy** | **#17223b** | secondary/70 **#063A74** (action/secondary-active, 선택 탭) | ❌ KRDS에 없는 색 | `--c-navy: #063a74;` |
| --c-navy-2 | #2d4670 | secondary/80 #052B57 | ❌ | `--c-navy-2: #052b57;` (+ `--c-sec-bd: #d6e0eb;` secondary/10) |
| --c-text | #1e2124 | text/basic #1E2124 | ✅ | 유지. `--c-text-strong: #131416;`(text/bolder) 추가 |
| --c-sub | #464c53 | text/subtle #464C53 | ✅ | 유지 |
| --c-mute | #6d7580 | gray/50 #6D7882 | ⚠️ 근소 차 | `--c-mute: #6d7882;` |
| --c-dis | #8a949e | text/disabled #8A949E | ✅ | 유지 |
| --c-bg | #f4f5f6 | gray/5 #F4F5F6 | ✅ | 유지 |
| --c-surface | #fafbfc | 대응 토큰 없음 | ⚠️ | `--c-surface: #f4f5f6;`(gray-subtler)로 통일하거나 #fff 사용. 유지한다면 KRDS 외 값임을 주석으로 표시 |
| --c-sec-sub | #eef2f7 | secondary/5 #EEF2F7 | ✅ | 유지 |
| --c-line | #edeff1 | gray/10 #E6E8EA (divider 계열 최소값) | ❌ | `--c-line: #e6e8ea;` |
| --c-bd | #cdd1d5 | gray/20 #CDD1D5 (divider/gray-light) | ✅ | 유지 |
| --c-bd-gray / --c-input-bd | #b1b8be / #58616a | border/gray #B1B8BE · input/border #58616A | ✅ | 유지 |
| --c-dang | #de3412 | danger/50 #DE3412 | ✅ | 유지 |
| --c-dang-dk | #a5271b | danger/60 #BD2C0F (text/danger) | ❌ | `--c-dang-dk: #bd2c0f;` |
| --c-dang-sub | #fdeceb | danger/5 #FDEFEC | ⚠️ | `--c-dang-sub: #fdefec;` (+ `--c-dang-bd: #fcdfd9;`) |
| --c-warn | #ffb114 | warning/30 #FFB114 (element/warning) | ✅ | 유지 (채움 전용. 텍스트에 쓰면 대비 부족) |
| --c-warn-dk | #8a5a00 | warning/60 #8A5C00 | ⚠️ | `--c-warn-dk: #8a5c00;` (+ `--c-warn-bd: #9e6a00;` warning/50) |
| --c-warn-sub | #fff6e0 | warning/5 #FFF3DB | ⚠️ | `--c-warn-sub: #fff3db;` |
| --c-ok / --c-ok-sub | #228738 / #e8f5eb | success/50 #228738 · success/5 #EAF6EC | ⚠️ sub | `--c-ok-sub: #eaf6ec;` (+ `--c-ok-dk: #267337;`) |
| --c-info / --c-info-sub | #0b78cb / #e7f3fc | information/50 #0B78CB · /5 #E7F4FE | ⚠️ sub | `--c-info-sub: #e7f4fe;` (+ `--c-info-dk: #096ab3;`) |
| --c-purple / --c-teal | #6f4bd8 / #0f9d8a | 없음 (KRDS 외. link/visited #5917B8, point #D63D4A만 있음) | ⚠️ | 데이터군 구분색이 꼭 필요할 때만 유지. 그 외에는 `--c-point: #d63d4a;` 추가 검토 |
| (없음) 지도 마커 | – | 주의 #FC6B19 · 정상 #1D792B (LibB) | ➕ | `--c-mk-warn: #fc6b19; --c-mk-ok: #1d792b;` 지도 전용으로 추가 |
| --r-s/m/l/xl | 4/6/8/12 | 4/6/8/12 (사용 빈도 6 > 4 > 8 > 12) | ✅ | 유지. `--r-xs: 2px; --r-pill: 999px;` 추가 (pill 724건) |
| --f | Pretendard | Pretendard 400/700 | ✅ | 유지 (500/600 사용은 지양) |
| --fs-2xs | 12 | KRDS 스타일 없음 (12px는 메타 텍스트에만 소수 사용) | ⚠️ | 유지하되 메타 전용. 일반 최소 크기는 13 |
| --fs-xs / s / m / hs / hm | 13/15/17/19/24 | 13/15/17/19/24 | ✅ | 유지 |
| --fs-hl | 28 | heading/large 32 | ❌ | `--fs-hl: 32px;` |
| body line-height | 1.55 | 1.5 | ⚠️ | `line-height: 1.5;` |
| **body letter-spacing** | -0.01em | 0 (KRDS 전체) | ❌ | `letter-spacing: 0;` |
| --shadow-1 | 2중 navy 그림자 | panel 0 4 16 rgba(15,20,28,.10) | ❌ | `--shadow-1: 0 4px 16px rgba(15,20,28,.10);` · `--shadow-ctl: 0 2px 6px rgba(0,0,0,.10);` |
| --shadow-2 | 0 8 28 navy .16 | popover 0 6 20 rgba(38,89,166,.16) | ❌ | `--shadow-2: 0 6px 20px rgba(38,89,166,.16);` · `--shadow-hero: 0 6px 24px rgba(38,89,166,.12);` |
| **--hdr-h** | 64 | masthead 32 + header 76 = 108 | ❌ | `--masthead-h: 32px; --hdr-h: 76px;` 추가 후 KRDS 공식 배너 행 도입 (정부 누리집 필수 요소) |
| (없음) 레이아웃 | .chatcol 46% / max 860 | LNB 280 · 대화 838 · 우측 패널 800(카드 784, r12) · 탭 바 48 | ➕ | `--lnb-w: 280px; --chat-w: 838px; --panel-w: 800px; --tab-h: 48px;` |
| 선택 탭/토글 배경 | var(--c-navy) | 탭은 line 스타일(primary 밑줄 #256EF4, 텍스트 primary/60). secondary-active #063A74는 채움 버튼에 사용 | ⚠️ | `.restabs .on`, `.subtabs .on`은 navy 채움 대신 `color: var(--c-primary-dk); box-shadow: inset 0 -2px var(--c-primary)` 검토 |
| 사용자 말풍선 / 입력 바 | – | 말풍선 #ECF2FE r12 · 입력 바 흰색 r12 패딩 24 | ✅ 대체로 일치 | `.composer`의 1.5px primary 테두리는 Figma에 없음(그림자만 있음). `border: 1px solid var(--c-bd)`로 맞출지 검토 |

**우선순위 Top 5**
1. `--c-navy: #063a74; --c-navy-2: #052b57;` — 비 KRDS 색 제거 (globals.css에서 --c-navy 참조 약 10곳)
2. `--masthead-h: 32px; --hdr-h: 76px;` — KRDS 공식 헤더 구조(합계 108px). 레이아웃 변수 `--lnb-w: 280px; --panel-w: 800px; --tab-h: 48px` 추가
3. body `letter-spacing: 0; line-height: 1.5;` · `--fs-hl: 32px`
4. 상태 보조색 정합: `--c-dang-dk: #bd2c0f; --c-dang-sub: #fdefec; --c-warn-dk: #8a5c00; --c-warn-sub: #fff3db; --c-ok-sub: #eaf6ec; --c-info-sub: #e7f4fe; --c-mute: #6d7882; --c-line: #e6e8ea; --c-primary-bd: #d8e5fd;`
5. 그림자 교체: `--shadow-1: 0 4px 16px rgba(15,20,28,.10); --shadow-2: 0 6px 20px rgba(38,89,166,.16);`, 그리고 `--r-pill: 999px; --r-xs: 2px` 추가

> `globals.css`는 이 문서에서 수정하지 않았습니다. 위 권고는 반영 결정용입니다.
