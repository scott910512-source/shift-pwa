// 명단을 app.js(내장본) 와 crew.json(서버 원본) 사이에서 맞춘다.
//
//   node tools/sync-crew.js              app.js  ->  crew.json + wallpaper.py
//   node tools/sync-crew.js --from-json  crew.json  ->  app.js + wallpaper.py
//
// 앱 안 관리자 화면에서 서버에 올리면 crew.json 만 바뀐다. 그 뒤에 기본
// 방향으로 돌리면 올린 내용을 옛 app.js 로 덮어써 버린다. 그래서 crew.json
// 쪽이 더 새로우면 멈추고 --from-json 을 쓰라고 알린다.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const APP = path.join(root, 'app.js');
const CREW = path.join(root, 'crew.json');
const fromJson = process.argv.slice(2).indexOf('--from-json') !== -1;
const src = fs.readFileSync(APP, 'utf8');

const start = src.indexOf('function seedCrews()');
if (start < 0) throw new Error('app.js 에서 seedCrews() 를 찾지 못했습니다.');
const open = src.indexOf('{', start);
let depth = 0, end = -1;
for (let i = open; i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
if (end < 0) throw new Error('seedCrews() 본문을 파싱하지 못했습니다.');

const seedCrews = new Function('return (' + src.slice(start, end) + ')')();
const crews = seedCrews();

const vm = src.match(/var\s+SEED_VERSION\s*=\s*(\d+)/);
const seedVersion = vm ? Number(vm[1]) : 1;

// 상근 인원도 함께 내보낸다 (교대 명단과는 별개)
const sm = src.match(/var\s+STAFF\s*=\s*(\[[^\]]*\])/);
const staff = sm ? new Function('return ' + sm[1])() : [];

// ── 어느 쪽을 원본으로 쓸지 정한다 ───────────────────────────────
let onDisk = null;
try { onDisk = JSON.parse(fs.readFileSync(CREW, 'utf8')); } catch (e) { onDisk = null; }

let finalCrews = crews;
let finalStaff = staff;
let finalVersion = seedVersion;
let updatedAt = new Date().toISOString().slice(0, 10);

if (fromJson) {
  if (!onDisk || !onDisk.crews) throw new Error('crew.json 을 읽지 못했습니다.');
  finalCrews = onDisk.crews;
  finalStaff = Array.isArray(onDisk.staff) ? onDisk.staff : staff;
  finalVersion = typeof onDisk.seedVersion === 'number' ? onDisk.seedVersion : seedVersion;
  updatedAt = onDisk.updatedAt || updatedAt;

  // app.js 의 내장본(seedCrews / STAFF / SEED_VERSION) 을 crew.json 에 맞춘다.
  const ind = '  ';
  const teams = Object.keys(finalCrews);
  const bodyLines = [`${ind}  return {`];
  teams.forEach((t, i) => {
    const f = finalCrews[t].factories || {};
    bodyLines.push(`${ind}    ${t}: {`);
    bodyLines.push(`${ind}      leader: '${String(finalCrews[t].leader || '').replace(/'/g, "\\'")}',`);
    bodyLines.push(`${ind}      factories: {`);
    const ps = Object.keys(f);
    ps.forEach((pk, j) => {
      const names = (f[pk] || []).map(n => `'${String(n).replace(/'/g, "\\'")}'`).join(', ');
      bodyLines.push(`${ind}        '${pk}': [${names}]${j < ps.length - 1 ? ',' : ''}`);
    });
    bodyLines.push(`${ind}      }`);
    bodyLines.push(`${ind}    }${i < teams.length - 1 ? ',' : ''}`);
  });
  bodyLines.push(`${ind}  };`);

  // seedCrews() 본문에서 return 앞의 주석은 그대로 살린다.
  const bodyRaw = src.slice(open + 1, end - 1);
  const ri = bodyRaw.indexOf('return');
  const keep = (ri > 0 ? bodyRaw.slice(0, ri) : '').replace(/\s*$/, '');
  const rebuilt = '{' + keep + '\n' + bodyLines.join('\n') + '\n' + ind + '}';
  let next = src.slice(0, open) + rebuilt + src.slice(end);

  next = next.replace(/var\s+SEED_VERSION\s*=\s*\d+/, `var SEED_VERSION = ${finalVersion}`);
  next = next.replace(/var\s+STAFF\s*=\s*\[[^\]]*\]/,
    'var STAFF = [' + finalStaff.map(n => `'${String(n).replace(/'/g, "\\'")}'`).join(', ') + ']');
  fs.writeFileSync(APP, next, 'utf8');
} else {
  // crew.json 이 더 새로우면(앱에서 올렸을 때) 덮어쓰지 않고 멈춘다.
  if (onDisk && typeof onDisk.seedVersion === 'number' && onDisk.seedVersion > seedVersion) {
    console.error(
      `\ncrew.json 이 더 새롭습니다 (crew.json v${onDisk.seedVersion} > app.js v${seedVersion}).\n` +
      '앱 관리자 화면에서 서버에 올린 명단이 있는 것 같습니다.\n' +
      '그대로 진행하면 그 명단을 옛 app.js 내용으로 덮어씁니다.\n\n' +
      '  서버 명단을 app.js 에 가져오려면:  node tools/sync-crew.js --from-json\n' +
      `  정말 app.js 로 덮어쓰려면:        app.js 의 SEED_VERSION 을 ${onDisk.seedVersion + 1} 이상으로 올린 뒤 다시 실행\n`);
    process.exit(1);
  }
  fs.writeFileSync(CREW, JSON.stringify(
    { seedVersion: finalVersion, updatedAt, crews: finalCrews, staff: finalStaff }, null, 2) + '\n', 'utf8');
}

