// ============================================================
// 4조 2교대 근무표 — iOS 홈/잠금화면 위젯 (Scriptable 전용)
//
//  설치: Scriptable 앱 → + → 이 파일 전체 붙여넣기 → 이름 "근무표"
//        홈 화면 길게 누르기 → + → Scriptable → 크기 선택 →
//        위젯 길게 누르기 → 위젯 편집 → Script: 근무표
//
//  명단은 배포된 crew.json 을 받아 쓰므로, 명단이 바뀌어도 위젯을 다시
//  붙여넣을 필요가 없습니다. 근무 패턴 계산은 이 스크립트 안에서 하므로
//  인터넷이 없어도 동작합니다.
// ============================================================

const APP_URL = "https://scott910512-source.github.io/shift-pwa/";

// ---------- 명단 ----------
const CREW_URL = APP_URL + "crew.json";
const CACHE_FILE = "shift-crew.json";

// 한 번도 명단을 받지 못했을 때만 쓰는 값
const FALLBACK = {
  A: { leader: "노용수", factories: { "1": [], "2": ["하형만", "박성현", "진영욱"], "3": [] } },
  B: { leader: "조한석", factories: { "1": [], "2": ["안민호", "장예닮", "김재섭"], "3": [] } },
  C: { leader: "김민규", factories: { "1": [], "2": ["박광현", "전규석", "김윤종", "이재서"], "3": [] } },
  D: { leader: "김명수", factories: { "1": [], "2": ["백정욱", "김병섭", "박상준"], "3": [] } }
};
const PLANTS = ["1", "2", "3"];

let CREW = FALLBACK;
let CREW_SOURCE = "기본값";

function normalizeCrew(raw) {
  const out = {};
  for (const t of ["A", "B", "C", "D"]) {
    const src = (raw && raw[t]) || {};
    const fx = src.factories || {};
    const factories = {};
    for (const p of PLANTS) {
      const arr = Array.isArray(fx[p]) ? fx[p] : [];
      factories[p] = arr.map(x => String(x == null ? "" : x).trim()).filter(Boolean);
    }
    out[t] = { leader: String(src.leader == null ? "" : src.leader).trim(), factories };
  }
  return out;
}

async function loadCrew() {
  const fm = FileManager.local();
  const path = fm.joinPath(fm.cacheDirectory(), CACHE_FILE);

  try {                                   // 1) 최신 명단
    const req = new Request(CREW_URL + "?t=" + Date.now());
    req.timeoutInterval = 8;
    const json = await req.loadJSON();
    if (json && json.crews) {
      try { fm.writeString(path, JSON.stringify(json)); } catch (e) {}
      CREW = normalizeCrew(json.crews);
      CREW_SOURCE = "최신";
      return;
    }
  } catch (e) { /* 오프라인 등 */ }

  try {                                   // 2) 마지막으로 받아둔 명단
    if (fm.fileExists(path)) {
      const json = JSON.parse(fm.readString(path));
      if (json && json.crews) {
        CREW = normalizeCrew(json.crews);
        CREW_SOURCE = "저장본";
        return;
      }
    }
  } catch (e) { /* 아래로 */ }

  CREW = normalizeCrew(FALLBACK);         // 3) 내장 기본값
  CREW_SOURCE = "기본값";
}

// ---------- 근무 패턴 (웹앱과 동일) ----------
const TEAMS = ["A", "B", "C", "D"];
const ANCHOR = Date.UTC(2026, 7, 27);   // 2026-08-27 = 사이클 0일차
const DAY = 86400000;
const BLOCKS = [["D", "B"], ["C", "A"], ["B", "D"], ["A", "C"]];

const mod = (n, m) => ((n % m) + m) % m;

function shiftOf(utcMidnight) {
  const n = Math.round((utcMidnight - ANCHOR) / DAY);
  const [day, night] = BLOCKS[mod(Math.floor(n / 3), 4)];
  return { day, night, nth: mod(n, 3) + 1,
           off: TEAMS.filter(t => t !== day && t !== night) };
}

