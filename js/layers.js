/* 大限、流年疊宮：宮名、四化、祿羊陀、魁鉞昌曲、馬鸞喜。純計算。
   規則依課程 Ch 02-01：本命紅字、大限綠字、流年藍字；
   大限看「大限命宮的宮干」，流年看「流年年干」；宮名一律由命宮起逆時針。 */
(function (root) {
  const Z = typeof require !== 'undefined' ? require('./chart.js') : root.Ziwei;
  const { STEMS, BRANCHES, SIHUA } = Z;
  const HUA = ['祿', '權', '科', '忌'];
  const NAMES = ['命', '兄', '夫', '子', '財', '疾', '遷', '友', '官', '田', '福', '父'];
  const LUCUN = { 甲: 2, 乙: 3, 丙: 5, 丁: 6, 戊: 5, 己: 6, 庚: 8, 辛: 9, 壬: 11, 癸: 0 };
  const KUIYUE = { 甲: [1, 7], 戊: [1, 7], 庚: [1, 7], 乙: [0, 8], 己: [0, 8], 丙: [11, 9], 丁: [11, 9], 壬: [3, 5], 癸: [3, 5], 辛: [2, 6] };
  const CHANG = { 甲: 5, 乙: 6, 丙: 8, 丁: 9, 戊: 8, 己: 9, 庚: 11, 辛: 0, 壬: 2, 癸: 3 };
  const QU = { 甲: 9, 乙: 8, 丙: 6, 丁: 5, 戊: 6, 己: 5, 庚: 3, 辛: 2, 壬: 0, 癸: 11 };
  const mod = (n, m) => ((n % m) + m) % m;
  // 驛馬：申子辰→寅、寅午戌→申、巳酉丑→亥、亥卯未→巳
  const HORSE = { 申: 2, 子: 2, 辰: 2, 寅: 8, 午: 8, 戌: 8, 巳: 11, 酉: 11, 丑: 11, 亥: 5, 卯: 5, 未: 5 };
  const horse = (b) => HORSE[BRANCHES[b]];

  /** 這一層（大限或流年）的星曜：回傳 [{idx, tag}]，tag 例如「祿」「羊」「馬」 */
  function placeStars(stem, branchIdx) {
    const lc = LUCUN[stem];
    const out = [
      { idx: lc, tag: '祿' }, { idx: lc + 1, tag: '羊' }, { idx: lc - 1, tag: '陀' },
      { idx: KUIYUE[stem][0], tag: '魁' }, { idx: KUIYUE[stem][1], tag: '鉞' },
      { idx: CHANG[stem], tag: '昌' }, { idx: QU[stem], tag: '曲' },
      { idx: horse(branchIdx), tag: '馬' },
      { idx: 3 - branchIdx, tag: '鸞' }, { idx: 3 - branchIdx + 6, tag: '喜' },
    ];
    return out.map((s) => ({ idx: mod(s.idx, 12), tag: s.tag }));
  }

  function layer(chart, prefix, mingIdx, stem, branchIdx) {
    const names = Array(12).fill('');
    for (let k = 0; k < 12; k++) names[mod(mingIdx - k, 12)] = prefix + NAMES[k];
    const hua = SIHUA[stem].map((star, i) => {
      const idx = chart.palaces.findIndex((p) => p.stars.some((s) => s.n === star));
      return { star, h: HUA[i], idx };
    });
    const stars = Array.from({ length: 12 }, () => []);
    placeStars(stem, branchIdx).forEach((s) => stars[s.idx].push(prefix + s.tag));
    return { prefix, mingIdx, stem, branch: BRANCHES[branchIdx], names, hua, stars };
  }

  /** 計算指定西元年的大限與流年。年齡用虛歲＝年−農曆生年＋1。 */
  function compute(chart, year) {
    const age = year - chart.lunar.year + 1;
    const stemIdx = mod(year - 4, 10), branchIdx = mod(year - 4, 12);
    const nian = layer(chart, '年', branchIdx, STEMS[stemIdx], branchIdx);
    nian.ganzhi = STEMS[stemIdx] + BRANCHES[branchIdx];
    const di = chart.palaces.findIndex((p) => age >= p.daxian[0] && age <= p.daxian[1]);
    let da = null;
    if (di >= 0) {
      const p = chart.palaces[di];
      da = layer(chart, '大', di, p.stem, di);
      da.range = p.daxian;
      da.ganzhi = p.stem + p.branch;
    }
    return { year, age, nian, da };
  }

  /** 一句話摘要，給案例事件時間軸用 */
  function summary(chart, year) {
    const r = compute(chart, year);
    const out = [`${year} 年（${r.nian.ganzhi}，虛歲 ${r.age}）`];
    if (r.da) out.push(`大限 ${r.da.range[0]}–${r.da.range[1]} 歲，大命在${r.da.branch}（${chart.palaces[r.da.mingIdx].name}）`);
    else out.push('尚未起大限（童限）');
    out.push(`年命在${r.nian.branch}，疊在本命${chart.palaces[r.nian.mingIdx].name}`);
    const where = (L) => L.hua.map((x) => `${x.star}化${x.h}${x.idx >= 0 ? '→' + chart.palaces[x.idx].name : ''}`).join('、');
    out.push('流年四化：' + where(r.nian));
    if (r.da) out.push('大限四化：' + where(r.da));
    return out.join('｜');
  }

  const api = { compute, summary, placeStars, NAMES };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Layers = api;
})(typeof window !== 'undefined' ? window : globalThis);
