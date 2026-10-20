"use client";
/**
 * 연락망 엑셀 양식 · 내려받기 · 올리기 (브라우저에서 실행) — report4 contacts-xlsx 와 같은 양식
 *  열: 상위 조직 | 조직(부서) | 이름 | 직위 | 담당업무 | 휴대전화 | 이메일 | 전파그룹 | 사무실 전화
 *  · 올리기 = 미리 보기(추가·수정·삭제) 후 등록 · 「추가·수정만」 / 「엑셀과 똑같이 맞추기」
 */
import { fmtPhone, type Bundle, type Contact, type Unit, type UnitKind } from "./contacts";

export interface ContactRow { row: number; upper: string; unit: string; name: string; title: string; duty: string; phone: string; email: string; office: string; groups: string[] }

const COLUMNS = [
  { key: "upper", header: "상위 조직", width: 24 },
  { key: "unit", header: "조직(부서)", width: 24 },
  { key: "name", header: "이름", width: 12 },
  { key: "title", header: "직위", width: 14 },
  { key: "duty", header: "담당업무", width: 24 },
  { key: "phone", header: "휴대전화", width: 16 },
  { key: "email", header: "이메일", width: 26 },
  { key: "groups", header: "전파그룹", width: 28 },
  { key: "office", header: "사무실 전화", width: 16 },
] as const;
type ColKey = (typeof COLUMNS)[number]["key"];

const GUIDE = [
  "연락망 일괄 등록 안내",
  "",
  "1. 「연락망」 시트의 2행부터 한 사람씩 입력합니다. 1행(제목)은 지우지 마세요.",
  "2. 조직(부서)는 꼭 입력합니다. 이름을 비우면 담당자 없는 조직만 만듭니다(내려받은 파일의 빈 조직 줄).",
  "3. 상위 조직은 조직(부서)가 바로 속한 조직입니다(예: 재난상황관리반 › 자연재난과). 비우면 조직(부서)가 맨 위 조직이 됩니다.",
  "4. 없는 조직·전파그룹은 새로 만듭니다.",
  "5. 같은 조직에 같은 이름이 있으면 내용을 고칩니다(직위·번호 등). 없으면 새로 추가합니다.",
  "6. 전파그룹이 여러 개면 쉼표(,)로 구분합니다. 예: 상황관리반, 구·군 재난부서",
  "7. 휴대전화는 문자 수신 번호입니다. 사무실 전화는 비상연락망에 함께 보입니다(선택).",
  "8. 올릴 때 「추가·수정만」을 고르면 엑셀에 없는 기존 담당자는 그대로 둡니다.",
  "9. 「엑셀과 똑같이 맞추기」를 고르면 엑셀에 없는 담당자와 빈 조직을 지웁니다. 줄을 지워 조직·담당자를 없앨 때 씁니다.",
];

async function excel() {
  const mod = await import("exceljs");
  return (mod.default ?? mod) as typeof import("exceljs");
}
function save(buf: ArrayBuffer, name: string) {
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 양식(예시 1행) 또는 현재 연락망을 엑셀로 내려받기 */
export async function downloadContactsXlsx(b: Bundle | null, fileName: string) {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("연락망", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ key: c.key, header: c.header, width: c.width }));
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.height = 22;
  head.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE7FB" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  if (b) {
    const unit = new Map(b.units.map((u) => [u.id, u]));
    const staffed = new Set(b.contacts.map((c) => c.unitId));
    // 담당자 없는 조직도 한 줄 (맞추기로 올려도 조직이 사라지지 않게) · 조직 순서대로
    for (const u of b.units) {
      if (staffed.has(u.id)) continue;
      ws.addRow({ upper: (u.parentId && unit.get(u.parentId)?.name) || "", unit: u.name });
    }
    for (const c of b.contacts) {
      const u = unit.get(c.unitId);
      ws.addRow({
        upper: (u?.parentId && unit.get(u.parentId)?.name) || "", unit: u?.name ?? "", name: c.name, title: c.title, duty: c.duty,
        phone: c.phone, email: c.email, office: c.office ?? "",
        groups: b.groups.filter((g) => g.memberIds.includes(c.id)).map((g) => g.name).join(", "),
      });
    }
  } else {
    ws.addRow({ upper: "○○시 재난안전대책본부", unit: "재난상황관리반", name: "홍길동", title: "주무관", duty: "상황관리", phone: "010-0000-0000", email: "", groups: "상황관리반", office: "" });
  }
  ws.getColumn("phone").numFmt = "@"; // 번호가 숫자로 바뀌지 않게 글자 칸으로
  ws.getColumn("office").numFmt = "@";
  const guide = wb.addWorksheet("작성 안내");
  guide.getColumn(1).width = 100;
  GUIDE.forEach((t, i) => {
    const cell = guide.getCell(i + 1, 1);
    cell.value = t;
    if (i === 0) cell.font = { bold: true, size: 14 };
  });
  save(await wb.xlsx.writeBuffer(), fileName);
}

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { text?: unknown; richText?: { text: string }[]; result?: unknown };
    if (o.richText) return o.richText.map((r) => r.text).join("").trim();
    if (o.text != null) return String(o.text).trim();
    if (o.result != null) return String(o.result).trim();
  }
  return String(v).trim();
}
/** 전화번호를 000-0000-0000 꼴로 (엑셀이 앞자리 0을 지운 경우도) */
export function normalizePhone(v: string) {
  let n = v.replace(/\D/g, "");
  if (n.length === 10 && n.startsWith("10")) n = "0" + n;
  if (n.length === 9 && n.startsWith("2")) n = "0" + n;
  if (n.length === 9 && n.startsWith("02")) return `${n.slice(0, 2)}-${n.slice(2, 5)}-${n.slice(5)}`;
  return n.length >= 10 ? fmtPhone(n) : v.trim();
}

