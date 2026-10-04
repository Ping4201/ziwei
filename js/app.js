/* 畫面與互動 */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 無痕模式等情況略過 */ } };
const fmtDate = (t) => new Date(t).toLocaleDateString('zh-TW');
// 第 13 項「晚子」= 23:00–24:00，排盤時視為次日的子時
const HOURS = ['早子 00–01', '丑 01–03', '寅 03–05', '卯 05–07', '辰 07–09', '巳 09–11', '午 11–13', '未 13–15', '申 15–17', '酉 17–19', '戌 19–21', '亥 21–23', '晚子 23–24'];
const hourLabel = (s) => (s.late ? '晚子' : HOURS[s.h].split(' ')[0]);
const hourOption = (s) => (s.late ? 12 : s.h);
// 地支 index → [row, col]
const POS = { 5: [1, 1], 6: [1, 2], 7: [1, 3], 8: [1, 4], 9: [2, 4], 10: [3, 4], 11: [4, 4], 0: [4, 3], 1: [4, 2], 2: [4, 1], 3: [3, 1], 4: [2, 1] };
const SHA = ['擎羊', '陀羅', '火星', '鈴星', '地空', '地劫'];
const PAL = ['命宮', '兄弟', '夫妻', '子女', '財帛', '疾厄', '遷移', '交友', '官祿', '田宅', '福德', '父母'];
const ANHE = [1, 0, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]; // 六合暗合宮：子丑、寅亥、卯戌、辰酉、巳申、午未
const isMain = (n) => Ziwei.MAIN_STARS.includes(n);
const starLabel = (s) => s.n + (s.h ? '化' + s.h : '');

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- 分頁 ---------- */
const loaders = {};
function showTab(name) {
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $$('.panel').forEach((p) => (p.hidden = p.id !== 'tab-' + name));
  if (loaders[name]) Promise.resolve(loaders[name]()).catch((e) => toast(e.message));
  location.hash = name;
}
$('#tabs').addEventListener('click', (e) => e.target.dataset.tab && showTab(e.target.dataset.tab));

/* ---------- 排盤 ---------- */
const cur = { chart: null, caseId: null, sel: null, events: [] };
const view = Object.assign({ da: false, nian: false, year: new Date().getFullYear() }, lsGet('zw-view', {}));
view.year = new Date().getFullYear();
const form = $('#chart-form');
form.hour.innerHTML = HOURS.map((h, i) => `<option value="${i}">${h}</option>`).join('');
form.place.innerHTML = '<option value="">不換算（直接用時間）</option>' +
  Solar.CITIES.map(([n, l]) => `<option value="${l}">${n}（東經 ${l}°）</option>`).join('') +
  '<option value="other">其他地點（手動輸入）</option>';
const syncPlaceFields = () => { $('#place-other').hidden = form.place.value !== 'other'; };
form.place.addEventListener('change', syncPlaceFields);

/** 讀表單，回傳排盤參數。有填「出生時間」就依時間（可換算真太陽時）決定時辰，否則用時辰下拉選單。 */
function resolveBirth() {
  const [y, m, d] = form.date.value.split('-').map(Number);
  const t = form.time.value;
  if (!t) {
    const hv = Number(form.hour.value);
    return { y, m, d, hourBranch: hv === 12 ? 0 : hv, lateZi: hv === 12, birth: null };
  }
  const [hh, mm] = t.split(':').map(Number);
  let tt = { y, m, d, hh, mm, delta: 0 };
  let place = '';
  const other = form.place.value === 'other';
  if (form.place.value) {
    const lon = other ? Number(form.lon.value) : Number(form.place.value);
    if (!Number.isFinite(lon)) throw new Error('請輸入出生地的經度');
    place = other ? `經度 ${lon}°` : form.place.selectedOptions[0].textContent.split('（')[0];
    tt = Solar.convert({ y, m, d, hh, mm, lon, tz: other ? Number(form.tz.value) : 8, dst: form.dst.checked });
  } else if (form.dst.checked) {
    tt = Solar.convert({ y, m, d, hh, mm, dst: true });
  }
  const b = Solar.branchOf(tt.hh);
  return {
    y: tt.y, m: tt.m, d: tt.d, hourBranch: b.branch, lateZi: b.late,
    birth: { clock: `${y}-${m}-${d} ${pad(hh)}:${pad(mm)}`, trueSolar: `${tt.y}-${tt.m}-${tt.d} ${pad(tt.hh)}:${pad(tt.mm)}`, delta: Math.round(tt.delta * 10) / 10, place, dst: form.dst.checked },
  };
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  try {
    const r = resolveBirth();
    cur.chart = Ziwei.buildChart({
      name: form.name.value.trim(), gender: form.gender.value, y: r.y, m: r.m, d: r.d,
      hourBranch: r.hourBranch, lateZi: r.lateZi, leapRule: form.leap.value,
    });
    cur.chart.birth = r.birth;
  } catch (err) {
    return toast(err.message);
  }
  cur.caseId = null; cur.sel = null; cur.events = [];
  $('#case-verdict').value = '未驗證';
  $('#case-note').value = '';
  $('#case-hypo').value = '';
  $('#case-hide').checked = false;
  $('#case-status').textContent = '';
  $('#fix-result').innerHTML = '';
  view.year = Math.max(new Date().getFullYear(), cur.chart.lunar.year);
  renderChart();
  renderEvents();
});

function starHtml(s, borrowed, extra = []) {
  const main = isMain(s.n);
  const cls = (main ? 'star' : 'star minor' + (SHA.includes(s.n) ? ' sha' : '')) + (borrowed ? ' borrow' : '');
  const hua = s.h ? `<span class="hua hua-${s.h}">${s.h}</span>` : '';
  const ex = extra.map((x) => `<span class="hua l-${x.l}">${x.t}</span>`).join('');
  return `<span class="${cls}" data-star="${esc(s.n)}">${esc(s.n)}${hua}${ex}</span>`;
}

function layerData() {
  if (!cur.chart || !(view.da || view.nian)) return null;
  return Layers.compute(cur.chart, view.year);
}

