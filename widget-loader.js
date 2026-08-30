// ============================================================
// 4조 2교대 근무표 — 위젯 로더 (Scriptable)
//
//  ★ 이 짧은 코드만 한 번 붙여넣으면 됩니다. 이후로는 다시 붙여넣을 일이
//    없습니다. 실제 위젯 코드(widget.js)를 인터넷에서 받아 실행하므로
//    레이아웃이 바뀌든 명단이 바뀌든 자동으로 반영됩니다.
//
//  설치: Scriptable → + → 이 파일 붙여넣기 → 이름 "근무표"
//        홈 화면 길게 → + → Scriptable → 크기 선택 →
//        위젯 길게 → 위젯 편집 → Script: 근무표
// ============================================================

const CODE_URL = "https://scott910512-source.github.io/shift-pwa/widget.js";
const CACHE_NAME = "shift-widget-code.js";

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), CACHE_NAME);

function readCache() {
  try { return fm.fileExists(cachePath) ? fm.readString(cachePath) : null; }
  catch (e) { return null; }
}

async function fetchCode() {
  try {
    const req = new Request(CODE_URL + "?t=" + Date.now());
    req.timeoutInterval = 10;
    const code = await req.loadString();
    // 너무 짧으면 오류 페이지를 받은 것 → 버린다
    return (code && code.length > 500) ? code : null;
  } catch (e) { return null; }
}

async function runCode(code) {
  // 직접 eval 이라야 받은 코드가 Scriptable API(ListWidget, Request …)에
  // 접근할 수 있다. new Function 은 전역만 보므로 쓰지 않는다.
  // widget.js 는 최상위 await 를 쓰므로 async 화살표로 감싼다.
  await eval(`(async () => {\n${code}\n})()`);
}

function errorWidget(msg) {
  const w = new ListWidget();
  w.backgroundColor = new Color("#0e1218");
  w.setPadding(14, 14, 14, 14);
  const t1 = w.addText("근무표");
  t1.font = Font.boldSystemFont(14);
  t1.textColor = new Color("#e8edf4");
  w.addSpacer(6);
  const t2 = w.addText(msg);
  t2.font = Font.systemFont(11);
  t2.textColor = new Color("#98a3b1");
  t2.lineLimit = 4;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  return w;
}

// 1) 새 코드를 받아 실행해 보고, 성공했을 때만 캐시에 저장한다.
//    (잘못된 코드가 올라와도 마지막 정상 버전으로 되돌아간다)
let ok = false;
const fresh = await fetchCode();
if (fresh) {
  try {
    await runCode(fresh);
    try { fm.writeString(cachePath, fresh); } catch (e) {}
    ok = true;
  } catch (e) {
    console.warn("새 위젯 코드 실행 실패, 이전 버전으로 되돌립니다: " + e);
  }
}

// 2) 실패했거나 오프라인이면 마지막으로 잘 돌던 코드를 쓴다
if (!ok) {
  const cached = readCache();
  if (cached) {
    try { await runCode(cached); ok = true; }
    catch (e) { console.warn("저장된 위젯 코드 실행 실패: " + e); }
  }
}

// 3) 둘 다 없으면 안내 위젯
if (!ok) {
  const w = errorWidget("위젯을 불러오지 못했습니다.\n인터넷에 연결한 뒤 다시 시도해 주세요.");
  if (typeof config !== "undefined" && config.runsInWidget) Script.setWidget(w);
  else await w.presentMedium();
  Script.complete();
}
