// 「재난담당자의 하루」 시연 따라하기 슬라이드 — 대본 v3.3.2(content.json) + 로컬 리허설 화면(deck_*.png)
// node build.cjs [출력.pptx] — 기본 출력 ../11_demo_day_slides.pptx (pptxgenjs·sharp 는 이 폴더에서 npm install)
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const sharp = require("sharp");
/** pptxgenjs 는 테마 색을 쓰지 못한다 — 써낸 뒤 ppt/theme/theme1.xml 의 색 묶음을 이 자료 색으로 바꾼다(jszip 은 pptxgenjs 에 딸려 온다) */
async function applyTheme(file, theme) {
  const JSZip = require(require.resolve("jszip", { paths: [require.resolve("pptxgenjs")] }));
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const part = "ppt/theme/theme1.xml";
  const xml = await zip.file(part).async("string");
  const slots = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];
  const scheme = `<a:clrScheme name="${theme.name}">${slots.map((k) => `<a:${k}><a:srgbClr val="${theme.colors[k]}"/></a:${k}>`).join("")}</a:clrScheme>`;
  const out = xml.replace(/<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/, () => scheme);
  if (!out.includes(scheme)) throw new Error("테마 색 묶음을 찾지 못함");
  zip.file(part, out);
  // 글 언어 = 한국어 → PowerPoint 가 한글을 어절 단위로 줄바꿈한다(en-US 면 글자마다 끊는다) // QA_FIX_APPLIED
  for (const name of Object.keys(zip.files).filter((n) => /^ppt\/(slides\/slide|slideLayouts\/slideLayout|slideMasters\/slideMaster)\d+\.xml$/.test(n) || n === "ppt/presentation.xml")) {
    const x = await zip.file(name).async("string");
    zip.file(name, x.replace(/lang="en-US"/g, 'lang="ko-KR"'));
  }
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

const HERE = __dirname;
const SHOTS = process.env.DECK_SHOTS || path.join(HERE, "..", "..", "..", "..", "app", "harness", "reports", "shots");
const OUT = path.resolve(process.argv[2] || path.join(HERE, "..", "11_demo_day_slides.pptx"));
const IMG = path.join(HERE, "img");
fs.mkdirSync(IMG, { recursive: true });
const content = JSON.parse(fs.readFileSync(path.join(HERE, "content.json"), "utf8"));

const FONT = "맑은 고딕";
const THEME = {
  name: "재난담당자의 하루",
  headFontFace: FONT,
  bodyFontFace: FONT,
  colors: {
    dk1: "1E2633", lt1: "FFFFFF", dk2: "1B2B4B", lt2: "F2F4F7",
    accent1: "0E6BA8", accent2: "2F7D4A", accent3: "6B4FA0", accent4: "C26A06", accent5: "0F766E", accent6: "475569",
    hlink: "0E6BA8", folHlink: "6B4FA0",
  },
};
const HEX = { muted: "5B6474", line: "D5DAE1", faint: "8A93A3", amberBg: "FFF4E5", slateBg: "EEF1F5", tealBg: "E7F4F2", navyBg: "E8EDF6" };
const REGION = {
  부산: { c: "accent1", hex: THEME.colors.accent1, bg: "E6F0F8", win: "부산 창 · bs_safety01" },
  인제: { c: "accent2", hex: THEME.colors.accent2, bg: "E8F3EC", win: "인제 창 · ij_safety01" },
  영천: { c: "accent3", hex: THEME.colors.accent3, bg: "EFEAF7", win: "영천 창 · yc_safety02" },
};
const MODE = { 실시간: { c: "accent4", note: "기다림 있음" }, 예열: { c: "accent5", note: "바로 뜸" }, "앱 화면": { c: "accent6", note: "에이전트 질의 없음" } };

// ── 글 너비 어림(맑은 고딕) — 넘치지 않게 글자 크기를 고른다 ──
function emWidth(s, hw = 0.93) {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if ((c >= 0xac00 && c <= 0xd7a3) || (c >= 0x3130 && c <= 0x318f) || (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3000 && c <= 0x303f) || (c >= 0xff00 && c <= 0xffef)) w += hw;
    else if (ch === " ") w += 0.3;
    else if (/[A-Z0-9]/.test(ch)) w += 0.62;
    else if (/[a-z]/.test(ch)) w += 0.54;
    else if ("·.,:;'\"()[]~-—/|".includes(ch)) w += 0.42;
    else w += 0.7;
  }
  return w;
}
const linesOf = (t, wIn, pt) => {
  const cap = (wIn * 72 - 14) / pt;
  return String(t).split("\n").reduce((n, p) => n + Math.max(1, Math.ceil(emWidth(p) / cap)), 0);
};
/** 문단들의 높이(인치) — 줄 간격 1.18, 문단 뒤 간격 */
const hOf = (paras, wIn, pt, after = 5) => (paras.reduce((n, p) => n + linesOf(p, wIn, pt), 0) * pt * 1.18 + paras.length * after) / 72 + 0.12;