// desktop/wallpaper.py 의 내장 명단(FALLBACK)도 같이 맞춘다.
// 사내망에서 crew.json 을 못 받아올 때 이 값이 쓰이므로 비어 있으면 안 된다.
const wp = path.join(root, 'desktop', 'wallpaper.py');
const q = v => JSON.stringify(v, null, 0).replace(/","/g, '", "').replace(/:\[/g, ': [');
const lines = ['# FALLBACK:START — tools/sync-crew.js 가 자동으로 고쳐 쓴다. 손으로 고치지 말 것.', 'FALLBACK = {', '  "crews": {'];
const names = Object.keys(finalCrews);
names.forEach((t, i) => {
  const f = finalCrews[t].factories;
  lines.push(`    ${JSON.stringify(t)}: {"leader": ${JSON.stringify(finalCrews[t].leader)}, "factories": {`);
  const ps = Object.keys(f);
  ps.forEach((pk, j) => {
    lines.push(`      ${JSON.stringify(pk)}: ${q(f[pk])}${j < ps.length - 1 ? ',' : '}}' + (i < names.length - 1 ? ',' : '')}`);
  });
});
lines.push('  },', `  "staff": ${q(finalStaff)}`, '}', '# FALLBACK:END');

const wpSrc = fs.readFileSync(wp, 'utf8');
const re = /# FALLBACK:START[\s\S]*?# FALLBACK:END/;
if (!re.test(wpSrc)) throw new Error('desktop/wallpaper.py 에서 FALLBACK 블록을 찾지 못했습니다.');
fs.writeFileSync(wp, wpSrc.replace(re, lines.join('\n')), 'utf8');

const total = Object.keys(finalCrews).reduce((n, t) =>
  n + Object.keys(finalCrews[t].factories).reduce((m, p) => m + finalCrews[t].factories[p].length, 0), 0);
const what = fromJson ? 'app.js + wallpaper.py' : 'crew.json + wallpaper.py';
console.log(`${what} 갱신 완료 — seedVersion ${finalVersion}, 조장 ${Object.keys(finalCrews).length}명, 조원 ${total}명, 상근 ${finalStaff.length}명`);
