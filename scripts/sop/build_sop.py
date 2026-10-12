"""행동매뉴얼 재난대응 프로세스 표 → 대응절차(SOP) JSON

추출 규칙: report4 `public/api-docs/mapping.html` R1~R25
  대응단계(표의 열 순서, R22) → 임무 [n] → 조치 [n-m] → 세부행동 '-'
  부서 칸(R19)은 표의 행 묶음. 조치 상세(기관·쪽)는 행동카드에서 가져온다(②).

사용: python -I -X utf8 scripts/sop/build_sop.py <매뉴얼 PDF 폴더> <출력 JSON> [--dump <디버그 폴더>]
"""
import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

import pymupdf

STEPS = ["SIGN_DETECTION", "INITIAL_RESPONSE", "EMERGENCY_RESPONSE", "RECOVERY"]
STEP_FILL = {  # 프로세스 표 칸 채움색 → 열(단계)
    (1.0, 1.0, 0.8): 0,
    (0.98, 0.93, 0.82): 1,
    (1.0, 0.8, 0.8): 2,
    (0.88, 0.93, 0.82): 3,
}
GRAY = (0.8, 0.8, 0.8)

MANUALS = [
    {
        "id": "SOP-BUSAN-FLOOD",
        "region": "busan",
        "manualId": "MAN-BUSAN-2026",
        "title": "부산광역시 풍수해(태풍·호우·대설) 재난 현장조치 행동매뉴얼",
        "short": "부산 풍수해 현장조치 행동매뉴얼",
        "file": "(부산) 풍수해 재난 현장조치 행동매뉴얼(26.7.6.)_fn.pdf",
        "offset": 6,  # PDF 쪽 - 인쇄 쪽
        "style": "bracket",  # [n] / [n-m] / -
        "mine": "자연재난과",
        "table": [  # (PDF 쪽, 부서 구분 — 행마다 다르면 목록)
            (40, ["초기대응부서", "지휘부", "지휘부"]),
            (41, "협업부서"),
            (42, "협업부서"),
            (43, "협업부서"),
            (44, "유관기관"),
        ],
        "cards": (46, 263),
        "goals": [46, 81, 153, 200],  # 단계별 '가. 대응 지침' 쪽 (PDF)
        # 특보 → 대응단계 추천 근거: 프로세스 표 임무 제목의 특보 표기 (인쇄 p.34)
        "recommend": [
            {"level": "예비특보", "step": 0, "pdf": 40, "basis": "1단계 징후감지 — [1] 기상특보(태풍정보·호우예비특보·적설예보) 접수"},
            {"level": "주의보", "step": 1, "pdf": 40, "basis": "2단계 초기대응 — [4] 기상특보(태풍예비특보, 호우주의보, 적설량 예보) 접수"},
            {"level": "경보", "step": 2, "pdf": 40, "basis": "3단계 비상대응 — [7] 기상특보(태풍특보, 호우경보, 적설량 1cm~) 접수"},
            {"level": "해제", "step": 3, "pdf": 40, "basis": "4단계 수습·복구 — [9-11] 기상특보 해제 접수"},
        ],
    },
    {
        "id": "SOP-YEONGCHEON-FLOOD",
        "region": "yeongcheon",
        "manualId": "MAN-YEONGCHEON-2026",
        "title": "영천시 풍수해(태풍·호우, 대설) 재난 현장조치 행동매뉴얼",
        "short": "영천 풍수해 현장조치 행동매뉴얼",
        "file": "(영천)풍수해 현장조치 행동매뉴얼.pdf",
        "offset": 6,
        "style": "function",  # ①-1 / ①-1-1 (협업기능형, R10)
        "mine": "안전재난하천과",
        "table": [(33, ["초기대응부서", "지휘부", "지휘부"]), (34, "협업부서"), (35, "협업부서"), (36, "협업부서"), (37, "협업부서")],
        "cards": (38, 263),
        "goals": [38, 62, 93, 188],
        # 재난대응 단계 표 (인쇄 p.26): 상황 열의 특보 표기
        "recommend": [
            {"level": "예비특보", "step": 0, "pdf": 32, "basis": "평시 및 초기대응 — 태풍 정보 발표, 호우·대설 예비특보 발표 등"},
            {"level": "주의보", "step": 1, "pdf": 32, "basis": "지대본 비상 1단계 — 태풍 예비특보, 호우·대설 주의보 발표"},
            {"level": "경보", "step": 2, "pdf": 32, "basis": "지대본 비상 2·3단계 — 태풍특보, 호우·대설 경보 발표"},
            {"level": "해제", "step": 3, "pdf": 32, "basis": "수습·복구 — 기상특보 해제 후 (피해 발생 시) 수습·복구를 시행하는 단계"},
        ],
    },
    {
        "id": "SOP-INJE-FLOOD",
        "region": "inje",
        "manualId": "MAN-INJE-2026",
        "title": "인제군 풍수해 현장조치 행동매뉴얼",
        "short": "인제 풍수해 현장조치 행동매뉴얼",
        "file": "(인제) 풍수해 현장조치 행동매뉴얼(비상연락망 삭제본).pdf",
        "offset": 0,
        "style": "bracket",
        "mine": "안전교통과",
        "table": [(64, ["초기대응부서"]), (65, ["지휘부", "지휘부", "협업부서"]), (66, "협업부서"), (67, "협업부서"), (68, "협업부서"), (69, "협업부서"), (70, "협업부서")],
        "cards": (72, 206),
        "goals": [72, 84, 133, 196],
        # 과장·국장·지휘부 요약본 (p.8~9)
        "recommend": [
            {"level": "예비특보", "step": 0, "pdf": 8, "basis": "1단계 징후 감지 — 기상 전망 시, 예비 특보 시"},
            {"level": "주의보", "step": 1, "pdf": 8, "basis": "2단계 초기 대응 — 주의보 발효"},
            {"level": "경보", "step": 2, "pdf": 9, "basis": "3단계 비상 대응 — 주의보(확대), 경보 발효"},
            {"level": "해제", "step": 3, "pdf": 9, "basis": "4단계 수습·복구 — 상황 종료 시"},
        ],
    },
]

# ---------------------------------------------------------------- 공통 전처리 (R20)
MID_DOTS = "·․‧ㆍ･・"
CIRCLED = {chr(0x2460 + i): str(i + 1) for i in range(20)}


def norm(t: str) -> str:
    t = t.replace("\xa0", " ").replace("　", " ")
    for c in MID_DOTS:
        t = t.replace(c, "·")
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def squash(t: str) -> str:
    """띄어쓰기 무시 비교용"""
    return re.sub(r"\s+", "", norm(t))


PHONE = re.compile(r"(☎\s*)?\(?0\d{1,3}\)?[\s\-－~.]*\d{3,4}[\s\-－~.]*\d{4}(\s*~\s*\d+)?|☎\s*[\d\-~]+")