// ── 화면 사진 ──
const shotPath = (n) => path.join(SHOTS, `deck_${n}.png`);
const has = (n) => fs.existsSync(shotPath(n));
const firstOf = (alts) => (Array.isArray(alts) ? alts : [alts]).find(has) ?? null;
/** 주황 테두리(#f59e0b, 4px) 찾기 — 같은 줄 길이 60px 넘는 가로 줄이 세 줄 겹치는 곳 */
async function highlightBox(file) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const isO = (x, y) => {
    const i = (y * W + x) * C;
    return Math.abs(data[i] - 245) < 22 && Math.abs(data[i + 1] - 158) < 26 && data[i + 2] < 60;
  };
  // 테두리 가로 변 = 주황 줄(3줄 겹침) 아래 6px 안쪽이 주황이 아닌 곳 — 주황으로 칠한 표지(「주의」·AI 모드 단추)는 안쪽도 주황이라 빠진다
  // 위(4px)·아래(7px)가 모두 주황이 아니어야 테두리 변(칠한 표지의 윗변·아랫변은 한쪽이 주황)
  const edge = (x0, x1, y) => {
    const ya = Math.max(0, y - 4);
    const yb = Math.min(H - 1, y + 7);
    let a = 0;
    let b = 0;
    let n = 0;
    for (let x = x0 + 6; x <= x1 - 6; x += 3) {
      n++;
      if (isO(x, ya)) a++;
      if (isO(x, yb)) b++;
    }
    return n > 0 && a / n < 0.3 && b / n < 0.3;
  };
  let box = null;
  for (let y = 0; y < H - 3; y++) {
    let run = 0;
    for (let x = 0; x <= W; x++) {
      if (x < W && isO(x, y) && isO(x, y + 1) && isO(x, y + 2)) run++;
      else {
        if (run >= 22 && edge(x - run, x - 1, y)) box = grow(box, x - run, y, x - 1, y + 3);
        run = 0;
      }
    }
  }
  return box;
  function grow(b, x0, y0, x1, y1) {
    return b ? { x0: Math.min(b.x0, x0), y0: Math.min(b.y0, y0), x1: Math.max(b.x1, x1), y1: Math.max(b.y1, y1) } : { x0, y0, x1, y1 };
  }
}
/** 사진 하나 준비 — JPEG 로, crop 이면 주황 테두리 둘레를 16:10 으로 잘라 키운다 */
async function prep(name, { crop = false, minW = 760, pad = crop === "tight" ? 1.12 : 1.9 } = {}) {
  const src = shotPath(name);
  const out = path.join(IMG, `${name}${crop === "tight" ? "_t" : crop ? "_z" : ""}.jpg`);
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs > fs.statSync(src).mtimeMs) {
    const m0 = await sharp(out).metadata();
    return { file: out, w: m0.width, h: m0.height };
  }
  const meta = await sharp(src).metadata();
  let region = null;
  if (crop) {
    const b = await highlightBox(src);
    if (b) {
      const cx = (b.x0 + b.x1) / 2;
      const cy = (b.y0 + b.y1) / 2;
      let w = Math.max(minW, (b.x1 - b.x0) * pad, ((b.y1 - b.y0) * pad) * 1.6);
      w = Math.min(w, meta.width);
      const h = Math.min(w / 1.6, meta.height);
      w = h * 1.6;
      const left = Math.round(Math.min(Math.max(0, cx - w / 2), meta.width - w));
      const top = Math.round(Math.min(Math.max(0, cy - h / 2), meta.height - h));
      region = { left, top, width: Math.round(w), height: Math.round(h) };
    }
  }
  // 답 카드(대화 이력에서 다시 연 화면 — 시나리오를 끈 뒤라 머리줄은 무대와 다르다) — 카드 머리(결론·표 시작)만 자른다
  if (!region && /_card$/.test(name)) region = { left: 478, top: 142, width: 924, height: 560 };
  if (!region && /^op4_/.test(name)) region = { left: 0, top: 0, width: 1600, height: 150 };
  // 머리줄 기준지역 칸 · 기준지역 확인 창 · AI 모드 띠 — 고정 영역
  if (!region && /base_pick$/.test(name)) region = { left: 640, top: 0, width: 960, height: 104 };
  if (!region && /_dialog$/.test(name)) region = { left: 520, top: 330, width: 560, height: 340 };
  if (!region && /aim_band$/.test(name)) region = { left: 0, top: 96, width: 1600, height: 116 };
  let img = sharp(src);
  if (region) img = img.extract(region);
  await img.jpeg({ quality: 84, mozjpeg: true }).toFile(out);
  const m2 = await sharp(out).metadata();
  return { file: out, w: m2.width, h: m2.height };
}

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.author = "재난안전 AI 시범서비스";
pres.title = "재난담당자의 하루 — 시연 따라하기";
pres.subject = "2026-11-05 행정안전부 국장 보고 시연 대본 v3.3.2";
pres.theme = { headFontFace: FONT, bodyFontFace: FONT };
const C = pres.SchemeColor;
const W = 13.333;

const FOOT = { x: 0.5, y: 7.08, w: 8, h: 0.28, fontSize: 9, color: HEX.faint, fontFace: FONT };
pres.defineSlideMaster({
  title: "표지",
  background: { color: THEME.colors.dk2 },
  objects: [
  ],
});
pres.defineSlideMaster({
  title: "구역",
  background: { color: THEME.colors.dk2 },
  objects: [
  ],
  slideNumber: { x: 12.3, y: 7.0, w: 0.7, h: 0.3, fontSize: 10, color: "CADCFC", fontFace: FONT, align: "right" },
});
pres.defineSlideMaster({
  title: "단계",
  background: { color: "FFFFFF" },
  objects: [
    { text: { text: "재난담당자의 하루 · 시연 따라하기 · 대본 v3.3.2", options: FOOT } },
  ],
  slideNumber: { x: 12.3, y: 7.05, w: 0.7, h: 0.3, fontSize: 10, color: HEX.faint, fontFace: FONT, align: "right" },
});
pres.defineSlideMaster({
  title: "내용",
  background: { color: "FFFFFF" },
  objects: [
    { text: { text: "재난담당자의 하루 · 시연 따라하기 · 대본 v3.3.2", options: FOOT } },
  ],
  slideNumber: { x: 12.3, y: 7.05, w: 0.7, h: 0.3, fontSize: 10, color: HEX.faint, fontFace: FONT, align: "right" },
});

let objN = 0;
const on = (p) => `o${++objN}${p ? `_${p}` : ""}`;
const T = (slide, text, o) => slide.addText(text, { isTextBox: true, fontFace: FONT, margin: 0, objectName: on("t"), ...o });
const box = (slide, o) => slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { rectRadius: 0.08, line: { type: "none" }, objectName: on("box"), ...o });
const chip = (slide, x, y, w, text, fill, color = C.background1) => {
  box(slide, { x, y, w, h: 0.38, fill: { color: fill }, rectRadius: 0.19 });
  T(slide, text, { x, y, w, h: 0.38, fontSize: 13, bold: true, color, align: "center", valign: "middle" });
};
const label = (slide, x, y, w, text, color) => T(slide, text, { x, y, w, h: 0.28, fontSize: 12, bold: true, color, valign: "middle" });
/** 글 문단들 — 글머리(bullet: true | "num") */
const paras = (list, pt, { bullet = false, color = C.text1, bold = false, after = 5 } = {}) =>
  list.map((t, i) => ({
    text: t,
    options: {
      fontSize: pt, color, bold, paraSpaceAfter: after, breakLine: i < list.length - 1,
      ...(bullet === "num" ? { bullet: { type: "number", indent: 18 } } : bullet ? { bullet: { indent: 14 } } : {}),
    },
  }));

