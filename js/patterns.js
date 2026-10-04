/* 斷事常用格局自動偵測（課程 Ch 11-3）。純計算，依本命盤（可加大限／流年的化忌）。
   宮位用地支 index（子=0）；三方四正 = 本宮、對宮(+6)、三合(+4、+8)；鄰宮 = 前後各一宮。
   只用宮內實際的星，空宮借來的對宮星不算。 */
(function (root) {
  const mod = (n, m) => ((n % m) + m) % m;
  const KONG = ['地空', '地劫'];
  const SHA4 = ['擎羊', '陀羅', '火星', '鈴星'];
  const TAOHUA = ['天姚', '咸池', '紅鸞', '天喜'];

  /** 一句話說明，和速查「格局」條目一致 */
  const BRIEF = {
    祿逢沖破: '吉中藏凶，白忙一場', 祿空馬倒: '走投無路', 馬落空亡: '滯礙重重',
    廉相羊: '法律問題、官非', 廉殺羊: '官非、凶傷、挫折',
    刑忌夾印: '壓力極大、被人連累', 財蔭夾印: '有人分擔壓力、貴人多、間接有好處',
    羊陀夾忌: '破財、因財惹禍', 火鈴夾忌: '必有災厄、傷病', 雙忌夾: '四面楚歌、孤立無援', 雙忌夾忌: '四面楚歌、孤立無援',
    火貪: '橫財來的機遇', 鈴貪: '橫財來的機遇', 火鈴貪: '橫財來的機遇',
    昌貪: '做事顛倒，不按常理出牌', 曲貪: '做事顛倒，不按常理出牌', 昌曲貪: '做事顛倒，不按常理出牌',
    巨火羊: '口舌之災', 巨逢四煞: '一說話就倒楣', 風流彩杖: '因為桃花而破財或招災',
    泛水桃花: '逢煞易有桃花災', 桃花犯主: '桃花過重，思想開放', 水中作塚: '容易有水的問題或言語詐騙', 十惡格: '脾氣怪異、暴躁反覆招災',
  };
  /** 速查條目名稱（有些格局合併成一條） */
  const TERM = {
    雙忌夾: '雙忌夾／雙忌夾忌', 雙忌夾忌: '雙忌夾／雙忌夾忌',
    火貪: '火貪／鈴貪／火鈴貪', 鈴貪: '火貪／鈴貪／火鈴貪', 火鈴貪: '火貪／鈴貪／火鈴貪',
    昌貪: '昌貪／曲貪／昌曲貪', 曲貪: '昌貪／曲貪／昌曲貪', 昌曲貪: '昌貪／曲貪／昌曲貪',
  };

  /**
   * @param chart  Ziwei.buildChart 的結果
   * @param layers 選填，Layers.compute 的結果（取大限／流年的化忌，另外判斷夾忌類格局）
   * @returns [{name, idx, layer, brief, term, note}] layer = '本命' | '大限' | '流年'
   */
  function detect(chart, layers) {
    const P = chart.palaces;
    const has = (b, f) => P[mod(b, 12)].stars.some(f);
    const hasName = (b, n) => has(b, (s) => s.n === n);
    const hasAny = (b, ns) => has(b, (s) => ns.includes(s.n));
    const sf = (b) => [b, b + 6, b + 4, b + 8].map((x) => mod(x, 12));
    const inSf = (b, f) => sf(b).some((i) => has(i, f));
    const inSfName = (b, ...ns) => inSf(b, (s) => ns.includes(s.n));
    const lu = (b) => has(b, (s) => s.h === '祿' || s.n === '祿存');

    const out = [];
    const push = (name, idx, layer = '本命', note = '') => out.push({ name, idx, layer, brief: BRIEF[name], term: TERM[name] || name, note });

    // ---- 只看本命的格局 ----
    for (let b = 0; b < 12; b++) {
      const ji = inSf(b, (s) => s.h === '忌');
      const kong = inSf(b, (s) => KONG.includes(s.n));
      const horse = inSfName(b, '天馬');
      const where = (i) => (i === b ? '本宮' : i === mod(b + 6, 12) ? '對宮' : '三合');
      const trig = sf(b).flatMap((i) => P[i].stars.filter((s) => s.h === '忌' || KONG.includes(s.n)).map((s) => `${where(i)}${P[i].name}的${s.n}${s.h === '忌' ? '化忌' : ''}`));
      const luName = P[b].stars.filter((s) => s.h === '祿' || s.n === '祿存').map((s) => (s.n === '祿存' ? '祿存' : s.n + '化祿')).join('、');
      if (lu(b) && (ji || kong)) push('祿逢沖破', b, '本命', `${luName}；${trig.join('、')}`);
      if (lu(b) && horse && (ji || kong)) push('祿空馬倒', b, '本命', `${luName}＋${P[sf(b).find((i) => hasName(i, '天馬'))].name}的天馬；${trig.join('、')}`);
      if (hasName(b, '天馬') && inSfName(b, '擎羊', '陀羅') && kong) push('馬落空亡', b);

      const jiHere = has(b, (s) => s.h === '忌');
      if (hasName(b, '廉貞') && hasName(b, '天相') && hasName(b, '擎羊') && jiHere) push('廉相羊', b);
      if (hasName(b, '廉貞') && hasName(b, '七殺') && hasName(b, '擎羊') && jiHere) push('廉殺羊', b);

      if (hasName(b, '天相')) {
        const L = b - 1, R = b + 1;
        const xing = (x) => hasAny(x, ['天梁', '天刑']);
        const ji2 = (x) => has(x, (s) => s.h === '忌' || s.n === '陀羅');
        const cai = (x) => has(x, (s) => s.h === '祿' || s.n === '祿存');
        const yin = (x) => hasName(x, '天梁');
        if ((xing(L) && ji2(R)) || (xing(R) && ji2(L))) push('刑忌夾印', b);
        if ((cai(L) && yin(R)) || (cai(R) && yin(L))) push('財蔭夾印', b);
      }

      if (hasName(b, '貪狼')) {
        const f = inSfName(b, '火星'), l = inSfName(b, '鈴星');
        if (f && l) push('火鈴貪', b); else if (f) push('火貪', b); else if (l) push('鈴貪', b);
        const c = inSfName(b, '文昌'), q = inSfName(b, '文曲');
        if (c && q) push('昌曲貪', b); else if (c) push('昌貪', b); else if (q) push('曲貪', b);
        if (hasAny(b, ['擎羊', '陀羅'])) push('風流彩杖', b);
        if (b === 0 || b === 11) push('泛水桃花', b, '本命', inSf(b, (s) => SHA4.includes(s.n)) ? '三方四正有煞，較明顯' : '三方四正目前沒有煞');
        if (hasName(b, '紫微') && inSf(b, (s) => TAOHUA.includes(s.n))) push('桃花犯主', b);
      }
      if (hasName(b, '巨門')) {
        if (inSfName(b, '火星') && inSfName(b, '擎羊')) push('巨火羊', b);
        const n = new Set(); sf(b).forEach((i) => P[i].stars.forEach((s) => SHA4.includes(s.n) && n.add(s.n)));
        if (n.size >= 3) push('巨逢四煞', b, '本命', `見${[...n].join('、')}`);
      }
      if (hasName(b, '破軍') && (b === 0 || b === 11) && inSf(b, (s) => s.n === '文曲' && s.h === '忌')) push('水中作塚', b);
      if (hasName(b, '太陰') && hasAny(b, ['火星', '鈴星'])) push('十惡格', b);
    }

    // ---- 夾忌類：本命一定只有一個化忌，大限／流年的化忌加進來才可能成雙 ----
    const kinds = (jiAt) => {
      const r = [];
      const ji = (x) => jiAt[mod(x, 12)] > 0;
      for (let b = 0; b < 12; b++) {
        const L = b - 1, R = b + 1;
        if (ji(b)) {
          const yt = (hasName(L, '擎羊') && hasName(R, '陀羅')) || (hasName(R, '擎羊') && hasName(L, '陀羅'));
          const hl = (hasName(L, '火星') && hasName(R, '鈴星')) || (hasName(R, '火星') && hasName(L, '鈴星'));
          if (yt) r.push(['羊陀夾忌', b]);
          if (hl) r.push(['火鈴夾忌', b]);
        }
        if (ji(L) && ji(R)) r.push([ji(b) ? '雙忌夾忌' : '雙忌夾', b]);
      }
      return r;
    };
    const base = Array(12).fill(0);
    P.forEach((p, b) => p.stars.forEach((s) => { if (s.h === '忌') base[b]++; }));
    const key = (r) => r[0] + '@' + r[1];
    const baseSet = new Set(kinds(base).map(key));
    kinds(base).forEach(([n, b]) => push(n, b));
    if (layers) {
      [['大限', layers.da], ['流年', layers.nian]].forEach(([label, X]) => {
        if (!X) return;
        const jiAt = base.slice();
        X.hua.forEach((x) => { if (x.h === '忌' && x.idx >= 0) jiAt[x.idx]++; });
        kinds(jiAt).forEach((r) => { if (!baseSet.has(key(r))) push(r[0], r[1], label); });
      });
    }
    return out;
  }

  const api = { detect, BRIEF };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Patterns = api;
})(typeof window !== 'undefined' ? window : globalThis);