function renderChart() {
  const c = cur.chart;
  $('#chart-wrap').hidden = false;
  const l = c.lunar;
  const lunarText = `${l.year}年${l.leap ? '閏' : ''}${l.month}月${l.day}日`;
  const bi = c.birth;
  $('#chart-summary').innerHTML =
    `<span><b>${esc(c.name || '（未命名）')}</b> ${c.gender === 'M' ? '男' : '女'}</span>` +
    `<span>國曆 ${c.solar.y}-${c.solar.m}-${c.solar.d} ${hourLabel(c.solar)}時${c.solar.late ? '（視為次日）' : ''}</span>` +
    `<span>農曆 ${lunarText}</span><span>${c.yearGanzhi}年</span>` +
    (bi ? `<span class="muted">鐘錶 ${esc(bi.clock)} → 真太陽時 ${esc(bi.trueSolar.split(' ')[1])}${bi.place ? '（' + esc(bi.place) + '，' + (bi.delta >= 0 ? '+' : '') + bi.delta + ' 分）' : ''}${bi.dst ? '，已減日光節約 1 小時' : ''}</span>` : '');

  // 圖層控制
  $('#lay-da').checked = !!view.da;
  $('#lay-nian').checked = !!view.nian;
  const ys = [];
  for (let y = l.year; y <= l.year + 110; y++) ys.push(`<option value="${y}"${y === view.year ? ' selected' : ''}>${y}（${Ziwei.STEMS[(y - 4) % 10]}${Ziwei.BRANCHES[(y - 4) % 12]}・${y - l.year + 1}歲）</option>`);
  $('#lay-year').innerHTML = ys.join('');
  $('#lay-year').disabled = !(view.da || view.nian);

  const L = layerData();
  const sel = cur.sel;
  const rel = sel == null ? {} : { [sel]: 'sel', [(sel + 6) % 12]: 'opp', [(sel + 4) % 12]: 'tri', [(sel + 8) % 12]: 'tri', [ANHE[sel]]: 'an' };
  const cells = c.palaces.map((p, b) => {
    const [r, col] = POS[b];
    // 空宮（沒有主星）：整套借對宮的星，本宮原有的星仍保留
    const empty = !p.stars.some((s) => isMain(s.n));
    const borrowed = empty ? c.palaces[(b + 6) % 12].stars : [];
    const borrowHtml = borrowed.length ? `<span class="borrow-tag">借對宮</span>${borrowed.map((s) => starHtml(s, true)).join('')}` : '';
    const layers = [];
    if (L && view.da && L.da) layers.push({ k: 'da', X: L.da });
    if (L && view.nian) layers.push({ k: 'nian', X: L.nian });
    const extraFor = (s) => layers.flatMap(({ k, X }) => X.hua.filter((x) => x.idx === b && x.star === s.n).map((x) => ({ l: k, t: (k === 'da' ? '大化' : '年化') + x.h })));
    const lyrTags = layers.flatMap(({ k, X }) => X.stars[b].map((t) => `<span class="lt ${k}">${t}</span>`)).join('');
    const lyrNames = layers.map(({ k, X }) => `<span class="ln ${k}">${X.names[b]}</span>`).join('');
    const cls = ['cell', p.name === '命宮' ? 'ming' : '', rel[b] || ''].filter(Boolean).join(' ');
    return `<div class="${cls}" data-b="${b}" style="grid-row:${r};grid-column:${col}">
      ${p.note ? '<i class="note-dot" title="有備註"></i>' : ''}
      <div class="stars">${p.stars.map((s) => starHtml(s, false, extraFor(s))).join('')}${borrowHtml}</div>
      ${lyrTags ? `<div class="lyr">${lyrTags}</div>` : ''}
      <div class="foot"><div class="pn"><span class="pname">${p.name}${p.isShen ? '·身' : ''}</span><span class="gz">${p.stem}${p.branch}</span></div>${lyrNames ? `<div class="lns">${lyrNames}</div>` : ''}<div class="dx">${p.daxian[0]}–${p.daxian[1]}</div></div>
    </div>`;
  });
  const laySum = L ? `<div class="lay-sum">${view.da ? (L.da ? `<div class="da">大限 ${L.da.range[0]}–${L.da.range[1]} 歲 ${L.da.ganzhi}限</div>` : '<div class="muted">尚未起大限</div>') : ''}${view.nian ? `<div class="nian">流年 ${L.year} ${L.nian.ganzhi}（${L.age}歲）</div>` : ''}</div>` : '';
  const center = `<div class="center" style="grid-row:2/4;grid-column:2/4">
    <div class="big">${esc(c.name || '命盤')}</div>
    <div>${c.gender === 'M' ? '男' : '女'}　${c.juName}</div>
    <div class="muted">命主 ${c.mingZhu}　身主 ${c.shenZhu}</div>
    <div class="sihua">${c.sihua.map((x) => `<span class="hua hua-${x.slice(-1)}">${x}</span>`).join('')}</div>
    ${laySum}
  </div>`;
  $('#chart-grid').innerHTML = cells.join('') + center;
  renderPanel();
}

function setView(patch) {
  Object.assign(view, patch);
  lsSet('zw-view', { da: view.da, nian: view.nian });
  if (cur.chart) renderChart();
}
$('#lay-da').addEventListener('change', (e) => setView({ da: e.target.checked }));
$('#lay-nian').addEventListener('change', (e) => setView({ nian: e.target.checked }));
$('#lay-year').addEventListener('change', (e) => setView({ year: Number(e.target.value) }));
$('#lay-prev').addEventListener('click', () => setView({ year: Math.max(cur.chart.lunar.year, view.year - 1) }));
$('#lay-next').addEventListener('click', () => setView({ year: view.year + 1 }));

$('#chart-grid').addEventListener('click', (e) => {
  const cell = e.target.closest('.cell');
  const b = cell ? Number(cell.dataset.b) : null;
  const star = e.target.closest('[data-star]');
  if (star) { cur.sel = b; renderChart(); return showStarInfo(star.dataset.star, b); }
  if (cell) { cur.sel = cur.sel === b ? null : b; $('#star-info').hidden = true; renderChart(); }
});

/* ---------- 點宮位／點星：顯示速查說明 ---------- */
/** 從條目內文挑出「某宮」那一行。主星寫「命宮：…」，雙星寫「在命宮：…」。 */
function palaceLine(body, pal) {
  if (!body) return '';
  const re = new RegExp('^在?' + pal + '宮?[^：\\n]{0,8}：(.*)$');
  for (const l of body.split('\n')) { const m = l.match(re); if (m) return m[1]; }
  return '';
}
async function termMap() {
  return new Map((await getAllTerms()).map((t) => [t.name, t]));
}
const sfText = (c, b) => {
  const p = c.palaces[b];
  const shown = p.stars.filter((s) => !isMain(s.n) || s.h).map(starLabel);
  return `${p.name}：${shown.join(' ') || '（無）'}${p.stars.some((s) => isMain(s.n)) ? '' : '〔空宮，借對宮〕'}`;
};