const hlCache = new Map();
const hasHighlight = async (name) => {
  if (!hlCache.has(name)) hlCache.set(name, !!(await highlightBox(shotPath(name))));
  return hlCache.get(name);
};
async function addImage(slide, name, x, y, w, { crop = false, caption = null } = {}) {
  const im = await prep(name, { crop });
  if (caption === CAP_A && !(await hasHighlight(name))) caption = "로컬 리허설 화면(2026-10-30)";
  if (caption === CAP_A && CAP_OVERRIDE[name]) caption = CAP_OVERRIDE[name];
  const h = w * (im.h / im.w);
  slide.addShape(pres.shapes.RECTANGLE, { x: x - 0.02, y: y - 0.02, w: w + 0.04, h: h + 0.04, fill: { color: HEX.line }, line: { type: "none" }, objectName: on("frame") });
  slide.addImage({ path: im.file, x, y, w, h, altText: caption ?? name, objectName: on("img") });
  if (caption) T(slide, caption, { x, y: y + h + 0.06, w, h: 0.26, fontSize: 10, color: HEX.muted });
  return h;
}

// ── 단계 슬라이드 ──
const SHOT = {
  "1": { a: [["s1_aim_btn"]], b: [["s1_aim_modal", "tight"]] },
  "2": { a: [["s01_aim_band"], ["s02_brief_btn", "tight"]], b: [["s02_board"]] },
  "3": { a: [["06_bs_sop_bar"]], b: [["06_bs_sop_panel"]] },
  "4": { a: [["s02_board"]], b: [["s04_cell4"]] },
  "5": { a: [["s5_BS-02_pick"]], b: [["s5_BS-02_card", "s5_BS-02_ans"]] },
  "6": { a: [["06_bs_sop_panel"]], b: [["06_bs_sop_16-1", "crop"]] },
  "7": { a: [["s7_BS-04_pick"]], b: [["s7_BS-04_card", "s7_BS-04_ans"]] },
  "8": { a: [["s8_BS-05_pick"]], b: [["s8_BS-05_card", "s8_BS-05_ans"]] },
  "9": { a: [["s9_BS-06_pick"]], b: [["s9_BS-06_card", "s9_BS-06_ans"]] },
  "10": { a: [["s10_base_pick"], ["s10_dialog"]], b: [["s10_BS-07-v3_card", "s10_BS-07-v3_ans"]] },
  "11-0": { a: [["s11-0_aim_btn"]], b: [["s11-0_aim_modal", "tight"]] },
  "11": { a: [["s11_IJ-01_pick"]], b: [["s11_IJ-01_card", "s11_IJ-01_ans"]] },
  "12": { a: [["s12_IJ-02_pick"]], b: [["s12_IJ-02_card", "s12_IJ-02_ans"]] },
  "13": { a: [["10_ij_sop_bar"]], b: [["10_ij_sop_40-6", "crop"]] },
  "13-1": { a: [["s13-1_IJ-04_pick"]], b: [["s13-1_IJ-04_card", "s13-1_IJ-04_ans"]] },
  "14": { a: [["s14_IJ-05-R_pick"]], b: [["s14_IJ-05-R_card", "s14_IJ-05-R_ans"]] },
  "15": { a: [["s15_IJ-07-R_pick"]], b: [["s15_IJ-07-R_card", "s15_IJ-07-R_ans"]] },
  "16-0": { a: [["s16-0_aim_btn"]], b: [["s16-0_aim_modal", "tight"]] },
  "16": { a: [["s16_YC-01-v3_pick"]], b: [["s16_YC-01-v3_card", "s16_YC-01-v3_ans"]] },
  "17": { a: [["s17_YC-02_pick"]], b: [["s17_YC-02_card", "s17_YC-02_ans"]] },
  "18": { a: [["s18_YC-04_pick"]], b: [["s18_YC-04_card", "s18_YC-04_ans"]] },
  "18-1": { a: [["s18-1_YC-05_pick"]], b: [["s18-1_YC-06_card", "s18-1_YC-06_ans"]] },
  "19": { a: [["s19_YC-09_pick"]], b: [["s19_YC-09_card", "s19_YC-09_ans"]] },
};
const pick = (spec) => (spec ?? []).map((alts) => {
  const crop = alts.includes("tight") ? "tight" : alts.includes("crop");
  const n = firstOf(alts.filter((a) => a !== "crop" && a !== "tight"));
  return n ? { n, crop } : null;
}).filter(Boolean);

function header(slide, st, part) {
  const R = REGION[st.region];
  const big = st.step.length <= 2;
  slide.addShape(pres.shapes.OVAL, { x: 0.5, y: 0.36, w: 0.88, h: 0.88, fill: { color: C[R.c] }, line: { type: "none" }, objectName: on("badge") });
  T(slide, st.step, { x: 0.5, y: 0.36, w: 0.88, h: 0.88, fontSize: big ? 26 : 16, bold: true, color: C.background1, align: "center", valign: "middle" });
  T(slide, [
    { text: st.region, options: { bold: true, color: C[R.c] } },
    { text: `  ·  ${st.clock}  ·  ${R.win}`, options: { color: HEX.muted } },
  ], { x: 1.55, y: 0.3, w: 7.2, h: 0.32, fontSize: 13, valign: "middle" });
  const tpt = Math.max(16, Math.min(24, Math.floor((7.3 * 72) / (emWidth(st.title, 1.02) * 1.04))));
  T(slide, st.title, { x: 1.55, y: 0.62, w: 7.4, h: 0.62, fontSize: tpt, bold: true, color: C.text1, valign: "middle" });
  // 오른쪽 표지: 방식 · 무대 시간 · (선택) · 1/2
  const chips = [];
  if (st.optional) chips.push({ t: "선택", fill: C.text2, w: 0.85 });
  chips.push({ t: st.mode, fill: C[MODE[st.mode].c], w: st.mode === "앱 화면" ? 1.2 : 1.0 });
  let x = W - 0.5;
  for (const c of chips.reverse()) {
    x -= c.w;
    chip(slide, x, 0.36, c.w, c.t, c.fill);
    x -= 0.12;
  }
  const times = [`무대 ${st.stageTime}`, st.cumulative ? `누적 ${st.cumulative}` : null, MODE[st.mode].note].filter(Boolean).join("  ·  ");
  T(slide, times, { x: W - 0.5 - 4.6, y: 0.82, w: 4.6, h: 0.3, fontSize: 11, color: HEX.muted, align: "right", valign: "middle" });
  if (part) T(slide, part, { x: 9.0, y: 0.3, w: W - 0.5 - 9.0 - 2.35, h: 0.32, fontSize: 12, bold: true, color: C[R.c], align: "right", valign: "middle" });
}