// ---------- 한국 표준시 고정 ----------
const KST = 9 * 3600000;
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function kstParts(ts = Date.now()) {
  const d = new Date(ts + KST);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(),
           h: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay() };
}
const keyOf = (y, m, d) => Date.UTC(y, m, d);
function partsOfKey(k) {
  const d = new Date(k);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay() };
}
const pad2 = n => (n < 10 ? "0" + n : "" + n);
function labelOf(k) {
  const p = partsOfKey(k);
  return `${p.m + 1}/${p.d} (${DOW[p.dow]})`;
}

// 08:00~20:00 주간 / 20:00~ 야간 / 00:00~08:00 어제 야간
function currentShift(now = Date.now()) {
  const p = kstParts(now);
  const todayKey = keyOf(p.y, p.m, p.d);
  const dawn = p.h < 8;
  const kind = (p.h >= 8 && p.h < 20) ? "day" : "night";
  const srcKey = (kind === "night" && dawn) ? todayKey - DAY : todayKey;
  const s = shiftOf(srcKey);
  let boundary;
  if (p.h < 8) boundary = Date.UTC(p.y, p.m, p.d, 8) - KST;
  else if (p.h < 20) boundary = Date.UTC(p.y, p.m, p.d, 20) - KST;
  else boundary = Date.UTC(p.y, p.m, p.d, 8) - KST + DAY;
  return { kind, dawn, todayKey, srcKey, boundary,
           team: kind === "day" ? s.day : s.night };
}

const leaderOf = t => (CREW[t] && CREW[t].leader) || "";
const membersOf = (t, p) => (CREW[t] && CREW[t].factories[p]) || [];

// ---------- 색 ----------
const C_BG    = new Color("#0e1218");
const C_FG    = new Color("#e8edf4");
const C_MUTE  = new Color("#98a3b1");
const C_DIM   = new Color("#68737f");
const C_DAY   = new Color("#f0ad3c");
const C_NIGHT = new Color("#7d99f7");
const C_CHIP  = new Color("#1c2331");
const C_LINE  = new Color("#2a3444");
const C_LINE2 = new Color("#39445a");

function txt(stack, s, size, color, opts = {}) {
  const t = stack.addText(s);
  t.font = opts.bold ? Font.boldSystemFont(size)
         : opts.mono ? Font.mediumMonospacedSystemFont(size)
         : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = opts.lineLimit || 1;
  if (opts.minScale) t.minimumScaleFactor = opts.minScale;
  return t;
}

function symbol(stack, name, size, color) {
  try {
    const img = stack.addImage(SFSymbol.named(name).image);
    img.imageSize = new Size(size, size);
    img.tintColor = color;
    img.resizable = true;
    return img;
  } catch (e) {
    return txt(stack, name.indexOf("sun") === 0 ? "주" : "야", size - 2, color, { bold: true });
  }
}

// ---------- 구성 요소 ----------

// 위젯 폭 추정 (2단을 정확히 반씩 나누기 위해 필요)
function widgetWidth(family) {
  let sw = 390;
  try {
    const s = Device.screenSize();
    sw = Math.min(s.width, s.height);
  } catch (e) { /* 기본값 사용 */ }
  let w;
  if (sw >= 428) w = 364;
  else if (sw >= 414) w = 360;
  else if (sw >= 390) w = 338;
  else if (sw >= 375) w = 329;
  else w = 292;
  if (family === "extraLarge") w = w * 2 + 16;   // 아이패드
  return w;
}

// 공장 라벨 칩
function chip(row, text, f) {
  const box = row.addStack();
  box.backgroundColor = C_CHIP;
  box.cornerRadius = 4;
  box.setPadding(2, 5, 2, 5);
  box.size = new Size(f.labelW, 0);
  box.centerAlignContent();
  txt(box, text, f.label, C_MUTE);
  return box;
}

// 공장 한 줄:  [1공장]  인재홍 주오빈 황서우 남기호
function plantRow(col, team, plant, f) {
  const row = col.addStack();
  row.centerAlignContent();
  row.spacing = 6;
  chip(row, plant + "공장", f);
  const list = membersOf(team, plant);
  txt(row, list.length ? list.join(" ") : "미등록", f.name,
      list.length ? C_FG : C_DIM, { lineLimit: 1, minScale: 0.45 });
  row.addSpacer();
  return row;
}

