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

const out = {
  seedVersion,
  updatedAt: new Date().toISOString().slice(0, 10),
  crews
};
fs.writeFileSync(path.join(root, 'crew.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');

const total = Object.keys(crews).reduce((n, t) =>
  n + Object.keys(crews[t].factories).reduce((m, p) => m + crews[t].factories[p].length, 0), 0);
console.log(`crew.json 갱신 완료 — seedVersion ${seedVersion}, 조장 4명, 조원 ${total}명`);