/** 왼쪽 단(글 덩어리들) — 넘치면 글자를 줄인다 */
function column(slide, blocks, x, y, w, hMax, R) {
  for (let base = 15; base >= 11; base -= 0.5) {
    let total = 0;
    const laid = blocks.map((b) => {
      const pt = Math.max(10.5, base + (b.dpt ?? 0));
      const inner = b.boxed ? w - 0.3 : w;
      const ind = b.bullet ? 0.3 : 0;
      const h = (b.label ? 0.3 : 0) + hOf(b.items, inner - ind, pt, b.after ?? 5) + (b.boxed ? 0.18 : 0);
      total += h + 0.14;
      return { ...b, pt, h };
    });
    if (total <= hMax || base <= 11) {
      let cy = y;
      for (const b of laid) {
        if (b.boxed) box(slide, { x, y: cy, w, h: b.h, fill: { color: b.boxed } });
        const ix = b.boxed ? x + 0.15 : x;
        const iw = b.boxed ? w - 0.3 : w;
        let ty = cy + (b.boxed ? 0.09 : 0);
        if (b.label) {
          label(slide, ix, ty, iw, b.label, b.labelColor ?? C[R.c]);
          ty += 0.3;
        }
        T(slide, paras(b.items, b.pt, { bullet: b.bullet, color: b.color ?? C.text1, bold: b.bold, after: b.after ?? 5 }), {
          x: ix, y: ty, w: iw, h: b.h - (b.label ? 0.3 : 0) - (b.boxed ? 0.18 : 0), valign: "top", fit: "none",
        });
        cy += b.h + 0.14;
      }
      return { base, total, over: total > hMax };
    }
  }
}

const NOTE_HEAD = (st) => `단계 ${st.step} · ${st.region} · ${st.clock} · ${st.title}\n방식 ${st.mode}${st.optional ? "(선택)" : ""} · 무대 ${st.stageTime}${st.cumulative ? ` · 누적 ${st.cumulative}` : ""}\n`;
const overflow = [];

async function images(slide, list, x, y, w, hMax, caption) {
  if (!list.length) {
    box(slide, { x, y, w, h: 2.0, fill: { color: HEX.slateBg } });
    T(slide, "화면 사진 없음 — 대본 글을 따른다", { x, y, w, h: 2.0, fontSize: 14, color: HEX.muted, align: "center", valign: "middle" });
    return 2.0;
  }
  if (list.length === 1) {
    const im = await prep(list[0].n, { crop: list[0].crop });
    const ww = Math.min(w, hMax * (im.w / im.h));
    return addImage(slide, list[0].n, x + (w - ww), y, ww, { crop: list[0].crop, caption });
  }
  // 여럿 — 위아래로, 단 너비에 맞춘 뒤 높이가 넘치면 함께 줄인다
  const ims = await Promise.all(list.map((l) => prep(l.n, { crop: l.crop })));
  const gap = 0.22;
  const capH = caption ? 0.34 : 0;
  const natural = ims.reduce((n, im) => n + w * (im.h / im.w), 0);
  const k = Math.min(1, (hMax - gap * (ims.length - 1) - capH) / natural);
  let cy = y;
  for (let i = 0; i < list.length; i++) {
    const ww = w * k;
    const h = await addImage(slide, list[i].n, x + (w - ww), cy, ww, { crop: list[i].crop, caption: i === list.length - 1 ? caption : null });
    cy += h + gap;
  }
  return cy - y;
}

const CAP_A = "주황 테두리 = 누를 곳 · 로컬 리허설 화면(2026-10-30)";
const CAP_OVERRIDE = { s02_board: "주황 테두리 = 브리핑 현황판 — 맨 오른쪽 4번 칸을 누른다 · 로컬 리허설 화면" };
const CAP_B = "로컬 리허설 답(2026-10-30) — 무대 답 글은 다시 생기므로 화면을 그대로 읽는다";

