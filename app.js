// ===== 数据整理 =====
const ALL_LESSONS = [...LESSONS, ...HB_LESSONS];
const normZh = s => s.replace(/／/g, '/').replace(/\s+/g, '');

const WORDS = (() => {
  const map = new Map();
  const add = (ko, zh, lesson) => {
    if (!map.has(ko)) map.set(ko, { id: 'w:' + ko, type: 'word', ko, zhList: [], lessons: [] });
    const w = map.get(ko);
    if (!w.zhList.some(z => normZh(z) === normZh(zh))) w.zhList.push(zh);
    if (!w.lessons.includes(lesson)) w.lessons.push(lesson);
  };
  RAW_WORDS.forEach(([ko, zh, lesson]) => add(ko, zh, lesson));
  // 手册词汇：已有的词只补充出处，新词才加入释义
  const known = new Set(map.keys());
  HB_WORDS.forEach(([ko, zh, lesson]) => {
    if (known.has(ko)) { const w = map.get(ko); if (!w.lessons.includes(lesson)) w.lessons.push(lesson); }
    else add(ko, zh, lesson);
  });
  return [...map.values()].map(w => ({ ...w, zh: w.zhList.join('；') }));
})();

const SENTENCES = (() => {
  const seen = new Set();
  return [...RAW_SENTENCES, ...HB_SENTENCES].filter(s => !seen.has(s.ko) && seen.add(s.ko)).map(s => {
    const chunks = s.ko.split(' ');
    if (chunks.length !== s.g.length) console.warn('逐词翻译数量不一致：', s.ko);
    return { ...s, id: 's:' + s.ko, type: 'sentence', chunks, lessons: s.lessons || [s.src.slice(0, 5)] };
  });
})();

const ITEMS = new Map([...WORDS, ...SENTENCES].map(x => [x.id, x]));

// ===== 罗马音（国语罗马字，含连音、鼻音化、送气化等常见音变）=====
const INI = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const INI_R = { 'ㄱ':'g','ㄲ':'kk','ㄴ':'n','ㄷ':'d','ㄸ':'tt','ㄹ':'r','ㅁ':'m','ㅂ':'b','ㅃ':'pp','ㅅ':'s','ㅆ':'ss','ㅇ':'','ㅈ':'j','ㅉ':'jj','ㅊ':'ch','ㅋ':'k','ㅌ':'t','ㅍ':'p','ㅎ':'h' };
const VOW_R = ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i'];
const FIN = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const SPLIT = { 'ㄳ':['ㄱ','ㅅ'],'ㄵ':['ㄴ','ㅈ'],'ㄶ':['ㄴ','ㅎ'],'ㄺ':['ㄹ','ㄱ'],'ㄻ':['ㄹ','ㅁ'],'ㄼ':['ㄹ','ㅂ'],'ㄽ':['ㄹ','ㅅ'],'ㄾ':['ㄹ','ㅌ'],'ㄿ':['ㄹ','ㅍ'],'ㅀ':['ㄹ','ㅎ'],'ㅄ':['ㅂ','ㅅ'] };
const REP = { 'ㄱ':'k','ㄲ':'k','ㅋ':'k','ㄳ':'k','ㄺ':'k','ㄴ':'n','ㄵ':'n','ㄶ':'n','ㄷ':'t','ㅅ':'t','ㅆ':'t','ㅈ':'t','ㅊ':'t','ㅌ':'t','ㅎ':'t',
  'ㄹ':'l','ㄼ':'l','ㄽ':'l','ㄾ':'l','ㅀ':'l','ㅁ':'m','ㄻ':'m','ㅂ':'p','ㅍ':'p','ㅄ':'p','ㄿ':'p','ㅇ':'ng' };
const ASP = { 'ㄱ':'ㅋ','ㄷ':'ㅌ','ㅂ':'ㅍ','ㅈ':'ㅊ' };

