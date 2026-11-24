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
// 화면 요소만 우리 화면(통합 탐색)의 것으로 바꿨다 — 아래 UI·장면 위 상수. 걸음(orElse 포함)도 개발서버와 같다
// (R59 — 답 속 이름이 개발서버처럼 상세 탭을 만들고 지도로 옮겨 가, R54 에 더했던 「말풍선 [상세 보기]로 여는 걸음」은 되돌림).
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
  /** 우측 패널을 접는다(scroll 보다 먼저) — 지도가 필요 없는 답은 글을 넓게. 지도·상세·근거가 필요해지면 open·click 이 다시 편다(사용자 지시 2026-11-24). */
  fold?: boolean
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

export type DemoRegion = "busan" | "inje" | "daejeon" | "seoul"

/** 장면의 기준지역 — 개발서버 DemoRegions(부산광역시 2600000000 · 인제군 5181000000)를 우리 기준지역(브이월드 이름·코드)으로 */
export const DemoRegions: Record<DemoRegion, BaseRegion> = {
  busan: { sido: { code: "26", name: "부산광역시" } },
  inje: { sido: { code: "51", name: "강원특별자치도" }, sigungu: { code: "51810", name: "인제군" } },
  /** 2026-11-19 대전시청 시연 — 대전광역시(시·도) */
  daejeon: { sido: { code: "30", name: "대전광역시" } },
  /** 2026-11-25 행안부 실장 보고 — 서울특별시(시·도) */
  seoul: { sido: { code: "11", name: "서울특별시" } },
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
  /**
   * 대화 칸의 구르는 곳 — 강조를 이 안으로 자른다(개발서버 .search-scroll · .answer-turns).
   * 가운데 칸은 하나만 보인다(개발서버 SearchPage): 대화면 턴 목록(.thread-turns)만 구르고, 브리핑이면 칸(.thread--brief) 전체가 구른다
   */
  scroll: ".ex-main .thread-turns, .ex-main .thread--brief",
  /** 대화의 턴들(개발서버 .answer-turns > li) — 질문 한 턴이 section 하나, 브리핑 화면은 브리핑 묶음이 section 하나 */
  turns: ".ex-main :is(.thread-turns, .thread--brief) > section",
  lastTurn: ".ex-main :is(.thread-turns, .thread--brief) > section:last-of-type",
  /** 답 카드·본문·받는 중(개발서버 .answer-card · .answer-md · .answer-running) */
  answerCard: ".acard.ans",
  answerBody: ".md",
  answerRunning: ".answer-running, .briefing-item-wait[aria-busy=\"true\"]",
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
  detailPane: ".rpanel .entity-tab",
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
/** 답 글 속 이름(상세 탭을 만들고 지도로 옮겨 감 — 개발서버 .answer-md-entity) */
const Entity = `${LastTurn} .ref-link`
/** 답변 대상 목록의 [상세 보기](개발서버 .ans-refbox .ans-lnk--xs) */
const RefDetail = `${LastTurn} .ans-refbox .ans-lnk--xs`
/** 답 글의 표·문단·인용 */
const MdTable = `${BodyBox} .md-table`
const MdP = `${BodyBox} p`
const MdText = `${BodyBox} li, ${BodyBox} p`
/** 대상 상세(T3Q-15)의 속성 묶음과 칸(개발서버 .evd-record · .di-pill) */
// 「점검·정비 기록」 묶음 — 기본정보 칸(.kv)과 한 선택자로 묶으면 문서 순서상 기본정보가 먼저 잡혀 자막(점검 기록)과 다른 곳을 비췄다(2026-11-19 인제 점검).
const DetailRecord = `${UI.detailPane} .evd-record`
/** 점검 기록이 없는 대상의 기본정보 칸 — DetailRecord 를 못 찾을 때만 */
const DetailKv = `${UI.detailPane} .ev-sec .kv`
const DetailField = `${UI.detailPane} .di-pill, ${UI.detailPane} .kv > *`
/** 유사사례 카드·첫 사례 열기·사건 상세 타임라인(개발서버 .sim-card · .sim-open · .evp-tl) */
const SimCard = `${LastTurn} .sim-card`
const SimOpen = `${LastTurn} .sim-open`
const EventTimeline = ".evp-tl" // 개발서버 사건 상세 타임라인(EventDetail — 11/19 화면 맞춤 뒤 이름)
/** AI 모드 창 브리핑 줄·[브리핑 시작](개발서버 .aim-brief · .aim-brief-go) */
const AimBrief = UI.aimBrief
const AimBriefGo = `${UI.aimBrief} .btn`
/** 답이 온 브리핑 항목의 [크게 보기](개발서버 .briefing-item.is-done .briefing-item-open) · 브리핑 묶음 */
const BriefDone = ".briefing-item.is-done .briefing-item-open"
/** 「통제·대피 대상」 항목의 [크게 보기](aria-label 「3번 통제·대피 대상 크게 보기」) */
const BriefControl = '.briefing-item-open[aria-label*="통제·대피"]'
const BriefBlock = ".ex-main .thread--brief > section.brief-block:last-of-type"
/** 재난상황 조건 창(개발서버 ConditionModal) — [조건 변경]·[적용]·[기본 조건으로 되돌리기] */
const CondOpen = ".composer .cmp-cond .lnk"
const CondApply = ".cond-modal .modal-f .btn.primary"
const CondReset = ".cond-modal .modal-f .btn"

/**
 * 대응절차 걸음(부산시 현장조치 행동매뉴얼) — 15:20 끝과 부산 + 대전의 「15:15 · 대응절차 확인」이 함께 쓴다.
 * 대응절차 탭은 로그인 계정 지역의 매뉴얼이다(시연 계정 busan2 = 부산).
 */
function sopSteps(first: string): DemoStep[] {
  return [
    {
      // 대응절차는 특보 줄 오른쪽 끝 [대응절차] 단추로 켠다(개발서버 ManualButton — 2026-11-19)
      click: { sel: ".wxbar .wxsop" },
      waitFor: ".sp-steps",
      focus: ["panel"],
      say: first,
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
    // 대응절차는 다시 누르면 접힌다 — 뒷장면(급경사지 등)에 떠 있지 않게(사용자 지시 2026-11-04). 단추를 다시 눌러 탭을 거두고 지도로
    { silentClick: { sel: ".wxbar .wxsop.on" }, wait: 300 },
    { click: { sel: Tab, text: "지도" }, wait: 400 },
  ]
}

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
          { click: { sel: Tab, text: "온천" } },
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
      // 앞 장면(11:30)의 N3지구 상세 탭이 이 답 동안 패널에 남지 않게 지도 탭으로(11/19 녹화 검수)
      { open: "map", focus: ["answer"], say: "자연재해위험개선지구와 산사태취약지역, 급경사지가 구별·종류별로 정리되어 나옵니다." },
      {
        scroll: { sel: Body },
        focus: [{ sel: BodyBox }],
        say: "구별 지정 현황표 아래로, 지구마다 이름과 위치가 목록으로 이어집니다.",
      },
      // 「안락2」는 이름이 가리키는 대상 종류가 달라 누를 수 없는 이름이다(개발서버 규칙 — 11/19 점검) — 누를 수 있는 안락지하차도로
      { click: { sel: Entity, text: "안락지하차도" }, wait: 600 },
      {
        click: { sel: Tab, text: "안락지하차도" },
        orElse: [{ click: { sel: RefDetail } }],
        focus: ["panel"],
        say: "목록에서 안락지하차도처럼 이름을 누르면, 그 시설의 위치와 상세정보를 바로 확인할 수 있습니다.",
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
      // 「모여 있는 곳을 눌러 확대」는 뺐다 — 동래구만 남기면 묶음 원이 없는 배율이라 누를 것이 없었다(11/19 녹화 검수)
      {
        // 상세가 있는 급경사지로 정해 고른다 — 「동래구 중심」 같은 근사 위치 점은 상세가 없다(사용자 지적 2026-11-04).
        click: { sel: Pin, text: "동래문화회관", visible: true },
        orElse: [{ click: { sel: Pin, text: "동래한솔", visible: true }, waitFor: UI.mapPopup }],
        waitFor: UI.mapPopup,
        say: "그중 한곳을 골라",
      },
      {
        click: { sel: PopDetail },
        // 지도에 그 점이 안 보이면(작은 화면 등) 답에서 같은 급경사지 이름을 눌러 상세를 연다.
        orElse: [
          { click: { sel: Entity, text: "동래문화회관" }, wait: 600 },
          { click: { sel: Tab, text: "동래문화회관" } },
        ],
        focus: ["panel"],
        say: "위치와 상세정보를 확인합니다.",
      },
      {
        scroll: { sel: DetailRecord },
        focus: [{ sel: DetailRecord }],
        orElse: [{ scroll: { sel: DetailKv }, focus: [{ sel: DetailKv }] }],
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
      // 「자동 팝업」을 말로 짚는다(사용자 지시 2026-11-24)
      { focus: ["alert"], say: "찾아 들어가지 않아도 AI 모드 창이 자동으로 팝업됩니다. 특보 변화를 감지해, 우선 확인해야 할 사항을 다시 정리해 줍니다." },
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
      // 앞 장면(11:40)에서 연 상세 탭이 브리핑 동안 패널에 남지 않게 지도 탭으로(11/19 녹화 검수)
      { open: "map", click: { sel: UI.aiButton, text: "AI" }, waitFor: AimBriefGo, focus: ["aimode"], say: "AI 모드 창을 열어" },
      { scroll: { sel: AimBrief }, focus: [{ sel: AimBrief }], say: "현재 상황 브리핑을 시작합니다." },
      {
        click: { sel: AimBriefGo },
        waitFor: BriefDone,
        focus: [{ sel: BriefBlock }],
        wait: 1200,
        say: "담당자가 정해 둔 네 가지 항목이 한 번에 정리됩니다.",
      },
      // 브리핑 답은 실제로 받아 오므로 순서대로 오지 않는다 — 「완료된 셋째」가 아니라 이름(통제·대피 대상)으로 집고,
      // 그 항목이 늦으면 조금 더 기다린다(2026-11-18 점검: 순번으로 집어 엉뚱한 항목·빈 강조).
      { waitFor: BriefControl },
      // 누르기 전에 그 항목을 화면 가운데로 내려 강조 상자를 여유 있게 보인 뒤 누른다 — 누를 때의 굴림(nearest)만으로는
      // 항목이 화면 아래 끝에 걸려 강조가 답답했다(사용자 지시 2026-11-24).
      {
        scroll: { sel: BriefControl },
        focus: [{ sel: BriefControl }],
        say: "그중 통제·대피 대상 항목을 열어 봅니다.",
        wait: 600,
      },
      {
        click: { sel: BriefControl },
        orElse: [{ click: { sel: BriefDone } }],
        // 크게 본 항목은 브리핑 묶음 안의 .brief-big(개발서버 BriefingAnswer) — 답 카드(.acard.ans)가 아니라 「answer」로는 비었다(2026-11-18 점검).
        focus: [{ sel: ".brief-big" }],
        say: "통제가 필요한 도로와 지하차도가 한 화면에 정리됩니다.",
        wait: 800,
      },
      // 말만 하고 화면이 멈춰 있지 않게 실제로 내려 짚는다(사용자 지시 2026-11-24). 답은 실제로 받아 오므로 표가 없으면 소제목, 그것도 없으면 그대로.
      {
        scroll: { sel: ".brief-big table" },
        focus: [{ sel: ".brief-big table" }],
        orElse: [{ scroll: { sel: ".brief-big h3" }, focus: [{ sel: ".brief-big h3" }] }],
        say: "대상마다 위치와 통제 기준이 함께 나와, 어디부터 통제를 준비할지 바로 보입니다.",
        wait: 600,
      },
    ],
    outro: "브리핑으로 전체 상황을 훑었으니, 이제 궁금한 점을 질문으로 더 깊이 들어가 봅니다.",
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
      // 한눈 요약 표의 이름을 누르면 상세 탭은 생기되 보이는 것은 지도다(개발서버 openEntity) — 탭을 눌러 점검 기록까지 보인다(11/19 녹화 검수)
      { click: { sel: `${Panel} .sm-link` }, remember: true, focus: ["panel"], say: "이름을 누르면 지도에서 위치를 보여 주고,", wait: 400 },
      { click: { sel: Tab, text: "$picked" }, wait: 700 },
      {
        scroll: { sel: DetailRecord },
        focus: [{ sel: DetailRecord }],
        orElse: [{ scroll: { sel: DetailKv }, focus: [{ sel: DetailKv }] }],
        say: "상세에서는 점검 이력까지 함께 확인해 현장 점검의 우선순위를 검토합니다.",
      },
      {
        scroll: { sel: Body },
        focus: [{ sel: BodyBox }],
        say: "상세 답에는 등급과 점검 결과를 묶어 정리한 우선순위 근거가 이어집니다.",
      },
      { open: "map", focus: ["panel"], say: "지도로 돌아가 우선 점검 대상이 어디에 있는지도 함께 봅니다.", wait: 600 },
    ],
  },

  // 부산 + 대전에서만 — 15:20(강우 조건 질의)을 빼는 대신 대응절차만 따로 본다(사용자 지시 2026-11-18)
  {
    label: "15:15 · 대응절차 확인",
    region: "busan",
    intro: "점검할 대상을 추렸다면, 이제 단계별로 어떤 조치를 준비해야 하는지도 확인해야 합니다.",
    steps: sopSteps("비가 이어질 때 실제로 어떤 조치를 준비해야 하는지 대응절차를 확인합니다."),
    outro: "점검 우선순위와 해야 할 조치까지 같은 화면에서 확인했습니다. 실제 조치 여부는 현장 상황과 공식 기준에 따라 담당자가 판단합니다.",
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
        // 조건 창 걸음에도 박스를 둔다 — 자막만 바뀌고 박스가 없으면 무엇을 하는지 놓친다(11/19 녹화 검수)
        focus: [{ sel: ".cond-modal" }],
        say: "재난상황 조건 입력 창을 엽니다.",
      },
      {
        fill: { at: { sel: `input[aria-label="3시간 누적 값 (mm)"]` }, value: "70" },
        focus: [{ sel: ".cond-measure", text: "3시간 누적" }],
        say: "3시간 누적 강우 70밀리미터를 넣고,",
      },
      {
        fill: { at: { sel: ".cond-pick", text: "피해·통제" }, value: "지하차도" },
        focus: [{ sel: ".cond-pick", text: "피해·통제" }],
        say: "피해·통제 키워드에는 지하차도를 적습니다.",
      },
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
        // 표에서 초량제1은 아래쪽(18번째 줄)이고 속성 칸이 비어 있다(받아 둔 답 11/19) — 그 줄까지 굴려 짚고, 자막은 표에 보이는 것만 말한다.
        scroll: { sel: `${Panel} .sm-table tr`, text: "초량제1" },
        focus: [{ sel: `${Panel} .sm-table tr`, text: "초량제1" }],
        say: "목록 아래쪽에는 2020년 7월 집중호우 때 인명피해가 났던 초량제1지하차도도 들어 있습니다.",
      },
      { open: "map", silentClick: { sel: `${Panel} .sm-map-toggle`, text: "지도 보기" }, focus: ["panel"] },
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
        // 받아 둔 답(CQ-BS-02)의 「지하차도 관련 주요 피해 및 복구 이력」 표 — 첫 줄이 2020-07-23 초량제1 차량 고립
        scroll: { sel: `${MdTable} tr`, text: "차량 고립" },
        focus: [{ sel: `${MdTable} tr`, text: "차량 고립" }],
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
      ...sopSteps("과거 피해가 있었던 만큼, 비가 이어질 때 실제로 어떤 조치를 준비해야 하는지 대응절차를 확인합니다."),
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
        scroll: { sel: MdText, text: "대응 기준" },
        focus: [{ sel: MdText, text: "대응 기준" }],
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
        // 캠핑장은 행정구역(진동리)을 가리킨 이름이라 누를 수 없다(개발서버 규칙 — 11/19 점검) — 누르지 않고 답 속 내용을 짚는다.
        focus: ["panel", { sel: MdP, text: "캠핑장" }],
        say: "캠핑장 반경 1킬로미터 안에 급경사지 4곳과 토석류 산사태취약지역 2곳이 붙어 있습니다.",
      },
      {
        scroll: { sel: `${MdTable} tr`, text: "진동6지구" },
        focus: [{ sel: `${MdTable} tr`, text: "진동6지구" }],
        say: "가장 가까운 진동6지구는 캠핑장에서 약 350미터 떨어져 있고, 최근 점검에서 불안전 판정을 받았습니다.",
      },
      { click: { sel: Entity, text: "진동6지구" }, wait: 600 },
      {
        click: { sel: Tab, text: "진동6지구" },
        orElse: [{ click: { sel: RefDetail } }],
        focus: ["panel"],
        say: "이름을 눌러 위험등급과 상세정보를 확인하고,",
      },
      {
        scroll: { sel: DetailRecord },
        focus: [{ sel: DetailRecord }],
        orElse: [{ scroll: { sel: DetailKv }, focus: [{ sel: DetailKv }] }],
        say: "아래로 내려 점검 기록을 봅니다. 사람이 머무는 곳 가까이에 위험 사면이 있다면, 특보 때 먼저 살펴야 할 곳입니다.",
      },
      // 상세를 본 뒤 지도로 돌아가지 않는다 — 가려져 있던 지도가 다시 보이며 그 대상으로 확 당겨져 「튀어」 보였다(사용자 지적 11/19).
      // 다음 장면이 기준지역을 옮기면 패널은 지도로 돌아가 새 지역 경계로 맞춰진다.
    ],
    outro: "지역마다 재난의 특성은 다르지만, 과거에 축적된 위험정보와 점검 이력을 업무에 활용한다는 점은 같습니다.",
  },

  // 5막 — 대전(2026-11-19 대전시청 시연 · 사용자 지시 2026-11-18: 과거 침수사례 → 지역 위험·취약정보 → 하천계획·시설정보).
  // 답은 질문 모음 「한눈 요약 질의」 대전 6문 가운데 셋(IG-DJ-07·03·01 — 11/19 지도 도형이 나오는 질의로 07 교체, 연도별(08)은 T3Q 가 지도 자료를 거의 안 줘 장면을 뺌) — 받은 답을 읽고 짚을 곳을 골랐다.
  // 답 끝의 「이어서 물어보기」에는 상류가 다른 지역 질문을 섞어 줄 때가 있어 그 줄까지 굴리지 않는다.
  {
    label: "전환 · 대전광역시",
    region: "daejeon",
    intro:
      "이번에는 대전광역시를 살펴보겠습니다. " +
      "갑천과 유등천, 대전천이 도심을 가로지르는 대전에서는 하천변 저지대 침수와 하천 시설 관리가 중요합니다. " +
      "과거 침수흔적에서 출발해 그때의 대응과 하천 주변 위험지역까지 차례로 확인하겠습니다.",
    dwellMs: 1200,
  },
  {
    // 2026-11-19 사용자 지시 — 정림동 과거 침수사례(IG-DJ-04)는 침수흔적 도형이 북쪽 100km(경기 용인)로 밀려 와 2024년 7월 침수흔적(IG-DJ-07)으로 바꿈
    label: "대전 · 2024년 7월 집중호우 침수흔적",
    pinId: "IG-DJ-07",
    region: "daejeon",
    intro: "먼저 2024년 7월 집중호우 때 대전에 남은 침수흔적입니다. 어디가 얼마나 잠겼는지부터 확인합니다.",
    steps: [
      { focus: ["answer-summary", { sel: BodyBox }], say: "그때 대전에 남은 침수흔적의 건수와 전체 침수면적을 한눈에 보여 줍니다." },
      {
        scroll: { sel: MdTable },
        focus: [{ sel: MdTable }],
        say: "자치구별로 나눠 보면 서구와 유성구에 피해가 몰렸다는 것을 알 수 있습니다.",
      },
      {
        // 둘째 표(침수면적 상위 25곳)는 화면보다 길다 — 표 전체를 가운데로 굴리면 머리·첫 줄이 화면 밖에 남아(11/19 리허설)
        // 머리줄과 첫 줄(가장 넓은 지구)을 짚는다. 머리줄 「평균 침수심」은 첫째 표에도 있어 둘째(nth 1)를 쓴다.
        scroll: { sel: `${MdTable} tr`, text: "침산새들지구" },
        focus: [{ sel: `${MdTable} tr`, text: "평균 침수심", nth: 1 }, { sel: `${MdTable} tr`, text: "침산새들지구" }],
        say: "침수면적이 넓은 지구부터 침수면적과 평균 침수심, 발생일을 함께 정리해 줍니다. 가장 넓게 잠긴 곳은 침산새들지구입니다.",
      },
      // 사용자 지시 2026-11-19 — 「범위 그대로 그려진다」면서 도형을 안 보여 줬다. 침수면적이 큰 두 곳을 답에서 차례로 눌러
      // 지도가 그 침수 범위(폴리곤)로 옮겨 가는 것을 보인다(답 속 이름 → 지도, 개발서버 openEntity).
      {
        click: { sel: Entity, text: "침산새들지구" },
        // 답 속 이름이 눌리지 않는 이름이면 지도에서 같은 대상을 누른다
        orElse: [{ open: "map", click: { sel: MapPinAny, text: "침산새들지구" } }],
        focus: ["panel", { sel: `${MdTable} tr`, text: "침산새들지구" }],
        say: "침수면적이 가장 넓은 침산새들지구를 누르면, 지도가 그 자리로 옮겨 가 실제로 잠겼던 범위가 그대로 그려집니다.",
        wait: 1200,
      },
      {
        click: { sel: Entity, text: "방동 123" },
        // 답 속 이름이 눌리지 않는 이름이면 지도에서 같은 대상을 누른다
        orElse: [{ open: "map", click: { sel: MapPinAny, text: "방동 123" } }],
        focus: ["panel", { sel: `${MdTable} tr`, text: "방동 123" }],
        say: "두 번째로 넓은 유성구 방동 123도 누르면, 그곳의 침수 범위를 지도에서 바로 확인할 수 있습니다.",
        wait: 1200,
      },
    ],
    outro: "피해가 어디서, 얼마나 났는지를 알면 같은 곳에서 피해가 되풀이되지 않도록 먼저 대비할 수 있습니다.",
  },
  {
    label: "대전 · 2024년 7월 10일 호우 대피·통제",
    pinId: "IG-DJ-03",
    region: "daejeon",
    intro: "가장 최근의 큰 피해는 2024년 7월 10일 새벽 호우였습니다. 그날 시민들에게 어떤 안내가 나갔는지 되짚어 봅니다.",
    steps: [
      {
        focus: [{ sel: BodyBox }],
        say: "호우경보 대피 권고부터 산사태 경보, 교량 통제와 해제까지, 대피·통제 문자를 시간순으로 정리해 보여 줍니다.",
      },
      {
        scroll: { sel: `${MdTable} tr`, text: "교각 침하" },
        focus: [{ sel: `${MdTable} tr`, text: "교각 침하" }],
        say: "아침부터 통제된 유등교는 오후에 교각 침하가 확인되어 전면 통제가 이어졌고, 도마교·태평교 우회가 안내되었습니다.",
      },
      {
        // 받아 둔 답(2026-11-19)의 「재해연보 수록 쪽수」 목록 — 「2024 재해연보 p.154」 등
        scroll: { sel: `${BodyBox} ul`, text: "재해연보 p." },
        focus: [{ sel: `${BodyBox} ul`, text: "재해연보 p." }],
        say: "이 호우가 2024 재해연보 몇 쪽에 실렸는지도 함께 알려 주어, 공식 피해 기록을 바로 찾아볼 수 있습니다.",
      },
    ],
    outro: "지난 대응 기록은 다음 호우 때 무엇을 어떤 순서로 안내할지 준비하는 기준이 됩니다.",
  },
  {
    label: "대전 · 3대 하천 산책로·하상도로 주변",
    pinId: "IG-DJ-01",
    region: "daejeon",
    intro: "이제 지역의 위험·취약정보를 봅니다. 비가 많이 오면 가장 먼저 물에 잠기는 곳은 하천 산책로와 하상도로입니다.",
    steps: [
      { focus: ["answer-summary", { sel: BodyBox }], say: "갑천·유등천·대전천을 따라 홍수취약지구와 침수 우려 지하차도를 하천별로 묶어 보여 줍니다." },
      {
        scroll: { sel: MdText, text: "대전천 하상도로(" },
        focus: [{ sel: MdText, text: "대전천 하상도로(" }],
        say: "대전천 하상도로처럼 수위가 조금만 올라도 잠겨 가장 먼저 통제해야 하는 구간도 짚어 줍니다.",
      },
      {
        // 받아 둔 답에는 표가 없다 — 「주요 하천 수위 연계 통제 기준」 목록을 비춘다
        scroll: { sel: `${BodyBox} ul`, text: "(복수교) (유등천)" },
        focus: [{ sel: `${BodyBox} ul`, text: "(복수교) (유등천)" }],
        say: "하천마다 기준이 되는 수위 관측지점도 정리되어, 어느 지점의 수위를 지켜봐야 하는지 알 수 있습니다.",
      },
      {
        open: "map",
        click: { sel: MapCluster, largest: true, visible: true },
        focus: ["panel"],
        say: "지도에서 위험지구와 지하차도 위치를 함께 봅니다. 정확한 위치가 없는 지하차도는 행정구역 중심에 표시됩니다.",
        wait: 800,
      },
      // 사용자 지시 2026-11-19 — 갑천을 따라 있는 하천 인접 침수 위험 지하차도를 답에서 차례로 눌러 지도로 보이고,
      // 문예지하차도 상세의 위험·취약정보에서 차단시설 등 설비 정보를 확인한다
      {
        click: { sel: Entity, text: "만년지하차도" },
        orElse: [{ open: "map", click: { sel: MapPinAny, text: "만년지하차도" } }],
        focus: ["panel", { sel: MdText, text: "만년지하차도" }],
        say: "갑천 쪽 하천 인접 지하차도를 차례로 눌러 봅니다. 먼저 만년지하차도,",
        wait: 1000,
      },
      {
        click: { sel: Entity, text: "갑천지하차도" },
        orElse: [{ open: "map", click: { sel: MapPinAny, text: "갑천지하차도" } }],
        focus: ["panel", { sel: MdText, text: "갑천지하차도" }],
        say: "이어서 갑천지하차도,",
        wait: 1000,
      },
      {
        click: { sel: Entity, text: "문예지하차도" },
        orElse: [{ open: "map", click: { sel: MapPinAny, text: "문예지하차도" } }],
        focus: ["panel", { sel: MdText, text: "문예지하차도" }],
        say: "그리고 문예지하차도까지, 모두 갑천 가까이에 있다는 것을 지도에서 확인할 수 있습니다.",
        wait: 1000,
      },
      {
        click: { sel: Tab, text: "문예지하차도" },
        orElse: [{ click: { sel: RefDetail } }],
        focus: ["panel"],
        say: "문예지하차도의 상세를 열고,",
        wait: 700,
      },
      {
        scroll: { sel: `${UI.detailPane} .ev-sec`, text: "위험·취약정보" },
        focus: [{ sel: `${UI.detailPane} .ev-sec`, text: "위험·취약정보" }],
        orElse: [{ scroll: { sel: DetailKv }, focus: [{ sel: DetailKv }] }],
        say: "위험·취약정보에서 차단시설 같은 설비 정보와 통제 기준을 확인합니다.",
      },
      // 사용자 지시 2026-11-19 — 침수 위험지역을 요약 보기로 한 번 보이고, 상세가 있는 지구를 눌러 상세도 한 번 보인다
      {
        open: "map",
        click: { sel: `${Panel} .sm-map-toggle`, text: "요약 보기" },
        focus: ["panel"],
        wait: 1500,
        say: "요약 보기로 바꾸면 하천 주변 침수 위험지역과 지하차도가 자치구별로 몇 곳인지 한눈에 비교할 수 있습니다.",
      },
      { silentClick: { sel: `${Panel} .sm-map-toggle`, text: "지도 보기" }, wait: 300 },
      { click: { sel: Entity, text: "정림" }, wait: 600 },
      {
        click: { sel: Tab, text: "정림" },
        orElse: [{ click: { sel: RefDetail } }],
        focus: ["panel"],
        say: "답에서 정림 지구를 누르면, 위험등급과 지정 사유 같은 상세정보를 바로 확인할 수 있습니다.",
      },
    ],
    outro: "호우특보가 내려지면 어느 구간부터 진입을 막고 안내 방송을 할지, 이 목록이 현장 점검의 출발점이 됩니다.",
  },
  // 6막 — 행안부 실장 보고(2026-11-25 · 사용자 지시 2026-11-24): 「부산 + 인제(매뉴얼)」·「서울 + 부산 + 인제」.
  // 중간보고 회의록(김인건 서기관 — 사건 중심·당시 강우 조건·신고와 기상 융합·홍수경보 때 조치)과 지자체 의견수렴(언제 통제·대피, 인제 캠핑장)을 반영.
  // 범용 업무 질문이 뼈대, 날짜가 박힌 사건 질문은 「한 방」 장면에만. 행동매뉴얼은 질문 하나 + 대응절차 화면으로 묶는다.
  // 답은 한눈 요약 질의 IG-BS-13~17 · IG-IJ-08·09 · IG-SE-01~04(11/24 T3Q 실측 답을 보고 짚을 곳을 골랐다).
  // 주의: IG-BS-17(119 신고)의 사건 「2024년 9.19.~9.21. 호우」는 열지 않는다 — 그 사건 타임라인의 다른 지역 재해구호 기록에 가려지지 않은 실명이 있다(T3Q 수정 요청 11/24).
  {
    label: "부산 · 호우경보 때 먼저 볼 곳",
    pinId: "IG-BS-13",
    region: "busan",
    intro: "주의보가 경보로 올라설 때를 대비해, 경보가 나면 먼저 확인해야 할 시설을 한 번에 추려 봅니다.",
    steps: [
      // 글을 먼저 넓게 읽고(패널 접기) 지도가 필요할 때 편다 · 말할 때 짚은 곳이 이미 보이게(사용자 지시 2026-11-24)
      {
        fold: true,
        scroll: { sel: MdText, text: "D·E등급" },
        focus: [{ sel: MdText, text: "D·E등급" }],
        say: "하천 가까이 있는 지하차도와 위험 급경사지, 관리 중인 개선지구가 종류별로 정리됩니다.",
      },
      {
        scroll: { sel: MdTable },
        focus: [{ sel: MdTable }],
        say: "지하차도마다 재해위험등급과 통제 수위, 차단시설이 함께 나와 어디부터 통제를 준비할지 바로 보입니다.",
      },
      { open: "map", focus: ["panel"], say: "같은 대상이 지도에도 함께 표시됩니다.", wait: 800 },
      { click: { sel: Entity, text: "장전지하차도" }, wait: 600 },
      {
        click: { sel: Tab, text: "장전지하차도" },
        orElse: [{ click: { sel: RefDetail } }],
        focus: ["panel"],
        say: "온천천 옆 장전지하차도의 상세를 열어 봅니다.",
      },
      // 상세를 연 뒤 내려서 위험·취약정보 → 진입차단시설을 짚으며 말한다(사용자 지시 2026-11-24). 값은 T3Q-15 UP-630 실측(11/24)
      {
        scroll: { sel: DetailField, text: "위험·취약정보" },
        focus: [{ sel: DetailField, text: "위험·취약정보" }],
        say: "아래로 내려 위험·취약정보를 보면, 하천 500미터 안에 있는 U자형 지하차도이고,",
        wait: 400,
      },
      {
        scroll: { sel: DetailField, text: "진입차단시설" },
        focus: [{ sel: DetailField, text: "진입차단시설" }, { sel: DetailField, text: "통제 기준 수심" }],
        say: "진입차단시설과 통제 기준 수심까지 나와 있어, 경보가 나면 바로 차단을 준비할 수 있습니다.",
        wait: 600,
      },
    ],
    outro: "경보가 나기 전에 통제를 준비할 곳을 목록과 지도로 함께 확인했습니다.",
  },
  {
    label: "부산 · 2020년 7월 23일, 그 비가 지금 온다면",
    pinId: "IG-BS-14",
    region: "busan",
    intro: "2020년 7월 23일 부산에는 시간당 80밀리미터가 넘는 비가 내렸습니다. 그때 어디가 잠겼는지, 지금 같은 비가 오면 어디가 위험한지 묻습니다.",
    steps: [
      {
        fold: true,
        scroll: { sel: MdText, text: "81.6" },
        focus: [{ sel: MdText, text: "81.6" }],
        say: "먼저 그날 관측된 시간당 최대 강우량과 하루 강우량이 나옵니다.",
      },
      {
        scroll: { sel: MdTable },
        focus: [{ sel: MdTable }],
        say: "이어서 어느 동네가 얼마나 넓게, 얼마나 깊게 잠겼는지 침수흔적 기록으로 정리됩니다.",
      },
      { open: "map", focus: ["panel"], say: "지도에는 그때의 침수흔적과 지금의 취약시설이 함께 겹쳐 보입니다.", wait: 1000 },
    ],
    outro: "과거 사건의 강우 조건을 지금의 위험시설과 이어 보면, 같은 비가 왔을 때 어디부터 대비할지 미리 정할 수 있습니다.",
  },
  {
    label: "부산 · 경보는 20시, 통제는 22시 53분",
    pinId: "IG-BS-15",
    region: "busan",
    intro: "같은 날 특보와 재난문자, 통제가 어떤 순서로 이뤄졌는지 사건 타임라인으로 되짚습니다.",
    steps: [
      // 「시간순」이라고 말할 때 이미 표가 보이게 내려 짚는다(사용자 지시 2026-11-24)
      {
        fold: true,
        scroll: { sel: MdTable },
        focus: [{ sel: MdTable }],
        say: "호우특보와 재난문자, 도로와 지하차도 통제가 시간순으로 정리됩니다.",
      },
      {
        scroll: { sel: `${MdTable} tr`, text: "20:00" },
        focus: [{ sel: `${MdTable} tr`, text: "20:00" }],
        say: "저녁 8시, 부산 전역에 호우경보가 발효되었고,",
      },
      {
        scroll: { sel: `${MdTable} tr`, text: "22:53" },
        focus: [{ sel: `${MdTable} tr`, text: "22:53" }],
        say: "초량 제1·2 지하차도 통제 안내는 밤 10시 53분에 나갔습니다. 경보 뒤 세 시간 가까이 지나서입니다.",
      },
      {
        click: { sel: Entity, text: "2020년 7.23" },
        waitFor: EventTimeline,
        orElse: [{ click: { sel: RefDetail }, waitFor: EventTimeline }],
        focus: ["panel"],
        say: "사건을 열어 보면,",
      },
      {
        scroll: { sel: `${EventTimeline} > li` },
        focus: [{ sel: EventTimeline }],
        say: "당시 발송된 재난문자와 특보 기록이 원본 그대로 시간순으로 이어집니다.",
        wait: 600,
      },
    ],
    outro: "경보가 난 뒤 무엇을 언제 통제해야 하는지, 지금의 매뉴얼로 이어서 확인합니다.",
  },
  {
    label: "부산 · 호우경보 때 매뉴얼상 누가 무엇을",
    pinId: "IG-BS-16",
    region: "busan",
    intro: "지금 같은 경보가 나면 행동매뉴얼은 누가 무엇을 하도록 정해 두었는지 묻습니다.",
    steps: [
      // 결론의 ①하천변 산책로 → ②하천 옆 지하차도 → ③주요 간선 지하차도 문단 전체를 강조(소제목만이 아니라 — 사용자 지시 2026-11-24)
      {
        fold: true,
        scroll: { sel: MdText, text: "간선" },
        focus: [{ sel: MdText, text: "비상1단계" }, { sel: MdText, text: "간선" }],
        say: "호우경보가 나면 비상 1단계로 올라가고, 통제는 하천변 산책로부터 하천 옆 지하차도, 주요 간선 지하차도 순서로 하도록 되어 있습니다.",
      },
      {
        scroll: { sel: MdTable },
        focus: [{ sel: MdTable }],
        say: "부서별 임무는 매뉴얼 쪽수와 함께 표로 정리됩니다.",
      },
      {
        click: { sel: `${LastTurn} .doc-cite` },
        waitFor: ".edp-tabs",
        focus: ["panel"],
        say: "근거 표시를 누르면 매뉴얼의 해당 쪽이 열려 원문을 바로 확인할 수 있습니다.",
        wait: 600,
      },
      {
        click: { sel: ".edp-tab", text: "원본 쪽" },
        focus: ["panel"],
        say: "원본 쪽으로 바꾸면 책자 그대로의 모습도 볼 수 있습니다.",
        wait: 1000,
      },
      ...sopSteps("세부 조치는 대응절차에서 단계별로 확인하고 진행 상황을 남깁니다."),
    ],
    outro: "실제 조치 여부는 현장 상황과 공식 기준에 따라 담당자가 판단합니다.",
  },
  {
    label: "부산 · 119 신고가 가장 많았던 날과 그날 비",
    pinId: "IG-BS-17",
    region: "busan",
    intro: "우리 지역에서 신고가 가장 많았던 날, 비는 얼마나 왔을까요. 119 신고와 기상 관측을 묶어 봅니다.",
    steps: [
      {
        fold: true,
        scroll: { sel: MdText, text: "9월 21일" },
        focus: [{ sel: MdText, text: "9월 21일" }, { sel: MdText, text: "378.5" }],
        say: "부산에서 풍수해 신고가 가장 많았던 날과, 그날의 강우량이 함께 나옵니다.",
      },
      {
        scroll: { sel: MdTable },
        focus: [{ sel: MdTable }],
        say: "구·군별로 어떤 신고가 몇 건이었는지도 정리됩니다.",
      },
    ],
    outro: "신고 기록과 그날의 비를 함께 보면, 비슷한 비가 올 때 어느 동네에서 신고가 몰릴지 가늠할 수 있습니다.",
  },
  {
    label: "인제 · 하천 인접 캠핑장 주변 범람 위험",
    pinId: "IG-IJ-08",
    region: "inje",
    intro: "인제군에는 계곡과 하천을 따라 캠핑장이 많습니다. 하천 바로 옆 캠핑장과 주변 위험지역을 확인합니다.",
    steps: [
      {
        fold: true,
        scroll: { sel: `${MdTable} tr`, text: "상남천" },
        focus: [{ sel: MdTable }],
        say: "하천에서 수십 미터밖에 떨어지지 않은 캠핑장이 하천별로 정리됩니다.",
      },
      {
        scroll: { sel: `${BodyBox} h3`, text: "자연재해위험지구" },
        focus: [{ sel: `${BodyBox} h3`, text: "자연재해위험지구" }],
        say: "캠핑장 가까이에 있는 개선지구와 붕괴위험 급경사지도 함께 짚어 줍니다.",
      },
      { open: "map", focus: ["panel"], say: "지도에서 캠핑장과 주변 위험지역이 얼마나 가까운지 봅니다.", wait: 1000 },
    ],
    outro: "사람이 머무는 곳과 위험지역의 거리를 알면, 특보 때 먼저 대피를 안내할 곳이 분명해집니다.",
  },
  {
    label: "인제 · 호우경보 때 야영객 대피는 누가 언제",
    pinId: "IG-IJ-09",
    region: "inje",
    intro: "경보가 나면 야영객 대피는 누가, 언제 해야 하는지 인제군 행동매뉴얼로 확인합니다.",
    steps: [
      {
        fold: true,
        scroll: { sel: MdText, text: "인제군수" },
        focus: [{ sel: MdText, text: "인제군수" }],
        say: "대피명령은 군수가 내리고, 현장 대피는 안전교통과와 경찰, 읍·면이 맡는다고 정리됩니다.",
      },
      {
        click: { sel: `${LastTurn} .doc-cite` },
        waitFor: ".edp-tabs",
        focus: ["panel"],
        say: "근거 표시를 누르면 인제군 매뉴얼의 해당 쪽을 바로 열어 확인할 수 있습니다.",
        wait: 600,
      },
    ],
    outro: "지역마다 매뉴얼은 달라도, 같은 방식으로 근거를 찾아 대응을 준비할 수 있습니다.",
  },
  {
    label: "전환 · 서울특별시",
    region: "seoul",
    intro: "이번에는 서울특별시를 살펴보겠습니다. 2022년 8월 집중호우 때 도심 저지대와 지하차도가 잠겼던 곳입니다.",
    dwellMs: 1200,
  },
  {
    label: "서울 · 침수흔적 구역 안 지하차도",
    pinId: "IG-SE-01",
    region: "seoul",
    intro: "과거에 물에 잠겼던 구역 안에 들어 있는 지하차도가 어디인지 확인합니다.",
    steps: [
      {
        fold: true,
        scroll: { sel: MdTable },
        focus: [{ sel: MdTable }],
        say: "침수흔적 구역 안에 바로 들어 있는 지하차도와, 경계 바로 옆에 있는 지하차도가 나뉘어 정리됩니다.",
      },
      // 지도 아이콘 → 말풍선 [상세 보기]로 상세를 열고, 왜 위험한지 상세 본문을 짚으며 말한다(사용자 지시 2026-11-24).
      // 노들길은 동 중심 점(dong_center)이라 정확 위치 점(Pin)이 아니다 — 답 속 이름을 눌러 지도를 그 자리로 옮긴 뒤 지도의 점을 누른다.
      // 상세 값은 T3Q-15 UP-831 실측(11/24): 위험등급 4 · 샛강 500m 안 · U형 · 인명피해우려지역 예 · 통제 수심 10cm · 스크린
      { open: "map", focus: ["panel"], say: "지도에서 위치를 함께 봅니다.", wait: 800 },
      { click: { sel: Entity, text: "노들길지하차도" }, focus: ["panel"], wait: 1200 },
      {
        click: { sel: MapPinAny, text: "노들길지하차도", visible: true },
        waitFor: UI.mapPopup,
        focus: ["panel"],
        say: "지도에서 노들길지하차도를 골라",
      },
      {
        click: { sel: PopDetail },
        orElse: [{ click: { sel: Tab, text: "노들길지하차도" } }],
        focus: ["panel"],
        say: "상세 보기로 엽니다.",
        wait: 400,
      },
      {
        scroll: { sel: DetailField, text: "인명피해우려지역" },
        focus: [{ sel: DetailField, text: "위험등급" }, { sel: DetailField, text: "하천 500m" }, { sel: DetailField, text: "인명피해우려지역" }],
        say: "샛강에서 500미터 안에 있는 U자형 지하차도이고, 인명피해 우려지역으로 지정되어 있어 침수 때 위험이 큰 곳입니다.",
        wait: 400,
      },
      {
        scroll: { sel: DetailField, text: "진입차단시설" },
        focus: [{ sel: DetailField, text: "통제 기준 수심" }, { sel: DetailField, text: "진입차단시설" }],
        say: "물이 10센티미터만 차도 통제하도록 되어 있고, 진입차단시설도 갖춰져 있습니다.",
        wait: 600,
      },
    ],
    outro: "물에 잠겼던 자리에 있는 지하차도는 다음 호우 때 가장 먼저 통제를 검토할 곳입니다.",
  },
  {
    label: "서울 · 2022년 8월 강남역, 그때와 지금",
    pinId: "IG-SE-02",
    region: "seoul",
    intro: "2022년 8월 강남역 일대가 잠겼을 때의 침수흔적과, 지금의 위험지구 지정 현황을 견줘 봅니다.",
    steps: [
      {
        fold: true,
        scroll: { sel: MdText, text: "1.8m" },
        focus: [{ sel: MdText, text: "1.8m" }],
        say: "2022년 8월 강남역 일대는 최대 1.8미터까지 잠겼습니다.",
      },
      // 서울 전체로 맞춘 지도에서는 침수흔적이 너무 작게 보인다 — 답에서 침수흔적을 눌러 그 범위로 확대한다(사용자 지시 2026-11-24)
      {
        click: { sel: Entity, text: "강남역사거리 일대" },
        orElse: [{ open: "map", click: { sel: MapPinAny, text: "강남역사거리" } }],
        focus: ["panel", { sel: MdText, text: "강남역사거리 일대" }],
        say: "강남역사거리 일대를 누르면 지도가 그 자리로 다가가, 실제로 잠겼던 범위가 그대로 그려집니다.",
        wait: 1200,
      },
      {
        click: { sel: Entity, text: "역삼동 858" },
        orElse: [{ open: "map", click: { sel: MapPinAny, text: "역삼동 858" } }],
        focus: ["panel", { sel: MdText, text: "역삼동 858" }],
        say: "바로 옆 역삼동 858 일원은 4만 제곱미터 넘게 잠겼습니다.",
        wait: 1200,
      },
      {
        scroll: { sel: `${MdTable} tr`, text: "자연재해위험개선지구" },
        focus: [{ sel: `${MdTable} tr`, text: "자연재해위험개선지구" }],
        say: "그런데 강남구에는 자연재해위험개선지구가 한 곳도 없습니다. 이웃한 서초구와 표로 바로 견줘 볼 수 있습니다.",
      },
    ],
    outro: "과거 피해와 지금의 지정 현황을 견주면, 관리가 비어 있는 곳을 찾을 수 있습니다.",
  },
  {
    label: "서울 · 119 신고가 가장 많았던 날과 그날 비",
    pinId: "IG-SE-03",
    region: "seoul",
    intro: "서울에서 신고가 가장 많았던 날, 비는 얼마나 왔는지 119 신고와 기상 관측을 묶어 봅니다.",
    steps: [
      {
        fold: true,
        scroll: { sel: MdText, text: "126.7" },
        focus: [{ sel: MdText, text: "314건" }, { sel: MdText, text: "126.7" }],
        say: "신고가 가장 많았던 날과 그날의 강우량이 함께 나오고,",
      },
      {
        scroll: { sel: MdText, text: "은평구" },
        focus: [{ sel: MdText, text: "은평구" }],
        say: "자치구별 신고 건수까지 정리됩니다.",
      },
    ],
    outro: "신고 기록과 그날의 비를 함께 보면, 비슷한 비가 올 때 어느 동네에서 신고가 몰릴지 가늠할 수 있습니다.",
  },
  {
    label: "서울 · 개인정보는 가려서 보여 줍니다",
    pinId: "IG-SE-04",
    region: "seoul",
    intro: "재난문자에는 개인정보가 담길 때가 있습니다. 같은 기간 서울에서 나간 실종자 찾기 문자를 봅니다.",
    steps: [
      {
        fold: true,
        scroll: { sel: `${BodyBox} li`, text: "노원구" },
        focus: [{ sel: BodyBox }],
        say: "실종자의 이름과 나이, 인상착의, 사진 주소는 원천에서 가려져 오고, 화면에는 가림으로 표시됩니다.",
      },
    ],
    outro: "개인정보는 원천에서 가린 상태로만 다루고, 화면은 가린 자리를 그대로 알려 줍니다.",
  },
  {
    label: "마무리",
    // 기준지역을 부산으로 되돌리면 대화가 새로 시작되어 첫 화면으로 돌아간다(사용자 지시 2026-11-04).
    region: "busan",
    intro:
      "지금까지 호우 예비특보에서 주의보로 상황이 바뀌는 동안, 재난안전 담당자가 어떤 정보를 확인하고 업무에 활용하는지 살펴봤습니다. " +
      "특보의 변화를 확인하고, 위험지역과 시설을 찾아보고, 상세정보와 과거 피해·대응 기록까지 연결해서 검토했습니다. " +
      "부산과 인제, 대전처럼 지역이 달라도 같은 방식으로 지역의 위험정보를 확인하고 대응에 활용할 수 있습니다. " +
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

/**
 * 시연 시나리오(사용자 지시 2026-11-18) — [자동 시연]을 누르면 고른다. 장면은 AutoScript 를 이름(label)으로 골라 쓰고,
 * 시나리오에 맞지 않는 안내만 바꿔 읽는다.
 *  · 부산 + 인제 = 부산 하루 전체 + 인제
 *  · 부산 + 대전 = 부산은 AI 모드 흐름(예비특보 → 주의보 → 브리핑) + 점검 우선순위 + 대응절차, 지역 정보 조회는 대전 4장면 전부
 *    (대전과 겹치는 부산 위험지역·대응수위·과거 사례·강우 조건 장면은 뺀다 — 7~8분)
 *  · 부산 + 인제 + 대전(사용자 지시 2026-11-19) = 부산은 「부산 + 대전」과 같은 AI 모드 흐름, 이어서 인제 계곡 → 대전 4장면, 마무리는 짧게
 */
export type DemoScenarioId = "busan-inje" | "busan-daejeon" | "busan-inje-daejeon" | "busan-inje-manual" | "seoul-busan-inje"
export interface DemoScenario {
  id: DemoScenarioId
  name: string
  desc: string
  /** 대략 걸리는 시간(분) — 고르는 창에 보인다 */
  minutes: string
  scenes: string[]
  /** 장면 이름 → 이 시나리오에서 바꿔 읽는 안내 */
  text?: Record<string, Partial<Pick<AutoScene, "intro" | "outro">>>
}

const BusanDay = [
  "프롤로그 · AI 모드 소개",
  "11:00 · 호우 예비특보, AI 모드 시작",
  "11:30 · 온천천 주변 위험지역",
  "11:40 · 동래·연제·금정 위험지구 전체",
  "15:00 · 호우주의보, AI 모드 자동 감지",
  "15:05 · 현재 상황 브리핑",
  "15:10 · 점검 우선순위",
  "15:20 · 강우 조건으로 묻고 대응절차까지",
  "15:50 · 온천천 대응수위",
  "15:55 · 과거 침수 사례와 당시 대응",
]
/** 부산 + 대전 · 부산 + 인제 + 대전의 부산 부분 — AI 모드 흐름(예비특보 → 주의보 → 브리핑) + 점검 우선순위 + 대응절차 */
const BusanAim = [
  "프롤로그 · AI 모드 소개",
  "11:00 · 호우 예비특보, AI 모드 시작",
  "15:00 · 호우주의보, AI 모드 자동 감지",
  "15:05 · 현재 상황 브리핑",
  "15:10 · 점검 우선순위",
  "15:15 · 대응절차 확인",
]
const Daejeon = [
  "전환 · 대전광역시",
  "대전 · 2024년 7월 집중호우 침수흔적",
  "대전 · 2024년 7월 10일 호우 대피·통제",
  "대전 · 3대 하천 산책로·하상도로 주변",
]

export const DemoScenarios: DemoScenario[] = [
  {
    id: "busan-inje",
    name: "부산 + 인제",
    desc: "부산 담당자의 하루(예비특보부터 과거 사례까지) 뒤 인제 계곡 숙박·야영장",
    minutes: "약 12분",
    scenes: [...BusanDay, "전환 · 인제군", "인제 · 진동리 계곡 숙박·야영장 주변", "마무리"],
    text: {
      마무리: {
        intro:
          "지금까지 호우 예비특보에서 주의보로 상황이 바뀌는 동안, 재난안전 담당자가 어떤 정보를 확인하고 업무에 활용하는지 살펴봤습니다. " +
          "특보의 변화를 확인하고, 위험지역과 시설을 찾아보고, 상세정보와 과거 피해·대응 기록까지 연결해서 검토했습니다. " +
          "부산과 인제처럼 지역이 달라도 같은 방식으로 지역의 위험정보를 확인하고 대응에 활용할 수 있습니다. " +
          "이상으로 시연을 마치겠습니다.",
      },
    },
  },
  {
    id: "busan-daejeon",
    name: "부산 + 대전",
    desc: "부산에서 AI 모드 특보 감지·브리핑 → 점검 우선순위 → 대응절차, 이어서 대전 과거 침수사례 → 위험·취약정보 → 하천계획·시설",
    minutes: "약 8분",
    scenes: [...BusanAim, ...Daejeon, "마무리"],
    text: {
      마무리: {
        intro:
          "지금까지 부산에서는 호우 예비특보가 주의보로 바뀌는 동안 AI 모드가 특보 변화를 알리고, 점검 우선순위와 대응절차까지 확인하는 흐름을, " +
          "대전에서는 2024년 7월 침수흔적에서 출발해 그때의 대응과 하천 주변 위험지역까지 이어서 살펴봤습니다. " +
          "부산과 대전처럼 지역이 달라도 같은 방식으로 지역의 위험정보를 확인하고 대응에 활용할 수 있습니다. " +
          "이상으로 시연을 마치겠습니다.",
      },
    },
  },
]

// 사용자 지시 2026-11-24 — 행안부 실장 보고(11/25 · 1.2배속). AI 모드로 시작하는 흐름은 그대로 두고, 범용 업무 질문 + 사건 「한 방」 +
// 행동매뉴얼(질문 하나 → 근거 쪽 → 대응절차)로 묶는다. 마무리는 한 문장.
const AimStart = ["프롤로그 · AI 모드 소개", "11:00 · 호우 예비특보, AI 모드 시작", "15:00 · 호우주의보, AI 모드 자동 감지", "15:05 · 현재 상황 브리핑"]
const ShortEnd = { 마무리: { intro: "이상으로 시연을 마치겠습니다." } }
const InjeShort = {
  "전환 · 인제군": { intro: "이번에는 산간 지역인 인제군을 살펴보겠습니다. 계곡과 하천을 따라 사람이 머무는 곳이 많은 지역입니다." },
}
DemoScenarios.push(
  {
    id: "busan-inje-manual",
    name: "부산 + 인제(매뉴얼)",
    desc: "부산 AI 모드 특보 감지·브리핑 → 경보 때 먼저 볼 곳 → 2020년 7월 23일 그 비가 지금 온다면 · 경보와 통제 시각 → 매뉴얼 근거·대응절차 → 119 신고와 그날 비, 이어서 인제 캠핑장 주변 위험 → 야영객 대피 매뉴얼",
    minutes: "1.2배속 약 8분",
    scenes: [
      ...AimStart,
      "부산 · 호우경보 때 먼저 볼 곳",
      "부산 · 2020년 7월 23일, 그 비가 지금 온다면",
      "부산 · 경보는 20시, 통제는 22시 53분",
      "부산 · 호우경보 때 매뉴얼상 누가 무엇을",
      "부산 · 119 신고가 가장 많았던 날과 그날 비",
      "전환 · 인제군",
      "인제 · 하천 인접 캠핑장 주변 범람 위험",
      "인제 · 호우경보 때 야영객 대피는 누가 언제",
      "마무리",
    ],
    text: { ...InjeShort, ...ShortEnd },
  },
  {
    id: "seoul-busan-inje",
    name: "서울 + 부산 + 인제",
    desc: "부산 AI 모드 특보 감지·브리핑 → 경보 때 먼저 볼 곳 → 경보와 통제 시각 → 매뉴얼 근거·대응절차, 이어서 서울 침수흔적 안 지하차도 → 강남역 그때와 지금 → 119 신고와 그날 비 → 개인정보 가림, 인제 캠핑장 → 야영객 대피",
    minutes: "1.2배속 약 9분",
    scenes: [
      ...AimStart,
      "부산 · 호우경보 때 먼저 볼 곳",
      "부산 · 경보는 20시, 통제는 22시 53분",
      "부산 · 호우경보 때 매뉴얼상 누가 무엇을",
      "전환 · 서울특별시",
      "서울 · 침수흔적 구역 안 지하차도",
      "서울 · 2022년 8월 강남역, 그때와 지금",
      "서울 · 119 신고가 가장 많았던 날과 그날 비",
      "서울 · 개인정보는 가려서 보여 줍니다",
      "전환 · 인제군",
      "인제 · 하천 인접 캠핑장 주변 범람 위험",
      "인제 · 호우경보 때 야영객 대피는 누가 언제",
      "마무리",
    ],
    text: {
      ...InjeShort,
      ...ShortEnd,
      "전환 · 서울특별시": { intro: "이번에는 서울특별시를 살펴보겠습니다. 2022년 8월 집중호우 때 도심 저지대와 지하차도가 잠겼던 곳입니다." },
    },
  },
)

// 사용자 지시 2026-11-19 — 부산 + 인제 + 대전. 연결 안내는 앞 지역에서 본 것에 맞춰 바꾸고, 마무리는 짧게.
DemoScenarios.push({
  id: "busan-inje-daejeon",
  name: "부산 + 인제 + 대전",
  desc: "부산에서 AI 모드 특보 감지·브리핑 → 점검 우선순위 → 대응절차, 이어서 인제 계곡 숙박·야영장, 대전 과거 침수흔적 → 하천 주변 위험지역",
  minutes: "약 9분",
  scenes: [...BusanAim, "전환 · 인제군", "인제 · 진동리 계곡 숙박·야영장 주변", ...Daejeon, "마무리"],
  text: {
    "전환 · 인제군": {
      intro:
        "이번에는 산간 지역인 인제군을 살펴보겠습니다. " +
        "부산에서 특보 변화와 점검 우선순위를 확인했다면, 인제에서는 계곡 주변 산사태와 급경사지 붕괴 위험에 주의를 기울여야 합니다.",
    },
    "인제 · 진동리 계곡 숙박·야영장 주변": {
      outro: "사람이 머무는 곳 가까이의 위험 사면과 점검 이력을 미리 알면, 특보 때 먼저 살필 곳이 분명해집니다.",
    },
    "전환 · 대전광역시": {
      intro:
        "마지막으로 대전광역시를 살펴보겠습니다. " +
        "갑천과 유등천, 대전천이 도심을 가로지르는 대전에서는 하천변 저지대 침수가 중요합니다. " +
        "과거 침수흔적에서 출발해 그때의 대응과 하천 주변 위험지역까지 확인하겠습니다.",
    },
    마무리: {
      intro:
        "부산과 인제, 대전에서 특보 변화부터 위험지역, 과거 피해와 대응 기록까지 살펴봤습니다. " +
        "지역이 달라도 같은 방식으로 위험정보를 확인하고 대응에 활용할 수 있습니다. 이상으로 시연을 마치겠습니다.",
    },
  },
})

export const scenarioById = (id: string | null | undefined): DemoScenario | undefined => DemoScenarios.find((s) => s.id === id)

/** 시나리오의 장면 — 이름 순서대로, 바꿔 읽는 안내를 입혀서. 시나리오가 없으면 대본 전체 */
export function scenarioScenes(id?: DemoScenarioId | null): AutoScene[] {
  const sc = scenarioById(id)
  if (!sc) return AutoScript
  return sc.scenes.map((label) => {
    const scene = AutoScript.find((s) => s.label === label)
    if (!scene) throw new Error(`자동 시연 시나리오 ${sc.id}: 장면 없음 ${label}`)
    return { ...scene, ...(sc.text?.[label] ?? {}) }
  })
}

/** 이번에 돌릴 장면들과 그 질문. 질문이 목록에 없으면 pin 은 null(내레이션 장면과 같이 다룬다). */
export function scenesFrom(pins: DemoPin[], scenario?: DemoScenarioId | null): { scene: AutoScene; pin: DemoPin | null; fallback: DemoPin | null }[] {
  const byId = new Map(pins.map((p) => [p.pin_id, p]))
  return scenarioScenes(scenario).map((scene) => ({
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