const LX = 0.5; // 왼쪽 단
const LW = 5.3;
const RX = 6.1; // 오른쪽 단(사진)
const RW = 6.73;
async function stepA(st, sec) {
  const R = REGION[st.region];
  const s = pres.addSlide({ masterName: "단계", sectionTitle: sec });
  header(s, st, "① 누르기");
  // 담당자 상황 — 머리 아래 한 줄
  T(s, [
    { text: "담당자 상황  ", options: { bold: true, color: C[R.c] } },
    { text: st.situation, options: { color: C.text1 } },
  ], { x: LX, y: 1.32, w: 12.33, h: 0.36, fontSize: Math.min(14, Math.floor((11.6 * 72) / (emWidth(st.situation) * 1.04))), valign: "middle" });
  const blocks = [{ label: "누를 것", items: st.actions, bullet: "num", dpt: 1, after: 6 }];
  if (st.question) blocks.push({ label: "보내는 질문", items: [st.question, ...(st.preset ? st.preset.split(/\r?\n/).map((p) => `붙는 조건 · ${p.replace(/^→\s*/, "")}`) : [])], boxed: HEX.slateBg, dpt: -2, labelColor: C.text2 });
  if (st.waitFill) blocks.push({ label: "기다리는 동안", items: [st.waitFill], boxed: HEX.amberBg, dpt: -1.5, labelColor: C.accent4 });
  const r = column(s, blocks, LX, 1.8, LW + 0.2, 5.2, R);
  if (r.over) overflow.push(`${st.step} 누르기 ${r.total.toFixed(2)}in`);
  await images(s, pick(SHOT[st.step]?.a), RX + 0.2, 1.8, RW - 0.2, 4.75, CAP_A);
  s.addNotes(`${NOTE_HEAD(st)}\n[담당자 상황] ${st.situation}\n\n[누를 것]\n${st.actions.map((a, i) => `${i + 1}. ${a}`).join("\n")}${st.question ? `\n\n[질문]\n${st.question}\n붙는 조건: ${st.preset || "없음"}` : ""}${st.waitFill ? `\n\n[기다리는 동안]\n${st.waitFill}` : ""}\n\n${st.notes}`);
}
async function stepB(st, sec) {
  const R = REGION[st.region];
  const s = pres.addSlide({ masterName: "단계", sectionTitle: sec });
  header(s, st, "② 짚기·말하기");
  const blocks = [{ label: "화면에서 짚을 것", items: st.look, bullet: true, dpt: 0.5, after: 6 }];
  if (st.say.length) blocks.push({ label: "말할 것", items: st.say, bullet: st.say.length > 1, boxed: R.bg, dpt: -1, labelColor: C[R.c] });
  if (st.next) blocks.push({ label: "다음", items: [st.next], dpt: -1.5, color: C.text2, bold: true });
  const r = column(s, blocks, LX, 1.45, LW, 5.55, R);
  if (r.over) overflow.push(`${st.step} 짚기 ${r.total.toFixed(2)}in`);
  const ih = await images(s, pick(SHOT[st.step]?.b), RX, 1.45, RW, 3.05, null);
  // 주의 · 막히면 — 사진 아래 위아래로
  const parts = [
    st.dont.length ? { t: "주의", items: st.dont, fill: HEX.amberBg, c: C.accent4 } : null,
    st.ifStuck ? { t: "막히면", items: [st.ifStuck], fill: HEX.slateBg, c: C.text2 } : null,
  ].filter(Boolean);
  const top = 1.45 + ih + 0.18;
  const avail = 6.98 - top - 0.1 * (parts.length - 1);
  const iw = RW - 0.26;
  let pt = 12.5;
  const need = (p) => parts.reduce((n, c) => n + 0.34 + hOf(c.items, iw - (c.items.length > 1 ? 0.25 : 0), p, 3), 0);
  while (pt > 10.5 && need(pt) > avail) pt -= 0.5;
  if (need(pt) > avail) overflow.push(`${st.step} 주의·막히면 ${need(pt).toFixed(2)}>${avail.toFixed(2)}`);
  let y = top;
  for (const c of parts) {
    const h = 0.34 + hOf(c.items, iw - (c.items.length > 1 ? 0.25 : 0), pt, 3);
    box(s, { x: RX, y, w: RW, h, fill: { color: c.fill } });
    label(s, RX + 0.13, y + 0.05, iw, c.t, c.c);
    T(s, paras(c.items, pt, { bullet: c.items.length > 1, after: 3 }), { x: RX + 0.13, y: y + 0.32, w: iw, h: h - 0.36, valign: "top" });
    y += h + 0.1;
  }
  s.addNotes(`${NOTE_HEAD(st)}\n[짚을 것]\n${st.look.map((a) => `- ${a}`).join("\n")}${st.say.length ? `\n\n[말할 것]\n${st.say.join("\n")}` : ""}${st.dont.length ? `\n\n[주의]\n${st.dont.map((a) => `- ${a}`).join("\n")}` : ""}\n\n[막히면] ${st.ifStuck}\n[다음] ${st.next}\n\n${st.notes}`);
}
async function stepOne(st, sec) {
  const R = REGION[st.region];
  const s = pres.addSlide({ masterName: "단계", sectionTitle: sec });
  header(s, st, "시간이 남을 때만");
  const blocks = [{ label: "누를 것", items: st.actions, bullet: "num", dpt: 0.5, after: 5 }];
  if (st.question) blocks.push({ label: "보내는 질문", items: [st.question, ...(st.preset ? [`붙는 조건 · ${st.preset}`] : [])], boxed: HEX.slateBg, dpt: -2.5, labelColor: C.text2 });
  blocks.push({ label: "화면에서 짚을 것", items: st.look, bullet: true, dpt: -0.5 });
  if (st.say.length) blocks.push({ label: "말할 것", items: st.say, bullet: st.say.length > 1, boxed: R.bg, dpt: -1.5 });
  if (st.dont.length) blocks.push({ label: "주의", items: st.dont, boxed: HEX.amberBg, dpt: -2, labelColor: C.accent4, bullet: st.dont.length > 1 });
  const r = column(s, blocks, 0.5, 1.5, 5.0, 5.45, R);
  if (r.over) overflow.push(`${st.step} 한 장 ${r.total.toFixed(2)}in`);
  await images(s, pick(SHOT[st.step]?.one), 5.8, 1.5, 7.03, 5.2, CAP_B);
  s.addNotes(`${NOTE_HEAD(st)}\n[누를 것]\n${st.actions.map((a, i) => `${i + 1}. ${a}`).join("\n")}\n\n[짚을 것]\n${st.look.join("\n")}\n\n[막히면] ${st.ifStuck}\n[다음] ${st.next}\n\n${st.notes}`);
}