function romanizeWord(word) {
  const syl = [];
  for (const ch of word) {
    const c = ch.charCodeAt(0) - 0xAC00;
    if (c < 0 || c > 11171) { syl.push({ raw: ch }); continue; }
    syl.push({ i: INI[Math.floor(c / 588)], v: Math.floor((c % 588) / 28), f: FIN[c % 28], ch });
  }
  // 音变：处理相邻两个音节
  for (let k = 0; k < syl.length - 1; k++) {
    const a = syl[k], b = syl[k + 1];
    if (a.raw || b.raw || !a.f) continue;
    if (b.i === 'ㅇ' && a.f !== 'ㅇ') {               // 连音
      if (a.f === 'ㅎ') a.f = '';
      else if (SPLIT[a.f]) { const [x, y] = SPLIT[a.f]; a.f = x; b.i = y === 'ㅎ' ? 'ㅇ' : y; }
      else { b.i = a.f; a.f = ''; }
    } else if (b.i === 'ㅎ' && !SPLIT[a.f] && ['k', 't', 'p'].includes(REP[a.f])) { // 送气化
      b.i = { k: 'ㅋ', t: 'ㅌ', p: 'ㅍ' }[REP[a.f]]; a.f = '';
    } else if (['ㅎ','ㄶ','ㅀ'].includes(a.f) && ASP[b.i]) { // 하얗다 → 하야타
      b.i = ASP[b.i]; a.f = a.f === 'ㅎ' ? '' : SPLIT[a.f][0];
    }
  }
  let out = '';
  syl.forEach((s, k) => {
    if (s.raw) { out += s.raw; return; }
    const prev = syl[k - 1];
    const prevRep = prev && !prev.raw && prev.f ? (prev.ch === '밟' ? 'p' : REP[prev.f]) : '';
    let ini = INI_R[s.i];
    if (s.i === 'ㄹ') ini = prevRep === 'l' || prevRep === 'n' ? 'l' : prevRep ? 'n' : 'r';
    if (s.i === 'ㄴ' && prevRep === 'l') ini = 'l';                    // 설날 → seollal
    out += ini + VOW_R[s.v];
    if (!s.f) return;
    let rep = s.ch === '밟' ? 'p' : REP[s.f];
    const next = syl[k + 1];
    if (next && !next.raw) {
      if (['ㄴ','ㅁ'].includes(next.i)) rep = { k: 'ng', t: 'n', p: 'm' }[rep] || rep; // 鼻音化
      else if (next.i === 'ㄹ') rep = rep === 'n' ? 'l' : ({ k: 'ng', p: 'm', t: 'n' }[rep] || rep);
    }
    out += rep;
  });
  return out;
}
const romanize = text => text.split(' ').map(romanizeWord).join(' ');

// ===== 本地存储 =====
const store = {
  get(key, def) { try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; } },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
};
let wrongBook = store.get('kr_wrong', {});   // id -> { count, time }
let vocabBook = store.get('kr_vocab', []);   // [id]
let marks = store.get('kr_marks', {});       // sentenceId -> [chunk index]

function addWrong(id) {
  const e = wrongBook[id] || { count: 0 };
  wrongBook[id] = { count: e.count + 1, time: Date.now() };
  store.set('kr_wrong', wrongBook); updateBadges();
  toast(e.count ? '错题本：再次标记 +1' : '已加入错题本');
}
function removeWrong(id) { delete wrongBook[id]; store.set('kr_wrong', wrongBook); updateBadges(); }
function toggleVocab(id) {
  const i = vocabBook.indexOf(id);
  if (i >= 0) { vocabBook.splice(i, 1); toast('已从生词本移出'); }
  else { vocabBook.push(id); toast('已加入生词本'); }
  store.set('kr_vocab', vocabBook); updateBadges();
}
function toggleMark(sid, idx) {
  const list = marks[sid] || [];
  const i = list.indexOf(idx);
  i >= 0 ? list.splice(i, 1) : list.push(idx);
  marks[sid] = list; store.set('kr_marks', marks);
}

// ===== 发音（浏览器内置韩语语音）=====
let koVoice = null;
function loadVoice() { koVoice = speechSynthesis.getVoices().find(v => v.lang.replace('_', '-').startsWith('ko')) || null; }
if ('speechSynthesis' in window) { loadVoice(); speechSynthesis.onvoiceschanged = loadVoice; }
function speak(text) {
  if (!('speechSynthesis' in window)) return toast('当前浏览器不支持语音播放');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR'; u.rate = 0.85;
  if (koVoice) u.voice = koVoice;
  speechSynthesis.speak(u);
}

// ===== 工具函数 =====
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let toastTimer;
// action：可选的 { label, fn }，在提示里放一个按钮（如「撤销」），提示停留 5 秒
function toast(msg, action) {
  const t = $('#toast');
  t.textContent = msg;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'toast-action'; b.textContent = action.label;
    b.onclick = () => { t.classList.remove('show'); action.fn(); };
    t.append(b);
  }
  t.classList.toggle('has-action', !!action);
  t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), action ? 5000 : 1400);
}
function updateBadges() {
  $('#dueCount').textContent = dueItems().length;
  $('#wrongCount').textContent = Object.keys(wrongBook).length;
  $('#vocabCount').textContent = vocabBook.length;
}
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// 查找包含某个单词的例句
const PARTICLES = ['', '은', '는', '이', '가', '을', '를', '의', '도', ','];
function findExamples(word) {
  const keys = [word.ko, ...(WORD_FORMS[word.ko] || [])];
  if (word.ko.endsWith('다') && word.ko.length >= 3) keys.push(word.ko.slice(0, -1));
  return SENTENCES.filter(s => keys.some(key => key.length >= 2
    ? s.ko.includes(key)
    : s.chunks.some(c => PARTICLES.some(p => c.replace(/[.?!]/g, '') === key + p))));
}

