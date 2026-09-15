// app.js 의 seedCrews() 를 읽어 crew.json 을 다시 만든다.
// 명단을 고친 뒤 `node tools/sync-crew.js` 를 실행하면 위젯도 같은 명단을 쓴다.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

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

const out = {
  seedVersion,
  updatedAt: new Date().toISOString().slice(0, 10),
  crews,
  staff
};
fs.writeFileSync(path.join(root, 'crew.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');

// desktop/wallpaper.py 의 내장 명단(FALLBACK)도 같이 맞춘다.
// 사내망에서 crew.json 을 못 받아올 때 이 값이 쓰이므로 비어 있으면 안 된다.
const wp = path.join(root, 'desktop', 'wallpaper.py');
const q = v => JSON.stringify(v, null, 0).replace(/","/g, '", "').replace(/:\[/g, ': [');
const lines = ['# FALLBACK:START — tools/sync-crew.js 가 자동으로 고쳐 쓴다. 손으로 고치지 말 것.', 'FALLBACK = {', '  "crews": {'];
const names = Object.keys(crews);
names.forEach((t, i) => {
  const f = crews[t].factories;
  lines.push(`    ${JSON.stringify(t)}: {"leader": ${JSON.stringify(crews[t].leader)}, "factories": {`);
  const ps = Object.keys(f);
  ps.forEach((pk, j) => {
    lines.push(`      ${JSON.stringify(pk)}: ${q(f[pk])}${j < ps.length - 1 ? ',' : '}}' + (i < names.length - 1 ? ',' : '')}`);
  });
});
lines.push('  },', `  "staff": ${q(staff)}`, '}', '# FALLBACK:END');

const wpSrc = fs.readFileSync(wp, 'utf8');
const re = /# FALLBACK:START[\s\S]*?# FALLBACK:END/;
if (!re.test(wpSrc)) throw new Error('desktop/wallpaper.py 에서 FALLBACK 블록을 찾지 못했습니다.');
fs.writeFileSync(wp, wpSrc.replace(re, lines.join('\n')), 'utf8');

const total = Object.keys(crews).reduce((n, t) =>
  n + Object.keys(crews[t].factories).reduce((m, p) => m + crews[t].factories[p].length, 0), 0);
console.log(`crew.json + wallpaper.py 갱신 완료 — seedVersion ${seedVersion}, 조장 4명, 조원 ${total}명, 상근 ${staff.length}명`);