async function renderPanel() {
  const box = $('#palace-panel');
  if (cur.sel == null || !cur.chart) { box.hidden = true; return; }
  const c = cur.chart, b = cur.sel, p = c.palaces[b];
  const T = await termMap();
  if (cur.sel !== b) return;
  const opp = (b + 6) % 12, tri = [(b + 4) % 12, (b + 8) % 12], an = ANHE[b];
  const notes = [];
  const mains = p.stars.filter((s) => isMain(s.n)).map((s) => s.n);
  if (mains.length === 2) {
    const t = T.get(mains[0] + mains[1]) || T.get(mains[1] + mains[0]);
    const line = t && palaceLine(t.body, p.name);
    if (line) notes.push([`雙星 ${t.name}`, line]);
  }
  for (const s of p.stars) {
    const t = T.get(s.n);
    const line = t && palaceLine(t.body, p.name);
    if (line) notes.push([s.n, line]);
    if (s.h) {
      const th = T.get('化' + s.h);
      const l2 = th && palaceLine(th.body, p.name);
      if (l2) notes.push([`${s.n}化${s.h}`, l2]);
    }
  }
  const four = [b, opp, ...tri];
  const xiang = four.filter((i) => c.palaces[i].stars.some((s) => s.n === '天相')).map((i) => {
    const l = (i + 11) % 12, r = (i + 1) % 12;
    return `天相在${c.palaces[i].name}：吸左右宮 → ${sfText(c, l)}｜${sfText(c, r)}`;
  });
  const L = layerData();
  const lay = [];
  if (L && view.da && L.da) lay.push(`<span class="ln da">${L.da.names[b]}</span> ${L.da.stars[b].map((t) => `<span class="lt da">${t}</span>`).join('')}`);
  if (L && view.nian) lay.push(`<span class="ln nian">${L.nian.names[b]}</span> ${L.nian.stars[b].map((t) => `<span class="lt nian">${t}</span>`).join('')}`);
  box.hidden = false;
  box.innerHTML = `
    <div class="pp-head"><h3>${p.name}（${p.stem}${p.branch}）${p.isShen ? '・身宮' : ''}</h3><button class="ghost" id="btn-edit-palace">編輯這一宮</button></div>
    ${lay.length ? `<div class="pp-lay">${lay.join('　')}</div>` : ''}
    <div class="pp-sf"><b>三方四正</b>（只看輔煞星與有四化的主星）<ul>
      <li>本宮　${esc(sfText(c, b))}</li><li>對宮　${esc(sfText(c, opp))}</li>
      <li>三合　${esc(sfText(c, tri[0]))}</li><li>三合　${esc(sfText(c, tri[1]))}</li>
      <li class="muted">暗合　${esc(sfText(c, an))}</li></ul></div>
    ${xiang.length ? `<div class="pp-note">${xiang.map(esc).join('<br>')}</div>` : ''}
    <div class="pp-stars">${notes.length ? notes.map(([k, v]) => `<div class="pp-line"><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('') : '<p class="muted">這宮沒有對應的速查說明。</p>'}</div>
    ${p.note ? `<div class="pp-line"><b>備註</b><span>${esc(p.note)}</span></div>` : ''}`;
}
$('#palace-panel').addEventListener('click', (e) => { if (e.target.id === 'btn-edit-palace') editPalace(cur.sel); });

async function showStarInfo(name, b) {
  const T = await termMap();
  const t = T.get(name);
  const box = $('#star-info');
  box.hidden = false;
  if (!t) { box.innerHTML = `<h3>${esc(name)}</h3><p class="muted">速查裡還沒有這個術語，可到「速查」頁新增。</p>`; return; }
  const p = b != null ? cur.chart.palaces[b] : null;
  const line = p ? palaceLine(t.body, p.name) : '';
  let extra = '';
  const s = p && p.stars.find((x) => x.n === name);
  if (s && s.h) {
    const th = T.get('化' + s.h);
    const ys = cur.chart.yearGanzhi[0];
    const yt = T.get(ys + '年四化');
    let yblock = '';
    if (yt) {
      const blocks = yt.body.split(/\n(?=■ |【化忌解方)/);
      yblock = blocks.filter((x) => x.startsWith('■ ' + name + '化' + s.h) || (s.h === '忌' && x.startsWith('【化忌解方'))).join('\n\n');
    }
    extra = `<div class="si-hua"><b>${esc(name)}化${s.h}</b>${th && p ? `<div>在${p.name}：${esc(palaceLine(th.body, p.name) || '（無逐宮說明）')}</div>` : ''}${yblock ? `<pre>${esc(yblock)}</pre>` : ''}</div>`;
  }
  box.innerHTML = `<h3>${esc(t.name)} <span class="tag">${esc(t.cat)}</span>${t.doubt ? '<span class="tag mine">存疑</span>' : ''}</h3>
    <div class="muted">${esc(t.brief)}</div>
    ${p && line ? `<div class="si-pal"><b>在${p.name}</b>：${esc(line)}</div>` : ''}
    ${extra}
    <details class="mt"><summary>完整內容</summary><p>${esc(t.body)}</p></details>`;
}

const dlgPalace = $('#dlg-palace');
function starsToText(stars) {
  return stars.map((s) => s.n + (s.h ? '化' + s.h : '')).join('、');
}
function textToStars(text) {
  return text.split(/[,，、\s]+/).filter(Boolean).map((t) => {
    const m = t.match(/^(.+?)化([祿權科忌])$/);
    return m ? { n: m[1], h: m[2] } : { n: t, h: '' };
  });
}
function editPalace(b) {
  const p = cur.chart.palaces[b];
  $('#palace-title').textContent = `${p.name}（${p.stem}${p.branch}）`;
  const f = $('#palace-form');
  f.stars.value = starsToText(p.stars);
  f.note.value = p.note || '';
  dlgPalace.returnValue = '';
  dlgPalace.onclose = () => {
    if (dlgPalace.returnValue !== 'ok') return;
    p.stars = textToStars(f.stars.value);
    p.note = f.note.value.trim();
    renderChart();
  };
  dlgPalace.showModal();
}

/* ---------- 比對文墨天機盤 ---------- */
let cmp = null; // { parsed, result }
const starsHtml = (arr) => (arr.length ? arr.map((s) => `<span class="cs">${esc(s)}</span>`).join('') : '<span class="muted">（無）</span>');
function renderCompare() {
  const box = $('#cmp-result');
  const { result } = cmp;
  const diffs = result.rows.filter((r) => r.differs);
  let html = '';
  if (!result.rows.length) {
    html = '<p class="err">看不到任何宮位。請每行以地支（子丑寅…）或宮名（命宮、兄弟…）開頭。</p>';
  } else {
    html += `<p class="cmp-sum ${diffs.length || result.juDiff ? 'bad' : 'good'}">比對了 ${result.rows.length} 個宮位：` +
      (diffs.length || result.juDiff ? `<b>${diffs.length} 個宮位不同</b>` : '<b>全部吻合 ✓</b>') + '</p>';
    if (result.juDiff) {
      html += `<p class="err">五行局不同：系統 ${esc(result.juDiff.system)}／文墨 ${esc(result.juDiff.wenmo)}。這代表命宮、生日或時辰的判定不同，請先確認出生時間、晚子時、閏月設定，再比對星曜。</p>`;
    }
    html += diffs.map((r) => `
      <label class="cmp-row"><input type="checkbox" data-idx="${r.idx}" checked>
        <div><div class="cmp-h">${esc(r.branch)}宮（${esc(r.palace)}）</div>
          <div class="cmp-line"><b>系統</b>${starsHtml(r.system)}</div>
          <div class="cmp-line"><b>文墨</b>${starsHtml(r.wenmo)}</div>
          <div class="cmp-note">${[r.onlyWm.length ? '文墨多：' + r.onlyWm.join('、') : '', r.onlySys.length ? '系統多：' + r.onlySys.join('、') : '', ...r.huaDiff].filter(Boolean).map(esc).join('｜')}</div>
        </div></label>`).join('');
    html += '<div class="actions mt">' +
      (diffs.length ? '<button type="button" id="btn-cmp-apply" class="primary">套用勾選的宮位</button>' : '') +
      '<button type="button" id="btn-cmp-copy" class="ghost">複製差異報告</button></div>';
  }
  box.innerHTML = html;
}
$('#btn-cmp').addEventListener('click', () => {
  if (!cur.chart) return toast('請先排盤');
  const parsed = Compare.parse($('#cmp-text').value);
  cmp = { parsed, result: Compare.diff(cur.chart, parsed) };
  renderCompare();
});
$('#btn-cmp-clear').addEventListener('click', () => { $('#cmp-text').value = ''; $('#cmp-result').innerHTML = ''; cmp = null; });
$('#cmp-result').addEventListener('click', async (e) => {
  if (!cmp) return;
  if (e.target.id === 'btn-cmp-apply') {
    const picked = new Set($$('#cmp-result input[type=checkbox]:checked').map((c) => Number(c.dataset.idx)));
    let n = 0;
    cmp.result.rows.filter((r) => picked.has(r.idx)).forEach((r) => { Compare.apply(cur.chart, r, cmp.parsed); n++; });
    if (!n) return toast('沒有勾選任何宮位');
    renderChart();
    cmp.result = Compare.diff(cur.chart, cmp.parsed);
    renderCompare();
    toast(`已套用 ${n} 個宮位，記得按「儲存為案例」`);
  }
  if (e.target.id === 'btn-cmp-copy') {
    const text = Compare.report(cur.chart, cmp.result);
    try { await navigator.clipboard.writeText(text); toast('已複製，可貼給 Claude'); }
    catch { prompt('請複製這段文字：', text); }
  }
});

/* ---------- 定盤：並排比較相鄰時辰 ---------- */
/** 以「農曆日＋時辰」為單位找前後時辰：子時視為該農曆日的早子（與晚子視為次日一致）。 */
function neighborCharts() {
  const c = cur.chart, s = c.solar;
  const base = Date.UTC(s.y, s.m - 1, s.d + (s.late ? 1 : 0));
  const out = [];
  for (let k = -2; k <= 2; k++) {
    let t = base, b = s.late ? 0 : s.h;
    // 逐格移動
    const step = k < 0 ? -1 : 1;
    for (let i = 0; i < Math.abs(k); i++) {
      if (step < 0) { if (b === 0) { b = 11; t -= 864e5; } else b -= 1; }
      else if (b === 11) { b = 0; t += 864e5; } else b += 1;
    }
    const D = new Date(t);
    out.push({ k, y: D.getUTCFullYear(), m: D.getUTCMonth() + 1, d: D.getUTCDate(), b });
  }
  return out.map((o) => ({ ...o, chart: Ziwei.buildChart({ name: c.name, gender: c.gender, y: o.y, m: o.m, d: o.d, hourBranch: o.b, lateZi: false, leapRule: c.leapRule }) }));
}
$('#btn-fix').addEventListener('click', () => {
  if (!cur.chart) return toast('請先排盤');
  const list = neighborCharts();
  const row = (label, f) => `<tr><th>${label}</th>${list.map((o) => `<td class="${o.k === 0 ? 'now' : ''}">${f(o.chart, o)}</td>`).join('')}</tr>`;
  const mp = (ch) => ch.palaces.find((p) => p.name === '命宮');
  const main = (p) => p.stars.filter((s) => isMain(s.n)).map(starLabel).join('') || '空宮';
  $('#fix-result').innerHTML = `<div class="tbl-wrap"><table class="fix">
    <tr><th></th>${list.map((o) => `<th class="${o.k === 0 ? 'now' : ''}">${o.k === 0 ? '目前：' : o.k < 0 ? '前' + -o.k + '：' : '後' + o.k + '：'}${o.b === 0 ? '子' : Ziwei.BRANCHES[o.b]}時</th>`).join('')}</tr>
    ${row('命宮', (ch) => `${mp(ch).branch}宮 ${main(mp(ch))}`)}
    ${row('身宮', (ch) => `${ch.palaces.find((p) => p.isShen).branch}宮（${ch.palaces.find((p) => p.isShen).name}）`)}
    ${row('五行局', (ch) => ch.juName)}
    ${row('紫微在', (ch) => ch.palaces.find((p) => p.stars.some((s) => s.n === '紫微')).branch + '宮')}
    ${row('財帛', (ch) => main(ch.palaces.find((p) => p.name === '財帛')))}
    ${row('官祿', (ch) => main(ch.palaces.find((p) => p.name === '官祿')))}
    ${row('夫妻', (ch) => main(ch.palaces.find((p) => p.name === '夫妻')))}
    ${row('', (ch, o) => (o.k === 0 ? '' : `<button class="ghost" data-fixk="${o.k}">改用這個</button>`))}
  </table></div><p class="hint">對照你的經歷（性格、工作、感情、重大事件）看哪一欄最像；事件時間軸也可以幫忙驗證。</p>`;
  cur.fixList = list;
});
$('#fix-result').addEventListener('click', (e) => {
  const k = e.target.dataset.fixk;
  if (k == null) return;
  const o = cur.fixList.find((x) => x.k === Number(k));
  if (!o || !confirm('改用這個時辰重新排盤？目前對這張盤手動修改的星曜會被覆蓋。')) return;
  o.chart.birth = null;
  cur.chart = o.chart; cur.sel = null;
  form.date.value = `${o.y}-${pad(o.m)}-${pad(o.d)}`;
  form.time.value = ''; form.hour.value = o.b;
  renderChart();
  $('#fix-result').innerHTML = '';
  toast('已改用新時辰');
});

/* ---------- 案例紀錄：推論、事件時間軸 ---------- */
function eventYears() {
  const l = cur.chart.lunar.year;
  const arr = [];
  for (let y = new Date().getFullYear() + 3; y >= l; y--) arr.push(`<option value="${y}">${y}（${Ziwei.STEMS[(y - 4) % 10]}${Ziwei.BRANCHES[(y - 4) % 12]}）</option>`);
  return arr.join('');
}
const EV_VERDICT = ['未驗證', '準', '部分準', '不準'];
function renderEvents() {
  const box = $('#ev-list');
  if (!cur.chart) { box.innerHTML = ''; return; }
  $('#ev-year').innerHTML = eventYears();
  const ev = cur.events.slice().sort((a, b) => b.year - a.year);
  const cnt = EV_VERDICT.map((v) => `${v} ${cur.events.filter((e) => e.verdict === v).length}`).join('｜');
  $('#ev-stat').textContent = cur.events.length ? `命中統計：${cnt}` : '';
  box.innerHTML = ev.map((e, i) => `
    <div class="ev"><div class="ev-h"><b>${e.year}</b><select data-evv="${cur.events.indexOf(e)}">${EV_VERDICT.map((v) => `<option${v === e.verdict ? ' selected' : ''}>${v}</option>`).join('')}</select><button class="ghost" data-evd="${cur.events.indexOf(e)}">刪除</button></div>
      <div>${esc(e.text)}</div>
      <details><summary class="muted">這年的大限、流年</summary><div class="muted">${esc(Layers.summary(cur.chart, e.year))}</div></details></div>`).join('');
}
$('#btn-ev-add').addEventListener('click', () => {
  const text = $('#ev-text').value.trim();
  if (!cur.chart || !text) return toast('請輸入事件內容');
  cur.events.push({ year: Number($('#ev-year').value), text, verdict: $('#ev-verdict').value });
  $('#ev-text').value = '';
  renderEvents();
});
$('#ev-list').addEventListener('click', (e) => {
  if (e.target.dataset.evd != null) { cur.events.splice(Number(e.target.dataset.evd), 1); renderEvents(); }
});
$('#ev-list').addEventListener('change', (e) => {
  if (e.target.dataset.evv != null) { cur.events[Number(e.target.dataset.evv)].verdict = e.target.value; renderEvents(); }
});

$('#btn-save-case').addEventListener('click', async () => {
  if (!cur.chart) return;
  const item = {
    id: cur.caseId || undefined,
    chart: cur.chart,
    verdict: $('#case-verdict').value,
    note: $('#case-note').value,
    hypo: $('#case-hypo').value,
    hideBirth: $('#case-hide').checked,
    events: cur.events,
  };
  const saved = await Store.save('cases', item);
  cur.caseId = saved.id;
  $('#case-status').textContent = '已儲存 ' + new Date().toLocaleTimeString('zh-TW');
  toast('案例已儲存');
});

/* ---------- 案例 ---------- */
async function renderCases() {
  const q = $('#case-search').value.trim().toLowerCase();
  const all = (await Store.list('cases')).filter((c) =>
    !q || (c.chart.name + c.note + c.verdict + (c.hypo || '') + (c.events || []).map((e) => e.text).join('')).toLowerCase().includes(q));
  $('#case-list').innerHTML = all.length ? all.map((c) => {
    const ch = c.chart;
    const mp = ch.palaces.find((p) => p.name === '命宮');
    const main = mp.stars.filter((s) => isMain(s.n)).map((s) => s.n).join('') || '命無主星';
    const ev = c.events || [];
    const hit = ev.length ? `｜事件 ${ev.length}：準 ${ev.filter((e) => e.verdict === '準').length} 部分 ${ev.filter((e) => e.verdict === '部分準').length} 不準 ${ev.filter((e) => e.verdict === '不準').length}` : '';
    const birth = c.hideBirth ? '生日已隱藏' : `${ch.solar.y}-${ch.solar.m}-${ch.solar.d}`;
    return `<div class="item" data-id="${c.id}">
      <div><div class="t">${esc(ch.name || '（未命名）')} <span class="tag">${esc(c.verdict)}</span></div>
      <div class="s">${birth}｜${ch.juName}｜命宮 ${esc(main)}｜${fmtDate(c.updated)}${hit}</div>
      <div class="s">${esc((c.note || c.hypo || '').slice(0, 60))}</div></div>
      <button class="danger" data-del="${c.id}">刪除</button></div>`;
  }).join('') : '<p class="muted">還沒有案例。到「排盤」排好盤後按「儲存為案例」。</p>';
}
loaders.cases = renderCases;
$('#case-search').addEventListener('input', renderCases);
function openCase(c) {
  cur.chart = c.chart; cur.caseId = c.id; cur.sel = null; cur.events = c.events || [];
  form.name.value = c.chart.name; form.gender.value = c.chart.gender;
  form.date.value = `${c.chart.solar.y}-${pad(c.chart.solar.m)}-${pad(c.chart.solar.d)}`;
  form.hour.value = hourOption(c.chart.solar); form.time.value = '';
  $('#case-verdict').value = c.verdict; $('#case-note').value = c.note || '';
  $('#case-hypo').value = c.hypo || ''; $('#case-hide').checked = !!c.hideBirth;
  $('#case-status').textContent = ''; $('#fix-result').innerHTML = '';
  view.year = Math.max(new Date().getFullYear(), c.chart.lunar.year);
  showTab('chart');
  renderChart();
  renderEvents();
}
$('#case-list').addEventListener('click', async (e) => {
  const del = e.target.dataset.del;
  if (del) {
    if (confirm('確定刪除這個案例？')) { await Store.remove('cases', del); renderCases(); }
    return;
  }
  const item = e.target.closest('.item');
  if (!item) return;
  openCase(await Store.get('cases', item.dataset.id));
});

/* ---------- 筆記 ---------- */
const noteForm = $('#note-form');
let noteId = null;
async function renderNotes() {
  const q = $('#note-search').value.trim().toLowerCase();
  const all = (await Store.list('notes')).filter((n) => !q || (n.title + n.tags + n.body).toLowerCase().includes(q));
  $('#note-list').innerHTML = all.length ? all.map((n) => `
    <div class="item${n.id === noteId ? ' on' : ''}" data-id="${n.id}"><div>
      <div class="t">${esc(n.title)}</div>
      <div class="s">${(n.tags || '').split(/[,，]/).filter(Boolean).map((t) => `<span class="tag">${esc(t.trim())}</span>`).join('')}${fmtDate(n.updated)}</div>
    </div></div>`).join('') : '<p class="muted">沒有符合的筆記。</p>';
}
loaders.notes = renderNotes;
$('#note-search').addEventListener('input', renderNotes);
function openNote(n) {
  noteId = n ? n.id : null;
  noteForm.hidden = false;
  noteForm.title.value = n ? n.title : '';
  noteForm.tags.value = n ? n.tags : '';
  noteForm.body.value = n ? n.body : '';
  renderNotes();
}
$('#btn-new-note').addEventListener('click', () => openNote(null));
$('#note-list').addEventListener('click', async (e) => {
  const item = e.target.closest('.item');
  if (item) openNote(await Store.get('notes', item.dataset.id));
});
noteForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const saved = await Store.save('notes', { id: noteId || undefined, title: noteForm.title.value.trim(), tags: noteForm.tags.value.trim(), body: noteForm.body.value });
  noteId = saved.id;
  renderNotes();
  toast('筆記已儲存');
});
$('#btn-del-note').addEventListener('click', async () => {
  if (!noteId || !confirm('確定刪除這篇筆記？')) return;
  await Store.remove('notes', noteId);
  noteId = null; noteForm.hidden = true; renderNotes();
});

/* ---------- 速查 ---------- */
let termCat = '全部';
let termsCache = null;
const invalidateTerms = () => { termsCache = null; };
/** 內建條目 + 你的修改（override）+ 自訂條目。修改只存在你的私人資料庫，不會進 GitHub。結果會快取，編輯後自動重新讀取。 */
async function getAllTerms() {
  if (termsCache) return termsCache;
  const saved = await Store.list('terms');
  const ov = new Map(saved.filter((t) => t.override).map((t) => [t.name, t]));
  const builtin = BUILTIN_TERMS.map((t) => {
    const o = ov.get(t.name);
    return o ? { ...t, cat: o.cat, brief: o.brief, body: o.body, doubt: !!o.doubt, edited: true, ovId: o.id, builtin: true } : { ...t, builtin: true };
  });
  const custom = saved.filter((t) => !t.override).map((t) => ({ ...t, custom: true }));
  termsCache = builtin.concat(custom);
  return termsCache;
}
const snip = (text, q) => {
  const i = text.toLowerCase().indexOf(q);
  return i < 0 ? text.slice(0, 60) : (i > 20 ? '…' : '') + text.slice(Math.max(0, i - 20), i + 50);
};
async function renderTerms() {
  const all = await getAllTerms();
  const cats = ['全部', ...new Set(all.map((t) => t.cat)), ...(all.some((t) => t.doubt) ? ['存疑'] : [])];
  $('#term-cats').innerHTML = cats.map((c) => `<button class="chip${c === termCat ? ' on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  const q = $('#term-search').value.trim().toLowerCase();
  const rows = all.filter((t) => (termCat === '全部' || (termCat === '存疑' ? t.doubt : t.cat === termCat)) && (!q || (t.name + t.brief + t.body).toLowerCase().includes(q)));
  $('#term-list').innerHTML = rows.map((t) => {
    const key = esc(t.custom ? t.id : t.name);
    const btns = `<button class="ghost" data-edit="${key}">編輯</button>` +
      (t.custom ? `<button class="ghost" data-del="${key}">刪除</button>` : '') +
      (t.edited ? `<button class="ghost" data-reset="${key}">還原內建</button>` : '');
    return `<div class="term"><h3>${esc(t.name)} <span class="tag">${esc(t.cat)}</span>${t.edited ? '<span class="tag mine">我改過</span>' : ''}${t.doubt ? '<span class="tag doubt">存疑</span>' : ''}</h3>
      <div class="b">${esc(t.brief)}</div><p>${esc(t.body)}</p>
      <div class="actions mt">${btns}</div></div>`;
  }).join('') || '<p class="muted">找不到，試試新增自訂術語。</p>';

  // 全站搜尋：有輸入關鍵字時，一併列出相符的筆記與案例
  const extra = $('#term-extra');
  if (!q) { extra.innerHTML = ''; return; }
  const [notes, cases] = await Promise.all([Store.list('notes'), Store.list('cases')]);
  if ($('#term-search').value.trim().toLowerCase() !== q) return; // 輸入已變動，放棄舊結果
  const nHit = notes.filter((n) => (n.title + n.tags + n.body).toLowerCase().includes(q)).slice(0, 15);
  const cHit = cases.filter((c) => (c.chart.name + c.note + (c.hypo || '') + (c.events || []).map((e) => e.text).join('')).toLowerCase().includes(q)).slice(0, 10);
  extra.innerHTML = (nHit.length ? `<h2 class="mt">相符的筆記（${nHit.length}）</h2><div class="list">${nHit.map((n) => `<div class="item" data-nid="${n.id}"><div><div class="t">${esc(n.title)}</div><div class="s">${esc(snip(n.body, q))}</div></div></div>`).join('')}</div>` : '') +
    (cHit.length ? `<h2 class="mt">相符的案例（${cHit.length}）</h2><div class="list">${cHit.map((c) => `<div class="item" data-cid="${c.id}"><div><div class="t">${esc(c.chart.name || '（未命名）')}</div><div class="s">${esc(snip(c.note + ' ' + (c.hypo || '') + ' ' + (c.events || []).map((e) => e.year + ' ' + e.text).join(' '), q))}</div></div></div>`).join('')}</div>` : '');
}
loaders.terms = renderTerms;
let termTimer;
$('#term-search').addEventListener('input', () => { clearTimeout(termTimer); termTimer = setTimeout(renderTerms, 250); });
$('#term-cats').addEventListener('click', (e) => { if (e.target.dataset.cat) { termCat = e.target.dataset.cat; renderTerms(); } });
$('#term-extra').addEventListener('click', async (e) => {
  const it = e.target.closest('.item');
  if (!it) return;
  if (it.dataset.nid) { showTab('notes'); openNote(await Store.get('notes', it.dataset.nid)); }
  if (it.dataset.cid) openCase(await Store.get('cases', it.dataset.cid));
});
const dlgTerm = $('#dlg-term');
function editTerm(t) {
  const f = $('#term-form');
  f.name.value = t?.name || ''; f.name.readOnly = !!t?.builtin;
  const cat = t?.cat || '自訂';
  if (![...f.cat.options].some((o) => o.value === cat)) f.cat.add(new Option(cat, cat)); // 舊資料裡的其他分類也能選到
  f.cat.value = cat; f.brief.value = t?.brief || ''; f.body.value = t?.body || '';
  f.doubt.checked = !!t?.doubt;
  dlgTerm.returnValue = '';
  dlgTerm.onclose = async () => {
    if (dlgTerm.returnValue !== 'ok') return;
    const item = { name: f.name.value.trim(), cat: f.cat.value.trim() || '自訂', brief: f.brief.value.trim(), body: f.body.value.trim(), doubt: f.doubt.checked };
    if (t?.builtin) Object.assign(item, { id: t.ovId || 'ov-' + item.name, override: true });
    else item.id = t?.id;
    await Store.save('terms', item);
    invalidateTerms(); renderTerms(); toast('已儲存');
  };
  dlgTerm.showModal();
}
$('#btn-new-term').addEventListener('click', () => editTerm(null));
$('#term-list').addEventListener('click', async (e) => {
  const { edit, del, reset } = e.target.dataset;
  if (!edit && !del && !reset) return;
  const all = await getAllTerms();
  const byKey = (k) => all.find((t) => (t.custom ? t.id : t.name) === k);
  if (edit) editTerm(byKey(edit));
  if (del && confirm('確定刪除這個術語？')) { await Store.remove('terms', del); invalidateTerms(); renderTerms(); }
  if (reset && confirm('還原成內建內容？你的修改會被刪除。')) { await Store.remove('terms', byKey(reset).ovId); invalidateTerms(); renderTerms(); }
});