NL = "\n"
# 직위·역할 뒤에 붙은 실명 (R17) — '반장: 김광재', '담당자(도승욱)'
NAME_AFTER_ROLE = re.compile(r"(반장|반원|담당자|담당|팀장|과장|주무관|성명|책임자|관리자|연락관)\s*(?:[:：]\s*|\(\s*)([가-힣]{2,4})(?:\s*[,·]\s*[가-힣]{2,4})*\s*\)?(?=$|[\s,)*])")


def scrub(t: str) -> str:
    """R17 실명·전화번호는 보내지 않음 (줄바꿈은 유지)"""
    out = []
    for ln in (t or "").split(NL):
        ln = re.sub(r"\(?\s*:?\s*https?://\d[\d.]*\s?\d*[^\s)]*\s*\)?", "", ln)  # 내부망(IP) 주소
        ln = PHONE.sub("", ln)
        ln = re.sub(r"\(\s*(FAX|fax|Fax|팩스)?\s*\)", "", ln)
        ln = NAME_AFTER_ROLE.sub(lambda m: m.group(1), ln)
        ln = re.sub(r"\s+,", ",", ln)
        ln = re.sub(r"\(\s*\)", "", ln)
        ln = re.sub(r"[ \t]{2,}", " ", ln).strip(" ,")
        if ln:
            out.append(ln)
    return NL.join(out)


def fill_key(f):
    return tuple(round(v, 2) for v in f) if f else None


# ---------------------------------------------------------------- 표 칸 찾기
def page_lines(pg):
    out = []
    for bl in pg.get_text("dict")["blocks"]:
        for ln in bl.get("lines", []):
            txt = "".join(s["text"] for s in ln["spans"])
            if not txt.strip():
                continue
            x0, y0, x1, y1 = ln["bbox"]
            bold = any(s["flags"] & 16 or "Bold" in s["font"] or "bold" in s["font"].lower() for s in ln["spans"] if s["text"].strip())
            size = max((sp["size"] for sp in ln["spans"] if sp["text"].strip()), default=0)
            out.append({"x0": x0, "y0": y0, "x1": x1, "y1": y1, "t": txt, "bold": bold, "size": size})
    return out


def table_cells(pg):
    cells, grays = [], []
    for d in pg.get_drawings():
        f = fill_key(d.get("fill"))
        r = d["rect"]
        if not f or r.width < 30 or r.height < 12:
            continue
        if f in STEP_FILL:
            cells.append({"col": STEP_FILL[f], "x0": r.x0, "y0": r.y0, "x1": r.x1, "y1": r.y1})
        elif f == GRAY:
            grays.append({"x0": r.x0, "y0": r.y0, "x1": r.x1, "y1": r.y1})
    # 중복 제거
    seen, uniq = set(), []
    for c in cells:
        k = (c["col"], round(c["x0"]), round(c["y0"]), round(c["x1"]), round(c["y1"]))
        if k not in seen:
            seen.add(k)
            uniq.append(c)
    return uniq, grays


def inside(ln, c, pad=3):
    cy = (ln["y0"] + ln["y1"]) / 2
    return ln["x0"] >= c["x0"] - pad and ln["x1"] <= c["x1"] + pad and c["y0"] - 1 <= cy <= c["y1"] + 1


def split_bands(cells, grays, head_y1):
    """부서 행 묶음 (R19) — 회색 구분 칸이 있으면 그 범위, 없으면 네 열 공통 경계·빈틈으로 나눔"""
    body = [c for c in cells if c["y0"] >= head_y1 - 1]
    bands = []
    for g in grays:
        if g["y0"] >= head_y1 - 1 and g["y1"] - g["y0"] > 20:
            bands.append([g["y0"], g["y1"]])
    # 회색 칸에 덮이지 않은 칸
    rest = [c for c in body if not any(b[0] - 2 <= (c["y0"] + c["y1"]) / 2 <= b[1] + 2 for b in bands)]
    if rest:
        ivs = sorted([(c["y0"], c["y1"]) for c in rest])
        merged = []
        for a, b in ivs:
            if merged and a <= merged[-1][1] + 2:
                merged[-1][1] = max(merged[-1][1], b)
            else:
                merged.append([a, b])
        # 네 열이 모두 같은 y 에서 끝나면 행 경계
        for m in merged:
            inner = [c for c in rest if c["y0"] >= m[0] - 1 and c["y1"] <= m[1] + 1]
            ends = {}
            for c in inner:
                ends.setdefault(round(c["y1"]), set()).add(c["col"])
            cuts = sorted(y for y, cols in ends.items() if len(cols) == 4 and m[0] + 5 < y < m[1] - 5)
            start = m[0]
            for y in cuts:
                bands.append([start, y])
                start = y
            bands.append([start, m[1]])
    bands.sort()
    # 가까운 회색 칸 경계 정리 (같은 행 두 칸)
    out = []
    for b in bands:
        if out and b[0] < out[-1][1] - 3:
            out[-1][1] = max(out[-1][1], b[1])
        else:
            out.append(b)
    return out


ORG_END = ("및", "적십자사", "과", "실", "소", "청", "서", "단", "관", "센터", "본부", "지사", "공사", "사단", "부대", "협회", "시", "군", "구", "도", "반", "팀", "대", "원", "처", "국", "등", ")", ",", "부서", "기관", "매체", "장")


def join_label(prev: str, nxt: str) -> str:
    """구분 칸 줄바꿈 이음 — 앞 줄이 기관·부서 이름으로 끝나면 띄우고, 낱말 중간에서 끊긴 것이면 붙임 (R5·R20)"""
    if not prev:
        return nxt
    if prev.endswith(ORG_END) or nxt.startswith(("(", "·", "등")) or prev.endswith("·"):
        sep = "" if nxt.startswith("·") or prev.endswith("·") else " "
        return prev + sep + nxt
    return prev + nxt