// 교대 제목 줄:  ☀ 주간 C조 · 김민규        ● 근무중
function shiftHead(col, kind, team, f, opts = {}) {
  const isDay = kind === "day";
  const color = isDay ? C_DAY : C_NIGHT;
  const row = col.addStack();
  row.centerAlignContent();
  row.spacing = 4;

  symbol(row, isDay ? "sun.max.fill" : "moon.fill", f.icon, color);
  txt(row, isDay ? "주간" : "야간", f.kind, C_MUTE);
  txt(row, team + "조", f.team, color, { bold: true });
  txt(row, "·", f.kind, C_DIM);
  const lead = leaderOf(team);
  txt(row, lead || "미등록", f.leader, lead ? C_FG : C_DIM, { bold: true });
  row.addSpacer();
  if (opts.now) txt(row, "● 근무중", f.badge, color);
  else txt(row, isDay ? "08:00~" : "20:00~", f.badge, C_DIM, { mono: true });
  return row;
}

// 한 단(주간 또는 야간) = 제목 + 1·2·3공장
function shiftColumn(parent, kind, team, f, colW, opts = {}) {
  const col = parent.addStack();
  col.layoutVertically();
  if (colW) col.size = new Size(colW, 0);
  shiftHead(col, kind, team, f, opts);
  col.addSpacer(f.gapHead);
  PLANTS.forEach((p, i) => {
    if (i) col.addSpacer(f.gapRow);
    plantRow(col, team, p, f);
  });
  return col;
}

// 두 단 사이 세로 구분선
function divider(row, h) {
  const d = row.addStack();
  d.size = new Size(1, h);
  d.backgroundColor = C_LINE;
  return d;
}

// 맨 윗줄:  8/30 (일) │ 1일차  휴무 B·D                    10:34
function topRow(w, cur, offs, f) {
  const row = w.addStack();
  row.centerAlignContent();
  row.spacing = 6;
  const s = shiftOf(cur.todayKey);
  txt(row, labelOf(cur.todayKey), f.date, C_FG, { bold: true });
  txt(row, "│", f.meta, C_LINE2);
  txt(row, `${s.nth}일차`, f.meta, C_DIM);
  txt(row, "휴무 " + offs.join("·"), f.meta, C_MUTE);
  row.addSpacer();
  const p = kstParts();
  txt(row, `${pad2(p.h)}:${pad2(p.mi)}`, f.date, C_MUTE, { mono: true });
  return row;
}

// ---------- 위젯 ----------
// 위젯 갱신 희망 간격. iOS 가 정확히 지켜주진 않지만, 이 값보다 이르게는
// 갱신하지 않는다. 너무 짧게 잡으면 iOS 가 갱신 횟수를 줄여버린다.
const REFRESH_MS = 15 * 60 * 1000;

const FONTS = {
  small:  { date: 11,   meta: 9,   icon: 11, kind: 10,   team: 15, leader: 11,   badge: 9,
            label: 8,   name: 9,    labelW: 30, gapHead: 3, gapRow: 2, divH: 0 },
  medium: { date: 11.5, meta: 9.5, icon: 11, kind: 9.5,  team: 13, leader: 11,   badge: 8.5,
            label: 8,   name: 9.5,  labelW: 30, gapHead: 5, gapRow: 4, divH: 84 },
  large:  { date: 14,   meta: 11,  icon: 13, kind: 11.5, team: 16, leader: 13.5, badge: 10.5,
            label: 9.5, name: 11.5, labelW: 36, gapHead: 7, gapRow: 6, divH: 112 },
  extraLarge: { date: 15, meta: 12, icon: 15, kind: 13, team: 19, leader: 15, badge: 12,
            label: 11,  name: 13.5, labelW: 42, gapHead: 8, gapRow: 7, divH: 130 }
};

