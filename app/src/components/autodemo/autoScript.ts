// 자동 시연 대본 — 행안부 국장 보고용(5차안 2026-11-04: 담당자가 왜 그 정보를 보는가). 개발서버(kjw 998facb) features/demoMode/autoScript.ts 복제(R54).
//
// 원칙(사용자 지시 2026-11-05):
// - 국장은 실무자가 아니다. 응답 글의 세부(건수·지구명·수치)는 읽지 않는다.
// - 본 사업의 목적과 기대효과 관점으로 말한다. 다만 「흩어진 데이터 연결 · 판단을 돕는다」 같은
//   누구나 아는 말은 쓰지 않는다(사용자 지시 2026-11-05). 장면마다 구체적인 효과 하나씩만 맡긴다.
// - 결정은 사람이 한다 — 서비스가 «정해 준다»고 과장하지 않는다.
// - 미리 받아 둔 답을 보이므로 "지금 AI 가 답했다"고 말하지 않는다. 다만 «미리 받았다»는 말도 하지 않는다(사용자 지시 2026-11-05).
// - 질문 원문은 바꾸지 않는다(질문은 대화에 말풍선으로 그대로 보인다).
//
// SEFTYAI 로 옮기며(R54): 장면·자막(label·intro·say·outro)·질문 id·걸음 차례는 개발서버와 글자까지 같다.
// 화면 요소만 우리 화면(통합 탐색)의 것으로 바꿨다 — 아래 UI·장면 위 상수. 개발서버에 없던 것은 「집을 요소가 없으면 orElse」 걸음뿐이다
// (우리 답 속 이름은 지도로만 옮겨 가고 상세 탭을 열지 않아, 탭이 없으면 지도 말풍선 [상세 보기]로 연다).
// 지도 점·묶음·구 이름표는 캔버스라 "@map:…" 로 지도에게 묻는다(lib/autoDemoMap).
import type { BaseRegion } from "@/lib/baseRegion"

/** 강조할 화면 요소 이름 — Spotlight 가 실제 위치를 매번 다시 잰다(해상도와 무관). */
export type FocusName = "answer" | "answer-summary" | "panel" | "question" | "alert" | "aimode" | "aim-card" | "aim-tiles"

/**
 * 화면에서 집을 요소 — 선택자에 글자(text)·순번(nth)·「숫자가 가장 큰 것」(largest)으로 좁힌다.
 * 진행기가 찾은 요소에 표를 달아 커서·강조가 같은 요소를 따라가게 한다.
 * 선택자가 "@map:cluster" · "@map:pin" · "@map:pin-exact" · "@map:area" 이면 지도(OpenLayers 캔버스)에게 묻는다.
 */
export interface Target {
  sel: string
  text?: string
  nth?: number
  /** 글자가 숫자인 것 가운데 가장 큰 것(지도 묶음 「12」 등). */
  largest?: boolean
  /** 지금 화면에 실제로 보이는 것만(지도 점 — 화면 밖·다른 것에 가린 점은 누를 수 없다). */
  visible?: boolean
}

/** 강조할 곳 — 이름(FocusName) 또는 직접 집은 요소. */
export type FocusTarget = FocusName | Target

/**
 * 답을 놓은 뒤 이어지는 화면 동작 한 걸음(5차안 2026-11-04).
 * 차례: scroll → (look | click) → open → waitFor → focus → say → wait.
 * 집을 요소가 없으면 그 걸음의 동작만 건너뛰고(자막은 읽는다), orElse 가 있으면 그것을 대신 돈다.
 */
export interface DemoStep {
  say?: string
  /** 커서로 가리키기만 한다. */
  look?: Target
  /** 커서로 눌러 실제로 누른다. */
  click?: Target
  /** 커서 없이 조용히 누른다(체크 되돌리기·보기 범위 되돌리기). */
  silentClick?: Target
  scroll?: Target
  open?: "map" | "summary"
  /** 누른 뒤 이 요소가 나타날 때까지 기다린다(최대 4초). */
  waitFor?: string
  focus?: FocusTarget[]
  /** 읽은 뒤 더 머무는 시간(ms). */
  wait?: number
  /** 집을 요소가 없을 때 대신 돌 걸음. */
  orElse?: DemoStep[]
  /** 입력칸에 글자를 한 자씩 넣는다. at 이 입력칸이 아니면 그 안의 입력칸에 넣는다. */
  fill?: { at: Target; value: string }
  /** 누른 요소의 글(대상 이름)을 기억한다 — 뒤 걸음의 Target.text 에 "$picked" 로 쓴다. */
  remember?: boolean
  /** 실제 질문을 보내고 답이 올 때까지 기다린다(최대 ms) — 이 대본에는 쓰지 않는다(개발서버와 같음). */
  waitAnswer?: number
  /**
   * 받아 둔 시연 답(질문 id)을 대화에 놓는다 — 질문 칸에 글을 넣고 [질의]를 가리킨 다음 이것으로
   * 답을 세운다. 실제로 [질의]를 누르면 실시간 질문이 나가므로 누르지 않는다.
   */
  play?: string
}

export type DemoRegion = "busan" | "inje"

/** 장면의 기준지역 — 개발서버 DemoRegions(부산광역시 2600000000 · 인제군 5181000000)를 우리 기준지역(브이월드 이름·코드)으로 */
export const DemoRegions: Record<DemoRegion, BaseRegion> = {
  busan: { sido: { code: "26", name: "부산광역시" } },
  inje: { sido: { code: "51", name: "강원특별자치도" }, sigungu: { code: "51810", name: "인제군" } },
}

