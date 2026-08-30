// ============================================================
// 4조 2교대 근무표 — iOS 홈/잠금화면 위젯 (Scriptable 전용)
//
//  설치: Scriptable 앱 → + → 이 파일 전체 붙여넣기 → 이름 "근무표"
//        홈 화면 길게 누르기 → + → Scriptable → 위젯 크기 선택 →
//        위젯 길게 누르기 → 위젯 편집 → Script: 근무표
//
//  인터넷 없이 동작합니다. 명단이 바뀌면 아래 CREW 만 고치면 됩니다.
//  (웹앱과 같은 계산식이므로 결과가 항상 일치합니다)
// ============================================================

const APP_URL = "https://scott910512-source.github.io/shift-pwa/";

// ---------- 명단 ----------
// 배포된 crew.json 을 받아 캐시한다. 명단이 바뀌어도 위젯을 다시 붙여넣을
// 필요가 없다. 네트워크가 없으면 마지막으로 받은 값을, 그것도 없으면
// 아래 FALLBACK 을 쓴다.
const CREW_URL = APP_URL + "crew.json";
const CACHE_FILE = "shift-crew.json";

const FALLBACK = {
  A: { leader: "노용수", factories: { "1": [], "2": ["하형만", "박성현", "진영욱"], "3": [] } },
  B: { leader: "조한석", factories: { "1": [], "2": ["안민호", "장예닮", "김재섭"], "3": [] } },
  C: { leader: "김민규", factories: { "1": [], "2": ["박광현", "전규석", "김윤종", "이재서"], "3": [] } },
  D: { leader: "김명수", factories: { "1": [], "2": ["백정욱", "김병섭", "박상준"], "3": [] } }
};
const PLANTS = ["1", "2", "3"];

let CREW = FALLBACK;      // loadCrew() 가 채운다
let CREW_SOURCE = "기본값";

function normalizeCrew(raw) {
  const out = {};
  for (const t of ["A", "B", "C", "D"]) {
    const src = (raw && raw[t]) || {};
    const fs_ = src.factories || {};
    const factories = {};
    for (const p of PLANTS) {
      const arr = Array.isArray(fs_[p]) ? fs_[p] : [];
      factories[p] = arr.map(x => String(x == null ? "" : x).trim()).filter(Boolean);
    }
    out[t] = { leader: String(src.leader == null ? "" : src.leader).trim(), factories };
  }
  return out;
}

async function loadCrew() {
  const fm = FileManager.local();
  const path = fm.joinPath(fm.cacheDirectory(), CACHE_FILE);

  // 1) 최신 명단 받아오기
  try {
    const req = new Request(CREW_URL + "?t=" + Date.now());
    req.timeoutInterval = 8;
    const json = await req.loadJSON();
    if (json && json.crews) {
      try { fm.writeString(path, JSON.stringify(json)); } catch (e) {}
      CREW = normalizeCrew(json.crews);
      CREW_SOURCE = "최신";
      return;
    }
  } catch (e) { /* 오프라인 등 — 아래로 */ }

  // 2) 마지막으로 받아둔 명단
  try {
    if (fm.fileExists(path)) {
      const json = JSON.parse(fm.readString(path));
      if (json && json.crews) {
        CREW = normalizeCrew(json.crews);
        CREW_SOURCE = "저장본";
        return;
      }
    }
  } catch (e) { /* 아래로 */ }

  // 3) 내장 기본값
  CREW = normalizeCrew(FALLBACK);
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
  return {
    day, night,
    nth: mod(n, 3) + 1,
    off: TEAMS.filter(t => t !== day && t !== night)
  };
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
  // 다음 교대 시각 = 위젯 갱신 시점
  let boundary;
  if (p.h < 8) boundary = Date.UTC(p.y, p.m, p.d, 8) - KST;
  else if (p.h < 20) boundary = Date.UTC(p.y, p.m, p.d, 20) - KST;
  else boundary = Date.UTC(p.y, p.m, p.d, 8) - KST + DAY;
  return { kind, dawn, todayKey, srcKey, boundary,
           team: kind === "day" ? s.day : s.night };
}

const leaderOf = t => (CREW[t] && CREW[t].leader) || "";
const countOf = t => PLANTS.reduce((n, p) => n + ((CREW[t] && CREW[t].factories[p]) || []).length, 0);
const membersOf = (t, p) => (CREW[t] && CREW[t].factories[p]) || [];

// ---------- 색 ----------
const C_BG    = new Color("#0e1218");
const C_FG    = new Color("#e8edf4");
const C_MUTE  = new Color("#8b95a3");
const C_DIM   = new Color("#5f6a78");
const C_DAY   = new Color("#f0ad3c");
const C_NIGHT = new Color("#7d99f7");

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
    return txt(stack, name === "sun.max.fill" ? "주" : "야", size - 2, color, { bold: true });
  }
}