function buildWidget(family, now = Date.now()) {
  const w = new ListWidget();
  w.backgroundColor = C_BG;
  w.url = APP_URL;

  const cur = currentShift(now);
  const tKey = cur.todayKey;
  const dayS = shiftOf(tKey);
  const nightKey = cur.dawn ? tKey - DAY : tKey;
  const nightS = shiftOf(nightKey);
  const offs = TEAMS.filter(t => t !== dayS.day && t !== nightS.night);
  const f = FONTS[family] || FONTS.medium;

  // refreshAfterDate 는 "이 시각 전에는 갱신하지 말라"는 뜻이다. 교대 시각만
  // 넣으면 최대 12시간 동안 갱신이 막혀 화면이 멈춘 것처럼 보인다.
  // 다음 교대 시각과 15분 뒤 중 이른 쪽을 넣어 자주 갱신되게 한다.
  w.refreshAfterDate = new Date(Math.min(cur.boundary, now + REFRESH_MS));

  // 작은 위젯은 2단으로 나눌 폭이 없다 → 조·조장만 세로로
  if (family === "small") {
    w.setPadding(11, 11, 11, 11);
    const top = w.addStack();
    top.centerAlignContent();
    txt(top, labelOf(tKey), f.date, C_FG, { bold: true });
    top.addSpacer();
    txt(top, `${dayS.nth}일차`, f.meta, C_DIM);
    w.addSpacer(7);
    shiftHead(w, "day", dayS.day, f, { now: cur.kind === "day" });
    w.addSpacer(5);
    shiftHead(w, "night", nightS.night, f, { now: cur.kind === "night" });
    w.addSpacer();
    const off = w.addStack();
    off.centerAlignContent();
    off.spacing = 4;
    txt(off, "휴무", f.meta, C_DIM);
    txt(off, offs.join(" · "), f.meta, C_MUTE, { bold: true });
    off.addSpacer();
    return w;
  }

  // 가로 2단 — 왼쪽 주간 / 오른쪽 야간
  const pad = family === "medium" ? 11 : 14;
  w.setPadding(pad, pad + 1, pad, pad + 1);

  topRow(w, cur, offs, f);
  w.addSpacer(family === "medium" ? 9 : 12);

  const body = w.addStack();
  body.layoutHorizontally();
  body.topAlignContent();

  const gap = family === "medium" ? 10 : 14;
  const colW = Math.max(120, Math.floor((widgetWidth(family) - (pad + 1) * 2 - gap * 2 - 1) / 2));

  shiftColumn(body, "day", dayS.day, f, colW, { now: cur.kind === "day" });
  body.addSpacer(gap);
  divider(body, f.divH);
  body.addSpacer(gap);
  shiftColumn(body, "night", nightS.night, f, colW, { now: cur.kind === "night" });
  body.addSpacer();

  if (cur.dawn) {
    w.addSpacer(6);
    txt(w, `야간 ${nightS.night}조는 어제 20:00 시작 · 오늘 08:00 종료`, f.meta, C_DIM, { lineLimit: 1, minScale: 0.7 });
  }

  // 큰 위젯은 남는 공간에 앞으로의 근무를 덧붙인다
  if (family === "large" || family === "extraLarge") {
    w.addSpacer(12);
    txt(w, "다가오는 근무", f.meta, C_DIM);
    w.addSpacer(5);
    for (let i = 1; i <= 4; i++) {
      const k = tKey + i * DAY;
      const s = shiftOf(k);
      const r = w.addStack();
      r.centerAlignContent();
      r.spacing = 6;
      txt(r, labelOf(k), f.meta + 1, C_MUTE, { mono: true });
      r.addSpacer();
      txt(r, "주 " + s.day, f.meta + 1, C_DAY, { mono: true });
      txt(r, "야 " + s.night, f.meta + 1, C_NIGHT, { mono: true });
      w.addSpacer(4);
    }
  }
  return w;
}

// ---------- 실행 ----------
await loadCrew();

const family = (typeof config !== "undefined" && config.widgetFamily) ? config.widgetFamily : "medium";
const widget = buildWidget(family);

if (typeof config !== "undefined" && config.runsInWidget) {
  Script.setWidget(widget);
} else if (family === "small") {
  await widget.presentSmall();
} else if (family === "large") {
  await widget.presentLarge();
} else {
  await widget.presentMedium();
}
Script.complete();

// 테스트용 훅 (Scriptable 동작에는 영향 없음)
if (typeof globalThis !== "undefined") {
  globalThis.__SHIFT_WIDGET__ = { shiftOf, currentShift, buildWidget, loadCrew,
    normalizeCrew, getCrew: () => CREW, getSource: () => CREW_SOURCE };
}