export interface AutoScene {
  /** 화면 막대에 보이는 장면 이름. */
  label: string
  /** 시연 질문 ID(질문 모음 「한눈 요약 질의」 id = lib/library DAY_ITEMS · 받아 둔 답 sa_demo_pins). 없으면 내레이션만 하는 장면(오프닝·전환·클로징). */
  pinId?: string
  /** 저장된 답이 없을 때 대신 쓸 질문. */
  fallbackPinId?: string
  /** 이 장면의 기준지역. 지금과 다르면 장면 앞에서 바꾼다(대화가 새로 시작된다). */
  region?: DemoRegion
  /** 답을 보이기 전에 읽는 안내 — 상황과 왜 이 질문이 필요한지. */
  intro: string
  /** 대체 질문으로 보일 때 읽는 안내(말풍선 질문과 어긋나지 않게). */
  fallbackIntro?: string
  /** 답을 보인 뒤에 읽는 마무리 — 사업 목적·기대효과 관점. */
  outro?: string
  /**
   * AI 모드 시연 — 이 시연 질문(가상 특보로 받아 둔 AI 모드 점검 — lib/autoDemoAim)을 특보 줄과 AI 모드 창에 띄운다.
   * pinId 와 함께 쓰지 않는다.
   */
  aiModePinId?: string
  /** AI 모드 창 안에서 차례로 강조할 곳과 그때 읽을 문장. */
  aiModeSteps?: { focus: FocusName[]; say: string }[]
  /** AI 모드 창이 저절로 뜬다 — 커서가 [AI 모드]를 누르지 않는다(켜 둔 AI 모드가 특보 변화를 감지). */
  autoPopup?: boolean
  /** 답을 보인 뒤 우측 패널에서 열 것. */
  open?: "summary" | "map"
  /** 강조할 요소. 없으면 방금 놓은 답 카드. */
  focus?: FocusName[]
  /** 답을 놓은 뒤의 화면 동작 — 있으면 open·focus 대신 이것을 차례로 돈다. */
  steps?: DemoStep[]
  /** 마무리 뒤 다음 장면까지 머무는 시간(ms). 기본 3초. */
  dwellMs?: number
}

export const DefaultDwellMs = 3000

/** 우리 화면 요소(개발서버 선택자 → SEFTYAI). 진행기(useAutoDemo)·강조(Spotlight)도 이것을 쓴다 */
export const UI = {
  /** 우측 패널(개발서버 .side-panel) */
  panel: ".rpanel",
  /** 대화 칸 — 강조를 이 안으로 자른다(개발서버 .search-scroll) */
  scroll: ".ex-main .thread",
  /** 대화의 턴들(개발서버 .answer-turns > li) — 질문 한 턴·브리핑 묶음 하나가 section 하나 */
  turns: ".ex-main .thread > section",
  lastTurn: ".ex-main .thread > section:last-of-type",
  /** 답 카드·본문·받는 중(개발서버 .answer-card · .answer-md · .answer-running) */
  answerCard: ".acard.ans",
  answerBody: ".md",
  answerRunning: ".acard.loading",
  /** 질문 말풍선(개발서버 .answer-ask) */
  question: ".qbubble",
  /** 한눈 요약 압축 카드(개발서버 .sm-mod) */
  summaryCard: ".sm-card",
  /** 머리줄 [AI 모드](개발서버 .header-menu-btn) */
  aiButton: ".ai-pill",
  /** 특보 줄(개발서버 .alert-banner) */
  alert: ".wxbar",
  /** AI 모드 창(개발서버 .aim-modal · .aim-card · .aim-tiles · .aim-brief) */
  aim: ".modal.aimx",
  aimCard: ".aimx .aimx-card",
  aimTiles: ".aimx .aimx-tiles",
  aimBrief: ".aimx .aimx-brief",
  /** 질문 칸·[질의](개발서버 .query-box textarea · button) */
  questionBox: ".composer textarea",
  askButton: ".composer .cmp-row .btn.primary",
  /** 패널 탭 줄·[패널 펼치기](개발서버 .panel-tabs · .panel-reopen) */
  panelTabs: ".rpanel .rtabs, .panel-open",
  /** 지도 말풍선(개발서버 .map-pop) */
  mapPopup: ".sa-map-pop .mp-card",
  /** 대상 상세 탭(T3Q-15 — 개발서버 evd) */
  detailPane: ".rpanel .gdp",
} as const

/** 강조 이름 → 화면 요소(개발서버 Spotlight Selectors) */
export const FOCUS: Record<FocusName, string> = {
  answer: `${UI.lastTurn} ${UI.answerCard}`,
  "answer-summary": `${UI.lastTurn} ${UI.summaryCard}`,
  panel: UI.panel,
  question: `${UI.lastTurn} ${UI.question}`,
  alert: UI.alert,
  aimode: UI.aim,
  "aim-card": UI.aimCard,
  "aim-tiles": `${UI.aimTiles}, ${UI.aimBrief}`,
}