def label_text(lines, x_max, y0, y1):
    """왼쪽 구분 칸 글자 (세로쓰기 이음 R20) → 열(x)별 묶음"""
    sel = [ln for ln in lines if ln["x0"] < x_max - 2 and ln["x0"] + len(ln["t"].rstrip()) * 2 <= x_max + 12
           and ln["x1"] <= x_max + 14 and y0 - 1 <= (ln["y0"] + ln["y1"]) / 2 <= y1 + 1]
    sel.sort(key=lambda l: (round(l["x0"] / 8), l["y0"]))
    cols = []
    for ln in sorted(sel, key=lambda l: l["x0"]):
        for c in cols:
            if abs(c["x"] - ln["x0"]) < 14 or (ln["x0"] < c["x1"] - 4 and ln["x1"] > c["x"] + 4):
                c["ls"].append(ln)
                c["x1"] = max(c["x1"], ln["x1"])
                break
        else:
            cols.append({"x": ln["x0"], "x1": ln["x1"], "ls": [ln]})
    res = []
    for c in sorted(cols, key=lambda c: c["x"]):
        ls = sorted(c["ls"], key=lambda l: l["y0"])
        parts = [norm(l["t"]) for l in ls]
        one_char = sum(1 for p in parts if len(p.replace(" ", "")) <= 1)
        if one_char >= len(parts) * 0.6:
            # 세로쓰기: 글자 사이 간격이 크게 벌어진 곳이 낱말 경계
            gaps = [b["y0"] - a["y0"] for a, b in zip(ls, ls[1:])]
            med = sorted(gaps)[len(gaps) // 2] if gaps else 0
            words, cur = [], parts[0] if parts else ""
            for g, p in zip(gaps, parts[1:]):
                if med and g > med * 1.6:
                    words.append(cur)
                    cur = p
                else:
                    cur += p
            words.append(cur)
            parts = [w for w in words if w]
        txt = ""
        for p in parts:
            txt = join_label(txt, p)
        res.append(norm(txt))
    return [r for r in res if r and r not in ("구 분", "구분")]


# ---------------------------------------------------------------- 칸 안 글 → 임무·조치·세부행동
DETAIL_SYM = "-\xad－–"
BULLET_SYM = "■□▪▫●○◦◘◙⦁•·ㅇ❍◯∎▣◆◇◈▲△►▸▹✓√❏❑" + "".join(chr(c) for c in range(0xF000, 0xF100))
SUB_SYM = "⇨➡→▶▷⇒"
NOTE_SYM = "※＊*"
CODE_RE = re.compile(r"^\s*\[{1,2}\s*([0-9①-⑳][0-9①-⑳\s\-－,]*)\]")
NOCODE_RE = re.compile(r"^\s*\[([^\]\[0-9①-⑳][^\]]*)\]\s*(.*)$")
TYPO_MISSING_OPEN = re.compile(r"^\s*(\d{1,2})\](.*)$")  # '3]재대본 …' (R21)
NEED_RE = re.compile(r"^\(?\s*(필요\s*시|필요시)\s*\)?$")
LEAD_COND = re.compile(r"^\(\s*((?:필요|피해\s*발생|피해발생|운영|가동|설치|통지본|재대본|대피|발생)[^()]*?시?)\s*\)\s*(.+)$")
TAIL_COND = re.compile(r"^(.+?)\s*\(\s*([^()]*?(?:시|필요\s*시))\s*\)\s*$")
STAR_COND = re.compile(r"^(.+?)\s*[＊*]\s*([^＊*]+시)\s*$")


def code_norm(raw: str) -> str:
    s = raw
    for k, v in CIRCLED.items():
        s = s.replace(k, v)
    s = s.replace("－", "-").replace(" ", "")
    s = re.sub(r"-{2,}", "-", s)
    return s.strip("-,")


def split_codes(line: str):
    """[3-3][3-4] 제목 → (['3-3','3-4'], 제목) · [①-2-3] → ('1-2-3')"""
    codes, raw = [], []
    rest = line
    while True:
        m = CODE_RE.match(rest)
        if not m:
            break
        raw.append(m.group(1))
        codes.append(code_norm(m.group(1)))
        rest = rest[m.end():]
    return codes, raw, norm(rest)


def take_condition(title: str):
    """R8 조치 전체에 붙은 조건 → condition, R18 제목 일부의 조건은 그대로"""
    t = title
    m = re.match(r"^\(\s*(필요\s*시|필요시|피해\s*발생\s*시|피해발생시)\s*\)\s*(.+)$", t)
    if m:
        return norm(m.group(2)), norm(m.group(1))
    m = STAR_COND.match(t)
    if m and is_condition(m.group(2)):
        return norm(m.group(1)), norm(m.group(2))
    m = TAIL_COND.match(t)
    if m and len(m.group(2)) <= 18 and not re.search(r"\d+시", m.group(2)) and is_condition(m.group(2)):
        return norm(m.group(1)), norm(m.group(2))
    return t, ""


COND_WORDS = ("필요", "피해", "발생", "우려", "운영", "가동", "설치", "비상", "요청", "해당", "확대", "북상")
STAGE_WORDS = ("특보", "평시", "주의보", "경보", "단계")


def is_condition(c: str) -> bool:
    """R8 조치 전체에 붙은 조건인지 — '(평시 또는 예비특보 시)' 같은 단계 표기는 조건이 아님"""
    return any(w in c for w in COND_WORDS) and not any(w in c for w in STAGE_WORDS)


def strip_changed(title: str):
    """영천 (변경) 표기: 이전 단계와 내용이 다름"""
    if re.search(r"\(\s*변경\s*\)\s*$", title):
        return norm(re.sub(r"\(\s*변경\s*\)\s*$", "", title)), True
    return title, False


def split_inline_note(title: str):
    if "※" in title:
        a, b = title.split("※", 1)
        return norm(a), norm(b)
    return title, ""


def lead_sym(t: str):
    s = t.lstrip()
    if not s:
        return "", ""
    c = s[0]
    if c in DETAIL_SYM:
        return "detail", s[1:].strip()
    if c in SUB_SYM:
        return "sub", s[1:].strip()
    if c in NOTE_SYM:
        return "note", s[1:].strip()
    if c in BULLET_SYM:
        return "bullet:" + c, s[1:].strip()
    return "", s


def merge_rows(cell_lines):
    """같은 줄(y)에 끊긴 조각을 이어 붙임"""
    rows = []
    for ln in sorted(cell_lines, key=lambda l: (round(l["y0"], 0), l["x0"])):
        if rows and abs(rows[-1]["y0"] - ln["y0"]) < 2.2 and ln["x0"] >= rows[-1]["x1"] - 2:
            gap = ln["x0"] - rows[-1]["x1"]
            rows[-1]["t"] += (" " if gap > 2 else "") + ln["t"]
            rows[-1]["x1"] = ln["x1"]
            rows[-1]["bold"] = rows[-1]["bold"] or ln["bold"]
            rows[-1]["size"] = max(rows[-1].get("size", 0), ln.get("size", 0))
        else:
            rows.append(dict(ln))
    return rows


class CellParser:
    """한 칸(부서 행 × 단계 열)의 글 → missions/actions"""

    def __init__(self, man, step_i, group, sub, page_pdf, warn):
        self.man, self.step_i, self.group, self.sub, self.page = man, step_i, group, sub, page_pdf
        self.mdepth = 2 if man["style"] == "function" else 1
        self.missions, self.actions = [], []
        self.mission = None
        self.action = None
        self.last = None  # 이어 붙일 대상 (dict, key)
        self.cond_block = ""
        self.first_bullet = None  # 번호 없는 칸에서 조치가 되는 첫 깊이 기호
        self.warn = warn
        self.seq = 0
        self.prev_end = None  # 앞 줄 오른쪽 끝 (줄바꿈 판단 R5)

    # -- 생성
    def new_mission(self, code, name, implicit=False):
        name, cond = take_condition(name)
        m = {"code": code, "name": name, "condition": cond, "implicit": implicit}
        self.missions.append(m)
        self.mission, self.action, self.last = m, None, (m, "name")
        self.cond_block = ""
        self.first_bullet = None
        return m

    def mission_as_action(self, m):
        """[n] 제목 아래 [n-m] 없이 세부행동만 있는 임무 → 조치 1건 (코드 n)"""
        self.seq += 1
        a = {"code": m["code"], "raw": f"[{m['code']}]", "name": m["name"], "mission": m, "condition": m.get("condition", ""),
             "notes": list(m.get("notes", [])), "details": [], "coded": True, "changed": False, "order": self.seq, "selfMission": True}
        m["notes"] = []
        self.actions.append(a)
        self.action, self.last = a, (a, "name")
        return a

    def finish(self):
        """하위 조치가 하나도 없는 번호 임무 → 임무 자체를 조치로 (그 임무의 조치들 앞에 둠)"""
        for m in self.missions:
            if m["code"] and not any(x["mission"] is m and x["coded"] for x in self.actions):
                a = self.mission_as_action(m)
                self.actions.remove(a)
                first = next((i for i, x in enumerate(self.actions) if x["mission"] is m), len(self.actions))
                self.actions.insert(first, a)

    def ensure_mission(self):
        if not self.mission:
            gname = self.group["name"]
            self.new_mission(None, f"{gname} 조치", implicit=True)
        return self.mission

    def new_action(self, code, raw, title, coded=True):
        self.ensure_mission()
        title, note = split_inline_note(title)
        title, changed = strip_changed(title)
        title, cond = take_condition(title)
        cond = cond or self.cond_block or self.mission.get("condition", "")
        self.seq += 1
        a = {
            "code": code, "raw": raw, "name": title, "mission": self.mission, "condition": cond,
            "notes": [note] if note else [], "details": [], "coded": coded, "changed": changed, "order": self.seq,
        }
        self.actions.append(a)
        self.action, self.last = a, (a, "name")
        return a

    # -- 한 줄 처리
    def feed(self, t, row=None, cell=None):
        # 한글 줄바꿈은 낱말 단위라 앞 줄이 칸 끝에서 한 낱말(약 55pt) 안쪽까지 찼으면 줄바꿈으로 봄
        wrapped = self.prev_end is not None and cell is not None and self.prev_end >= cell["x1"] - 55
        self.prev_end = row["x1"] if row else None
        t = norm(t)
        if not t or not scrub(lead_sym(t)[1] or t):  # 주소만 있는 줄 등
            return
        self._feed(t, wrapped)

    def _feed(self, t, wrapped):
        # R21 '3]제목' → '[3]제목'
        m = TYPO_MISSING_OPEN.match(t)
        if m and not t.startswith("["):
            t = f"[{m.group(1)}]{m.group(2)}"
        codes, raw, rest = split_codes(t)
        if codes:
            depth = len(codes[0].split("-"))
            if len(codes) == 1 and depth <= self.mdepth:
                self.new_mission(codes[0], rest)
                return
            mcode = "-".join(codes[0].split("-")[: self.mdepth])
            if not self.mission or self.mission["code"] != mcode:
                same = next((m for m in self.missions if m["code"] == mcode), None)
                if same:  # 같은 칸에서 앞서 나온 임무로 돌아감 (코드 순서가 섞인 표)
                    self.mission, self.action, self.cond_block, self.first_bullet = same, None, "", None
                elif not (self.mission and self.mission["code"] is None and not self.mission["implicit"]):
                    # R7 상위 [n] 없이 [n-m]만 → 임무 n (이름은 행동카드 조치목록으로 채움)
                    self.new_mission(mcode, "", implicit=True)
            self.new_action(",".join(codes), "".join(f"[{r}]" for r in raw), rest)
            return
        m = NOCODE_RE.match(t)
        if m:
            inner, rest = norm(m.group(1)), norm(m.group(2))
            if NEED_RE.match(inner):  # R23
                self.cond_block = "필요시"
                self.action = None
                self.first_bullet = None
                if rest:
                    self.new_action(None, "", rest, coded=False)
                return
            self.new_mission(None, inner)  # R21 번호 없는 대괄호 소제목 = 임무
            if rest:
                self.new_action(None, "", rest, coded=False)
            return
        kind, body = lead_sym(t)
        if kind == "note":
            target = self.action or self.mission
            if target is None:
                self.warn.append({"page": self.page - self.man["offset"], "reason": f"칸 머리 설명: {scrub(body)[:40]}"})
                return
            target.setdefault("notes", []).append(scrub(body))
            self.last = (target["notes"], len(target["notes"]) - 1)
            return
        a = self.action
        if kind == "detail" and not a and self.mission and self.mission["code"] and not any(x["mission"] is self.mission for x in self.actions):
            a = self.mission_as_action(self.mission)
        if kind == "detail" or kind == "sub" or kind.startswith("bullet:"):
            sym = kind.split(":", 1)[1] if kind.startswith("bullet:") else kind
            if a and a["coded"]:
                # 번호 붙은 조치 아래: 첫 깊이 = 세부행동 제목, 그 아래 = 내용 (R3·R13)
                if kind == "detail" or not a["details"]:
                    a["details"].append({"title": scrub(body), "content": ""})
                    self.last = (a["details"][-1], "title")
                else:
                    d = a["details"][-1]
                    d["content"] = (d["content"] + "\n" if d["content"] else "") + scrub(body)
                    self.last = (d, "content")
                return
            # 번호 없는 칸(단계 × 주체 매트릭스): 첫 깊이 기호 줄 = 조치, 그 아래 = 세부행동
            if self.first_bullet is None or not a:
                self.first_bullet = self.first_bullet or sym
            if sym == self.first_bullet or not a:
                self.new_action(None, "", body, coded=False)
                return
            a["details"].append({"title": scrub(body), "content": ""})
            self.last = (a["details"][-1], "title")
            return
        # 기호 없는 줄
        if self.last and self.last[0] is self.mission and not self.mission.get("code") and not self.action and self.mission["name"]:
            # [소제목] 아래 문장 = 조치 (번호 없는 매뉴얼)
            self.new_action(None, "", body, coded=False)
            self.first_bullet = "plain"
            return
        title_line = bool(self.last) and self.last[1] == "name" and (self.last[0] is self.action or self.last[0] is self.mission)
        plain_item = bool(self.last) and self.last[1] == "title" and isinstance(self.last[0], dict) and self.last[0].get("_plain")
        if not wrapped and (title_line or plain_item) and not body.startswith("(") and (self.action or (self.mission and self.mission["code"])):
            # 제목 줄(또는 기호 없이 적은 항목)이 칸 끝까지 차지 않았는데 기호 없이 이어지는 줄
            # = 줄바꿈이 아니라 따로 적은 항목 → 세부행동. ('-' 세부행동·※ 설명 줄은 손으로 줄을 바꾼 경우가 많아 R5대로 이어 붙임)
            a = self.action or self.mission_as_action(self.mission)
            a["details"].append({"title": scrub(body), "content": "", "_plain": True})
            self.last = (a["details"][-1], "title")
            return
        if self.last:  # R5 칸이 좁아 줄바꿈된 것 — 앞 줄에 이어 붙임
            obj, key = self.last
            prev = obj[key]
            joiner = "" if (prev.endswith(("(", "·", "/", "-")) or body.startswith((")", "·", ","))) else " "
            obj[key] = norm(prev + joiner + body)
            if obj is self.action and key == "name":
                # 이어 붙인 뒤 조건·변경 다시 판단
                n, ch = strip_changed(obj["name"])
                n, cond = take_condition(n)
                obj["name"], obj["changed"] = n, obj["changed"] or ch
                if cond and not obj["condition"]:
                    obj["condition"] = cond
            return
        self.new_action(None, "", body, coded=False)


# ---------------------------------------------------------------- 행동카드 (②)
CARD_LABELS = ["코드번호", "조치목록", "조치내용", "주관부서", "지원부서", "협업기관", "연계코드"]


def step_of_label(s: str):
    s = squash(s)
    if not s:
        return None
    if "평시" in s or "징후" in s:
        return 0
    if "비상1" in s:
        return 1
    if "비상2" in s or "2·3" in s or "23단계" in s:
        return 2
    if "초기" in s:
        return 1
    if "비상" in s:
        return 2
    if "수습" in s or "복구" in s:
        return 3
    return None


def scan_cards(doc, man):
    a, b = man["cards"]
    cards = []
    for pno in range(a, b + 1):
        pg = doc[pno - 1]
        lines = page_lines(pg)
        heads = [ln for ln in lines if squash(ln["t"]).startswith("코드번호")]
        for h in heads:
            # 카드 머리 영역: 코드번호 줄 위 40pt ~ 아래 90pt, 같은 표 폭
            y0, y1 = h["y0"] - 40, h["y0"] + 95
            area = [ln for ln in lines if y0 <= ln["y0"] <= y1]
            area_rows = merge_rows(area)
            text = " | ".join(norm(r["t"]) for r in sorted(area_rows, key=lambda r: (r["y0"], r["x0"])))
            fields = {}
            # 같은 줄(y)에서 라벨 오른쪽 값
            for lab in CARD_LABELS:
                for r in area:
                    sq = squash(r["t"])
                    k = sq.find(lab)
                    if k < 0:
                        continue
                    after = re.sub(r"^\s*[ⓢⓒ]?\s*" + r"\s*".join(lab) + r"\s*[:：]?\s*", "", norm(r["t"]))
                    if after and after != norm(r["t"]):
                        val = after
                    else:
                        val = ""
                    if not val:
                        cand = [o for o in area if abs((o["y0"] + o["y1"]) / 2 - (r["y0"] + r["y1"]) / 2) < 4 and o["x0"] > r["x1"] - 1]
                        cand.sort(key=lambda o: o["x0"])
                        stop = []
                        for o in cand:
                            if any(squash(o["t"]).startswith(l2) or squash(o["t"]).startswith("ⓢ" + l2) or squash(o["t"]).startswith("ⓒ" + l2) for l2 in CARD_LABELS):
                                break
                            stop.append(norm(o["t"]))
                        val = " ".join(stop)
                    fields[lab] = norm(val.lstrip(":： "))
                    break
            # 카드 단계 표시: 머리 왼쪽 위 작은 글
            tags = [ln for ln in lines if h["y0"] - 45 <= ln["y0"] < h["y0"] - 2 and ln["x0"] < h["x0"] + 60]
            tag = " ".join(norm(t["t"]) for t in sorted(tags, key=lambda l: (l["y0"], l["x0"])))
            code_raw = fields.get("코드번호", "")
            code = code_norm(re.sub(r"[^0-9①-⑳\-－,]", "", code_raw.replace("~", ",")))
            cards.append({
                "pdf": pno, "y": h["y0"], "code": code, "codeRaw": code_raw, "tag": tag, "step": step_of_label(tag),
                "name": fields.get("조치목록", ""), "summary": fields.get("조치내용", ""),
                "lead": fields.get("주관부서", ""), "support": fields.get("지원부서", ""), "collab": fields.get("협업기관", ""),
                "link": fields.get("연계코드", ""), "head": text,
            })
    # 단계 표시가 없는 카드는 앞 카드 단계를 이어받음
    prev = None
    for c in cards:
        if c["step"] is None:
            c["step"] = prev
        prev = c["step"]
    return cards


def segments(pg):
    H, V = [], []
    for d in pg.get_drawings():
        for it in d["items"]:
            if it[0] == "l":
                p1, p2 = it[1], it[2]
                if abs(p1.y - p2.y) < 1 and abs(p1.x - p2.x) > 8:
                    H.append((min(p1.x, p2.x), max(p1.x, p2.x), (p1.y + p2.y) / 2))
                elif abs(p1.x - p2.x) < 1 and abs(p1.y - p2.y) > 8:
                    V.append(((p1.x + p2.x) / 2, min(p1.y, p2.y), max(p1.y, p2.y)))
            elif it[0] == "re":
                r = it[1]
                if r.height < 1.5 and r.width > 8:
                    H.append((r.x0, r.x1, (r.y0 + r.y1) / 2))
                elif r.width < 1.5 and r.height > 8:
                    V.append(((r.x0 + r.x1) / 2, r.y0, r.y1))
    return H, V


def card_tables(pg, y_from, y_to):
    """행동카드 표 (표준행동 | 세부내용(지시내용) | 비고) → 세부행동 (②-8~10)"""
    lines = page_lines(pg)
    heads = [l for l in lines if squash(l["t"]) == "표준행동" and y_from <= l["y0"] <= y_to]
    if not heads:
        return []
    H, V = segments(pg)
    rows_out = []
    for h in heads:
        hy = (h["y0"] + h["y1"]) / 2
        vx = sorted({round(v[0]) for v in V if v[1] < hy < v[2]})
        xs = []
        for x in vx:
            if not xs or x - xs[-1] > 3:
                xs.append(x)
        if len(xs) < 3:
            continue
        cols = list(zip(xs, xs[1:]))
        def col_of(x0, x1):
            cx = (x0 + x1) / 2
            for i, (a, b) in enumerate(cols):
                if a - 1 <= cx <= b + 1:
                    return i
            return None
        same = [l for l in lines if abs(l["y0"] - h["y0"]) < 4]
        ci_s = col_of(h["x0"], h["x1"])
        ci_d = next((col_of(l["x0"], l["x1"]) for l in same if squash(l["t"]) in ("세부내용", "지시내용", "세부내용및방법")), None)
        ci_n = next((col_of(l["x0"], l["x1"]) for l in same if squash(l["t"]).startswith("비고")), None)
        if ci_s is None or ci_d is None:
            continue
        bottom = max(v[2] for v in V if v[1] < hy < v[2])
        sx0, sx1 = cols[ci_s]
        hb = min([hh[2] for hh in H if hh[2] > h["y1"] - 1 and hh[0] <= sx0 + 3 and hh[1] >= sx1 - 3] + [h["y1"] + 4])
        cuts = sorted({round(hh[2], 1) for hh in H if hb + 2 < hh[2] < bottom - 2 and hh[0] <= sx0 + 3 and hh[1] >= sx1 - 3})
        edges = [hb] + cuts + [bottom]
        for a, b in zip(edges, edges[1:]):
            band = [l for l in lines if a - 1 <= (l["y0"] + l["y1"]) / 2 <= b + 1]
            def txt(ci, sep):
                if ci is None:
                    return ""
                ls = sorted([l for l in band if col_of(l["x0"], l["x1"]) == ci], key=lambda l: (l["y0"], l["x0"]))
                return sep.join(norm(l["t"]) for l in ls if norm(l["t"]))
            title = norm(txt(ci_s, " "))
            if not title:
                # 표준행동 칸이 위 행과 합쳐진 경우 — 앞 세부행동 내용에 이어 붙임
                if rows_out:
                    more = txt(ci_d, NL)
                    if more:
                        rows_out[-1]["content"] = (rows_out[-1]["content"] + NL + scrub(more)).strip()
                continue
            rows_out.append({"title": scrub(title), "content": scrub(txt(ci_d, NL)), "note": scrub(txt(ci_n, " "))})
    return rows_out


def card_body(doc, card, nxt, man):
    """카드 본문 첫 깊이 = 세부행동 제목, 그 아래 = 내용 (R9·R13). 다음 카드 머리 전까지."""
    out = []
    start_p, start_y = card["pdf"], card["y"] + 70
    end_p = nxt["pdf"] if nxt else card["pdf"] + 1
    end_y = nxt["y"] - 50 if nxt else 9999
    for pno in range(start_p, min(end_p, start_p + 3) + 1):
        pg = doc[pno - 1]
        H = pg.rect.height
        for r in merge_rows(page_lines(pg)):
            if pno == start_p and r["y0"] < start_y:
                continue
            if pno == end_p and r["y0"] >= end_y:
                continue
            if pno > start_p and pno == end_p and nxt is None:
                continue
            if r["y0"] < 45 or r["y0"] > H - 40:  # 쪽 머리글·쪽번호 (R20)
                continue
            out.append((pno, r))
    # 표준행동 표가 있으면 표가 우선 (부산형)
    rows = []
    for pno in sorted({p for p, _ in out}):
        y_from = start_y - 70 if pno == start_p else 0
        y_to = end_y if pno == end_p else 9999
        rows += card_tables(doc[pno - 1], y_from, y_to)
    if rows:
        return rows[:15]
    titles = []
    last_o = None
    for pno, r in out:
        t = norm(r["t"])
        if r["t"][:1].isdigit() and r.get("size", 0) >= 11 and re.match(r"^\d{1,2}\.\s*\S", t) and not re.match(r"^\d{1,2}\.\d", t):
            titles.append({"title": scrub(re.sub(r"^\d{1,2}\.\s*", "", t)), "content": "", "_x": r["x0"]})
            last_o = None
            continue
        if titles and re.match(r"^[○❍◯ㅇ●◦]\s*", t):
            body = scrub(re.sub(r"^[○❍◯ㅇ●◦]\s*", "", t))
            if body:
                d = titles[-1]
                d["content"] = (d["content"] + NL if d["content"] else "") + body
                last_o = r
            continue
        # ○ 줄이 칸 폭 때문에 넘어간 이음 줄 (R5)
        if titles and last_o is not None and not lead_sym(t)[0] and r["x0"] > last_o["x0"] + 4 and 0 < r["y0"] - last_o["y0"] < (last_o["y1"] - last_o["y0"]) * 1.9:
            d = titles[-1]
            d["content"] = norm(d["content"] + " " + scrub(t)) if NL not in d["content"] else d["content"] + " " + scrub(t)
            last_o = r
            continue
        last_o = None
    for d in titles:
        d.pop("_x", None)
    return [d for d in titles if d["title"]][:12]


def name_sim(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    def k(x):
        return squash(x).replace("·", "")
    def nop(x):
        return k(re.sub(r"\([^)]*\)", "", x))
    s = max(SequenceMatcher(None, k(a), k(b)).ratio(), SequenceMatcher(None, nop(a), nop(b)).ratio())
    # 한쪽 이름이 다른 쪽에 통째로 들어 있으면 (괄호 보충·덧붙인 말 차이) 같은 조치로 봄
    sa, sb = nop(a), nop(b)
    if min(len(sa), len(sb)) >= 6 and (sa in sb or sb in sa):
        s = max(s, 0.85)
    return s


def match_card(a, cards):
    """프로세스 표 조치 ↔ 행동카드 (②). 코드로 짝을 맞추되, 카드 번호가 표와 다르게 매겨진 매뉴얼(부산 3·4단계)이
    있어 조치 이름도 함께 본다. 제목·순서·세부행동은 표, 기관·쪽은 카드 (애매한 경우 규칙)."""
    first = a["code"].split(",")[0]
    best, best_s = None, 0.0
    for i, c in enumerate(cards):
        s = max(name_sim(a["name"], c["name"]), name_sim(a["name"], c["summary"]))
        hit = first in c["code"].split(",")
        same_step = c["step"] == a["step"]
        if hit and same_step and s >= 0.4:
            score = 2 + s
        elif same_step and s >= 0.8:
            score = 1 + s
        elif hit and s >= 0.6:  # R22 단계 표기가 다른 카드
            score = 0.5 + s
        else:
            continue
        if score > best_s:
            best, best_s = i, score
    return best


def step_goals(doc, pno):
    """단계별 '가. 대응 지침' ❍ 항목 (다음 '나.' 머리 전까지)"""
    rows = merge_rows([l for l in page_lines(doc[pno - 1])])
    rows.sort(key=lambda r: (round(r["y0"]), r["x0"]))
    out, on, in_note = [], False, False
    for r in rows:
        t = norm(r["t"])
        if re.search(r"대응\s*지침", t):
            on = True
            continue
        if not on:
            continue
        if re.match(r"^나\s*\.", t):
            break
        if re.match(r"^[❍○◯●]", t):
            out.append(scrub(re.sub(r"^[❍○◯●]\s*", "", t)))
            in_note = False
        elif t.startswith("※"):
            in_note = True  # ※ 보충 설명과 그 이음 줄은 지침 항목에 넣지 않음
        elif out and t and not in_note and not re.match(r"^[-\d]", t):
            out[-1] = norm(out[-1] + " " + scrub(t))
    return [o for o in out if o]


# ---------------------------------------------------------------- 매뉴얼 1종
def build_manual(pdf_dir: Path, man, dump=None):
    doc = pymupdf.open(pdf_dir / man["file"])
    warn = []
    groups, missions, actions = [], [], []
    step_info = [{"phaseLabel": "", "tablePdf": None} for _ in range(4)]
    for pno, kind in man["table"]:
        pg = doc[pno - 1]
        lines = page_lines(pg)
        cells, grays = table_cells(pg)
        # 머리 행: '1단계' 글이 든 칸
        heads = [ln for ln in lines if re.match(r"^\s*[1-4]\s*단계\s*$", ln["t"])]
        head_y1 = max((h["y1"] for h in heads), default=0) + 6
        for c in cells:
            if c["y0"] < head_y1 - 1:
                # 단계명 (원문) — 'N단계' 번호 칸은 건너뜀, 위기경보 칸(관심·주의·경계·심각·★)은 뺌 (D19)
                ls = [l for l in lines if inside(l, c) and l["t"].strip() not in ("관심", "주의", "경계", "심각", "★", "■")]
                txt = norm(" ".join(l["t"] for l in sorted(ls, key=lambda l: (round(l["y0"]), l["x0"]))))
                if txt and not re.fullmatch(r"[1-4]단계", squash(txt)):
                    if not step_info[c["col"]]["phaseLabel"]:
                        step_info[c["col"]]["phaseLabel"] = txt
                    step_info[c["col"]]["tablePdf"] = step_info[c["col"]]["tablePdf"] or pno
        body_cells = [c for c in cells if c["y0"] >= head_y1 - 1]
        bands = split_bands(cells, grays, head_y1)
        x_first = min(c["x0"] for c in body_cells if c["col"] == 0)
        for bi, (y0, y1) in enumerate(bands):
            gx = [g["x1"] for g in grays if g["y0"] < y1 - 2 and g["y1"] > y0 + 2 and g["x1"] < x_first]
            label_right = max(gx) if gx else x_first - 3
            labels = label_text(lines, label_right, y0, y1)
            if not labels:
                warn.append({"page": pno - man["offset"], "reason": "부서 칸 이름 없음"})
                continue
            gkind = kind[bi] if isinstance(kind, list) and bi < len(kind) else (kind if isinstance(kind, str) else "협업부서")
            fn = None
            if gkind == "초기대응부서":
                rest = [x for x in labels if squash(x) != "초기대응부서"]
                gname = " · ".join(rest) if rest else labels[-1]
            elif gkind == "지휘부" and len(labels) > 1:
                # '시장 | 부재 시 부시장' → '시장 (부재 시 부시장)'
                gname = f"{labels[0]} ({labels[1]})" if "부재" in labels[1] else " · ".join(labels)
            else:
                gname = labels[-1]
                if len(labels) > 1:
                    fn = " ".join(labels[:-1])  # 협업기능 (영천 ⑬ 재난수습홍보 등)
            gid = f"g{len(groups) + 1}"
            g = {"id": gid, "name": gname, "kind": gkind, "fn": fn, "pdf": pno, "page": pno - man["offset"],
                 "mine": gkind != "지휘부" and man["mine"] in squash(gname)}
            groups.append(g)
            bcells = [c for c in body_cells if y0 - 2 <= (c["y0"] + c["y1"]) / 2 <= y1 + 2]
            for col in range(4):
                ccells = sorted([c for c in bcells if c["col"] == col], key=lambda c: c["y0"])
                parser = None
                prev_right = label_right + 1 if col == 0 else max([c2["x1"] for c2 in bcells if c2["col"] == col - 1] + [0]) - 2
                for c in ccells:
                    sub_ls = [l for l in lines if l["x1"] <= c["x0"] + 3 and l["x0"] >= max(prev_right, c["x0"] - 46) and c["y0"] - 1 <= (l["y0"] + l["y1"]) / 2 <= c["y1"] + 1]
                    if col == 0 and c["x0"] - label_right < 12:
                        sub_ls = []
                    # 하위 칸 이름: 세로쓰기 낱글자는 붙이고, 여러 줄 낱말('기획/인사/총무/예산')은 띄어 씀
                    parts = [norm(l["t"]) for l in sorted(sub_ls, key=lambda l: (l["y0"], l["x0"]))]
                    sub = "".join(parts) if parts and all(len(x) <= 1 for x in parts) else norm(" ".join(parts))
                    if not re.search(r"[가-힣A-Za-z]", sub):  # 열 사이 화살표(→)는 하위 칸 이름이 아님
                        sub = ""
                    cl = merge_rows([l for l in lines if inside(l, c)])
                    if not cl:
                        continue
                    # 같은 부서·단계 안에서 하위 칸(공통/부서별/도로…)마다 따로
                    parser = CellParser(man, col, g, sub, pno, warn)
                    for r in cl:
                        parser.feed(r["t"], r, c)
                    parser.finish()
                    for m in parser.missions:
                        m.update({"step": col, "group": gid, "sub": sub, "pdf": pno})
                        missions.append(m)
                    for a in parser.actions:
                        a.update({"step": col, "group": gid, "sub": sub, "pdf": pno})
                        actions.append(a)
    # ---- 행동카드 연결
    cards = scan_cards(doc, man)
    used_cards = set()
    for a in actions:
        if not a["code"]:
            continue
        ci = match_card(a, cards)
        if ci is None:
            continue
        c = cards[ci]
        used_cards.add(ci)
        a["card"] = c
        nxt = cards[ci + 1] if ci + 1 < len(cards) else None
        if not a["details"]:  # R9 프로세스 표에 - 줄이 없으면 카드 본문
            a["details"] = card_body(doc, c, nxt, man)
            a["detailsFrom"] = "card"
        # R7 이름 없는 임무 = 카드 조치목록 ('(필요시)통제활동'처럼 조건이 붙어 있으면 R8)
        if a["mission"]["implicit"] and not a["mission"]["name"] and c["name"]:
            n, cond = take_condition(c["name"])
            a["mission"]["name"] = n
            if cond and not a["mission"].get("condition"):
                a["mission"]["condition"] = cond
    for m in missions:
        if m["implicit"] and not m["name"] and m["code"]:
            # 같은 부서 다른 단계에 같은 번호 임무가 있으면 그 이름
            twin = next((x for x in missions if x is not m and x["group"] == m["group"] and x["code"] == m["code"] and x["name"] and not x["implicit"]), None)
            if twin:
                m["name"] = twin["name"]
    for m in missions:
        if m["implicit"] and not m["name"]:
            m["name"] = f"{m['code']}" if m["code"] else "조치"
            warn.append({"page": m["pdf"] - man["offset"], "reason": f"임무 {m['code']} 이름 없음(카드 없음)"})
    # 임무 전체에 붙은 조건은 그 임무의 조치에도 (R8·R23)
    for a in actions:
        if not a["condition"] and a["mission"].get("condition"):
            a["condition"] = a["mission"]["condition"]
    # ---- JSON 모양
    step_out = []
    for i, s in enumerate(step_info):
        gp = man["goals"][i]
        step_out.append({"step": STEPS[i], "no": i + 1, "phaseLabel": s["phaseLabel"].replace(" · ", "·"),
                         "tablePdfPage": s["tablePdf"], "goals": step_goals(doc, gp), "goalPdfPage": gp, "goalPage": gp - man["offset"]})
    recommend = [{"level": r["level"], "step": STEPS[r["step"]], "basis": r["basis"], "pdfPage": r["pdf"], "page": r["pdf"] - man["offset"]}
                 for r in man["recommend"]]
    mis_out, mid, used_keys = [], {}, set()
    for k, m in enumerate(missions):
        key = f"{STEPS[m['step']]}:{m['group']}:{m['sub']}:{m['code'] or 'n' + str(k)}"
        if key in used_keys:
            key += f":{k}"
        used_keys.add(key)
        mid[id(m)] = key
        mis_out.append({"id": key, "code": m["code"], "name": m["name"], "step": STEPS[m["step"]], "group": m["group"],
                        "sub": m["sub"] or None, "condition": m["condition"] or None, "notes": [scrub(x) for x in m.get("notes", [])] or None,
                        # 번호·소제목 없이 기호 줄만 있는 칸에 붙인 '{부서} 조치' 임무 — 화면에서 머리를 숨김
                        "auto": bool(m["implicit"] and not m["code"]) or None})
    act_out, seen = [], set()
    for k, a in enumerate(actions):
        aid = f"{STEPS[a['step']][0:2]}-{a['group']}-{a['code'] or 'u' + str(k)}"
        while aid in seen:
            aid += "b"
        seen.add(aid)
        c = a.get("card")
        orgs = None
        if c:
            orgs = {"lead": scrub(c["lead"]).strip("- ") or None,
                    "support": [scrub(x) for x in re.split(r"[,，]", c["support"]) if scrub(x).strip("- ")] or None,
                    "collab": [scrub(x) for x in re.split(r"[,，]", c["collab"]) if scrub(x).strip("- ")] or None}
        page_pdf = c["pdf"] if c else a["pdf"]
        act_out.append({
            "id": aid, "code": a["code"], "name": scrub(a["name"]), "mission": mid[id(a["mission"])], "step": STEPS[a["step"]],
            "group": a["group"], "sub": a["sub"] or None, "condition": a["condition"] or None,
            "notes": [scrub(x) for x in a["notes"] if scrub(x)] or None, "changed": a["changed"] or None,
            "details": [{"seq": i + 1, "title": scrub(d["title"]),
                         **({"content": scrub(d["content"])} if scrub(d.get("content", "")) else {}),
                         **({"note": scrub(d["note"])} if scrub(d.get("note", "")) else {})}
                        for i, d in enumerate([d for d in a["details"] if scrub(d["title"])])],
            "detailsFrom": a.get("detailsFrom"),
            "summary": scrub(c["summary"]) if c and c["summary"] else None,
            "orgs": orgs,
            "page": page_pdf - man["offset"], "pdfPage": page_pdf, "tablePage": a["pdf"] - man["offset"], "tablePdfPage": a["pdf"],
        })
    out = {k: man[k] for k in ("id", "region", "manualId", "title", "short", "file", "offset", "style", "mine")}
    out.update({"pageCount": doc.page_count, "steps": step_out, "recommend": recommend, "groups": groups, "missions": mis_out,
                "actions": act_out, "warnings": warn, "cards": len(cards), "cardsUsed": len(used_cards)})
    if dump:
        dump_manual(out, cards, Path(dump))
    return out


def dump_manual(m, cards, dump: Path):
    dump.mkdir(parents=True, exist_ok=True)
    L = []
    gname = {g["id"]: g for g in m["groups"]}
    for g in m["groups"]:
        L.append(f"\n######## {g['id']} {g['name']} [{g['kind']}] p.{g['page']} mine={g['mine']}")
        for st in STEPS:
            ms = [x for x in m["missions"] if x["group"] == g["id"] and x["step"] == st]
            if not ms:
                continue
            L.append(f"  == {st}")
            for x in ms:
                L.append(f"    [{x['code'] or '-'}] {x['name']}{'  <' + x['sub'] + '>' if x['sub'] else ''}{'  {' + x['condition'] + '}' if x['condition'] else ''}")
                for a in [a for a in m["actions"] if a["mission"] == x["id"]]:
                    o = a.get("orgs") or {}
                    L.append(f"       {a['code'] or '·':10s} {a['name']}{'  {' + a['condition'] + '}' if a['condition'] else ''}  | 주관={o.get('lead')} p.{a['page']}{' ' + a['detailsFrom'] if a.get('detailsFrom') else ''}")
                    for d in a["details"]:
                        L.append(f"           - {d['title']}" + (f"  ⟶ {d['content'][:80]!r}" if d.get("content") else ""))
                    for n in a.get("notes") or []:
                        L.append(f"           ※ {n}")
    (dump / f"{m['region']}_tree.txt").write_text("\n".join(L), encoding="utf-8")
    (dump / f"{m['region']}_cards.txt").write_text("\n".join(f"p{c['pdf']} step={c['step']} code={c['code']!r} raw={c['codeRaw']!r} tag={c['tag']!r} | {c['name']} | 주관={c['lead']} | 지원={c['support']} | 협업={c['collab']}" for c in cards), encoding="utf-8")


def main():
    pdf_dir, out_path = Path(sys.argv[1]), Path(sys.argv[2])
    dump = sys.argv[sys.argv.index("--dump") + 1] if "--dump" in sys.argv else None
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    res = []
    for man in MANUALS:
        if only and man["region"] != only:
            continue
        m = build_manual(pdf_dir, man, dump)
        res.append(m)
        print(f"{m['region']}: 부서 {len(m['groups'])} · 임무 {len(m['missions'])} · 조치 {len(m['actions'])} · 카드 {m['cardsUsed']}/{m['cards']} · 경고 {len(m['warnings'])}")
    if not only:
        out_path.write_text(json.dumps({"rules": "report4 mapping.html R1~R25", "manuals": res}, ensure_ascii=False, indent=1), encoding="utf-8")
        print("저장:", out_path)


if __name__ == "__main__":
    main()