/** 把一段文字附加到某個速查條目底下（內建條目會存成你自己的版本） */
async function appendToTerm(name, text) {
  const all = await getAllTerms();
  const t = all.find((x) => x.name === name);
  if (!t) throw new Error(`找不到速查條目「${name}」`);
  const item = { name: t.name, cat: t.cat, brief: t.brief, body: `${t.body || ''}\n\n【我的筆記 ${new Date().toISOString().slice(0, 10)}】${text}`, doubt: !!t.doubt };
  if (t.builtin) Object.assign(item, { id: t.ovId || 'ov-' + t.name, override: true });
  else item.id = t.id;
  await Store.save('terms', item);
  invalidateTerms();
}
$('#btn-note-to-term').addEventListener('click', async () => {
  const ta = noteForm.body;
  const text = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim() || ta.value.trim();
  if (!text) return toast('這篇筆記沒有內容');
  const name = prompt('要加到哪一個速查條目？請輸入名稱，例如：天機、化忌、官祿、甲年四化\n（有選取文字就只加選取的部分，否則加整篇）', '');
  if (!name) return;
  try { await appendToTerm(name.trim(), text); toast(`已加到「${name.trim()}」`); } catch (err) { toast(err.message); }
});

/* ---------- 複習卡 ---------- */
const dlgQuiz = $('#dlg-quiz');
let quizPool = [], quizCur = null;
async function openQuiz() {
  const all = await getAllTerms();
  quizPool = [];
  for (const t of all) {
    for (const pal of PAL) {
      const line = palaceLine(t.body, pal);
      if (line) quizPool.push({ q: `「${t.name}」（${t.cat}）落在【${pal}】，代表什麼？`, a: line });
    }
    if (/年四化$/.test(t.name)) quizPool.push({ q: `${t.name}：祿、權、科、忌各是哪一顆星？`, a: t.brief });
  }
  if (!quizPool.length) return toast('還沒有可以出題的內容（需要有逐宮說明的條目）');
  nextQuiz();
  dlgQuiz.showModal();
}
function nextQuiz() {
  quizCur = quizPool[Math.floor(Math.random() * quizPool.length)];
  $('#quiz-q').textContent = quizCur.q;
  $('#quiz-a').textContent = quizCur.a;
  $('#quiz-a').hidden = true;
}
$('#btn-quiz').addEventListener('click', openQuiz);
$('#quiz-show').addEventListener('click', () => { $('#quiz-a').hidden = false; });
$('#quiz-next').addEventListener('click', nextQuiz);
$('#quiz-close').addEventListener('click', () => dlgQuiz.close());

