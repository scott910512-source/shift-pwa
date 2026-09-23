# -*- coding: utf-8 -*-
"""
4조 2교대 근무표 — PC 바탕화면 생성기 (Windows)

  화면 전체를 쓰는 대시보드를 그려 바탕화면으로 지정한다.
    · 왼쪽 위  : 오늘 주간(왼) / 야간(오른) 근무조와 공장별 명단
    · 왼쪽 아래: 이번 달 달력 — 날짜마다 주간·야간 조 표기
    · 오른쪽   : 전체 근무자 명단 (조별 + 상근)

  명단은 배포된 crew.json 을 받아 쓴다. 인터넷이 막혀 있으면
  마지막으로 받아둔 값을, 그것도 없으면 아래 내장 명단을 쓴다.

필요한 것:  Python 3.8+ ,  pip install pillow

사용법:
  python wallpaper.py                 # 이미지 생성 + 바탕화면 지정
  python wallpaper.py --no-set        # 이미지만 생성 (지정하지 않음)
  python wallpaper.py --out a.png --size 1920x1080 --now 2026-09-15T03:00
  python wallpaper.py --icon-cols 3   # 아이콘이 세 줄이면 그만큼 더 비운다
  python wallpaper.py --scale 0.9     # 전체 크기 (작을수록 아담)
  python wallpaper.py --install       # 이미지 생성 + 작업 스케줄러 등록
  python wallpaper.py --uninstall     # 자동 갱신 해제
  python wallpaper.py --diag          # 왜 안 바뀌는지 점검
  python wallpaper.py --online        # 최신 명단을 받아온다 (기본은 내장 명단)
  python wallpaper.py --bg 사진.jpg    # 배경 (사진 경로 / black / sejong)
"""

import calendar
import ctypes
import io
import json
import math
import os
import re
import sys
import urllib.request

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# 명단은 아래 FALLBACK 에 전부 들어 있어서 인터넷이 없어도 그대로 돈다.
# 사내망에서 막히면 기다리기만 하고 얻는 게 없으므로 기본은 접속하지 않는다.
# 최신 명단을 받아오고 싶을 때만 --online 을 붙인다.
USE_NETWORK = False
CREW_URL = "https://scott910512-source.github.io/shift-pwa/crew.json"

# 바탕화면 아이콘이 가리지 않도록 왼쪽을 몇 칸 비워 둘지.
# 윈도우 아이콘은 왼쪽 위부터 세로로 쌓이므로 그 폭만큼 피해서 그린다.
# 아이콘이 두 줄(열)을 넘어가면 3, 4 로 올리면 된다. 0 이면 꽉 채운다.
# 실행할 때 --icon-cols 3 처럼 바꿔 줄 수도 있다.
ICON_COLS = 5
ICON_COL_W = 78             # 아이콘 한 열의 폭 (1080p 기준, 보통 크기 아이콘)

# 전체 크기. 1.0 이면 화면을 꽉 채우고, 작을수록 아담해진다.
# --scale 0.9 처럼 실행할 때 바꿔 줄 수도 있다.
SCALE = 0.78

# ───────────────────────── 근무 패턴 (웹앱·위젯과 동일) ─────────────────────────

import datetime as _dt

TEAMS = ["A", "B", "C", "D"]
BLOCKS = [("D", "B"), ("C", "A"), ("B", "D"), ("A", "C")]
ANCHOR = _dt.date(2026, 8, 27)   # 사이클 0일차 (웹앱·위젯과 같은 기준일)
DOW = "월화수목금토일"            # date.weekday(): 0=월


def shift_of(d):
    """date -> (주간조, 야간조, 블록내 일차, 휴무조들)"""
    n = (d - ANCHOR).days        # 파이썬 //, % 는 음수에서도 내림이라 과거 날짜도 맞다
    day, night = BLOCKS[(n // 3) % 4]
    nth = n % 3 + 1
    off = [t for t in TEAMS if t not in (day, night)]
    return day, night, nth, off


def block_index(d):
    """3일 묶음 번호. 달력에서 묶음끼리 배경색을 번갈아 주는 데 쓴다."""
    return (d - ANCHOR).days // 3


def current_view(now):
    """지금 화면에 뭘 보여줄지. 00:00~08:00 은 야간이 어제 시작분이다."""
    today = now.date()
    dawn = now.hour < 8
    night_date = today - _dt.timedelta(days=1) if dawn else today
    day_team, _, nth, _ = shift_of(today)
    _, night_team, _, _ = shift_of(night_date)
    off = [t for t in TEAMS if t not in (day_team, night_team)]
    kind = "day" if 8 <= now.hour < 20 else "night"
    return {
        "date": today, "nth": nth, "dawn": dawn, "kind": kind,
        "day": day_team, "night": night_team, "night_date": night_date, "off": off,
    }


def now_kst():
    return _dt.datetime.now(_dt.timezone(_dt.timedelta(hours=9))).replace(tzinfo=None)


# ───────────────────────────────── 명단 ─────────────────────────────────

PLANTS = ["1", "2", "3"]

# FALLBACK:START — tools/sync-crew.js 가 자동으로 고쳐 쓴다. 손으로 고치지 말 것.
FALLBACK = {
  "crews": {
    "A": {"leader": "노용수", "factories": {
      "1": ["곽대력", "송상현", "문정중"],
      "2": ["하형만", "박성현", "진영욱"],
      "3": ["민경찬", "구태현", "여형진"]}},
    "B": {"leader": "조한석", "factories": {
      "1": ["김태진", "어하진", "황영수"],
      "2": ["안민호", "장예닮", "김재섭"],
      "3": ["김동희", "곽정재", "송재익", "이현식"]}},
    "C": {"leader": "김민규", "factories": {
      "1": ["김혁순", "김병로", "김문수"],
      "2": ["박광현", "전규석", "이재서"],
      "3": ["김인회", "김석규", "장주원", "박현석"]}},
    "D": {"leader": "김명수", "factories": {
      "1": ["정경훈", "정영훈", "이원준"],
      "2": ["백정욱", "김병섭", "박상준"],
      "3": ["양진리", "안윤철", "김지용", "황성호"]}}
  },
  "staff": ["방우석", "류인환", "우두형", "고형진", "고현석", "김윤종", "김동주"]
}
# FALLBACK:END


def cache_path():
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    d = os.path.join(base, "shift-wallpaper")
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, "crew.json")


def normalize(raw):
    crews = {}
    src = (raw or {}).get("crews") or {}
    for t in TEAMS:
        c = src.get(t) or {}
        fx = c.get("factories") or {}
        crews[t] = {
            "leader": str(c.get("leader") or "").strip(),
            "factories": {p: [str(x).strip() for x in (fx.get(p) or []) if str(x).strip()]
                          for p in PLANTS},
        }
    staff = [str(x).strip() for x in ((raw or {}).get("staff") or []) if str(x).strip()]
    return {"crews": crews, "staff": staff}


def has_names(crew):
    """공장 명단이 하나라도 들어 있는지. 껍데기만 받은 경우를 걸러낸다."""
    return any(crew["crews"][t]["factories"][p] for t in TEAMS for p in PLANTS)


def load_crew(url, online=USE_NETWORK):
    """내장 명단을 쓴다. --online 일 때만 최신 → 저장본 → 내장 순으로 시도한다."""
    if not online:
        return normalize(FALLBACK), "내장"
    path = cache_path()
    try:
        if url.startswith(("http://", "https://")):
            with urllib.request.urlopen(url, timeout=8) as r:
                raw = json.loads(r.read().decode("utf-8"))
        else:
            with open(url, encoding="utf-8") as f:
                raw = json.load(f)
        got = normalize(raw)
        if has_names(got):
            try:
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(raw, f, ensure_ascii=False)
            except OSError:
                pass
            return got, "최신"
    except Exception:
        # 사내망 SSL 검사 등으로 막히는 일이 있다. 내장 명단으로 조용히 넘어간다.
        pass
    try:
        with open(path, encoding="utf-8") as f:
            got = normalize(json.load(f))
        if has_names(got):
            return got, "저장본"
    except Exception:
        pass
    return normalize(FALLBACK), "내장"


# ───────────────────────────────── 글꼴 ─────────────────────────────────

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\malgunbd.ttf",       # 맑은 고딕 굵게
    r"C:\Windows\Fonts\malgun.ttf",         # 맑은 고딕
    r"C:\Windows\Fonts\NanumGothicBold.ttf",
    r"C:\Windows\Fonts\gulim.ttc",
    "/usr/local/lib/python3.11/dist-packages/koreanize_matplotlib/fonts/NanumGothicBold.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
]
FONT_CANDIDATES_REG = [
    r"C:\Windows\Fonts\malgun.ttf",
    r"C:\Windows\Fonts\NanumGothic.ttf",
    r"C:\Windows\Fonts\gulim.ttc",
    "/usr/local/lib/python3.11/dist-packages/koreanize_matplotlib/fonts/NanumGothic.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
]