/** 올린 엑셀 읽기 — 제목 행으로 열을 찾는다 (열 순서가 바뀌어도 됨) */
export async function parseContactsXlsx(file: File): Promise<{ rows: ContactRow[]; errors: string[] }> {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.getWorksheet("연락망") ?? wb.worksheets[0];
  if (!ws) return { rows: [], errors: ["시트를 찾을 수 없습니다."] };
  const col: Partial<Record<ColKey, number>> = {};
  ws.getRow(1).eachCell((cell, i) => {
    const h = text(cell.value).replace(/\s/g, "");
    const c = COLUMNS.find((x) => x.header.replace(/\s/g, "") === h || (x.key === "unit" && (h === "조직" || h === "부서")) || (x.key === "duty" && h === "임무"));
    if (c) col[c.key] = i;
  });
  if (!col.unit || !col.name) return { rows: [], errors: ["1행에 「조직(부서)」「이름」 제목이 있어야 합니다. 양식을 내려받아 쓰세요."] };
  const rows: ContactRow[] = [];
  const errors: string[] = [];
  ws.eachRow((r, n) => {
    if (n === 1) return;
    const get = (k: ColKey) => (col[k] ? text(r.getCell(col[k]!).value) : "");
    const v = {
      upper: get("upper"), unit: get("unit"), name: get("name"), title: get("title"), duty: get("duty"),
      phone: normalizePhone(get("phone")), email: get("email"), office: normalizePhone(get("office")),
      groups: get("groups").split(/[,，、\n]/).map((g) => g.trim()).filter(Boolean),
    };
    if (!v.unit && !v.name && !v.phone) return; // 빈 줄
    if (!v.unit) return void errors.push(`${n}행: 조직(부서)가 비어 있습니다.`);
    if (!v.name && v.phone) return void errors.push(`${n}행: 이름이 비어 있습니다.`);
    if (v.phone && !/^0\d{1,2}-\d{3,4}-\d{4}$/.test(v.phone)) errors.push(`${n}행: 휴대전화 「${v.phone}」 형식이 맞지 않습니다(그대로 넣음).`);
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) errors.push(`${n}행: 이메일 「${v.email}」 형식이 맞지 않습니다(그대로 넣음).`);
    rows.push({ row: n, ...v });
  });
  if (!rows.length && !errors.length) errors.push("입력된 조직·담당자가 없습니다.");
  if (rows.length > 3000) return { rows: [], errors: ["한 번에 3,000명까지 올릴 수 있습니다."] };
  return { rows, errors };
}

export interface ImportStat {
  added: number; updated: number; units: number; groups: number; removed: number; removedUnits: number;
  removedRows: { upper: string; unit: string; name: string; title: string; phone: string }[];
  /** 행 번호 → 추가/수정 */
  rowKind: Record<number, "추가" | "수정" | "조직">;
}

/**
 * 엑셀 일괄 등록 계획 (report4 importContacts 와 같은 규칙) — 바꾼 연락망과 결과 수를 돌려준다
 *  · 조직: 「상위 조직 › 조직(부서)」를 조직도 전체에서 찾고 없으면 만든다
 *  · 담당자: 같은 조직의 같은 이름(또는 같은 이름·번호)이면 고치고, 없으면 추가
 *  · sync: 엑셀에 없는 담당자·빈 조직을 지우고 전파그룹 소속도 엑셀대로 맞춘다
 */