/* ---------- 匯入 LINE 文字檔 ---------- */
const DATE_LINE = /^(?:[一二三四五六日週]+[,，]?\s*)?(?:\d{1,2}\/\d{1,2}\/\d{4}|\d{4}[./-]\d{1,2}[./-]\d{1,2}.*)$/;
const MSG_LINE = /^(?:上午|下午)?\s*(\d{1,2}:\d{2})\t([^\t]*)\t(.*)$/;
/** 解析 LINE 匯出的聊天記錄。keep 為空陣列時保留所有發言者。 */
function parseLine(text, keep, clean) {
  const out = [];
  let date = '', lastDate = '', on = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^"|"$/g, '');
    const m = raw.match(MSG_LINE);
    if (m) {
      const who = m[2].trim();
      on = !!who && (!keep.length || keep.some((k) => who.includes(k)));
      if (!on) continue;
      if (date && date !== lastDate) { out.push('', '## ' + date); lastDate = date; }
      out.push(clean ? m[3].replace(/^"/, '') : `[${m[1]}] ${who}：${m[3]}`);
    } else if (DATE_LINE.test(raw.trim()) && raw.trim().length < 30) {
      date = raw.trim(); on = false;
    } else if (on && line.trim()) {
      out.push(line);
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
$('#file-line').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  if (!files.length) return;
  const keep = $('#line-who').value.split(/[,，、\s]+/).filter(Boolean);
  const clean = $('#line-clean').checked;
  const result = $('#line-result');
  result.textContent = '';
  try {
    const existing = await Store.list('notes');
    for (const f of files) {
      const body = parseLine(await f.text(), keep, clean);
      if (!body) { result.textContent += `「${f.name}」沒有符合條件的發言（請檢查發言者名稱）\n`; continue; }
      const title = f.name.replace(/\.(txt|md)$/i, '');
      const old = existing.find((n) => n.title === title && /LINE匯入/.test(n.tags || ''));
      await Store.save('notes', old ? { ...old, body } : { title, tags: 'LINE匯入', body });
      result.textContent += `${old ? '已更新' : '已匯入'}「${title}」：${body.split('\n').length} 行\n`;
    }
    toast('完成');
  } catch (err) { result.textContent += '失敗：' + err.message; }
  e.target.value = '';
});

/* ---------- 備份 ---------- */
async function doExport() {
  const blob = new Blob([JSON.stringify(await Store.exportAll(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ziwei-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  lsSet('zw-last-backup', Date.now());
  $('#banner').hidden = true;
  toast('備份已下載');
}
$('#btn-export').addEventListener('click', doExport);
/** 超過 7 天沒備份就提醒（按「稍後」會 3 天內不再提醒） */
function checkBackup() {
  if (lsGet('zw-banner-snooze', 0) > Date.now()) return;
  const last = lsGet('zw-last-backup', 0);
  const days = last ? Math.floor((Date.now() - last) / 864e5) : null;
  if (days === null || days >= 7) {
    $('#banner-text').textContent = days === null ? '你還沒有備份過資料。' : `已 ${days} 天沒有備份。`;
    $('#banner').hidden = false;
  }
}
$('#banner-go').addEventListener('click', doExport);
$('#banner-x').addEventListener('click', () => { lsSet('zw-banner-snooze', Date.now() + 3 * 864e5); $('#banner').hidden = true; });
$('#file-import').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const n = await Store.importAll(JSON.parse(await f.text()));
    toast(`已匯入 ${n} 筆`);
    showTab(location.hash.slice(1) || 'chart');
  } catch (err) { toast(err.message); }
  e.target.value = '';
});

/* ---------- 快速筆記（上課用） ---------- */
const dlgQuick = $('#dlg-quick');
const quickForm = $('#quick-form');

/* 章節目錄存在私人資料庫（meta / chapters），下拉選單才會對應到課程單元；
   讀不到時只剩「其他」可手動輸入。 */
const OTHER = '__other';
let chapterGroups = null; // [{ch, title, units:[{no,name}]}]
async function loadChapters() {
  if (chapterGroups) return chapterGroups;
  const item = await Store.get('meta', 'chapters').catch(() => null);
  chapterGroups = (item && item.list) || [];
  return chapterGroups;
}
const unitValue = (g, u) => `${g.ch}-${u.no.split('-')[1]} ${u.name}`; // 例：Ch 03-02 紫微星
function buildChapterSelect(selected) {
  const sel = quickForm.chapterSel;
  const groups = chapterGroups || [];
  sel.innerHTML = '<option value="">（請選擇章節）</option>' +
    groups.map((g) => `<optgroup label="${esc(g.ch + ' ' + g.title)}">` +
      g.units.map((u) => { const v = unitValue(g, u); return `<option value="${esc(v)}" data-group="${esc(g.ch + ' ' + g.title)}">${esc(u.no + ' ' + u.name)}</option>`; }).join('') +
      '</optgroup>').join('') +
    `<option value="${OTHER}">其他／自行輸入…</option>`;
  const known = [...sel.options].some((o) => o.value === selected && o.value);
  if (known) { sel.value = selected; quickForm.chapter.hidden = true; quickForm.chapter.value = ''; }
  else if (selected || !groups.length) { sel.value = OTHER; quickForm.chapter.hidden = false; quickForm.chapter.value = selected || ''; }
  else { sel.value = ''; quickForm.chapter.hidden = true; }
  updateQuickHint();
}
const currentChapter = () => (quickForm.chapterSel.value === OTHER ? quickForm.chapter.value.trim() : quickForm.chapterSel.value);
/** 選到課程單元時，顯示對應速查條目的重點，邊看影片邊對照 */
async function updateQuickHint() {
  const box = $('#quick-hint');
  box.innerHTML = '';
  const v = currentChapter();
  if (!v || v === OTHER) return;
  const name = v.replace(/^Ch \d+-\d+\s*/, '');
  const all = await getAllTerms();
  const cand = name.split(/[、，,]/).flatMap((n) => [n.trim(), n.trim().replace(/[星宮]$/, ''), n.trim().replace(/天干四化$/, '年四化')]);
  const hits = [...new Set(cand)].map((n) => all.find((x) => x.name === n)).filter(Boolean).slice(0, 3);
  box.innerHTML = hits.map((x) => `<div class="qh"><b>${esc(x.name)}</b>　${esc(x.brief)}</div>`).join('');
}
quickForm.chapterSel.addEventListener('change', () => {
  const other = quickForm.chapterSel.value === OTHER;
  quickForm.chapter.hidden = !other;
  if (other) quickForm.chapter.focus();
  updateQuickHint();
});
quickForm.chapter.addEventListener('input', updateQuickHint);

async function openQuick() {
  await loadChapters();
  const recent = lsGet('zw-chapters', []);
  const last = (await Store.get('meta', 'progress').catch(() => null))?.chapter || recent[0] || '';
  buildChapterSelect(last);
  quickForm.text.value = lsGet('zw-draft', '');
  dlgQuick.returnValue = '';
  dlgQuick.showModal();
  quickForm.text.focus();
}
dlgQuick.addEventListener('input', () => lsSet('zw-draft', quickForm.text.value)); // 草稿自動保留，不怕誤關
// 按下儲存的當下就先把欄位內容取走（不等視窗關閉事件），避免連續記錄時內容被下一次覆蓋
quickForm.addEventListener('submit', async (e) => {
  if (!e.submitter || e.submitter.value !== 'ok') return;
  const text = quickForm.text.value.trim();
  const chapter = currentChapter() || '未分類';
  const group = quickForm.chapterSel.selectedOptions[0]?.dataset.group;
  if (!text) return;
  const now = new Date();
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const title = `${chapter}｜${day}`;
  const line = `[${pad(now.getHours())}:${pad(now.getMinutes())}] ${text}`;
  try {
    const exist = (await Store.list('notes')).find((n) => n.title === title);
    await Store.save('notes', exist
      ? { ...exist, body: exist.body + '\n\n' + line }
      : { title, tags: ['上課', group, chapter].filter(Boolean).join(', '), body: line });
    await Store.save('meta', { id: 'progress', chapter });
    lsSet('zw-chapters', [chapter, ...lsGet('zw-chapters', []).filter((c) => c !== chapter)].slice(0, 20));
    lsSet('zw-draft', '');
    toast('已記下');
    if (!$('#tab-notes').hidden) renderNotes();
  } catch (err) { toast('儲存失敗，草稿仍保留：' + err.message); }
});
$('#fab').addEventListener('click', openQuick);
$('#nav-note').addEventListener('click', openQuick);

/* ---------- 登入／啟動 ---------- */
window.addEventListener('unhandledrejection', (e) => toast(e.reason?.message || '發生錯誤'));
const loginEl = $('#login');
function showLogin(msg) {
  $('#banner').hidden = true; $('main').hidden = true; $('#fab').hidden = true; $('#tabs').hidden = true; $('.menu').hidden = true;
  loginEl.hidden = false;
  $('#login-msg').textContent = msg || '';
}
function startApp() {
  loginEl.hidden = true;
  $('main').hidden = false; $('#fab').hidden = false; $('#tabs').hidden = false; $('.menu').hidden = false;
  const h = location.hash.slice(1);
  showTab(['chart', 'cases', 'notes', 'terms', 'import'].includes(h) ? h : 'chart');
  checkBackup();
}
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  $('#login-msg').textContent = '登入中…';
  try { await Store.signIn(f.email.value.trim(), f.password.value); f.password.value = ''; startApp(); }
  catch (err) { $('#login-msg').textContent = err.message; }
});
const dlgPassword = $('#dlg-password');
const passwordForm = $('#password-form');
$('#btn-password').addEventListener('click', () => {
  $('.menu').open = false;
  passwordForm.reset();
  $('#password-msg').textContent = '';
  dlgPassword.showModal();
});
$('#btn-password-cancel').addEventListener('click', () => dlgPassword.close());
passwordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = passwordForm;
  const msg = $('#password-msg');
  if (f.next.value !== f.again.value) { msg.textContent = '兩次輸入的新密碼不一致'; return; }
  if (f.next.value === f.current.value) { msg.textContent = '新密碼不能與目前的密碼相同'; return; }
  msg.textContent = '更新中…';
  try {
    await Store.changePassword(f.current.value, f.next.value);
    f.reset();
    dlgPassword.close();
    toast('密碼已更新');
  } catch (err) { msg.textContent = err.message; }
});
$('#btn-logout').addEventListener('click', async () => { await Store.signOut(); cur.chart = null; location.hash = ''; location.reload(); });

(async () => {
  try {
    if (await Store.session()) startApp(); else showLogin();
    Store.onAuth((s) => { if (!s) showLogin(); });
  } catch (err) { showLogin(err.message); }
})();