// 한 교대 줄: [아이콘] 주간  C조   김민규
function shiftRow(w, kind, team, opts = {}) {
  const isDay = kind === "day";
  const color = isDay ? C_DAY : C_NIGHT;
  const row = w.addStack();
  row.centerAlignContent();
  row.spacing = 5;

  symbol(row, isDay ? "sun.max.fill" : "moon.fill", opts.iconSize || 12, color);
  txt(row, isDay ? "주간" : "야간", opts.labelSize || 12, C_MUTE);
  txt(row, team + "조", opts.teamSize || 15, color, { bold: true });

  if (opts.showLeader) {
    row.addSpacer();
    const lead = leaderOf(team);
    txt(row, lead || "미등록", opts.leaderSize || 13, lead ? C_FG : C_DIM);
  }
  if (opts.now) {
    row.addSpacer(4);
    txt(row, "● 근무중", 9.5, color);
  }
  if (!opts.showLeader && !opts.now) row.addSpacer();
  return row;
}

function headerRow(w, cur, opts = {}) {
  const row = w.addStack();
  row.centerAlignContent();
  txt(row, labelOf(cur.todayKey), opts.size || 12, C_MUTE, { mono: true });
  row.addSpacer();
  const s = shiftOf(cur.todayKey);
  txt(row, `${s.nth}일차`, (opts.size || 12) - 1, C_DIM, { mono: true });
  return row;
}

function offRow(w, offs, size = 11) {
  const row = w.addStack();
  row.centerAlignContent();
  row.spacing = 4;
  txt(row, "휴무", size, C_DIM);
  txt(row, offs.join(" · "), size, C_MUTE, { bold: true });
  row.addSpacer();
  return row;
}

// ---------- 위젯 ----------
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

  // 교대 시각에 맞춰 갱신 요청
  w.refreshAfterDate = new Date(cur.boundary);

  if (family === "small") {
    w.setPadding(12, 12, 12, 12);
    headerRow(w, cur, { size: 11 });
    w.addSpacer(8);
    shiftRow(w, "day", dayS.day, { now: cur.kind === "day", teamSize: 17, iconSize: 13 });
    w.addSpacer(5);
    shiftRow(w, "night", nightS.night, { now: cur.kind === "night", teamSize: 17, iconSize: 13 });
    w.addSpacer(8);
    offRow(w, offs, 10.5);
    return w;
  }

  if (family === "large") {
    w.setPadding(14, 14, 14, 14);
    headerRow(w, cur, { size: 13 });
    w.addSpacer(9);
    shiftRow(w, "day", dayS.day, { showLeader: true, now: cur.kind === "day", teamSize: 18, iconSize: 14, labelSize: 13 });
    w.addSpacer(3);
    plantLine(w, dayS.day);
    w.addSpacer(9);
    shiftRow(w, "night", nightS.night, { showLeader: true, now: cur.kind === "night", teamSize: 18, iconSize: 14, labelSize: 13 });
    w.addSpacer(3);
    plantLine(w, nightS.night);
    w.addSpacer(9);
    offRow(w, offs, 12);
    w.addSpacer(10);
    txt(w, "다가오는 근무", 10.5, C_DIM);
    w.addSpacer(4);
    for (let i = 1; i <= 5; i++) {
      const k = tKey + i * DAY;
      const s = shiftOf(k);
      const r = w.addStack();
      r.centerAlignContent();
      r.spacing = 6;
      txt(r, labelOf(k), 11.5, C_MUTE, { mono: true });
      r.addSpacer();
      txt(r, "주 " + s.day, 11.5, C_DAY, { mono: true });
      txt(r, "야 " + s.night, 11.5, C_NIGHT, { mono: true });
      w.addSpacer(3);
    }
    return w;
  }

  // medium (기본)
  w.setPadding(13, 14, 13, 14);
  headerRow(w, cur, { size: 12.5 });
  w.addSpacer(9);
  shiftRow(w, "day", dayS.day, { showLeader: true, now: cur.kind === "day", teamSize: 17, iconSize: 13 });
  w.addSpacer(6);
  shiftRow(w, "night", nightS.night, { showLeader: true, now: cur.kind === "night", teamSize: 17, iconSize: 13 });
  w.addSpacer(9);
  offRow(w, offs, 11.5);
  if (cur.dawn) {
    w.addSpacer(4);
    txt(w, `야간 ${nightS.night}조는 어제 20:00 시작 · 오늘 08:00 종료`, 9.5, C_DIM, { lineLimit: 2 });
  }
  return w;
}

// 공장별 인원 한 줄 (large 전용)
function plantLine(w, team) {
  const row = w.addStack();
  row.spacing = 8;
  PLANTS.forEach(p => {
    const list = membersOf(team, p);
    const col = row.addStack();
    col.layoutVertically();
    col.spacing = 1;
    txt(col, `${p}공장`, 9.5, C_DIM);
    txt(col, list.length ? list.join(" ") : "미등록",
        11, list.length ? C_FG : C_DIM, { lineLimit: 3, minScale: 0.7 });
  });
  row.addSpacer();
  return row;
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