// 5차안(2026-11-04 확정 대본) — 기능 설명이 아니라 «담당자가 왜 그 정보를 보는가»로 말한다.
// 정상(초록) → 11:00 예비특보(AI 모드 켜기) → 15:00 주의보(AI 모드 자동 감지) → 본격 확인 → 인제 → 마무리.
// 자막 원문: gitignore/중간보고 시연/자동시연_5차안_대본과_계획.md 「0. 확정 대본」.
const Panel = UI.panel
const LastTurn = UI.lastTurn
/** 한눈 요약 아래 상세 답의 첫 덩어리 — 여기로 굴려 «요약 다음 본문»을 보인다. */
const Body = `${LastTurn} ${UI.answerCard} ${UI.answerBody} > *`
const BodyBox = `${LastTurn} ${UI.answerCard} ${UI.answerBody}`
/** 패널 탭 이름 단추(지도·한눈 요약·대응절차·대상 상세). */
const Tab = `${Panel} .rtab-b`
/**
 * 상세가 있는 지도 점 — 「동래구 중심」처럼 행정구역 중심 좌표로만 찍힌 점(근사 위치)은
 * 상세가 없어 고르지 않는다(사용자 지적 2026-11-04).
 */
const Pin = "@map:pin-exact"
/** 지도 점(근사 위치 포함 — 객체 참조로 집을 때) · 묶음 원 · 요약 보기 구 이름표 */
const MapPinAny = "@map:pin"
const MapCluster = "@map:cluster"
const MapArea = "@map:area"
/** 지도 말풍선 [상세 보기] — 상세가 없으면(회색) 누르지 않고 다른 길로 */
const PopDetail = ".sa-map-pop .mp-btn.pri:not(:disabled)"
/** 답 글 속 이름(지도로 옮겨 감 — 개발서버 .answer-md-entity) */
const Entity = `${LastTurn} .ref-link`
/** 답 글의 표·문단·인용 */
const MdTable = `${BodyBox} .md-table`
const MdP = `${BodyBox} p`
const MdText = `${BodyBox} li, ${BodyBox} p`
const MdQuote = `${BodyBox} blockquote, ${BodyBox} p`
/** 대상 상세(T3Q-15)의 속성 묶음과 칸(개발서버 .evd-record · .di-pill) */
const DetailRecord = `${UI.detailPane} .kv, ${UI.detailPane} .tree-table`
const DetailField = `${UI.detailPane} th, ${UI.detailPane} .kv > *`
/** 유사사례 카드·첫 사례 열기·사건 상세 타임라인(개발서버 .sim-card · .sim-open · .evp-tl) */
const SimCard = `${LastTurn} .datacard-sec.sim`
const SimOpen = `${LastTurn} .sim-top`
const EventTimeline = ".ev-tl-list"
/** AI 모드 창 브리핑 줄·[브리핑 시작](개발서버 .aim-brief · .aim-brief-go) */
const AimBrief = UI.aimBrief
const AimBriefGo = `${UI.aimBrief} .btn`
/** 답이 온 브리핑 항목의 [크게 보기](개발서버 .briefing-item.is-done .briefing-item-open) · 브리핑 묶음 */
const BriefDone = ".brief-item .brief-item-tools .btn.line"
const BriefBlock = ".ex-main .thread > section.brief-block:last-of-type"
/** 재난상황 조건 창(개발서버 ConditionModal) — [조건 변경]·[적용]·[기본 조건으로 되돌리기] */
const CondOpen = ".composer .cmp-cond .lnk"
const CondApply = ".cond-modal .modal-f .btn.primary"
const CondReset = ".cond-modal .modal-f .btn"