# 머리말의 장식 문구용. 없으면 본문 글꼴로 대신한다.
FONT_CANDIDATES_SCRIPT = [
    r"C:\Windows\Fonts\segoesc.ttf",        # Segoe Script
    r"C:\Windows\Fonts\Gabriola.ttf",
    r"C:\Windows\Fonts\seguibli.ttf",       # Segoe UI Black Italic
]


def _first(paths):
    for p in paths:
        if os.path.exists(p):
            return p
    return None


def pick_font(override=None):
    """(굵게, 보통, 장식) 세 벌을 돌려준다."""
    if override:
        return override, override, override
    bold = _first(FONT_CANDIDATES)
    reg = _first(FONT_CANDIDATES_REG)
    if not bold and not reg:
        raise SystemExit("한글 글꼴을 찾지 못했습니다. --font 로 ttf 경로를 지정하세요.")
    bold, reg = bold or reg, reg or bold
    return bold, reg, _first(FONT_CANDIDATES_SCRIPT) or bold



# ───────────────────────────────── 색 ─────────────────────────────────

BG       = (8, 11, 16)           # 배경 (검정)
PANEL    = (20, 25, 33)          # 큰 패널
CARD     = (31, 38, 49)          # 안쪽 카드
CARD2    = (26, 32, 42)
LINE     = (52, 62, 78)
FG       = (234, 240, 247)       # 본문 글자
INK      = FG                    # (밝은 테마 때 이름을 그대로 쓴다)
INK2     = (158, 170, 186)
INK3     = (112, 124, 140)
WHITE    = (255, 255, 255)
DAY_C    = (242, 176, 62)        # 주간
NIGHT_C  = (124, 156, 246)       # 야간
TODAY_C  = (40, 116, 226)
SUN_C    = (232, 116, 116)
SAT_C    = (124, 166, 232)

# 바탕에 얹는 글귀. 필요 없으면 빈 문자열로 두면 그 줄이 사라진다.
BRAND_SCRIPT = ("Good Work", "Better Tomorrow")
BRAND_NAME   = "SK트리켐"
BRAND_SUB    = "Better Chemistry for a Brighter Tomorrow"
FOOTER_LINE  = "SAFETY · PEOPLE · TECHNOLOGY · SUSTAINABILITY"
GREETING     = ("오늘도 안전하게,", "좋은 하루 되세요.")
QUOTE        = "안전이 최고의 생산성입니다."

# 바탕화면에 까는 방식. 6 = 맞춤(전체가 보이고 남는 곳은 배경색),
# 10 = 채우기(화면을 꽉 채우되 넘치는 부분은 잘라냄).
# 배경이 검정이라 잘려 나가지 않는 "맞춤"이 안전하다.
WALLPAPER_STYLE = "6"

# 이 파일의 판. 화면 구석과 check.bat 에 찍히므로 옛 파일이 도는지 바로 안다.
VERSION = "v14"

# 화면보다 작게 그리면 윈도우가 늘려서 글자가 커지고 흐려진다.
# 반대로 크게 그리면 줄여서 깔끔하다. 그래서 감지값이 틀려도 안전하도록
# 최소 이 크기 이상으로 그린다 (가로세로 비율은 감지값 그대로 유지).
MIN_RENDER = (2560, 1440)
MAX_RENDER = (3840, 2160)

# 화면 크기를 잘못 잡으면 (1920, 1080) 처럼 직접 적는다. None 이면 자동 감지.
# check.bat 을 돌리면 지금 어떻게 재고 있는지 보여 준다.
SCREEN = None

# 배경. "black" 또는 "sejong"(세종호수공원·이응다리 그림) 또는 사진 파일 경로.
# 스크립트 옆에 background.jpg 를 두면 그 사진이 우선한다.
BACKGROUND = "black"


# ─────────────────────── 배경 — 세종호수공원 · 이응다리 ───────────────────────

_BG_CACHE = {}


