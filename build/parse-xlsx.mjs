// 기말_한자.xlsx → ../data.js 생성
// 사용법:
//   cd build
//   npm install
//   node parse-xlsx.mjs [엑셀경로]
//
// 엑셀 구조(Sheet1): A=한자, B=뜻, C=음
// 빈 줄을 기준으로 그룹을 나누며, 각 그룹은
//   [개별 한자들 ...] + [합성어(사자성어/단어) 1개] 로 구성됩니다.

import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] || path.resolve(__dirname, '../../기말_한자.xlsx');
const OUT = path.resolve(__dirname, '../data.js');

const wb = XLSX.readFile(SRC);
const ws = wb.Sheets['Sheet1'];
if (!ws) { console.error('Sheet1 을 찾을 수 없습니다:', SRC); process.exit(1); }
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

const clean = (s) => String(s ?? '')
  .replace(/\r\n/g, '\n')
  .replace(/[ \t]+$/gm, '')
  .trim();

// 빈 줄(모든 칸 공백)로 그룹 분리
const groups = [];
let cur = [];
for (const r of rows) {
  const cells = [clean(r[0]), clean(r[1]), clean(r[2])];
  if (cells.every((c) => c === '')) {
    if (cur.length) { groups.push(cur); cur = []; }
  } else {
    cur.push({ hanja: cells[0], meaning: cells[1], reading: cells[2] });
  }
}
if (cur.length) groups.push(cur);

const entries = [];
let id = 0;

for (const g of groups) {
  // 한글자 = 개별 한자, 그보다 길면 합성어/구절
  const chars = g.filter((x) => [...x.hanja].length === 1);
  const word = g.filter((x) => [...x.hanja].length > 1)[0] || null;

  // 합성어가 없으면 개별 한자 목록 (예: 천간 甲乙丙..., 지지 子丑...)
  if (!word) {
    entries.push({
      id: ++id, type: 'charlist',
      hanja: chars.map((c) => c.hanja).join(''),
      meaning: '', reading: '',
      chars: chars.map((c) => ({ hanja: c.hanja, meaning: c.meaning, reading: c.reading })),
    });
    continue;
  }

  // 음독이 비어 있으면 개별 한자 음을 이어 붙여 유도
  let reading = word.reading;
  if (!reading && chars.length) reading = chars.map((c) => c.reading).join('');

  const len = [...word.hanja].length;
  const type = chars.length === 4 && len === 4 ? 'idiom'
    : len <= 2 ? 'word'
      : len >= 5 ? 'long'
        : 'phrase';

  entries.push({
    id: ++id, type,
    hanja: word.hanja, meaning: word.meaning, reading,
    chars: chars.map((c) => ({ hanja: c.hanja, meaning: c.meaning, reading: c.reading })),
  });
}

// 개별 한자 취합 (한자별 등장한 뜻/음 모음)
const charMap = new Map();
for (const e of entries) {
  for (const c of e.chars) {
    if (!charMap.has(c.hanja)) charMap.set(c.hanja, { hanja: c.hanja, meanings: [], readings: [], in: [] });
    const o = charMap.get(c.hanja);
    if (c.meaning && !o.meanings.includes(c.meaning)) o.meanings.push(c.meaning);
    if (c.reading && !o.readings.includes(c.reading)) o.readings.push(c.reading);
    o.in.push(e.id);
  }
}
const characters = [...charMap.values()];

const TYPE_LABEL = { idiom: '사자성어', phrase: '성어', long: '장구', word: '단어', charlist: '한자목록' };

const data = {
  source: path.basename(SRC),
  generated: new Date().toISOString(),
  counts: {
    entries: entries.length,
    characters: characters.length,
    idioms: entries.filter((e) => e.type === 'idiom').length,
  },
  typeLabel: TYPE_LABEL,
  entries,
  characters,
};

fs.writeFileSync(OUT,
  '// 자동 생성 파일 — ' + path.basename(SRC) + ' 에서 파싱됨\n'
  + '// 재생성: cd build && node parse-xlsx.mjs\n'
  + 'window.HANJA_DATA = ' + JSON.stringify(data, null, 2) + ';\n', 'utf8');

console.log('entries:', entries.length, '/ characters:', characters.length);
console.log('by type:', JSON.stringify(entries.reduce((a, e) => ((a[e.type] = (a[e.type] || 0) + 1), a), {})));
console.log('-> written', OUT);