// ── 앞뒤 슬라이드 ──
function cover() {
  const s = pres.addSlide({ masterName: "표지", sectionTitle: "준비" });
  T(s, "재난담당자의 하루 — 시연 따라하기", { x: 0.8, y: 2.0, w: 11.7, h: 1.3, fontSize: 40, bold: true, color: C.background1, valign: "bottom" });
  s.addText([
    { text: "2026-11-05 행정안전부 국장 보고 · 11/4 리허설 · 당일 시연", options: { breakLine: true } },
    { text: "대본 v3.3.2(2026-10-30) 기준 · 화면 사진은 로컬 리허설(2026-10-30 저녁)", options: { fontSize: 14, color: "AFC3E6" } },
  ], { isTextBox: true, fontFace: FONT, margin: 0, x: 0.8, y: 3.55, w: 11.7, h: 1.5, fontSize: 18, color: "CADCFC", valign: "top" });
  s.addNotes("이 자료는 진행자용이다(청중에게 띄우지 않는다). 단계마다 ① 누르기 → ② 짚기·말하기 두 장. 자세한 근거는 발표자 노트와 대본 docs/renewal/design/11_demo_day_story.md.");
}
function howTo() {
  const s = pres.addSlide({ masterName: "내용", sectionTitle: "준비" });
  T(s, "이 자료 보는 법", { x: 0.5, y: 0.35, w: 12.3, h: 0.75, fontSize: 30, bold: true, color: C.text1, valign: "middle" });
  const cards = [
    { h: "단계마다 두 장", b: ["① 누르기 — 담당자 상황 · 누를 것(차례대로) · 보내는 질문과 붙는 조건", "② 짚기·말하기 — 화면에서 짚을 것 · 말할 것 · 주의 · 막히면"], fill: HEX.navyBg, c: C.text2 },
    { h: "표지 색", b: ["실시간 — 무대에서 처음 보낸다(기다림 있음)", "예열 — 아침에 받아 둔 답이 바로 뜬다", "앱 화면 — 대응절차 화면(에이전트 질의 없음)", "선택 — 시간이 남을 때만"], fill: HEX.slateBg, c: C.text2, chips: true },
    { h: "화면 사진", b: ["주황 테두리 = 누를 곳", "로컬 리허설 화면이다 — 에이전트 답 글은 무대에서 다시 생긴다", "답을 외워 말하지 않고 화면을 그대로 읽는다"], fill: HEX.amberBg, c: C.accent4 },
  ];
  const cw = 3.95;
  cards.forEach((cd, i) => {
    const x = 0.5 + i * (cw + 0.22);
    box(s, { x, y: 1.45, w: cw, h: 4.9, fill: { color: cd.fill } });
    T(s, cd.h, { x: x + 0.25, y: 1.65, w: cw - 0.5, h: 0.45, fontSize: 20, bold: true, color: cd.c });
    if (cd.chips) {
      const lst = [["실시간", C.accent4], ["예열", C.accent5], ["앱 화면", C.accent6], ["선택", C.text2]];
      lst.forEach(([t, f], k) => {
        chip(s, x + 0.25, 2.35 + k * 0.92, 1.15, t, f);
        T(s, cd.b[k].split(" — ")[1], { x: x + 1.55, y: 2.25 + k * 0.92, w: cw - 1.8, h: 0.6, fontSize: 14, color: C.text1, valign: "middle" });
      });
    } else {
      T(s, paras(cd.b, 15, { bullet: true, after: 10 }), { x: x + 0.25, y: 2.3, w: cw - 0.5, h: 3.8, valign: "top" });
    }
  });
  T(s, "무대에서 말하지 않는 것: 처리 시간(초) · 지도 대상 수 · 답 끝의 권고 절 — 자세한 것은 단계별 「주의」와 발표자 노트", { x: 0.5, y: 6.5, w: 12.3, h: 0.4, fontSize: 13, color: HEX.muted });
}
let OV_PT = 13;
function overview(p) {
  {
    // 세 카드 모두 들어가는 가장 큰 글자 크기
    const vw = 3.95 - 1.6;
    const fits = (pt) => p.overview.regions.every((r) => {
      const [a, b] = splitTime(r.time);
      return [r.account, r.scenarioWarning, r.steps, a, b || "—"].reduce((n, v) => n + Math.max(0.38, hOf([v], vw, pt, 2) + 0.04), 0) <= 2.95;
    });
    OV_PT = 13.5;
    while (OV_PT > 10.5 && !fits(OV_PT)) OV_PT -= 0.5;
  }
  const s = pres.addSlide({ masterName: "내용", sectionTitle: "준비" });
  T(s, "한눈에 — 세 지역 담당자의 하루", { x: 0.5, y: 0.35, w: 12.3, h: 0.75, fontSize: 30, bold: true, color: C.text1, valign: "middle" });
  T(s, p.overview.headline, { x: 0.5, y: 1.15, w: 12.3, h: 0.45, fontSize: 16, color: HEX.muted });
  const cw = 3.95;
  p.overview.regions.forEach((r, i) => {
    const key = Object.keys(REGION).find((k) => r.region.includes(k)) ?? "부산";
    const R = REGION[key];
    const x = 0.5 + i * (cw + 0.22);
    box(s, { x, y: 1.8, w: cw, h: 3.75, fill: { color: R.bg } });
    T(s, key, { x: x + 0.25, y: 1.95, w: 1.6, h: 0.6, fontSize: 28, bold: true, color: C[R.c] });
    T(s, r.theme, { x: x + 1.7, y: 1.95, w: cw - 1.95, h: 0.6, fontSize: 16, bold: true, color: C.text1, valign: "middle" });
    const [storyT, stageT] = splitTime(r.time);
    const rows = [["계정", r.account], ["특보 줄", r.scenarioWarning], ["단계", r.steps], ["이야기 시각", storyT], ["무대 소요", stageT || "—"]];
    // 줄 높이를 글 길이대로 — 세 카드 글자 크기는 같게(가장 긴 카드에 맞춤)
    const vw = cw - 1.6;
    const rowH = (v, p) => Math.max(0.38, hOf([v], vw, p, 2) + 0.04);
    const pt = OV_PT;
    if (rows.reduce((n, [, v]) => n + rowH(v, pt), 0) > 2.95) overflow.push(`한눈에 ${key}`);
    let ry = 2.58;
    for (const [k, v] of rows) {
      const h = rowH(v, pt);
      T(s, k, { x: x + 0.25, y: ry, w: 1.1, h: 0.3, fontSize: 11.5, bold: true, color: HEX.muted, valign: "top" });
      T(s, v, { x: x + 1.35, y: ry, w: vw, h, fontSize: pt, color: C.text1, valign: "top" });
      ry += h;
    }
  });
  const tw = (12.33 - 0.22 * (p.overview.totals.length - 1)) / p.overview.totals.length;
  p.overview.totals.forEach((t, i) => {
    const x = 0.5 + i * (tw + 0.22);
    box(s, { x, y: 5.75, w: tw, h: 1.05, fill: { color: HEX.navyBg } });
    T(s, t, { x: x + 0.2, y: 5.75, w: tw - 0.4, h: 1.05, fontSize: 15, bold: true, color: C.text2, valign: "middle" });
  });
}
/** 높이에 맞춰 여러 장으로 나눈다 */
function chunkBy(items, heightOf, avail) {
  const out = [];
  let cur = [];
  let h = 0;
  for (const it of items) {
    const ih = heightOf(it);
    if (cur.length && h + ih > avail) {
      out.push(cur);
      cur = [];
      h = 0;
    }
    cur.push(it);
    h += ih;
  }
  if (cur.length) out.push(cur);
  return out;
}
const pageTitle = (title, i, n) => (n > 1 ? `${title} (${i + 1}/${n})` : title);
function titleBox(s, title) {
  T(s, title, { x: 0.5, y: 0.35, w: 12.3, h: 0.75, fontSize: Math.min(30, Math.floor((12.3 * 72) / (emWidth(title, 1.02) * 1.04))), bold: true, color: C.text1, valign: "middle" });
}
function listSlide(title, items, sec, { notes = "", pt = 16, sub = null } = {}) {
  const y = sub ? 1.75 : 1.3;
  const w = 12.33;
  for (let big = 20; big > pt; big -= 0.5) if (hOf(items, w - 0.35, big, 12) <= (6.85 - y) * 0.92) { pt = big; break; }
  const pages = chunkBy(items, (it) => hOf([it], w - 0.35, pt, 10), 6.85 - y - 0.1);
  pages.forEach((part, i) => {
    const s = pres.addSlide({ masterName: "내용", sectionTitle: sec });
    titleBox(s, pageTitle(title, i, pages.length));
    if (sub) T(s, sub, { x: 0.5, y: 1.15, w: 12.3, h: 0.45, fontSize: 15, color: HEX.muted });
    if (hOf(part, w - 0.35, pt, 10) > 6.85 - y) overflow.push(`${title} 목록`);
    T(s, paras(part, pt, { bullet: true, after: 10 }), { x: 0.5, y, w, h: 6.85 - y, valign: "top" });
    if (notes) s.addNotes(notes);
  });
}
function tableSlide(title, head, rows, widths, sec, { notes = "", pt = 12.5, sub = null } = {}) {
  const y = sub ? 1.65 : 1.3;
  const rowH = (r) => Math.max(...r.map((v, j) => linesOf(String(v), widths[j] - 0.2, pt))) * pt * 1.3 / 72 + 0.14;
  let pages = chunkBy(rows, rowH, 6.9 - y - 0.45);
  if (pages.length > 2) {
    const avail = 6.9 - y - 0.45;
    const total = rows.reduce((n, r) => n + rowH(r), 0);
    const even = chunkBy(rows, rowH, Math.min(avail, (total / pages.length) * 1.12));
    if (even.length === pages.length) pages = even;
  } else if (pages.length === 2) {
    // 두 장 높이가 비슷하게
    const all = rows;
    let best = null;
    for (let k = 1; k < all.length; k++) {
      const h1 = all.slice(0, k).reduce((n, r) => n + rowH(r), 0);
      const h2 = all.slice(k).reduce((n, r) => n + rowH(r), 0);
      if (h1 > 6.9 - y - 0.45 || h2 > 6.9 - y - 0.45) continue;
      const sc = Math.max(h1, h2);
      if (!best || sc < best.sc) best = { k, sc };
    }
    if (best) pages = [all.slice(0, best.k), all.slice(best.k)];
  }
  pages.forEach((part, i) => {
    const s = pres.addSlide({ masterName: "내용", sectionTitle: sec });
    titleBox(s, pageTitle(title, i, pages.length));
    if (sub) T(s, sub, { x: 0.5, y: 1.15, w: 12.3, h: 0.4, fontSize: 14, color: HEX.muted });
    const hdr = head.map((h) => ({ text: h, options: { bold: true, color: "FFFFFF", fill: { color: THEME.colors.dk2 }, fontSize: pt, fontFace: FONT, valign: "middle" } }));
    const body = part.map((r, k) => r.map((v) => ({ text: String(v), options: { fontSize: pt, fontFace: FONT, color: THEME.colors.dk1, fill: { color: k % 2 ? "F7F8FA" : "FFFFFF" }, valign: "top" } })));
    s.addTable([hdr, ...body], { x: 0.5, y, w: 12.33, colW: widths, border: { type: "solid", pt: 0.75, color: HEX.line }, margin: [4, 6, 4, 6], autoPage: false, objectName: on("tbl") });
    const est = 0.45 + part.reduce((n, r) => n + rowH(r), 0);
    if (y + est > 6.95) overflow.push(`${title} 표 ${est.toFixed(2)}in`);
    if (notes) s.addNotes(notes);
  });
}
function sayingSlide(title, say, notes, sec, R = null) {
  let size = 18;
  while (size > 13.5 && hOf(say, 11.6, size, 12) > 5.3) size -= 0.5;
  let pages = chunkBy(say, (it) => hOf([it], 11.6, size, 12), 5.35);
  if (pages.length === 2) {
    // 두 장이면 고르게
    const hh = (a) => a.reduce((n, it) => n + hOf([it], 11.6, size, 12), 0);
    let best = null;
    for (let k = 1; k < say.length; k++) {
      const a = say.slice(0, k);
      const b = say.slice(k);
      if (hh(a) > 5.35 || hh(b) > 5.35) continue;
      const sc = Math.max(hh(a), hh(b));
      if (!best || sc < best.sc) best = { k, sc };
    }
    if (best) pages = [say.slice(0, best.k), say.slice(best.k)];
  }
  pages.forEach((items, i) => {
    const s = pres.addSlide({ masterName: "내용", sectionTitle: sec });
    titleBox(s, pageTitle(title, i, pages.length));
    box(s, { x: 0.5, y: 1.4, w: 12.33, h: 5.4, fill: { color: R ? R.bg : HEX.navyBg } });
    T(s, paras(items, size, { bullet: true, after: 14 }), { x: 0.85, y: 1.6, w: 11.6, h: 5.0, valign: "top" });
    if (hOf(items, 11.6, size, 14) > 5.0) overflow.push(`${title} 멘트`);
    s.addNotes(notes ?? "");
  });
}
/** 「08:30~16:30 · 무대 9:15~9:35」 → [이야기 시각, 무대 소요] */
function splitTime(t) {
  const m = String(t).match(/^(.*?)\s*·\s*무대\s*(.+)$/);
  return m ? [m[1].trim(), m[2].trim()] : [String(t), ""];
}
function divider(region, sub, sec, notes = "") {
  const R = REGION[region];
  const s = pres.addSlide({ masterName: "구역", sectionTitle: sec });
  s.background = { color: R.hex };
  T(s, region, { x: 0.8, y: 2.4, w: 11.7, h: 1.3, fontSize: 44, bold: true, color: C.background1, valign: "bottom" });
  T(s, sub, { x: 0.8, y: 3.85, w: 11.7, h: 1.6, fontSize: 20, color: C.background1, valign: "top" });
  if (notes) s.addNotes(notes);
}