def _lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _sejong(W, H):
    """세종호수공원과 이응다리를 단순하게 그린다.

    사진을 넣고 싶으면 --bg 로 파일을 지정하면 된다. 사진이 없을 때 쓰는 그림이다.
    가장자리가 매끄럽도록 두 배 크기로 그린 뒤 줄인다.
    """
    k = 2
    w, h = W * k, H * k
    img = Image.new("RGB", (w, h), BG)
    dr = ImageDraw.Draw(img)
    hz = int(h * 0.54)                                   # 수평선

    SKY_TOP, SKY_MID, SKY_LOW = (58, 122, 190), (128, 176, 214), (196, 220, 232)
    for y in range(hz):
        t = y / hz
        c = _lerp(SKY_TOP, SKY_MID, t / 0.7) if t < 0.7 else _lerp(SKY_MID, SKY_LOW, (t - 0.7) / 0.3)
        dr.line([(0, y), (w, y)], fill=c)

    # 옅은 햇무리
    gx, gy, gr = int(w * 0.78), int(h * 0.16), int(h * 0.26)
    glow = Image.new("L", (w, h), 0)
    ImageDraw.Draw(glow).ellipse([gx - gr, gy - gr, gx + gr, gy + gr], fill=70)
    img = Image.composite(Image.new("RGB", (w, h), (255, 246, 222)), img,
                          glow.filter(ImageFilter.GaussianBlur(gr // 2)))
    dr = ImageDraw.Draw(img)

    # 먼 산 두 겹
    for depth, col in ((0.11, (128, 160, 186)), (0.07, (104, 138, 168))):
        pts, amp = [(0, hz)], int(h * depth)
        n = 9
        for i in range(n + 1):
            x = w * i / n
            y = hz - amp * (0.45 + 0.55 * math.sin(i * 1.7 + depth * 40) ** 2)
            pts.append((x, y))
        pts.append((w, hz))
        dr.polygon(pts, fill=col)

    # 강 건너 도시 실루엣
    sky = (96, 130, 162)
    x = 0
    rnd = 0
    while x < w:
        rnd = (rnd * 1103515245 + 12345) % 2147483648
        bw = int(w * 0.018) + rnd % int(w * 0.022)
        bh = int(h * 0.018) + (rnd >> 8) % int(h * 0.055)
        dr.rectangle([x, hz - bh, x + bw, hz], fill=sky)
        x += bw + int(w * 0.004)

    # 호수
    WAT_TOP, WAT_BOT = (116, 158, 192), (70, 110, 150)
    for y in range(hz, h):
        dr.line([(0, y), (w, y)], fill=_lerp(WAT_TOP, WAT_BOT, (y - hz) / (h - hz)))

    # 도시 그림자가 물에 비친 것
    ref = img.crop((0, int(hz - h * 0.07), w, hz)).transpose(Image.FLIP_TOP_BOTTOM)
    ref = ref.filter(ImageFilter.GaussianBlur(int(h * 0.006)))
    img.paste(Image.blend(img.crop((0, hz, w, hz + ref.height)), ref, 0.28), (0, hz))
    dr = ImageDraw.Draw(img)

    # 이응다리 — 물 위에 놓인 둥근 고리
    cx, cy = int(w * 0.44), int(h * 1.12)
    rx, ry = int(w * 0.52), int(h * 0.235)
    deck = int(h * 0.011)
    for off, col in ((deck, (150, 168, 180)), (0, (246, 246, 242))):   # 그림자 → 상판
        dr.ellipse([cx - rx, cy - ry + off, cx + rx, cy + ry + off],
                   outline=col, width=deck)
    # 상판 위 난간
    dr.ellipse([cx - rx, cy - ry - deck // 2, cx + rx, cy + ry - deck // 2],
               outline=(228, 232, 234), width=max(2, deck // 5))
    # 다리 조명
    for i in range(40):
        a = math.pi + math.pi * i / 39          # 위쪽 호
        dr.ellipse([cx + math.cos(a) * rx - deck * .18, cy + math.sin(a) * ry - deck * .18,
                    cx + math.cos(a) * rx + deck * .18, cy + math.sin(a) * ry + deck * .18],
                   fill=(255, 250, 226))

    img = img.resize((W, H), Image.LANCZOS)
    # 글자가 잘 보이도록 위아래를 살짝 눌러 준다
    sh = Image.new("L", (W, H), 0)
    d2 = ImageDraw.Draw(sh)
    for y in range(H):
        t = y / H
        d2.line([(0, y), (W, y)],
                fill=int(120 * max(0, 1 - t / 0.5) + 70 * max(0, (t - 0.7) / 0.3)))
    return Image.composite(Image.new("RGB", (W, H), (16, 34, 58)), img, sh)


def background(W, H, path=None):
    """path 가 사진이면 잘라 채우고, "sejong" 이면 그림을, 아니면 검정."""
    if path is None:
        path = BACKGROUND
    key = (W, H, path)
    if key in _BG_CACHE:
        return _BG_CACHE[key].copy()
    if path == "black":
        _BG_CACHE[key] = Image.new("RGB", (W, H), BG)
        return _BG_CACHE[key].copy()
    img = None
    if path == "sejong":
        img = _sejong(W, H)
    elif path and os.path.exists(path):
        try:
            src = Image.open(path).convert("RGB")
            r = max(W / src.width, H / src.height)          # 화면을 채우도록 잘라 맞춘다
            src = src.resize((max(W, int(src.width * r)), max(H, int(src.height * r))),
                             Image.LANCZOS)
            img = src.crop(((src.width - W) // 2, (src.height - H) // 2,
                            (src.width - W) // 2 + W, (src.height - H) // 2 + H))
        except Exception:
            img = None
    if img is None:
        img = Image.new("RGB", (W, H), BG)
    _BG_CACHE[key] = img
    return img.copy()


# ───────────────────────────────── 그리기 ─────────────────────────────────

# 같은 숫자를 줘도 글꼴마다 실제로 그려지는 크기가 다르다. 칸은 숫자로 잡고
# 글자는 글꼴이 그리므로, 보정하지 않으면 윈도우(맑은 고딕)에서 칸을 넘친다.
# 기준은 이 코드를 맞춰 둔 나눔고딕 — 크기 100 에서 오름+내림 = 115.
REF_METRIC = 115
_FONT_K = {}


def font_k(path):
    """기준 글꼴과 같은 높이로 보이게 하는 크기 보정 배수."""
    if path not in _FONT_K:
        try:
            a, d = ImageFont.truetype(path, 100).getmetrics()
            _FONT_K[path] = REF_METRIC / float(a + d) if a + d else 1.0
        except Exception:
            _FONT_K[path] = 1.0
    return _FONT_K[path]


def load_font(path, size):
    return ImageFont.truetype(path, max(8, int(round(size * font_k(path)))))


def line_h(font):
    """한 줄이 실제로 차지하는 높이."""
    a, d = font.getmetrics()
    return a + d


def line_step(font, want):
    """줄 간격. 글꼴이 크면 겹치지 않게 밀어 준다."""
    return max(int(want), int(line_h(font) * 1.12))


def fit(dr, text, path, size, maxw, floor=8):
    """maxw 안에 들어올 때까지 글꼴을 줄인다. 이름이 잘리는 것보다 낫다."""
    size = int(size)
    while size > floor:
        fnt = load_font(path, size)
        if dr.textlength(text, font=fnt) <= maxw:
            return fnt
        size -= 1
    return load_font(path, floor)


def wrap_names(dr, names, path, size, maxw, floor=8):
    """이름들을 실제 폭을 재서 줄로 나눈다. (글꼴, 줄들)

    글자 수로 어림잡으면 글꼴이 바뀔 때 줄이 넘쳐 옆 칸을 파고든다.
    """
    if not names:
        return load_font(path, size), [["미등록"]]
    size = int(size)
    while size > floor:
        fnt = load_font(path, size)
        lines, cur = [], []
        for n in names:
            trial = cur + [n]
            if cur and dr.textlength("  ".join(trial), font=fnt) > maxw:
                lines.append(cur)
                cur = [n]
            else:
                cur = trial
        if cur:
            lines.append(cur)
        if len(lines) <= 2 and all(dr.textlength("  ".join(l), font=fnt) <= maxw
                                   for l in lines):
            return fnt, lines
        size -= 1
    fnt = load_font(path, floor)
    return fnt, [names]


def glass(img, box, radius, alpha=140, blur=16, edge=110, tint=WHITE):
    """배경을 흐려 유리판처럼 만든다. 글자가 사진 위에서도 읽히게 하는 장치."""
    x0, y0, x1, y1 = (int(v) for v in box)
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(img.width, x1), min(img.height, y1)
    if x1 <= x0 or y1 <= y0:
        return
    reg = img.crop((x0, y0, x1, y1)).filter(ImageFilter.GaussianBlur(blur))
    reg = Image.blend(reg, Image.new("RGB", reg.size, tint), alpha / 255.0)
    mask = Image.new("L", reg.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, reg.width - 1, reg.height - 1],
                                           radius=radius, fill=255)
    img.paste(reg, (x0, y0), mask)
    if edge:
        ov = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ImageDraw.Draw(ov).rounded_rectangle([x0, y0, x1 - 1, y1 - 1], radius=radius,
                                             outline=(255, 255, 255, edge), width=1)
        img.paste(Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB"), (0, 0))


def shadowed(dr, xy, text, font, fill=WHITE, blur=(0, 0, 0), a=90):
    """사진 위 흰 글자에 옅은 그림자를 깔아 대비를 준다."""
    dr.text((xy[0] + 1, xy[1] + 1), text, font=font, fill=tuple(int(c) for c in blur))
    dr.text(xy, text, font=font, fill=fill)


def layout(W, H, icon_cols=ICON_COLS, scale=SCALE):
    """내용 상자의 자리를 정한다. (여백, 아이콘칸, x, y, 폭, 높이)

    아이콘은 왼쪽 위부터 세로로 쌓이므로 그 폭(gutter)만큼은 비워 둔다.
    상자는 오른쪽에 붙이고 세로 가운데에 놓는다.
    """
    dpi = H / 1080.0
    M = max(1, int(round(30 * dpi)))
    gutter = int(round(ICON_COL_W * max(0, icon_cols) * dpi))
    box_w = int((W - M * 2) * scale)
    box_w = max(min(box_w, W - M - (gutter + M)), int(W * 0.3))
    box_h = int((H - M * 2) * scale)
    x0 = W - M - box_w
    y0 = max(M, (H - box_h) // 2)
    return M, gutter, x0, y0, box_w, min(box_h, H - y0 - M)


def build_image(view, crew, size, fonts, source, icon_cols=ICON_COLS, scale=SCALE,
                stamp=None, bg=None):
    W, H = size
    bold, reg, script = fonts
    dpi = H / 1080.0
    s = dpi * scale
    S = lambda v: max(1, int(round(v * s)))
    F = lambda p, sz: load_font(p, sz * s)

    img = background(W, H, bg)
    dr = ImageDraw.Draw(img)

    M, gutter, x0, y0, box_w, box_h = layout(W, H, icon_cols, scale)

    LX, TOP, BOT = x0, y0, y0 + box_h

    d = view["date"]

    # ── 머리말 (사진 위에 바로) ────────────────────────────────────────
    y = TOP
    if BRAND_SCRIPT and BRAND_SCRIPT[0]:
        f_sc = fit(dr, max(BRAND_SCRIPT, key=len), script, 23 * s, box_w * 0.4)
        st = line_step(f_sc, S(26))
        for i, ln in enumerate(BRAND_SCRIPT):
            shadowed(dr, (LX, y + i * st), ln, f_sc, WHITE, (30, 50, 80))
        y += st * len(BRAND_SCRIPT) + S(4)

    shadowed(dr, (LX, y), "4조 2교대 근무표", F(reg, 18), (222, 236, 250), (20, 40, 70))
    y += S(25)

    f_ym, f_dd = F(bold, 54), F(bold, 30)
    ym = "%d. %02d" % (d.year, d.month)
    if dr.textlength(ym, font=f_ym) > box_w * 0.3:
        f_ym = fit(dr, ym, bold, 54 * s, box_w * 0.3)
    shadowed(dr, (LX, y), ym, f_ym, WHITE, (18, 36, 62))
    vx = LX + dr.textlength(ym, font=f_ym) + S(24)
    dr.line([vx, y + S(8), vx, y + S(54)], fill=WHITE)

    dx = vx + S(22)
    dayt = "%d일 (%s)" % (d.day, DOW[d.weekday()])
    shadowed(dr, (dx, y + S(2)), dayt, f_dd, WHITE, (18, 36, 62))

    # 며칠째 근무인지 — 3일 묶음 안에서 몇 일차인가
    f_nt = F(bold, 21)
    nth = "%d일차" % view["nth"]
    nw = dr.textlength(nth, font=f_nt)
    nx = dx + dr.textlength(dayt, font=f_dd) + S(16)
    dr.rounded_rectangle([nx, y + S(5), nx + nw + S(26), y + S(40)], radius=S(18),
                         fill=DAY_C if view["kind"] == "day" else NIGHT_C)
    dr.text((nx + S(13), y + S(11)), nth, font=f_nt, fill=WHITE)
    dr.text((nx + nw + S(26) + S(6), y + S(11)), "/ 3", font=F(reg, 16), fill=(216, 232, 248))

    shadowed(dr, (dx, y + S(46)),
             "휴무  " + " · ".join(t + "조" for t in view["off"]),
             F(reg, 17), (218, 234, 250), (20, 40, 70))

    if GREETING and GREETING[0]:           # 인사말은 오른쪽 끝에
        f_gr = fit(dr, max(GREETING, key=len), reg, 16 * s, box_w * 0.25)
        gst = line_step(f_gr, S(21))
        for i, ln in enumerate(GREETING):
            gw = dr.textlength(ln, font=f_gr)
            shadowed(dr, (LX + box_w - gw, y + S(12) + i * gst), ln, f_gr,
                     (222, 236, 250), (20, 40, 70))

    head_b = y + max(S(76), line_step(f_dd, S(46)) + S(30))
    # ── 오른쪽: 전체 근무자 (세로로 길게) ─────────────────────────────
    foot_h = S(26) if FOOTER_LINE else 0
    RW = int(min(box_w * 0.30, S(440)))
    LWid = box_w - RW - S(14)
    RXp = LX + box_w - RW

    glass(img, (RXp, head_b, RXp + RW, BOT - foot_h), S(16), alpha=225, blur=18,
          edge=60, tint=PANEL)
    dr = ImageDraw.Draw(img)
    rpad = S(14)
    rx, rw = RXp + rpad, RW - rpad * 2
    ry = head_b + rpad

    dr.text((rx + S(2), ry), "전체 근무자", font=F(bold, 22), fill=FG)
    ry += S(32)

    live = {view["day"]: ("주간", DAY_C), view["night"]: ("야간", NIGHT_C)}
    inner = (BOT - foot_h) - rpad - ry
    f_pl = F(reg, 15)
    plw = max(dr.textlength(q + "공장", font=f_pl) for q in PLANTS) + S(10)

    f_st2, st_lines = wrap_names(dr, crew["staff"], reg, 17 * s, rw - S(4))
    st_step = line_step(f_st2, S(26))
    staff_h = S(32) + st_step * len(st_lines)
    team_h = (inner - staff_h - S(14) - S(10) * 4) // 4     # 조마다 같은 높이로 나눈다
    team_h = max(S(104), team_h)

    for t in TEAMS:
        c = crew["crews"][t]
        on = live.get(t)
        glass(img, (rx, ry, rx + rw, ry + team_h), S(10), alpha=215, blur=8,
              edge=50, tint=CARD if on else CARD2)
        dr = ImageDraw.Draw(img)
        px2, py2 = rx + S(12), ry + S(9)
        iw2 = rw - S(24)

        col = on[1] if on else (126, 140, 158)
        f_t = F(bold, 17)
        tb = dr.textlength(t, font=f_t)
        dr.rounded_rectangle([px2, py2, px2 + tb + S(18), py2 + S(26)], radius=S(6), fill=col)
        dr.text((px2 + S(9), py2 + S(2)), t, font=f_t, fill=(14, 18, 24))
        nx2 = px2 + tb + S(30)
        dr.text((nx2, py2 + S(1)), c["leader"] or "미등록",
                font=fit(dr, c["leader"] or "미등록", bold, 20 * s,
                         px2 + iw2 - nx2 - S(34)),
                fill=FG if c["leader"] else INK3)
        if on:
            f_b = F(bold, 14)
            dr.text((px2 + iw2 - dr.textlength(on[0], font=f_b), py2 + S(6)),
                    on[0], font=f_b, fill=col)

        py2 += S(32)
        room2 = (ry + team_h - S(8)) - py2
        step = max(line_step(f_pl, S(24)), room2 / len(PLANTS))
        for i2, p in enumerate(PLANTS):
            names = c["factories"][p]
            txt = " ".join(names) if names else "미등록"
            f_n2 = fit(dr, txt, reg, 18 * s, iw2 - plw)
            lh2 = max(line_h(f_n2), line_h(f_pl))
            ly2 = py2 + step * i2 + (step - lh2) / 2
            dr.text((px2, ly2 + (lh2 - line_h(f_pl)) / 2 + S(1)), p + "공장",
                    font=f_pl, fill=INK3)
            dr.text((px2 + plw, ly2), txt, font=f_n2, fill=INK2 if names else INK3)
        ry += team_h + S(10)

    dr.line([rx, ry - S(2), rx + rw, ry - S(2)], fill=LINE, width=max(1, S(1)))
    ry += S(8)
    f_sl = F(bold, 18)
    dr.text((rx + S(2), ry), "상근", font=f_sl, fill=FG)
    dr.text((rx + S(2) + dr.textlength("상근", font=f_sl) + S(10), ry + S(5)),
            "(교대 없음)", font=F(reg, 14), fill=INK3)
    ry += S(28)
    for i, ln in enumerate(st_lines):
        txt = "  ".join(ln) if isinstance(ln, list) else str(ln)
        dr.text((rx + S(2), ry + i * st_step), txt, font=f_st2,
                fill=INK2 if crew["staff"] else INK3)

    # ── 왼쪽 위: 현재 근무자 (크게) ───────────────────────────────────
    avail = (BOT - foot_h) - head_b
    cur_h = int(avail * 0.44)
    glass(img, (LX, head_b, LX + LWid, head_b + cur_h), S(16), alpha=225, blur=18,
          edge=60, tint=PANEL)
    dr = ImageDraw.Draw(img)

    hp = S(15)
    dr.text((LX + hp + S(4), head_b + hp), "현재 근무자", font=F(bold, 22), fill=FG)
    f_s = F(reg, 15)
    clock = "08:00 - 20:00" if view["kind"] == "day" else "20:00 - 08:00"
    tw = dr.textlength(clock, font=f_s)
    rr = LX + LWid - hp - S(4)
    dr.text((rr - tw, head_b + hp + S(6)), clock, font=f_s, fill=INK2)
    bw = dr.textlength("근무 중", font=f_s)
    dr.text((rr - tw - bw - S(14), head_b + hp + S(6)), "근무 중", font=f_s, fill=INK2)
    dr.ellipse([rr - tw - bw - S(28), head_b + hp + S(11),
                rr - tw - bw - S(19), head_b + hp + S(20)], fill=(88, 208, 132))

    cy_ = head_b + hp + S(34)
    ch_ = cur_h - (hp + S(34)) - hp
    cwid = (LWid - hp * 2 - S(12)) // 2

    def shift_card(cx_, kind, team):
        is_day = kind == "day"
        col = DAY_C if is_day else NIGHT_C
        c = crew["crews"][team]
        glass(img, (cx_, cy_, cx_ + cwid, cy_ + ch_), S(12), alpha=220, blur=8,
              edge=60, tint=CARD)
        d2 = ImageDraw.Draw(img)
        px, py = cx_ + S(16), cy_ + S(13)
        iw = cwid - S(32)

        f_t = F(bold, 25)
        tb = d2.textlength(team + "조", font=f_t)
        d2.rounded_rectangle([px, py, px + tb + S(20), py + S(37)], radius=S(9), fill=col)
        d2.text((px + S(10), py + S(3)), team + "조", font=f_t, fill=(14, 18, 24))
        d2.text((px + tb + S(34), py + S(3)), "주간" if is_day else "야간",
                font=F(bold, 25), fill=col)
        if view["kind"] == kind:
            lb, f_l = "● 근무 중", F(bold, 15)
            d2.text((px + iw - d2.textlength(lb, font=f_l), py + S(11)), lb, font=f_l, fill=col)

        py += S(45)
        f_ld = F(reg, 15)
        d2.text((px, py + S(5)), "교대조장", font=f_ld, fill=INK3)
        lx2 = px + d2.textlength("교대조장", font=f_ld) + S(14)
        d2.text((lx2, py), c["leader"] or "미등록",
                font=fit(d2, c["leader"] or "미등록", bold, 21 * s, px + iw - lx2),
                fill=FG if c["leader"] else INK3)
        py += S(32)
        d2.line([px, py - S(4), px + iw, py - S(4)], fill=LINE)

        f_p = F(reg, 16)
        plw2 = max(d2.textlength(q + "공장", font=f_p) for q in PLANTS) + S(12)
        # 남은 칸을 셋으로 나누고, 각 줄을 제 칸의 세로 가운데에 놓는다.
        # (예전엔 위로 몰리고 아래가 남았다)
        room = (cy_ + ch_ - S(10)) - py
        step = max(line_step(f_p, S(26)), room / len(PLANTS))
        for i, p in enumerate(PLANTS):
            names = c["factories"][p]
            txt = "   ".join(names) if names else "미등록"
            f_n = fit(d2, txt, bold, 21 * s, iw - plw2)
            lh = max(line_h(f_n), line_h(f_p))
            ly = py + step * i + (step - lh) / 2
            d2.text((px, ly + (lh - line_h(f_p)) / 2 + S(2)), p + "공장",
                    font=f_p, fill=INK3)
            d2.text((px + plw2, ly), txt, font=f_n, fill=FG if names else INK3)

    shift_card(LX + hp, "day", view["day"])
    shift_card(LX + hp + cwid + S(12), "night", view["night"])

    if view["dawn"]:
        nd = view["night_date"]
        dr.text((LX + hp, head_b + cur_h - S(2)),
                "※ 야간 %s조는 어제 %d/%d 20:00 시작 · 오늘 08:00 종료"
                % (view["night"], nd.month, nd.day), font=F(reg, 13), fill=INK3)

    # ── 왼쪽 아래: 달력 (작게) ────────────────────────────────────────
    low_y = head_b + cur_h + S(16)
    glass(img, (LX, low_y, LX + LWid, BOT - foot_h), S(16), alpha=225, blur=18,
          edge=60, tint=PANEL)
    dr = ImageDraw.Draw(img)

    cpad = S(12)
    cx0, cy0 = LX + cpad, low_y + cpad
    cw_in = LWid - cpad * 2
    ch_in = (BOT - foot_h) - low_y - cpad * 2

    cal = calendar.Calendar(firstweekday=6)          # 일요일 시작
    weeks = cal.monthdatescalendar(d.year, d.month)
    cols, rows = 7, len(weeks)
    colw = cw_in / cols

    f_mo = F(bold, 17)
    dr.text((cx0 + S(2), cy0), "%d월" % d.month, font=f_mo, fill=FG)
    lx = cx0 + cw_in
    f_lg = F(reg, 14)
    for lb, lc in (("야간", NIGHT_C), ("주간", DAY_C)):
        lx -= dr.textlength(lb, font=f_lg)
        dr.text((lx, cy0 + S(3)), lb, font=f_lg, fill=INK2)
        r = S(4)
        dr.ellipse([lx - S(13) - r, cy0 + S(10) - r, lx - S(13) + r, cy0 + S(10) + r], fill=lc)
        lx -= S(28)
    cy0 += S(24)

    f_dow = F(bold, 13)
    DOW_EN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]
    for i in range(cols):
        c = SUN_C if i == 0 else (SAT_C if i == 6 else INK2)
        tw = dr.textlength(DOW_EN[i], font=f_dow)
        dr.text((cx0 + colw * i + (colw - tw) / 2, cy0), DOW_EN[i], font=f_dow, fill=c)
    cy0 += S(20)

    gap = S(4)
    rowh = (ch_in - (cy0 - low_y - cpad) - gap * (rows - 1)) / rows
    f_day = F(bold, min(18, rowh / s * 0.30))
    f_tm = F(bold, min(14, rowh / s * 0.24))
    br = max(S(5), int(rowh * 0.14))
    f_bd = load_font(bold, max(7, br * 1.25))

    for ri, week in enumerate(weeks):
        for ci, cd in enumerate(week):
            x = cx0 + colw * ci
            yy = cy0 + (rowh + gap) * ri
            x1, y1 = x + colw - gap, yy + rowh
            other = cd.month != d.month
            today = cd == d
            dyt, ngt, _, _ = shift_of(cd)

            fill = TODAY_C if today else (None if other else
                                          (CARD if block_index(cd) % 2 else CARD2))
            if fill:
                dr.rounded_rectangle([x, yy, x1, y1], radius=S(8), fill=fill)

            dc = (WHITE if today else (78, 90, 106) if other else
                  (SUN_C if ci == 0 else SAT_C if ci == 6 else FG))
            dr.text((x + S(7), yy + S(3)), str(cd.day), font=f_day, fill=dc)

            a = 0.38 if other else 1.0
            base = TODAY_C if today else (fill or BG)
            mix = lambda c: tuple(int(base[i] + (c[i] - base[i]) * a) for i in range(3))
            tcol = WHITE if today else (FG if not other else (78, 90, 106))

            gy = yy + rowh - S(4) - (br * 2 + S(2)) * 2
            for j, (tm, col, lb) in enumerate(((dyt, DAY_C, "주"), (ngt, NIGHT_C, "야"))):
                by = gy + j * (br * 2 + S(2)) + br
                tw = dr.textlength(tm, font=f_tm)
                gw = br * 2 + S(4) + tw
                bx = x + (colw - gap - gw) / 2 + br
                dr.ellipse([bx - br, by - br, bx + br, by + br], fill=mix(col),
                           outline=WHITE if today else None, width=max(1, S(2)) if today else 0)
                bb = f_bd.getbbox(lb)
                dr.text((bx - (bb[0] + bb[2]) / 2, by - (bb[1] + bb[3]) / 2),
                        lb, font=f_bd, fill=(14, 18, 24))
                dr.text((bx + br + S(4), by - f_tm.size * 0.62), tm, font=f_tm, fill=tcol)

    half = (LWid - S(20)) / 2.0            # 왼쪽 구호 / 오른쪽 글귀가 만나지 않게
    if FOOTER_LINE:
        dr.text((LX, BOT - S(19)), FOOTER_LINE,
                font=fit(dr, FOOTER_LINE, reg, 13 * s, half), fill=INK3)
    if QUOTE:
        qt = '"' + QUOTE + '"'
        f_q = fit(dr, qt, reg, 14 * s, half)
        dr.text((LX + LWid - dr.textlength(qt, font=f_q), BOT - S(19)), qt,
                font=f_q, fill=(126, 140, 158))

    # ── 상표 · 기준 시각 ───────────────────────────────────────────────
    right = LX + box_w
    if BRAND_NAME:
        f_b1 = fit(dr, BRAND_NAME, bold, 21 * s, box_w * 0.3)
        shadowed(dr, (right - dr.textlength(BRAND_NAME, font=f_b1), BOT + S(12)),
                 BRAND_NAME, f_b1, FG, (0, 0, 0))
        if BRAND_SUB:
            f_b2 = fit(dr, BRAND_SUB, reg, 11 * s, box_w * 0.4)
            shadowed(dr, (right - dr.textlength(BRAND_SUB, font=f_b2),
                          BOT + S(12) + line_step(f_b1, S(26))),
                     BRAND_SUB, f_b2, INK3, (0, 0, 0))

    if stamp is None:
        stamp = "%02d:%02d 기준 · 명단 %s · %s" % (
            view["now"].hour, view["now"].minute, source, VERSION)
    if stamp:
        f_s2 = F(reg, 12)
        dr.text((LX, BOT + S(14)), stamp, font=f_s2, fill=INK3)
    return img


# ───────────────────────────────── Windows ─────────────────────────────────

def _dpi_aware():
    for call in (lambda: ctypes.windll.shcore.SetProcessDpiAwareness(2),
                 lambda: ctypes.windll.user32.SetProcessDPIAware()):
        try:
            call()
            return True
        except Exception:
            continue
    return False


def screen_probe():
    """화면 크기를 여러 방법으로 재 본다. (재 본 값들, 고른 값)

    화면 배율(125%·150%·200%)이 켜져 있으면 GetSystemMetrics 는 배율이
    적용된 작은 값을 준다. 그 크기로 그리면 윈도우가 늘려 채워서 글자가
    커지고 흐려진다. GetDeviceCaps(DESKTOPHORZRES) 는 배율과 상관없이
    실제 화소 수를 주므로 둘 중 큰 쪽을 쓴다.
    """
    got = {}
    aware = _dpi_aware()
    try:
        u = ctypes.windll.user32
        got["GetSystemMetrics"] = (u.GetSystemMetrics(0), u.GetSystemMetrics(1))
    except Exception:
        pass
    try:
        u, g = ctypes.windll.user32, ctypes.windll.gdi32
        hdc = u.GetDC(0)
        if hdc:
            try:
                got["GetDeviceCaps"] = (g.GetDeviceCaps(hdc, 118),   # DESKTOPHORZRES
                                        g.GetDeviceCaps(hdc, 117))  # DESKTOPVERTRES
                got["배율"] = "%d%%" % round(g.GetDeviceCaps(hdc, 88) / 96.0 * 100)
            finally:
                u.ReleaseDC(0, hdc)
    except Exception:
        pass
    got["DPI 인식"] = "켬" if aware else "끔"

    ok = [v for k, v in got.items()
          if isinstance(v, tuple) and v[0] >= 640 and v[1] >= 480]
    return got, (max(ok, key=lambda wh: wh[0] * wh[1]) if ok else (1920, 1080))


def screen_size():
    if SCREEN:
        return tuple(SCREEN)
    return screen_probe()[1]


def render_size(screen):
    """실제로 그릴 크기. 화면 비율은 그대로 두고 최소 크기 이상으로 키운다.

    화면보다 크게 그려 두면 윈도우가 줄여서 깔끔하게 깐다. 반대로 작게
    그리면 늘려서 글자가 커지고 흐려진다. 감지가 틀려도 안전한 쪽으로 둔다.
    """
    w, h = screen
    k = max(MIN_RENDER[0] / float(w), MIN_RENDER[1] / float(h), 1.0)
    k = min(k, MAX_RENDER[0] / float(w), MAX_RENDER[1] / float(h))
    return max(w, int(round(w * k))), max(h, int(round(h * k)))


# 회사 PC 는 정책으로 배경 변경을 막아 두는 일이 많다. 어디서 막혔는지 알려 준다.
POLICY_KEYS = [
    ("HKCU", r"Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop", "NoChangingWallPaper"),
    ("HKCU", r"Software\Microsoft\Windows\CurrentVersion\Policies\System", "Wallpaper"),
    ("HKCU", r"Software\Microsoft\Windows\CurrentVersion\Policies\System", "NoDispBackgroundPage"),
    ("HKCU", r"Software\Microsoft\Windows\CurrentVersion\Policies\Explorer", "NoChangingWallPaper"),
    ("HKLM", r"SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System", "Wallpaper"),
    ("HKLM", r"SOFTWARE\Policies\Microsoft\Windows\Personalization", "NoChangingWallPaper"),
]


def policy_blocks():
    """배경 변경을 막는 정책이 걸려 있으면 그 목록을 돌려준다."""
    try:
        import winreg
    except ImportError:
        return []
    roots = {"HKCU": winreg.HKEY_CURRENT_USER, "HKLM": winreg.HKEY_LOCAL_MACHINE}
    hits = []
    for r, sub, name in POLICY_KEYS:
        try:
            k = winreg.OpenKey(roots[r], sub)
            try:
                v, _ = winreg.QueryValueEx(k, name)
            finally:
                winreg.CloseKey(k)
        except OSError:
            continue
        if v not in (0, "", None):
            hits.append("%s\\%s\\%s = %r" % (r, sub, name, v))
    return hits


def registered_wallpaper():
    """윈도우가 지금 배경으로 알고 있는 파일 경로."""
    try:
        import winreg
        k = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Control Panel\Desktop")
        try:
            return winreg.QueryValueEx(k, "WallPaper")[0]
        finally:
            winreg.CloseKey(k)
    except OSError:
        return ""


def set_wallpaper(path):
    """바탕화면으로 지정하고, 정말 반영됐는지 되읽어서 확인한다.
    돌려주는 값: (성공 여부, 설명)"""
    path = os.path.abspath(path)
    try:
        import winreg
        k = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Control Panel\Desktop", 0, winreg.KEY_SET_VALUE)
        try:
            winreg.SetValueEx(k, "WallpaperStyle", 0, winreg.REG_SZ, WALLPAPER_STYLE)
            winreg.SetValueEx(k, "TileWallpaper", 0, winreg.REG_SZ, "0")
        finally:
            winreg.CloseKey(k)
    except Exception:
        pass

    SPI_SETDESKWALLPAPER, SPIF_UPDATEINIFILE, SPIF_SENDCHANGE = 20, 1, 2
    called = bool(ctypes.windll.user32.SystemParametersInfoW(
        SPI_SETDESKWALLPAPER, 0, path, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE))

    # 호출이 성공했다고 끝이 아니다. 레지스트리를 되읽어 진짜 바뀌었는지 본다.
    got = registered_wallpaper()
    stuck = os.path.normcase(os.path.normpath(got or "")) == os.path.normcase(path)
    blocks = policy_blocks()

    if stuck and called:
        return True, "완료"
    if blocks:
        return False, ("회사 정책이 배경 변경을 막고 있습니다.\n     막는 설정: "
                       + "\n                " + "\n                ".join(blocks)
                       + "\n     → 전산팀에 문의하거나, 이미지를 직접 배경으로 지정해 보세요:\n     "
                       + path)
    if not stuck:
        return False, ("지정은 했지만 윈도우가 되돌렸습니다. 지금 배경: %s\n     "
                       "다른 프로그램(테마·배경 슬라이드쇼·보안 프로그램)이 덮어쓰는 중일 수 있습니다.\n     "
                       "이미지는 여기 있으니 직접 지정해 보세요:\n     %s" % (got or "(없음)", path))
    return False, "실패"


# ───────────────────────── 작업 스케줄러 (PowerShell 없이) ─────────────────────────

TASK_NAME = "ShiftWallpaper"
# XML 등록이 막혔을 때만 쓰는 보조 작업들. 이름이 고정이라 다시 깔아도 덮어쓰기만 된다.
EXTRA_TASKS = [TASK_NAME + "_0005", TASK_NAME + "_0800", TASK_NAME + "_2000"]

TASK_XML = """<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>4jo 2gyodae wallpaper auto update</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger><Enabled>true</Enabled></LogonTrigger>
    <CalendarTrigger>
      <StartBoundary>2020-01-01T00:05:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>
    </CalendarTrigger>
    <CalendarTrigger>
      <StartBoundary>2020-01-01T08:00:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>
    </CalendarTrigger>
    <CalendarTrigger>
      <StartBoundary>2020-01-01T20:00:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>{user}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT5M</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>{exe}</Command>
      <Arguments>{args}</Arguments>
      <WorkingDirectory>{cwd}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"""


def _xml_escape(t):
    return (t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;"))


def _pythonw():
    """창이 뜨지 않는 pythonw.exe. 없으면 지금 쓰는 파이썬."""
    exe = sys.executable
    w = os.path.join(os.path.dirname(exe), "pythonw.exe")
    return w if os.path.exists(w) else exe


def _run(cmd):
    import subprocess
    r = subprocess.run(cmd, capture_output=True)
    out = (r.stdout + r.stderr).decode("cp949", "replace").strip()
    return r.returncode, out


def app_dir():
    """늘 같은 자리. 압축을 어디에 풀든 여기 있는 것이 돈다."""
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    d = os.path.join(base, "shift-wallpaper", "app")
    os.makedirs(d, exist_ok=True)
    return d


def installed_script():
    return os.path.join(app_dir(), "wallpaper.py")


def file_version(path):
    """그 파일이 몇 판인지 읽는다. 옛 파일이 도는지 확인하는 용도."""
    try:
        with io.open(path, encoding="utf-8") as f:
            for line in f:
                m = re.match(r'\s*VERSION\s*=\s*["\'](.+?)["\']', line)
                if m:
                    return m.group(1)
    except (OSError, UnicodeDecodeError):
        pass
    return "?"


def task_command():
    """작업 스케줄러가 실제로 무엇을 실행하는지 읽는다."""
    code, out = _run(["schtasks", "/Query", "/TN", TASK_NAME, "/FO", "LIST", "/V"])
    if code != 0:
        return ""
    for line in out.splitlines():
        if line.lower().startswith(("task to run", "실행할 작업")):
            return line.split(":", 1)[1].strip()
    return ""


def install_task():
    """작업 스케줄러에 등록한다. schtasks 만 쓰므로 PowerShell 이 필요 없다.

    스크립트를 고정 자리로 복사한 뒤 그 자리를 등록한다. 압축을 새 폴더에
    풀어도 옛 폴더의 옛 파일이 계속 도는 일을 없애기 위해서다.
    """
    import shutil
    import tempfile

    here = os.path.abspath(__file__)
    script = installed_script()
    if os.path.normcase(here) != os.path.normcase(script):
        shutil.copy2(here, script)
        # 배경 사진을 옆에 뒀다면 같이 옮긴다
        for n in ("background.jpg", "background.png", "background.jpeg"):
            src = os.path.join(os.path.dirname(here), n)
            if os.path.exists(src):
                shutil.copy2(src, os.path.join(app_dir(), n))
    print("설치 위치 : %s  (%s)" % (script, file_version(script)))

    # 옛 등록이 다른 폴더를 가리키고 있을 수 있다. 모두 지우고 새로 만든다.
    for n in [TASK_NAME] + EXTRA_TASKS:
        _run(["schtasks", "/Delete", "/TN", n, "/F"])
    exe = _pythonw()
    user = os.environ.get("USERNAME", "")
    domain = os.environ.get("USERDOMAIN", "")
    xml = TASK_XML.format(
        user=_xml_escape(("%s\\%s" % (domain, user)) if domain else user),
        exe=_xml_escape(exe),
        args=_xml_escape('"%s"' % script),
        cwd=_xml_escape(os.path.dirname(script)))

    fd, tmp = tempfile.mkstemp(suffix=".xml")
    os.close(fd)
    try:
        # schtasks /XML 은 UTF-16 파일을 요구한다
        with io.open(tmp, "w", encoding="utf-16") as f:
            f.write(xml)
        code, out = _run(["schtasks", "/Create", "/TN", TASK_NAME, "/XML", tmp, "/F"])
        if code == 0:
            return True, "로그온 시 + 매일 00:05 · 08:00 · 20:00"
        # XML 등록이 막히면 트리거를 따로따로 만든다 (기능은 같고 밀린 실행 따라잡기만 없음)
        tr = '"%s" "%s"' % (exe, script)
        made = []
        for name, args in ((TASK_NAME, ["/SC", "ONLOGON"]),
                           (EXTRA_TASKS[0], ["/SC", "DAILY", "/ST", "00:05"]),
                           (EXTRA_TASKS[1], ["/SC", "DAILY", "/ST", "08:00"]),
                           (EXTRA_TASKS[2], ["/SC", "DAILY", "/ST", "20:00"])):
            c, o = _run(["schtasks", "/Create", "/TN", name, "/TR", tr, "/F"] + args)
            if c == 0:
                made.append(name)
            else:
                out = o or out
        if made:
            return True, "로그온 시 + 매일 00:05 · 08:00 · 20:00 (작업 %d개)" % len(made)
        return False, out or "schtasks 등록 실패"
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


def uninstall_task():
    gone = []
    for name in [TASK_NAME] + EXTRA_TASKS:
        code, _ = _run(["schtasks", "/Delete", "/TN", name, "/F"])
        if code == 0:
            gone.append(name)
    return gone


# ───────────────────────────────── 실행 ─────────────────────────────────

def main():
    args = sys.argv[1:]

    def opt(name, default=None):
        return args[args.index(name) + 1] if name in args else default

    url = opt("--crew", CREW_URL)
    font_override = opt("--font")
    out = opt("--out")
    no_set = "--no-set" in args
    online = "--online" in args or opt("--crew") is not None

    if "--uninstall" in args:
        gone = uninstall_task()
        print("자동 갱신 해제:", ", ".join(gone) if gone else "등록된 작업이 없습니다")
        print("바탕화면 이미지는 그대로 남아 있습니다.")
        return

    if "--diag" in args:
        print("=== 점검 ===")
        print("지금 이 파일 : %s  (%s)" % (os.path.abspath(__file__), VERSION))
        ins = installed_script()
        if os.path.exists(ins):
            v = file_version(ins)
            print("깔린 파일    : %s  (%s)%s"
                  % (ins, v, "" if v == VERSION else "   ← 다릅니다! install.bat 을 다시"))
        else:
            print("깔린 파일    : 없음 — install.bat 을 실행하세요")
        cmd = task_command()
        if cmd:
            print("작업이 도는 것: %s" % cmd)
            if os.path.normcase(ins) not in os.path.normcase(cmd):
                print("             ← 엉뚱한 곳을 가리킵니다! install.bat 을 다시 실행하세요")
        print("파이썬     :", sys.executable)
        print("스크립트   :", os.path.abspath(__file__))
        probe, pick = screen_probe()
        for k, v in probe.items():
            print("%-10s : %s" % (k, "%dx%d" % v if isinstance(v, tuple) else v))
        print("고른 크기  : %dx%d%s" % (pick[0], pick[1], "  (SCREEN 으로 지정됨)" if SCREEN else ""))
        print("그릴 크기  : %dx%d  (작게 그리면 늘어나므로 넉넉히)" % render_size(pick))
        try:
            import winreg as _wr
            _k = _wr.OpenKey(_wr.HKEY_CURRENT_USER, r"Control Panel\Desktop")
            try:
                _st = _wr.QueryValueEx(_k, "WallpaperStyle")[0]
            finally:
                _wr.CloseKey(_k)
            print("까는 방식  : %s (%s)" % (_st, {"6": "맞춤", "10": "채우기",
                                                 "2": "확대", "0": "가운데"}.get(str(_st), "?")))
        except OSError:
            pass
        cur = registered_wallpaper()
        if cur and os.path.exists(cur):
            try:
                from PIL import Image as _I
                iw, ih = _I.open(cur).size
                print("지금 배경 이미지: %dx%d%s" % (iw, ih,
                      "" if (iw, ih) == tuple(screen_size()) else "  ← 화면과 다릅니다"))
            except Exception:
                pass
        print("지금 배경  :", registered_wallpaper() or "(없음)")
        b = policy_blocks()
        print("정책 차단  :", "\n             ".join(b) if b else "없음")
        found = [n for n in [TASK_NAME] + EXTRA_TASKS
                 if _run(["schtasks", "/Query", "/TN", n])[0] == 0]
        print("등록된 작업:", ", ".join(found) if found else "없음")
        if len(found) > 1:
            print("             (보조 작업까지 깔려 있습니다. install.bat 을 다시 실행하면 정리됩니다)")
        crew0, src0 = load_crew(url, online)
        print("명단       : %s — 조원 %d명, 상근 %d명" %
              (src0, sum(len(crew0["crews"][t]["factories"][p])
                         for t in TEAMS for p in PLANTS), len(crew0["staff"])))
        return

    now = now_kst()
    if opt("--now"):
        now = _dt.datetime.fromisoformat(opt("--now"))

    if opt("--size"):
        w, h = opt("--size").lower().split("x")
        size = (int(w), int(h))
        draw_at = size
    else:
        size = screen_size()
        draw_at = render_size(size)

    crew, source = load_crew(url, online)
    view = current_view(now)
    view["now"] = now

    icon_cols = int(opt("--icon-cols", ICON_COLS))
    scale = float(opt("--scale", SCALE))
    # 배경 사진 — 스크립트 옆에 background.jpg 를 두면 그걸 쓴다
    bg = opt("--bg")
    if not bg:
        here = os.path.dirname(os.path.abspath(__file__))
        for n in ("background.jpg", "background.png", "background.jpeg"):
            if os.path.exists(os.path.join(here, n)):
                bg = os.path.join(here, n)
                break
    img = build_image(view, crew, draw_at, pick_font(font_override), source, icon_cols,
                      scale, bg=bg)

    if not out:
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
        dd = os.path.join(base, "shift-wallpaper")
        os.makedirs(dd, exist_ok=True)
        # 같은 파일명으로 덮으면 윈도우가 이전 이미지를 계속 쓰는 일이 있어 번갈아 쓴다
        prev = os.path.join(dd, "current.txt")
        last = ""
        try:
            last = open(prev, encoding="utf-8").read().strip()
        except OSError:
            pass
        name = "wallpaper_b.png" if last.endswith("wallpaper_a.png") else "wallpaper_a.png"
        out = os.path.join(dd, name)
        try:
            open(prev, "w", encoding="utf-8").write(out)
        except OSError:
            pass

    img.save(out)
    print("[%s] 이미지 저장: %s  (%dx%d)" % (VERSION, out, img.size[0], img.size[1]))
    if not opt("--size"):
        print("        화면 %dx%d 로 재고, 그보다 크게 그려 줄여서 깝니다." % size)
    print("오늘: 주간 %s조 / 야간 %s조 / 휴무 %s · 명단 %s"
          % (view["day"], view["night"], "·".join(view["off"]), source))

    if not no_set and sys.platform.startswith("win"):
        ok, why = set_wallpaper(out)
        print("바탕화면 지정:", why)
    elif not no_set:
        print("바탕화면 지정은 Windows 에서만 동작합니다.")

    if "--install" in args:
        ok, why = install_task()
        if ok:
            print()
            print("자동 갱신 등록 완료 —", why)
            print("  지울 때는 uninstall.bat 을 실행하세요.")
        else:
            print()
            print("자동 갱신 등록 실패:", why)
            print("  바탕화면은 위에 나온 대로 바뀌었습니다. 자동 갱신만 안 걸린 상태입니다.")


if __name__ == "__main__":
    main()