// ===== 公共渲染片段 =====
function glossHTML(s, markable = true) {
  const m = marks[s.id] || [];
  return `<div class="gloss">${s.chunks.map((c, i) => `
    <span class="chunk${m.includes(i) ? ' marked' : ''}"${markable ? ` data-act="mark" data-id="${esc(s.id)}" data-i="${i}"` : ''}>
      <span class="k">${esc(c)}</span><span class="z">${esc(s.g[i])}</span>
    </span>`).join('')}</div>`;
}
const playBtn = text => `<button class="icon-btn" title="播放发音" data-act="speak" data-text="${esc(text)}">▶</button>`;
const vocabBtn = id => `<button class="icon-btn${vocabBook.includes(id) ? ' on' : ''}" title="加入/移出生词本" data-act="vocab" data-id="${esc(id)}">+</button>`;

const zhHTML = s => esc(s.zh) + (s.auto ? ' <span class="hint">（手册无整句译文，由逐词释义拼接）</span>' : '');

// 在按出处分组的列表里不再重复出处，只显示说话人
function sentenceHTML(s, showSrc = true) {
  const label = [showSrc && s.src, s.sp].filter(Boolean).map(esc).join(' · ');
  return `<div class="sent-item">
    <div class="sent-head"><span>${label}</span>
      <span>${playBtn(s.ko)} ${vocabBtn(s.id)}</span></div>
    ${glossHTML(s)}
    <div class="sent-zh">${zhHTML(s)}</div>
  </div>`;
}

function wordCardHTML(w) {
  const ex = findExamples(w).slice(0, 6);
  return `<div class="word-card">
    <div class="wc-top"><span class="wc-ko">${esc(w.ko)}</span>
      <span class="wc-actions">${playBtn(w.ko)}${vocabBtn(w.id)}</span></div>
    <div class="wc-rom">[${esc(romanize(w.ko))}]</div>
    <div class="wc-zh">${esc(w.zh)}</div>
    <div class="wc-meta">出自课件：${w.lessons.join('、')}</div>
    <div class="wc-gap"></div>
    <div class="wc-dash"></div>
    <div class="wc-ex-title">例句</div>
    ${ex.length ? ex.map(s => `<div class="wc-ex">${glossHTML(s)}<div class="sent-zh">${zhHTML(s)} ${playBtn(s.ko)}</div></div>`).join('')
      : '<div class="hint">课件中暂无包含该词的例句</div>'}
    ${dictExamplesHTML(dictLookup(w.ko)?.[2] || [])}
  </div>`;
}

// ===== FSRS 复习排期（ts-fsrs 6.0.0，MIT，见 vendor/）=====
// 每张卡片按「重来 / 困难 / 良好 / 简单」评分，算法给出下次复习时间；记录存在 kr_srs。
const scheduler = window.FSRS ? FSRS.fsrs({ enable_fuzz: true }) : null;
let srs = store.get('kr_srs', {});
function dueItems(now = new Date()) {
  return Object.entries(srs).filter(([id, c]) => ITEMS.has(id) && new Date(c.due) <= now)
    .sort((a, b) => new Date(a[1].due) - new Date(b[1].due)).map(([id]) => ITEMS.get(id));
}
const previewRatings = id => { const now = new Date(); return scheduler.repeat(srs[id] || FSRS.createEmptyCard(now), now); };
function rateCard(id, grade) {
  srs[id] = previewRatings(id)[grade].card;
  store.set('kr_srs', srs); updateBadges();
}
function fmtInterval(due) {
  const min = Math.round((new Date(due) - Date.now()) / 60000);
  if (min < 60) return Math.max(1, min) + ' 分钟';
  const h = Math.round(min / 60);
  if (h < 24) return h + ' 小时';
  const d = Math.round(h / 24);
  return d < 31 ? d + ' 天' : d < 365 ? Math.round(d / 30) + ' 个月' : (d / 365).toFixed(1) + ' 年';
}
const RATINGS = [[1, '重来', 'bad'], [2, '困难', ''], [3, '良好', 'good'], [4, '简单', '']];
function ratingRowHTML(id) {
  if (!scheduler) return '';
  const p = previewRatings(id);
  return `<div class="rate-row" role="group" aria-label="记得怎么样">${RATINGS.map(([g, label, cls]) =>
    `<button class="btn rate ${cls}" data-act="rate" data-grade="${g}">${label}<small>${fmtInterval(p[g].card.due)}后</small></button>`).join('')}</div>`;
}

// ===== 视图：闪卡复习 =====
const flash = { deck: 'all', queue: [], pos: 0, flipped: false };