export const AutoScript: AutoScene[] = [
  {
    label: "프롤로그 · AI 모드 소개",
    region: "busan",
    intro: "부산시 재난안전 담당자의 업무를 살펴보겠습니다. 현재 부산에는 발효된 기상특보가 없습니다.",
    steps: [
      {
        focus: ["alert"],
        look: { sel: UI.aiButton, text: "AI" },
        say: "AI 모드는 기상특보의 변화를 살피고, 재난 담당자가 필요한 정보를 신속하게 확인할 수 있도록 지원합니다.",
      },
    ],
    dwellMs: 1200,
  },

  // 1막 — 예비특보: 업무를 시작하며 AI 모드를 켠다
  {
    label: "11:00 · 호우 예비특보, AI 모드 시작",
    aiModePinId: "AIM-BS-01",
    region: "busan",
    intro: "오전 11시, 부산에 호우 예비특보가 발표된 상황을 가정하겠습니다. 담당자는 업무를 시작하면서 AI 모드를 켭니다.",
    aiModeSteps: [
      { focus: ["alert"], say: "아직 비가 본격적으로 내리기 전이지만," },
      { focus: ["aim-card"], say: "미리 살펴봐야 할 위험지역과 시설이 있는지 확인하기 위해서입니다." },
    ],
    outro: "담당자는 점검 내용을 확인한 뒤 평소 업무를 이어갑니다. AI 모드는 켜 둔 상태로 특보의 변화를 계속 살핍니다.",
    dwellMs: 1200,
  },
  {
    label: "11:30 · 온천천 주변 위험지역",
    pinId: "IG-BS-01",
    region: "busan",
    intro: "먼저 부산의 대표적인 도심하천인 온천천 주변을 살펴봅니다.",
    steps: [
      { focus: ["answer-summary", { sel: BodyBox }], say: "호우에 대비하려면 하천 주변에 어떤 위험지역이 있고, 어디에 집중되어 있는지 파악할 필요가 있습니다." },
      {
        scroll: { sel: Body },
        focus: [{ sel: BodyBox }],
        say: "한눈 요약 바로 아래에는 지역별 위험 요인과 점검대상을 정리한 상세 답이 이어집니다.",
      },
      {
        open: "map",
        click: { sel: MapCluster, largest: true, visible: true },
        focus: ["panel"],
        say: "위험지역이 모여 있는 구역을 확인하고,",
        wait: 800,
      },
      {
        // 침수흔적(고분로13번길지구 등)은 객체 상세가 없다(사용자 지적 2026-11-04) — 상세가 있는
        // 온천 일대 급경사지 점을 고른다. 이름에 「온천」이 든 대상은 이 답에서 모두 급경사지다.
        click: { sel: Pin, text: "온천", visible: true },
        orElse: [{ click: { sel: Pin, text: "연산교", visible: true }, waitFor: UI.mapPopup }],
        waitFor: UI.mapPopup,
        say: "그중 한곳을 자세히 살펴봅니다.",
      },
      {
        click: { sel: PopDetail },
        // 지도 말풍선이 없으면(다시 그려져 닫힘 등) 답에서 급경사지 이름을 눌러 같은 상세를 연다.
        orElse: [
          { click: { sel: Entity, text: "온천" }, wait: 600 },
          { click: { sel: Tab, text: "온천" }, orElse: [{ click: { sel: PopDetail } }] },
        ],
        focus: ["panel"],
        say: "위험등급뿐 아니라 어떤 이유로 위험지역에 지정되었는지, 관련 자료에는 어떤 내용이 담겨 있는지도 확인합니다.",
      },
    ],
    outro: "이러한 정보는 현장 점검이 필요한 곳을 선정하고, 점검의 우선순위를 검토하는 근거가 됩니다.",
  },
  {
    label: "11:40 · 동래·연제·금정 위험지구 전체",
    pinId: "IG-BS-02",
    region: "busan",
    intro: "이번에는 온천천이 지나는 동래구·연제구·금정구 전체로 넓혀, 지정된 위험지구가 얼마나 되는지 살펴봅니다.",
    steps: [
      { focus: ["answer"], say: "자연재해위험개선지구와 산사태취약지역, 급경사지가 구별·종류별로 정리되어 나옵니다." },
      {
        scroll: { sel: Body },
        focus: [{ sel: BodyBox }],
        say: "구별 지정 현황표 아래로, 지구마다 이름과 위치가 목록으로 이어집니다.",
      },
      { click: { sel: Entity, text: "안락2" }, wait: 600 },
      {
        click: { sel: Tab, text: "안락2" },
        orElse: [{ click: { sel: PopDetail } }],
        focus: ["panel"],
        say: "목록에서 지구 이름을 누르면, 그 지구의 지정 사유와 상세정보를 바로 확인할 수 있습니다.",
      },
      { open: "map", focus: ["panel"], say: "대상이 많을 때는 지도에서 전체 분포를 먼저 봅니다." },
      {
        click: { sel: `${Panel} .sm-map-toggle`, text: "요약 보기" },
        focus: ["panel"],
        wait: 1500,
        say: "요약 보기로 바꾸면 구별로 몇 곳이 있는지 색의 진하기로 한눈에 비교할 수 있습니다.",
      },
      {
        click: { sel: `${Panel} .sm-map-card:not(.is-on)`, text: "급경사지" },
        wait: 1500,
        say: "급경사지만 골라 보면, 어느 구에 많이 몰려 있는지가 드러납니다.",
      },
      {
        click: { sel: MapArea, text: "동래구" },
        wait: 2200,
        focus: ["panel"],
        say: "가장 많은 구를 누르면 그 구의 대상만 지도에 남습니다.",
      },
      {
        click: { sel: MapCluster, largest: true, visible: true },
        wait: 1000,
        say: "모여 있는 곳을 눌러 확대하고,",
      },
      {
        // 상세가 있는 급경사지로 정해 고른다 — 「동래구 중심」 같은 근사 위치 점은 상세가 없다(사용자 지적 2026-11-04).
        click: { sel: Pin, text: "동래문화회관", visible: true },
        orElse: [{ click: { sel: Pin, text: "동래한솔", visible: true }, waitFor: UI.mapPopup }],
        waitFor: UI.mapPopup,
        say: "한곳을 골라",
      },
      {
        click: { sel: PopDetail },
        // 지도에 그 점이 안 보이면(작은 화면 등) 답에서 같은 급경사지 이름을 눌러 상세를 연다.
        orElse: [
          { click: { sel: Entity, text: "동래문화회관" }, wait: 600 },
          { click: { sel: Tab, text: "동래문화회관" }, orElse: [{ click: { sel: PopDetail } }] },
        ],
        focus: ["panel"],
        say: "위치와 상세정보를 확인합니다.",
      },
      {
        scroll: { sel: DetailRecord },
        focus: [{ sel: DetailRecord }],
        say: "아래로 내려 보면 위험등급과 함께 최근 안전점검일과 점검 결과까지 이어집니다.",
      },
      {
        scroll: { sel: DetailField, text: "근거" },
        focus: ["panel"],
        say: "관리기관과 담당부서, 근거 자료도 함께 정리되어 있습니다.",
        wait: 400,
      },
    ],
    outro: "대상이 수백 곳이어도 구별 분포에서 시작해 한곳까지 좁혀 들어가면, 어디부터 볼지 빠르게 정할 수 있습니다.",
  },

  // 2막 — 주의보: 켜 둔 AI 모드가 먼저 알린다
  {
    label: "15:00 · 호우주의보, AI 모드 자동 감지",
    aiModePinId: "AIM-BS-03",
    autoPopup: true,
    region: "busan",
    intro: "오후 3시, 다른 업무를 보던 중 호우 예비특보가 주의보로 바뀝니다.",
    aiModeSteps: [
      { focus: ["alert"], say: "켜 둔 AI 모드가 특보 변화를 감지하고, 우선 확인해야 할 사항을 다시 정리합니다." },
      { focus: ["aim-card"], say: "저지대 침수 우려 지역과 배수 시설, 하천변 산책로와 지하차도 같은 위험 구간을 점검하라는 안내입니다." },
    ],
    outro: "이제는 사전에 위험요소를 파악하는 것에서 더 나아가, 어느 시설부터 점검하고 어떤 조치를 준비해야 할지 검토할 때입니다.",
    dwellMs: 1200,
  },
  {
    label: "15:05 · 현재 상황 브리핑",
    region: "busan",
    intro: "주의보가 내려지면 담당자는 지금 상황을 한 번에 정리해 봅니다.",
    steps: [
      // 채팅창의 [브리핑 세트]보다 AI 모드 창의 [브리핑 시작]으로 건다(사용자 지시 2026-11-04).
      { click: { sel: UI.aiButton, text: "AI" }, waitFor: AimBriefGo, say: "AI 모드 창을 열어" },
      { scroll: { sel: AimBrief }, focus: [{ sel: AimBrief }], say: "현재 상황 브리핑을 시작합니다." },
      {
        click: { sel: AimBriefGo },
        waitFor: BriefDone,
        focus: [{ sel: BriefBlock }],
        wait: 1200,
        say: "담당자가 정해 둔 네 가지 항목이 한 번에 정리됩니다.",
      },
      {
        click: { sel: BriefDone, nth: 2 },
        orElse: [{ click: { sel: BriefDone } }],
        focus: ["answer"],
        say: "그중 통제·대피 대상을 크게 열어, 통제가 필요한 도로와 지하차도를 확인합니다.",
        wait: 800,
      },
    ],
    outro: "브리핑으로 전체 상황을 훑은 뒤, 필요한 항목을 하나씩 깊이 살펴봅니다.",
  },
  {
    label: "15:10 · 점검 우선순위",
    pinId: "IG-BS-11",
    region: "busan",
    intro: "비가 계속되면 하천 주변 침수뿐 아니라 경사지 붕괴 위험도 함께 커집니다. 모든 위험시설을 동시에 점검할 수는 없습니다.",
    steps: [
      { focus: ["answer"], say: "따라서 위험등급과 기존 안전점검 결과를 함께 살펴보며 우선 확인할 대상을 추려봅니다." },
      {
        open: "summary",
        click: { sel: `${Panel} details.sm-tables > summary` },
        focus: ["panel"],
        say: "특히 위험등급이 좋지 않은 급경사지는 과거 점검에서 어떤 문제가 있었는지도 중요합니다.",
      },
      { click: { sel: `${Panel} .sm-link` }, focus: ["panel"], say: "위치와 점검 이력을 함께 확인해 현장 점검의 우선순위를 검토합니다." },
      {
        scroll: { sel: Body },
        focus: [{ sel: BodyBox }],
        say: "상세 답에는 등급과 점검 결과를 묶어 정리한 우선순위 근거가 이어집니다.",
      },
      { open: "map", focus: ["panel"], say: "지도로 돌아가 우선 점검 대상이 어디에 있는지도 함께 봅니다.", wait: 600 },
    ],
  },

  // 조건 입력·질문 입력까지는 실제로 보이고, 답은 같은 조건으로 받아 둔 시연 답(CQ-BS-01·02)을 놓는다
  // (사용자 지시 2026-11-04 — 실시간 답은 1~2분이라 보고 자리에서 기다릴 수 없다).
  {
    label: "15:20 · 강우 조건으로 묻고 대응절차까지",
    region: "busan",
    intro: "비가 이어져 3시간 누적 강우가 70밀리미터에 이르렀다고 가정합니다. 지금 상황을 조건으로 넣고, 무엇부터 확인해야 하는지 직접 물어봅니다.",
    steps: [
      {
        click: { sel: CondOpen, text: "조건 변경" },
        waitFor: ".cond-field",
        say: "재난상황 조건 입력 창을 엽니다.",
      },
      { fill: { at: { sel: `input[aria-label="3시간 누적 값 (mm)"]` }, value: "70" }, say: "3시간 누적 강우 70밀리미터를 넣고," },
      { fill: { at: { sel: ".cond-pick", text: "피해·통제" }, value: "지하차도" }, say: "피해·통제 키워드에는 지하차도를 적습니다." },
      { click: { sel: CondApply, text: "적용" }, wait: 400 },
      { fill: { at: { sel: UI.questionBox }, value: "재난상황 조건에서 가장 먼저 확인해야 할 우선 위험지역은?" } },
      { look: { sel: UI.askButton, text: "질의" }, play: "CQ-BS-01" },
      { open: "map" },
      {
        scroll: { sel: `${LastTurn} .acard-h` },
        focus: ["answer", "panel"],
        say: "답과 지도에 표시된 대상을 한 화면에서 함께 봅니다.",
      },
      {
        click: { sel: `${Panel} .sm-map-toggle`, text: "요약 보기" },
        focus: ["panel"],
        wait: 1200,
        say: "지도를 요약 보기로 바꾸면 행정구역별 분포가 드러납니다.",
      },
      {
        scroll: { sel: Body },
        focus: ["answer-summary", { sel: BodyBox }],
        say: "한눈 요약과 바로 아래 결론을 함께 보면, 지금 먼저 통제해야 할 곳은 하천에 인접하고 침수 이력이 있는 지하차도입니다.",
      },
      {
        click: { sel: `${LastTurn} .sm-expand` },
        focus: ["panel"],
        say: "패널에서 크게 보기로 오른쪽에서 자세히 보고,",
      },
      {
        click: { sel: `${Panel} details.sm-tables > summary` },
        focus: ["panel"],
        say: "표로 보기에서 지하차도별 차단 시설과 통제수심을 확인합니다.",
      },
      {
        // 15:30 지하차도 질문(IG-BS-07)을 이 답 안으로 합쳤다(사용자 지시 2026-11-04 — 질의 하나에서 액션을 소화).
        focus: [{ sel: `${Panel} .sm-table tr`, text: "초량제1" }],
        say: "맨 위의 초량제1지하차도는 U형 구조에 하천과 가깝고, 2020년 7월 인명피해 기록이 연결된 곳입니다.",
      },
      { open: "map", silentClick: { sel: `${Panel} .sm-map-toggle`, text: "지도 보기" } },
      {
        // 이어 묻기 답(CQ-BS-02)이 초량제1지하차도를 참조해 받아 둔 것이라 같은 곳을 집는다.
        click: { sel: Entity, text: "초량제1" },
        remember: true,
        focus: ["panel"],
        say: "초량제1지하차도를 누르면 지도가 그 자리로 옮겨 가고,",
        wait: 600,
      },
      {
        click: { sel: Tab, text: "초량제1" },
        orElse: [{ click: { sel: PopDetail } }],
        focus: ["panel"],
        say: "시설의 위치와 상세정보도 바로 확인할 수 있습니다.",
      },
      { open: "map", click: { sel: `${Panel} .map-pickmode` }, say: "다시 지도에서 객체 참조를 켜고," },
      {
        click: { sel: MapPinAny, text: "$picked" },
        focus: ["panel", { sel: ".query-refs" }],
        say: "그 지하차도를 골라 다음 질문에 붙입니다.",
      },
      { fill: { at: { sel: UI.questionBox }, value: "당시 발생한 피해내용은?" } },
      { look: { sel: UI.askButton, text: "질의" }, play: "CQ-BS-02" },
      {
        focus: ["answer-summary", { sel: BodyBox }],
        say: "골라 둔 지하차도를 두고 이어 물은 답입니다. 한눈 요약과 아래 본문을 함께 봅니다.",
      },
      { click: { sel: `${LastTurn} .sm-expand` }, focus: ["panel"], say: "패널에서 크게 보기로 정리된 내용을 확인하고," },
      {
        scroll: { sel: MdText, text: "동구청" },
        focus: [{ sel: MdText, text: "동구청" }],
        say: "응답으로 돌아와, 당시 발생한 주요 피해와 통제 내역을 자세히 확인합니다.",
        wait: 600,
      },
      // 뒷장면에 남지 않게 — 객체 참조 끄기, 참조 비우기, 조건 되돌리기.
      { open: "map", silentClick: { sel: `${Panel} .map-pickmode.is-on` } },
      { silentClick: { sel: ".query-ref-drop" } },
      { silentClick: { sel: CondOpen, text: "조건 변경" }, wait: 400 },
      { silentClick: { sel: CondReset, text: "기본 조건으로" }, wait: 200 },
      { silentClick: { sel: CondApply, text: "적용" }, wait: 200 },
      // 이어서 대응절차(전 15:30 장면의 걸음 그대로).
      {
        click: { sel: Tab, text: "대응절차" },
        waitFor: ".sp-steps",
        focus: ["panel"],
        say: "과거 피해가 있었던 만큼, 비가 이어질 때 실제로 어떤 조치를 준비해야 하는지 대응절차를 확인합니다.",
      },
      { focus: [{ sel: ".sp-steps" }], say: "부산시 현장조치 행동매뉴얼이 대응단계별로 정리되어 있어, 업무 화면에서 바로 열어 볼 수 있습니다." },
      { click: { sel: ".sp-steps button", text: "2단계" }, wait: 400 },
      {
        click: { sel: ".sp-act input[type=checkbox]" },
        orElse: [
          { click: { sel: ".sp-steps button", text: "1단계" }, wait: 400 },
          { click: { sel: ".sp-act input[type=checkbox]" } },
        ],
        focus: [{ sel: ".sp-act.done" }, { sel: ".sp-tools" }],
        say: "지금 단계에서 맡은 조치를 확인하고, 끝낸 조치는 바로 체크해 진행 상황을 남깁니다.",
      },
      {
        click: { sel: ".sp-act.done .tg" },
        focus: [{ sel: ".sp-act.done" }],
        say: "조치마다 연결된 행동카드에서 누가 주관하고, 어떤 순서로 무엇을 해야 하는지 세부 행동까지 확인합니다.",
        wait: 600,
      },
      // 체크는 기관 단위로 서버에 남는다 — 시연이 남긴 체크는 바로 거둔다.
      { silentClick: { sel: ".sp-act.done input[type=checkbox]" } },
      { click: { sel: ".sp-steps button", text: "3단계" }, wait: 300 },
      { silentClick: { sel: ".modeSw button", text: "전체 부서" }, wait: 300 },
      {
        scroll: { sel: ".sp-act", text: "지하차도 통제" },
        focus: [{ sel: ".sp-act", text: "지하차도 통제" }],
        say: "단계가 오르면 지하차도 통제 등 시설물 안전조치로 이어진다는 것도 미리 확인해 둡니다.",
      },
      { silentClick: { sel: ".modeSw button", text: "내 부서" } },
      { focus: ["panel"], say: "매뉴얼 책자를 따로 찾지 않아도 현장조치 절차를 업무 화면에서 늘 확인할 수 있습니다." },
      // 대응절차는 다시 누르면 접힌다 — 뒷장면(급경사지 등)에 떠 있지 않게(사용자 지시 2026-11-04).
      { click: { sel: Tab, text: "지도" }, wait: 400 },
    ],
    outro: "조건을 바꿔 묻고 고른 대상을 이어 물은 뒤, 해야 할 조치까지 같은 화면에서 확인했습니다. 실제 조치 여부는 현장 상황과 공식 기준에 따라 담당자가 판단합니다.",
  },

  {
    label: "15:50 · 온천천 대응수위",
    pinId: "IG-BS-08",
    region: "busan",
    intro: "지하차도와 하천 주변 시설을 관리하려면 하천 수위에 따른 대응기준도 확인해야 합니다.",
    steps: [
      { focus: ["answer-summary", { sel: BodyBox }], say: "온천천의 홍수취약지구와 기준 특보지점을 살펴보고," },
      // 한눈 요약에는 대응 내용이 없다 — 본문 아래 대응수위 표와 참고사항을 비춘다(사용자 지시 2026-11-04).
      {
        scroll: { sel: MdTable },
        focus: [{ sel: MdTable }],
        say: "본문 아래에는 기준 특보지점과 70퍼센트, 90퍼센트 대응수위가 정리되어 있습니다.",
      },
      {
        scroll: { sel: MdQuote, text: "대응수위 참고" },
        focus: [{ sel: MdQuote, text: "대응수위 참고" }],
        say: "수위가 어디까지 오르면 경계 조치를, 어디부터 통제와 주민 대피를 검토해야 하는지 대응 기준도 함께 확인합니다.",
      },
    ],
    outro: "이 기준은 실제 관측 수위와 견주어 담당자가 판단하는 데 쓰입니다.",
  },
  {
    label: "15:55 · 과거 침수 사례와 당시 대응",
    pinId: "SIM-SH-1-3",
    region: "busan",
    intro: "비가 이어지자, 이 일대에서 과거 집중호우 때 어떤 피해가 있었는지 견줘 봅니다.",
    steps: [
      {
        focus: ["answer-summary", { sel: BodyBox }],
        say: "온천천 주변의 과거 침수흔적을 날짜별로, 또 지구별 침수 면적으로 비교해 보여 줍니다.",
      },
      {
        scroll: { sel: SimCard },
        focus: [{ sel: SimCard }],
        say: "지금 조건과 비슷했던 과거 호우를 유사도 순으로 줄 세워, 어떤 사건과 견줘 볼지 고를 수 있습니다.",
      },
      {
        scroll: { sel: Body },
        focus: [{ sel: BodyBox }],
        say: "상세 답에는 사례마다 강우량과 피해지역, 피해 원인이 정리되어 있습니다.",
      },
      {
        // 침수흔적은 객체 상세가 없다(「상세 정보를 찾을 수 없습니다」) — 누르지 않고 원인 단락을 짚는다.
        scroll: { sel: MdText, text: "상류 유역" },
        focus: [{ sel: MdText, text: "상류 유역" }],
        say: "사례마다 피해 원인도 함께 적혀 있어, 상류 폭우와 하천 수위 상승처럼 반복되는 원인을 견줘 볼 수 있습니다.",
      },
      { open: "map", focus: ["panel"], say: "지도로 바꾸면 침수흔적이 실제로 어디에 겹쳐 있는지 보입니다.", wait: 600 },
      // 16:00 유사재난 장면(SIM-SH-2-6)을 이 답 안으로 합쳤다(사용자 지시 2026-11-04) — 카드는 한 번만 비춘다.
      {
        scroll: { sel: SimCard },
        click: { sel: SimOpen },
        waitFor: EventTimeline,
        focus: ["panel"],
        say: "유사사례 가운데 하나를 열면 당시 피해와 복구 기록뿐 아니라 재난문자 발송 이력도 시간순으로 확인할 수 있습니다.",
      },
      {
        scroll: { sel: `${EventTimeline} > li`, text: "저지대 차량" },
        focus: [
          { sel: `${EventTimeline} > li`, text: "산책로 이용을 금지" },
          { sel: `${EventTimeline} > li`, text: "저지대 차량" },
        ],
        say: "실제로 온천천 산책로 이용 금지와 저지대 차량 이동을 안내했던 기록이 남아 있습니다.",
      },
    ],
    outro: "과거 사례의 피해 원인과 당시 대응까지 견줘 보면, 이번 호우에서 어디를 먼저 살피고 무엇을 안내할지 검토하는 근거가 됩니다.",
  },
  // 4막 — 다른 지역
  {
    label: "전환 · 인제군",
    region: "inje",
    intro:
      "이번에는 산간 지역인 인제군을 살펴보겠습니다. " +
      "부산에서 도심 침수와 지하차도를 중점적으로 살펴봤다면, 인제에서는 산사태와 급경사지 붕괴 위험에 주의를 기울여야 합니다.",
    dwellMs: 1200,
  },
  {
    label: "인제 · 진동리 계곡 숙박·야영장 주변",
    pinId: "IG-IJ-01",
    region: "inje",
    intro: "인제군 기린면 진동리 계곡 일대의 숙박시설과 야영장 주변에 급경사지와 산사태취약지역이 있는지 확인합니다.",
    steps: [
      { focus: ["answer-summary", { sel: BodyBox }], say: "급경사지는 위험 점수로, 산사태취약지역은 등급별로 정리되어 나옵니다." },
      {
        scroll: { sel: Body },
        focus: [{ sel: BodyBox }],
        say: "상세 답에는 야영장에서 얼마나 떨어져 있는지와 최근 점검 결과가 함께 정리되어 있습니다.",
      },
      { open: "map", focus: ["panel"], say: "지도를 보면 계곡과 도로를 따라 급경사지가 이어지고, 그 가까이에 캠핑장이 있습니다." },
      {
        // 캠핑장은 지역 단위로 가리킨 대상이라 객체 상세가 없다 — 답에서 눌러 지도를 그 자리로 옮기고, 답 속 내용을 짚는다.
        click: { sel: Entity, text: "캠핑장" },
        focus: ["panel", { sel: MdP, text: "캠핑장" }],
        say: "답에서 캠핑장을 누르면 지도가 그 자리로 옮겨 갑니다. 캠핑장 반경 1킬로미터 안에 급경사지 4곳과 토석류 산사태취약지역 2곳이 붙어 있습니다.",
      },
      {
        scroll: { sel: `${MdTable} tr`, text: "진동6지구" },
        focus: [{ sel: `${MdTable} tr`, text: "진동6지구" }],
        say: "가장 가까운 진동6지구는 캠핑장에서 약 350미터 떨어져 있고, 최근 점검에서 불안전 판정을 받았습니다.",
      },
      { click: { sel: Entity, text: "진동6지구" }, wait: 600 },
      {
        click: { sel: Tab, text: "진동6지구" },
        orElse: [{ click: { sel: PopDetail } }],
        focus: ["panel"],
        say: "이름을 눌러 위험등급과 상세정보를 확인하고,",
      },
      {
        scroll: { sel: DetailRecord },
        focus: [{ sel: DetailRecord }],
        say: "아래로 내려 점검 기록을 봅니다. 사람이 머무는 곳 가까이에 위험 사면이 있다면, 특보 때 먼저 살펴야 할 곳입니다.",
      },
      { open: "map", focus: ["panel"], wait: 600 },
    ],
    outro: "지역마다 재난의 특성은 다르지만, 과거에 축적된 위험정보와 점검 이력을 업무에 활용한다는 점은 같습니다.",
  },

  {
    label: "마무리",
    // 기준지역을 부산으로 되돌리면 대화가 새로 시작되어 첫 화면으로 돌아간다(사용자 지시 2026-11-04).
    region: "busan",
    intro:
      "지금까지 호우 예비특보에서 주의보로 상황이 바뀌는 동안, 재난안전 담당자가 어떤 정보를 확인하고 업무에 활용하는지 살펴봤습니다. " +
      "특보의 변화를 확인하고, 위험지역과 시설을 찾아보고, 상세정보와 과거 피해·대응 기록까지 연결해서 검토했습니다. " +
      "이상으로 시연을 마치겠습니다.",
    dwellMs: 1000,
  },
]