(async () => {
  const p = content.prep;
  pres.addSection({ title: "준비" });
  cover();
  howTo();
  overview(p);
  listSlide("창 셋 준비 — 무대에서는 창만 바꾼다", p.windows, "준비", { sub: "로그인은 브라우저마다 하나 — 크롬 프로필 셋(또는 크롬·엣지 등)으로 나눠 미리 로그인해 둔다", pt: 17 });
  // 운영 순서
  {
    const cnt = {};
    for (const o of p.opsBefore) cnt[o.no] = (cnt[o.no] ?? 0) + 1;
    const seen = {};
    const nos = p.opsBefore.map((o) => (cnt[o.no] > 1 ? `${o.no}-${(seen[o.no] = (seen[o.no] ?? 0) + 1)}` : o.no));
    tableSlide("시연 전 운영 순서", ["#", "언제", "어디서", "할 일", "확인할 화면"], p.opsBefore.map((o, i) => [nos[i], o.when, o.where, o.what, o.check]), [0.62, 1.95, 2.35, 3.86, 3.55], "준비", { sub: "운영관리(운영자 계정)는 무대 밖에서만 — 시연 계정 창은 띄워 둔다", pt: 12 });
  }
  {
    const s = pres.addSlide({ masterName: "내용", sectionTitle: "준비" });
    T(s, "운영 화면 — 브리핑 4번 · 시나리오 켜기", { x: 0.5, y: 0.35, w: 12.3, h: 0.75, fontSize: 30, bold: true, color: C.text1, valign: "middle" });
    const h1 = has("op1_brief") ? await addImage(s, "op1_brief", 0.5, 1.35, 6.05, { caption: "① 부산 계정 설정 → 내 브리핑 항목: 「하천 옆 지하차도」 추가, 체크 4개" }) : 0;
    if (has("op2_scenario")) await addImage(s, "op2_scenario", 6.78, 1.35, 6.05, { caption: "② 운영관리 「시연 세트 예열」 탭 — 시연 시나리오 특보 켜기(세 지역)" });
    void h1;
  }
  {
    const s = pres.addSlide({ masterName: "내용", sectionTitle: "준비" });
    T(s, "운영 화면 — 예열 끝 · 세 창 특보 줄", { x: 0.5, y: 0.35, w: 12.3, h: 0.75, fontSize: 30, bold: true, color: C.text1, valign: "middle" });
    if (has("op3_warm_done")) await addImage(s, "op3_warm_done", 0.5, 1.35, 6.05, { caption: "③⑤ 「시연 세트 예열 시작」 → 진행 중 0 · 예열 항목 모두 끝" });
    let y = 1.35;
    for (const [acc, lab] of [["bs_safety01", "부산 창"], ["ij_safety01", "인제 창"], ["yc_safety02", "영천 창"]]) {
      const n = `op4_${acc}`;
      if (!has(n)) continue;
      const h = await addImage(s, n, 6.78, y, 6.05, { caption: `④ ${lab} 특보 줄 — 「시연 시나리오」 · 「기상청 실시간 특보 끊음」` });
      y += h + 0.62;
    }
  }
  listSlide("무대 직전 확인", p.preStage, "준비", { pt: 16 });
  pres.addSection({ title: "도입" });
  sayingSlide("도입 멘트(1분)", p.intro.say, p.intro.notes, "도입");

  const order = (st) => content.steps.filter((x) => x.region === st);
  const regionSub = {
    부산: "도심 침수 · 단계 1~10 · 시나리오 호우경보 「부산」",
    인제: "산사태·계곡 · 단계 11~15 · 시나리오 호우주의보 「강원도(인제평지, 인제산지)」",
    영천: "소하천 범람 · 단계 16~19 · 시나리오 호우경보 「경상북도(영천)」",
  };
  for (const region of ["부산", "인제", "영천"]) {
    const ov = p.overview.regions.find((r) => r.region.includes(region));
    pres.addSection({ title: region });
    const [storyT, stageT] = ov ? splitTime(ov.time) : ["", ""];
    divider(region, `${regionSub[region]}\n${REGION[region].win}${storyT ? ` · 이야기 ${storyT}` : ""}${stageT ? ` · 무대 소요 ${stageT}` : ""}`, region, `${region} 창으로 바꾼다(로그인하지 않는다).`);
    for (const st of order(region)) {
      await stepA(st, region);
      await stepB(st, region);
    }
  }
  pres.addSection({ title: "마무리" });
  sayingSlide("마무리 멘트(1분)", p.closing.say, p.closing.notes, "마무리");
  pres.addSection({ title: "만일을 위해" });
  tableSlide("막힐 때", ["이럴 때", "이렇게"], p.fallbacks.map((f) => [f.trouble, f.action]), [4.2, 8.13], "만일을 위해", { pt: 12.5 });
  tableSlide("「정보 부족」·한계를 말하는 법", ["이럴 때", "이렇게 말한다"], p.limits.map((f) => [f.when, f.say]), [4.2, 8.13], "만일을 위해", { pt: 12.5 });
  listSlide("시간이 밀릴 때 빼는 순서", p.timeCuts, "만일을 위해", { pt: 16 });
  tableSlide("시연 뒤 정리", ["#", "할 일", "확인"], p.opsAfter.map((o) => [o.no, o.what, o.check]), [0.6, 6.4, 5.33], "만일을 위해", { pt: 13 });

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("만듦", OUT, "· 슬라이드", pres.slides.length);
  if (overflow.length) console.log("넘칠 수 있음:", overflow.join(" | "));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