function deckItems(deck) {
  if (deck === 'due') return dueItems();
  if (deck === 'all') return [...ITEMS.values()];
  if (deck === 'words') return WORDS;
  if (deck === 'sentences') return SENTENCES;
  if (deck === 'wrong') return Object.keys(wrongBook).map(id => ITEMS.get(id)).filter(Boolean);
  if (deck === 'vocab') return vocabBook.map(id => ITEMS.get(id)).filter(Boolean);
  const lesson = deck.slice(2);
  return [...ITEMS.values()].filter(x => x.lessons.includes(lesson));
}
function startDeck(deck, doShuffle = false) {
  flash.deck = deck;
  flash.queue = doShuffle ? shuffle(deckItems(deck)) : deckItems(deck);
  flash.pos = 0; flash.flipped = false;
  showView('flash');
}

function renderFlash() {
  const opts = [['due', `今日待复习（${dueItems().length}）`], ['all', '全部（单词+句子）'], ['words', '全部单词'], ['sentences', '全部句子'],
    ...ALL_LESSONS.map(l => ['L:' + l, /^\d/.test(l) ? l + ' 课件' : l]), ['wrong', '错题本'], ['vocab', '生词本']];
  const item = flash.queue[flash.pos];
  let html = pageHead('闪卡复习', '单击正面播放发音，双击卡片加入错题本。翻面后按记忆情况评分，系统安排下次复习。',
    `<select id="deckSel" aria-label="选择复习范围">${opts.map(([v, t]) => `<option value="${v}"${v === flash.deck ? ' selected' : ''}>${t}</option>`).join('')}</select>
     <button class="btn" data-act="shuffle">打乱顺序</button>`);
  if (!item) {
    html += `<div class="empty">${flash.queue.length ? '本轮复习完成！' : flash.deck === 'due' ? '现在没有到期的卡片。可以选一节课件学新卡。' : '这一组还没有卡片'}</div>
      ${flash.queue.length ? '<button class="btn primary" data-act="restart">再来一轮</button>' : ''}`;
    $('#main').innerHTML = html; bindDeckSel(); return;
  }
  const isS = item.type === 'sentence';
  const inWrong = wrongBook[item.id];
  html += `<div class="progress">第 ${flash.pos + 1} / ${flash.queue.length} 张</div>
    <div class="card-wrap"><div id="card" class="card${flash.flipped ? ' flipped' : ''}">
      <div class="face front">
        <span class="tag">${isS ? '句子 · ' + esc(item.src) : '单词 · ' + item.lessons.join('、')}</span>
        ${inWrong ? `<span class="wrong-flag">错题本 ×${inWrong.count}</span>` : ''}
        <div class="big${isS ? ' sent' : ''}">${esc(item.ko)}</div>
        <div class="rom">[${esc(romanize(item.ko))}]</div>
        <span class="tip">单击发音 · 双击加入错题本</span>
      </div>
      <div class="face back">
        <span class="tag">中文</span>
        <div class="big${isS ? ' sent' : ''}">${esc(item.zh)}</div>
        ${isS ? glossHTML(item, false) : ''}
        <span class="tip">单击翻回正面 · 双击加入错题本</span>
      </div>
    </div></div>
    ${ratingRowHTML(item.id)}
    <div class="toolbar card-actions">
      <button class="btn" data-act="prev">上一张</button>
      <button class="btn primary" data-act="flip">翻面</button>
      <button class="btn" data-act="next">跳过</button>
      <span class="spacer"></span>${srs[item.id] ? `<span class="hint">下次复习：${new Date(srs[item.id].due).toLocaleDateString('zh-CN')}</span>` : '<span class="hint">新卡</span>'}
      ${playBtn(item.ko)} ${vocabBtn(item.id)}
    </div>`;
  $('#main').innerHTML = html;
  bindDeckSel();

  // 单击与双击区分：单击延迟执行，第二次点击在 300ms 内算双击（手机上 dblclick 不可靠，自己计时）
  const card = $('#card');
  let clickTimer = null, lastTap = 0;
  card.addEventListener('click', () => {
    clearTimeout(clickTimer);
    const now = Date.now();
    if (now - lastTap < 300) { lastTap = 0; markWrong(); return; }
    lastTap = now;
    clickTimer = setTimeout(() => {
      if (flash.flipped) flipCard(); else speak(item.ko);
    }, 260);
  });
  function markWrong() {
    addWrong(item.id);
    const flag = card.querySelector('.front .wrong-flag');
    const html2 = `错题本 ×${wrongBook[item.id].count}`;
    if (flag) flag.textContent = html2;
    else card.querySelector('.front').insertAdjacentHTML('beforeend', `<span class="wrong-flag">${html2}</span>`);
  }
}
function bindDeckSel() { $('#deckSel').onchange = e => startDeck(e.target.value); }
function flipCard() { flash.flipped = !flash.flipped; $('#card')?.classList.toggle('flipped', flash.flipped); }
function moveCard(step) {
  flash.pos = Math.max(0, Math.min(flash.queue.length, flash.pos + step));
  flash.flipped = false; renderFlash();
}