/** 시연 질문 하나 — 개발서버 DemoPin(pin_id · question · received_at) */
export interface DemoPin {
  pin_id: string
  question: string
  received_at: string | null
}

/** 이번에 돌릴 장면들과 그 질문. 질문이 목록에 없으면 pin 은 null(내레이션 장면과 같이 다룬다). */
export function scenesFrom(pins: DemoPin[]): { scene: AutoScene; pin: DemoPin | null; fallback: DemoPin | null }[] {
  const byId = new Map(pins.map((p) => [p.pin_id, p]))
  return AutoScript.map((scene) => ({
    scene,
    pin: scene.pinId ? (byId.get(scene.pinId) ?? null) : null,
    fallback: scene.fallbackPinId ? (byId.get(scene.fallbackPinId) ?? null) : null,
  }))
}

/** 대본이 쓰는 질문 id 전부(장면·장면 안 play·AI 모드) — 받아 둘 것 목록·시험이 쓴다 */
export function scriptPinIds(): { answers: string[]; aiMode: string[] } {
  const answers = new Set<string>()
  const aiMode = new Set<string>()
  const walk = (steps?: DemoStep[]) => {
    for (const s of steps ?? []) {
      if (s.play) answers.add(s.play)
      walk(s.orElse)
    }
  }
  for (const s of AutoScript) {
    if (s.pinId) answers.add(s.pinId)
    if (s.fallbackPinId) answers.add(s.fallbackPinId)
    if (s.aiModePinId) aiMode.add(s.aiModePinId)
    walk(s.steps)
  }
  return { answers: [...answers], aiMode: [...aiMode] }
}
