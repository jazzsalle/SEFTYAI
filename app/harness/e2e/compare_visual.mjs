// 하네스 — 시각화 적용 전후 비교 그림: 같은 장면의 전·후 화면을 한 장에 나란히(왼쪽 적용 전 · 오른쪽 적용 후).
// node harness/e2e/compare_visual.mjs   → harness/reports/shots/visual/compare_*.png
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { APP } from "../t3q/client.mjs";

const V = join(APP, "harness", "reports", "shots", "visual");
const OLD = join(APP, "harness", "reports", "shots", "viz"); // 이번 작업 직전(V2~V4 임시 적용) 사건 상세
const PAIRS = [
  ["1_briefing", "브리핑 — 현황판·답변", join(V, "before_D_brief_1.png"), join(V, "after_D_brief_1.png")],
  ["2_similar_list", "유사재난 사례 목록", join(V, "before_A_list.png"), join(V, "after_A_list.png")],
  // 사건 상세는 같은 사건(2021년 07.05~07.08 호우)의 패널만 — 적용 후는 harness/e2e/shots_event.mjs after
  ["3_event_detail", "사건 상세(오른쪽 패널) — 위쪽", join(OLD, "after2_busan_event_1.png"), join(V, "after_event_1.png")],
  ["4_event_detail_2", "사건 상세(오른쪽 패널) — 아래쪽", join(OLD, "after2_busan_event_2.png"), join(V, "after_event_2.png")],
  ["5_risk_list", "위험·취약 목록", join(V, "before_B_risk_list.png"), join(V, "after_B_risk_list.png")],
  ["6_flood", "침수흔적 목록", join(V, "before_B_flood.png"), join(V, "after_B_flood.png")],
  ["7_risk_detail", "대상 상세", join(V, "before_B_detail_1.png"), join(V, "after_B_detail_1.png")],
  ["8_laptop", "노트북 화면(1366×768) 첫 화면", join(V, "before_C_first_view_1366.png"), join(V, "after_C_first_view_1366.png")],
];
const uri = (p) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;
const exe = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 2300, height: 900 }, deviceScaleFactor: 1 });
for (const [key, title, before, after] of PAIRS) {
  if (!existsSync(before) || !existsSync(after)) { console.log("건너뜀(그림 없음)", key); continue; }
  await page.setContent(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    body{margin:0;background:#f4f5f6;font-family:Pretendard,'Malgun Gothic',sans-serif;color:#1e2124}
    h1{margin:0;padding:18px 24px 6px;font-size:26px}
    .row{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:12px 24px 24px}
    .col h2{margin:0 0 8px;font-size:20px}.col.b h2{color:#464c53}.col.a h2{color:#256ef4}
    img{width:100%;display:block;border:1px solid #cdd1d5;border-radius:6px;background:#fff}
  </style></head><body><h1>${title}</h1><div class="row">
    <div class="col b"><h2>적용 전</h2><img src="${uri(before)}"></div>
    <div class="col a"><h2>적용 후</h2><img src="${uri(after)}"></div>
  </div></body></html>`);
  await page.waitForTimeout(300);
  const out = join(V, `compare_${key}.png`);
  await page.screenshot({ path: out, fullPage: true });
  console.log("비교 그림", `compare_${key}.png`);
}
await browser.close();