// ===== 视图：句子 / 单词表 / 错题本 / 生词本 / 搜索 =====
// 页面统一结构：标题与一句说明在左，本页操作在右；内容按分组（组标题 + 数量）往下排
const pageHead = (title, desc, actions = '', count = null) => `<header class="page-head">
  <div><h1>${title}${count !== null ? ` <span class="count">${count}</span>` : ''}</h1>${desc ? `<p>${desc}</p>` : ''}</div>
  ${actions ? `<div class="page-actions">${actions}</div>` : ''}</header>`;
const groupHead = (title, count) => `<div class="group-head"><h2>${esc(title)}</h2><span class="count">${count}</span></div>`;
const lessonSelect = (id, value, lessons) => `<select id="${id}" aria-label="按课件筛选">
  <option value="all">全部课件</option>
  ${lessons.map(l => `<option value="${esc(l)}"${l === value ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

let sentLesson = 'all';
function renderSentences() {
  const list = sentLesson === 'all' ? SENTENCES : SENTENCES.filter(s => s.lessons.includes(sentLesson));
  const groups = {};
  list.forEach(s => (groups[s.src] = groups[s.src] || []).push(s));
  const lessons = ALL_LESSONS.filter(l => SENTENCES.some(s => s.lessons.includes(l)));
  $('#main').innerHTML = pageHead('句子拆分', '每个空格片段下方是对应的中文。点击片段标记重点，再点一次取消。',
    lessonSelect('sentLessonSel', sentLesson, lessons), list.length)
    + Object.entries(groups).map(([src, items]) => `<section class="group">${groupHead(src, items.length)}${items.map(s => sentenceHTML(s, false)).join('')}</section>`).join('');
  $('#sentLessonSel').onchange = e => { sentLesson = e.target.value; renderSentences(); };
}

let wordLesson = 'all';
function renderWords() {
  const list = wordLesson === 'all' ? WORDS : WORDS.filter(w => w.lessons.includes(wordLesson));
  // 全部课件时按每个词第一次出现的课件分组，避免一个词重复出现
  const order = wordLesson === 'all' ? ALL_LESSONS : [wordLesson];
  const groups = order.map(l => [l, list.filter(w => (wordLesson === 'all' ? w.lessons[0] : wordLesson) === l)]).filter(([, ws]) => ws.length);
  $('#main').innerHTML = pageHead('单词表', '点击单词查看发音、释义和例句。', lessonSelect('lessonSel', wordLesson, ALL_LESSONS), list.length)
    + groups.map(([l, ws]) => `<section class="group">${groupHead(/^\d/.test(l) ? l + ' 课件' : l, ws.length)}
      <div class="word-table">${ws.map(w => wordItemHTML(w)).join('')}</div></section>`).join('');
  $('#lessonSel').onchange = e => { wordLesson = e.target.value; renderWords(); };
}
function wordItemHTML(x, extra = '') {
  return `<div class="wt-item" data-act="open" data-id="${esc(x.id)}">
    <div><div class="wt-ko">${esc(x.ko)}</div><div class="wt-zh">${esc(x.zh)}${extra}</div></div>
    <div class="wt-btns">${playBtn(x.ko)}${vocabBtn(x.id)}</div></div>`;
}

function renderBook(kind) {
  const isWrong = kind === 'wrong';
  const ids = isWrong ? Object.keys(wrongBook).sort((a, b) => wrongBook[b].count - wrongBook[a].count) : [...vocabBook];
  const items = ids.map(id => ITEMS.get(id)).filter(Boolean);
  $('#main').innerHTML = pageHead(isWrong ? '错题本' : '生词本',
    isWrong ? '在闪卡上双击即可加入，按标记次数排序。' : '在搜索结果或单词旁点击 + 加入。',
    `<button class="btn primary" data-act="review" data-deck="${kind}"${items.length ? '' : ' disabled'}>复习${isWrong ? '错题本' : '生词本'}</button>`, items.length)
    + (items.length ? `<div class="word-table">${items.map(x => `
      <div class="wt-item" data-act="open" data-id="${esc(x.id)}">
        <div><div class="wt-ko">${esc(x.ko)}</div><div class="wt-zh">${esc(x.zh)}${isWrong ? ` · 错 ${wrongBook[x.id].count} 次` : ''}</div></div>
        <div class="wt-btns">${playBtn(x.ko)}<button class="icon-btn" title="移出" data-act="${isWrong ? 'unwrong' : 'unvocab'}" data-id="${esc(x.id)}">×</button></div>
      </div>`).join('')}</div>` : '<div class="empty">还没有内容</div>');
}

// ===== 维基词典（dict/wiktionary-ko-zh.js，CC BY-SA）：第一次搜索时才加载 =====
let dictState = window.WIKI_DICT ? 'ready' : 'idle';
let dictIndex = null;
function loadDict(done) {
  if (dictState === 'ready') return done();
  if (dictState === 'loading') return;
  dictState = 'loading';
  const s = document.createElement('script');
  s.src = 'dict/wiktionary-ko-zh.js';
  s.onload = () => { dictState = 'ready'; done(); };
  s.onerror = () => { dictState = 'failed'; done(); };
  document.head.appendChild(s);
}
const dictLookup = ko => {
  if (dictState !== 'ready') return null;
  dictIndex = dictIndex || new Map(WIKI_DICT.map(r => [r[0], r]));
  return dictIndex.get(ko) || null;
};
function dictSearch(q) {
  if (dictState !== 'ready') return [];
  const isKo = /[가-힣]/.test(q);
  const hits = WIKI_DICT.filter(([ko, gl]) => !WORDS.some(w => w.ko === ko) && (isKo ? ko.startsWith(q) : gl.some(g => g.includes(q))));
  return hits.sort((a, b) => (b[0] === q) - (a[0] === q) || a[0].length - b[0].length).slice(0, 12);
}
// 词典里的词加入生词本时登记为个人单词，这样也能进闪卡、复习排期和备份
let dictWords = store.get('kr_dictwords', {});
function registerDictWord(ko, zh) {
  if (!dictWords[ko]) { dictWords[ko] = { zh }; store.set('kr_dictwords', dictWords); }
  addDictItem(ko, dictWords[ko].zh);
}
function addDictItem(ko, zh) {
  const id = 'w:' + ko;
  if (!ITEMS.has(id)) ITEMS.set(id, { id, type: 'word', ko, zh, zhList: [zh], lessons: ['词典'] });
}
Object.entries(dictWords).forEach(([ko, v]) => addDictItem(ko, v.zh));

function dictCardHTML([ko, glosses, examples, hanja]) {
  const zh = glosses.join('；');
  const id = 'w:' + ko;
  return `<div class="word-card">
    <div class="wc-top"><span class="wc-ko">${esc(ko)}</span>
      <span class="wc-actions">${playBtn(ko)}<button class="icon-btn${vocabBook.includes(id) ? ' on' : ''}" title="加入/移出生词本" data-act="dict-vocab" data-ko="${esc(ko)}" data-zh="${esc(zh)}">+</button></span></div>
    <div class="wc-rom">[${esc(romanize(ko))}]${hanja ? ' · ' + esc(hanja) : ''}</div>
    <div class="wc-zh">${esc(zh)}</div>
    <div class="wc-meta">维基词典 · CC BY-SA</div>
    ${dictExamplesHTML(examples)}
  </div>`;
}
const dictExamplesHTML = examples => examples.length ? `<div class="wc-gap"></div><div class="wc-dash"></div><div class="wc-ex-title">词典例句</div>
  ${examples.map(([k, z]) => `<div class="dict-ex"><div class="dict-ex-ko">${esc(k)} ${playBtn(k)}</div><div class="sent-zh">${esc(z)}</div></div>`).join('')}` : '';

function renderSearch(q) {
  if (dictState === 'idle') loadDict(() => currentView === 'search' && lastQuery === q && renderSearch(q));
  const words = WORDS.filter(w => w.ko.includes(q) || w.zh.includes(q));
  const sents = SENTENCES.filter(s => s.ko.includes(q) || s.zh.includes(q) || s.g.some(g => g.includes(q)));
  const dict = dictSearch(q);
  const dictNote = dictState === 'loading' ? '<p class="hint">正在加载词典…</p>'
    : dictState === 'failed' ? '<p class="hint">词典没有加载成功。</p>' : '';
  $('#main').innerHTML = pageHead(`“${esc(q)}” 的搜索结果`, `课件：${words.length} 个单词 · ${sents.length} 个句子　词典：${dict.length} 条`)
    + (words.length ? `<section class="group">${groupHead('课件单词', words.length)}${words.map(wordCardHTML).join('')}</section>` : '')
    + (sents.length ? `<section class="group">${groupHead('相关句子', sents.length)}${sents.map(s => sentenceHTML(s)).join('')}</section>` : '')
    + `<section class="group">${groupHead('维基词典', dict.length)}${dictNote}${dict.map(dictCardHTML).join('')}
      ${dictState === 'ready' && !dict.length ? '<p class="hint">词典里没有其他相关词条。</p>' : ''}</section>`;
}

// ===== 视图：知识点（来自 knowledge.js，按章节分页，右侧是本章目录）=====
let kbChapter = KB_CHAPTERS[0].id;
function renderKnowledge() {
  const ch = KB_CHAPTERS.find(c => c.id === kbChapter);
  $('#main').innerHTML = pageHead('知识点', '按课件整理的文字、发音、语法和对话。点击韩文可以听发音。')
    + `<div class="segmented" role="group" aria-label="章节">${KB_CHAPTERS.map((c, i) => `
      <button type="button" class="seg${c.id === kbChapter ? ' active' : ''}" aria-pressed="${c.id === kbChapter}" data-act="chapter" data-id="${c.id}">
        <small>${String(i + 1).padStart(2, '0')}</small>${esc(c.title)}</button>`).join('')}</div>
    ${noteToolsHTML()}
    <div class="kb-layout">
      <article class="kb" id="kbBody"><div class="kb-intro"><h2>${esc(ch.title)}</h2><p>${esc(ch.desc)}</p></div>${ch.html}</article>
      <nav class="kb-outline" id="kbOutline" aria-label="本章目录"></nav>
    </div>`;
  const heads = [...$('#kbBody').querySelectorAll('h3')];
  heads.forEach((h, i) => { h.id = `kb-${ch.id}-${i}`; });
  $('#kbOutline').innerHTML = `<div class="outline-title">本章目录</div>`
    + heads.map(h => `<a data-act="jump" data-id="${h.id}">${esc(h.textContent)}</a>`).join('')
    + '<div class="outline-notes" id="kbNoteList"></div>';
  decorateNotes('kb:' + ch.id, $('#kbBody'));
  $('#kbBody').insertAdjacentHTML('afterbegin', `<select class="kb-jump" id="kbJump" aria-label="跳到小节">
    <option value="">跳到小节…</option>${heads.map(h => `<option value="${h.id}">${esc(h.textContent)}</option>`).join('')}</select>`);
  $('#kbJump').onchange = e => e.target.value && document.getElementById(e.target.value).scrollIntoView({ block: 'start' });
}

function renderReference() {
  $('#main').innerHTML = pageHead('资料与核对', '课件来源、整理原则，以及需要向老师确认的问题。') + noteToolsHTML()
    + `<article class="kb" id="refBody">${KB_REFERENCE.map(r => `<section class="group"><div class="kb-intro"><h2>${esc(r.title)}</h2><p>${esc(r.desc)}</p></div>${r.html}</section>`).join('')}</article>`;
  decorateNotes('ref', $('#refBody'));
}

// ===== 视图：数据与备份 =====
// 所有个人记录都在本机 localStorage；导出成一个 JSON 文件，换设备或清理浏览器后可以导入恢复。
const BACKUP_KEYS = { kr_srs: '复习进度', kr_wrong: '错题本', kr_vocab: '生词本', kr_marks: '句子标记', kr_notes: '笔记', kr_dictwords: '词典单词' };
const sizeOf = v => Array.isArray(v) ? v.length : Object.keys(v || {}).length;
function renderBackup() {
  $('#main').innerHTML = pageHead('数据与备份', '复习进度、错题本、生词本和笔记只保存在这台设备的浏览器里。定期导出一份备份，换设备时导入即可。',
    `<button class="btn" data-act="import">导入备份</button><button class="btn primary" data-act="export">导出备份</button>`)
    + `<div class="stat-grid">${Object.entries(BACKUP_KEYS).map(([k, label]) =>
      `<div class="stat-card"><strong>${sizeOf(store.get(k, null))}</strong><span>${label}</span></div>`).join('')}</div>
    <p class="hint">导入会用备份文件替换当前浏览器里的全部记录。</p>
    <input type="file" id="importFile" accept="application/json,.json" hidden>`;
  $('#importFile').onchange = e => e.target.files[0] && importBackup(e.target.files[0]);
}
function exportBackup() {
  const data = Object.fromEntries(Object.keys(BACKUP_KEYS).map(k => [k, store.get(k, null)]));
  const blob = new Blob([JSON.stringify({ app: 'tjm-korean-study', version: 1, exportedAt: new Date().toISOString(), data }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `韩语学习备份-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function importBackup(file) {
  let backup;
  try { backup = JSON.parse(await file.text()); } catch { return toast('文件不是有效的 JSON'); }
  if (backup?.app !== 'tjm-korean-study' || typeof backup.data !== 'object') return toast('这不是韩语学习的备份文件');
  const summary = Object.entries(BACKUP_KEYS).map(([k, label]) => `${label} ${sizeOf(backup.data[k])}`).join('、');
  if (!confirm(`导入后会替换当前记录。\n备份内容：${summary}\n确定导入吗？`)) return;
  for (const k of Object.keys(BACKUP_KEYS)) {
    const v = backup.data[k];
    if (v && typeof v === 'object') localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k);
  }
  location.reload();
}

// ===== 导航 =====
let currentView = 'flash', lastQuery = '';
function showView(view) {
  currentView = view;
  document.querySelectorAll('.sidebar .nav').forEach(a => a.classList.toggle('active', a.dataset.view === view));
  $('#crumbView').textContent = view === 'search' ? '搜索结果' : $(`.sidebar .nav[data-view="${view}"]`).firstChild.nextSibling.textContent;
  ({ flash: renderFlash, sentences: renderSentences, words: renderWords,
     wrong: () => renderBook('wrong'), vocab: () => renderBook('vocab'),
     knowledge: renderKnowledge, reference: renderReference, notes: renderNotes, backup: renderBackup, search: () => renderSearch(lastQuery) })[view]();
  window.scrollTo(0, 0);
}
function doSearch(q) {
  q = (q ?? $('#searchInput').value).trim();
  if (!q) return;
  $('#searchInput').value = q; lastQuery = q; showView('search');
  window.scrollTo(0, 0);
}

document.querySelectorAll('.sidebar a').forEach(a => a.onclick = e => {
  e.preventDefault();
  if (a.dataset.view === 'flash' && !flash.queue.length) return startDeck('all');
  showView(a.dataset.view);
});
$('#searchForm').addEventListener('submit', e => { e.preventDefault(); doSearch(); });

// 外观：白 / 灰 / 黑，与其他 TJM 办公应用共用存储键 tjm-theme
function applyTheme(theme) {
  document.body.dataset.theme = theme;
  document.querySelectorAll('[data-theme-choice]').forEach(b => {
    const on = b.dataset.themeChoice === theme;
    b.classList.toggle('active', on); b.setAttribute('aria-pressed', on);
  });
}
document.querySelectorAll('[data-theme-choice]').forEach(b => b.onclick = () => {
  localStorage.setItem('tjm-theme', b.dataset.themeChoice); applyTheme(b.dataset.themeChoice);
});
applyTheme(document.body.dataset.theme);

// 统一的按钮事件
$('#main').addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) {
    // 知识点里的韩文点一下就发音
    const ko = e.target.closest('.kb .gloss-ko, .kb .ko, .kb .pron-word, .kb .pron-out, .kb .step-token, .kb .map-pair b, .kb .map-pair strong, .kb .formula');
    if (ko && /[가-힣]/.test(ko.textContent) && getSelection().isCollapsed && !noteUI.boxing) speak(ko.textContent.replace(/[\[\]（）()]/g, ' '));
    return;
  }
  const { act, id } = el.dataset;
  if (['speak', 'vocab', 'unwrong', 'unvocab', 'mark'].includes(act)) e.stopPropagation();
  switch (act) {
    case 'speak': speak(el.dataset.text); break;
    case 'vocab': toggleVocab(id); el.classList.toggle('on', vocabBook.includes(id)); break;
    case 'mark': toggleMark(id, +el.dataset.i); el.classList.toggle('marked'); break;
    case 'unwrong': removeWrong(id); renderBook('wrong'); break;
    case 'unvocab': toggleVocab(id); renderBook('vocab'); break;
    case 'open': { const x = ITEMS.get(id); doSearch(x.ko); break; }
    case 'review': startDeck(el.dataset.deck, true); break;
    case 'shuffle': startDeck(flash.deck, true); break;
    case 'restart': startDeck(flash.deck, true); break;
    case 'flip': flipCard(); break;
    case 'chapter': kbChapter = id; renderKnowledge(); window.scrollTo(0, 0); break;
    case 'jump': document.getElementById(id).scrollIntoView({ block: 'start' }); break;
    case 'box': toggleBoxing(); break;
    case 'go-notes': showView('notes'); break;
    case 'note-jump': jumpToNote(id); break;
    case 'note-delete': deleteNote(id); break;
    case 'export': exportBackup(); break;
    case 'dict-vocab': registerDictWord(el.dataset.ko, el.dataset.zh); toggleVocab('w:' + el.dataset.ko); el.classList.toggle('on', vocabBook.includes('w:' + el.dataset.ko)); break;
    case 'import': $('#importFile').click(); break;
    case 'prev': moveCard(-1); break;
    case 'next': moveCard(1); break;
    case 'rate': {
      const item = flash.queue[flash.pos], grade = +el.dataset.grade;
      rateCard(item.id, grade);
      if (grade === 1) flash.queue.push(item);   // 重来：本轮稍后再出现一次
      moveCard(1); break;
    }
  }
});

document.addEventListener('keydown', e => {
  if (currentView !== 'flash' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') { e.preventDefault(); flipCard(); }
  else if (e.key === 'ArrowRight') moveCard(1);
  else if (e.key === 'ArrowLeft') moveCard(-1);
});

updateBadges();
startDeck(dueItems().length ? 'due' : 'all');