export function planImport(orgId: string, b: Bundle, rows: ContactRow[], sync: boolean): { next: Bundle; stat: ImportStat } {
  const units: Unit[] = b.units.map((u) => ({ ...u }));
  const people: Contact[] = b.contacts.map((c) => ({ ...c }));
  const digits = (p: string) => p.replace(/\D/g, "");
  const stat: ImportStat = { added: 0, updated: 0, units: 0, groups: 0, removed: 0, removedUnits: 0, removedRows: [], rowKind: {} };
  let seq = 0;
  const uid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;
  const nameOf = (id: string | null) => (id ? units.find((u) => u.id === id)?.name : undefined);
  const makeUnit = (name: string, parentId: string | null, kind?: UnitKind) => {
    const nu: Unit = { id: uid("u"), orgId, parentId, name, kind: kind ?? (parentId ? "dept" : "hq"), sort: units.filter((u) => u.parentId === parentId).length };
    units.push(nu);
    stat.units++;
    return nu;
  };
  const byName = (name: string) => units.find((u) => u.name === name) ?? makeUnit(name, null);
  const resolveUnit = (upper: string, name: string) => {
    const same = units.filter((u) => u.name === name);
    if (upper) {
      const hit = same.find((u) => nameOf(u.parentId) === upper);
      if (hit) return hit;
      const parent = byName(upper);
      return makeUnit(name, parent.id, parent.kind === "agency" ? "agency" : undefined);
    }
    return same.find((u) => !u.parentId) ?? same[0] ?? makeUnit(name, null);
  };
  const touched = new Set<string>();
  const seen = new Set<string>();
  const members = new Map(b.groups.map((g) => [g.name, new Set(sync ? [] : g.memberIds)]));
  for (const r of rows) {
    const u = resolveUnit(r.upper.trim(), r.unit.trim());
    touched.add(u.id);
    if (u.parentId) touched.add(u.parentId);
    const name = r.name.trim();
    if (!name) { stat.rowKind[r.row] = "조직"; continue; }
    const data = { unitId: u.id, name, title: r.title, duty: r.duty, phone: r.phone, email: r.email, office: r.office };
    const same = people.find((p) => !seen.has(p.id) && p.unitId === u.id && p.name === name) ?? (r.phone ? people.find((p) => !seen.has(p.id) && p.name === name && digits(p.phone) === digits(r.phone)) : undefined);
    let id: string;
    if (same) {
      Object.assign(same, data);
      id = same.id;
      stat.updated++;
      stat.rowKind[r.row] = "수정";
    } else {
      const nc: Contact = { ...data, id: uid("c"), orgId, sort: people.filter((p) => p.unitId === u.id).length };
      people.push(nc);
      id = nc.id;
      stat.added++;
      stat.rowKind[r.row] = "추가";
    }
    seen.add(id);
    for (const g of r.groups) {
      if (!members.has(g)) { members.set(g, new Set()); stat.groups++; }
      members.get(g)!.add(id);
    }
  }
  let keepPeople = people;
  const removeUnits: string[] = [];
  if (sync) {
    const gone = people.filter((p) => !seen.has(p.id));
    keepPeople = people.filter((p) => seen.has(p.id));
    const alive = new Set(keepPeople.map((p) => p.unitId));
    let left = units.filter((u) => !touched.has(u.id) && !alive.has(u.id));
    for (let changed = true; changed; ) {
      changed = false;
      for (const u of left) if (!units.some((c) => c.parentId === u.id && !removeUnits.includes(c.id))) { removeUnits.push(u.id); changed = true; }
      left = left.filter((u) => !removeUnits.includes(u.id));
    }
    const parentName = (id: string) => nameOf(units.find((u) => u.id === id)?.parentId ?? null) ?? "";
    stat.removed = gone.length;
    stat.removedUnits = removeUnits.length;
    stat.removedRows = [
      ...removeUnits.map((id) => ({ upper: parentName(id), unit: nameOf(id) ?? "", name: "", title: "", phone: "" })),
      ...gone.map((p) => ({ upper: parentName(p.unitId), unit: nameOf(p.unitId) ?? "", name: p.name, title: p.title, phone: p.phone })),
    ];
  }
  const keepIds = new Set(keepPeople.map((p) => p.id));
  const groups = [...members].map(([name, set], i) => {
    const old = b.groups.find((g) => g.name === name);
    const ids = [...set].filter((id) => keepIds.has(id));
    return old ? { ...old, memberIds: ids } : { id: uid("g"), orgId, name, memberIds: ids, sort: b.groups.length + i };
  });
  return { next: { units: units.filter((u) => !removeUnits.includes(u.id)), contacts: keepPeople, groups }, stat };
}
