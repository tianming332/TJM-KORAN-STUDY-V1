// ===== 知识点笔记：选中文字后高亮 / 标记 / 批注，框选模式画出区域 =====
// 笔记按「页面 + 第几张卡片 + 卡片内的文字位置」保存；内容是静态的，重新打开时按位置还原。
// 鼠标、触控和手写笔都走同一套 Selection 与 Pointer Events。
const NOTE_COLORS = [['yellow', '黄'], ['green', '绿'], ['pink', '粉'], ['blue', '蓝']];
let notes = store.get('kr_notes', []);
const saveNotes = () => store.set('kr_notes', notes);
const notesOf = page => notes.filter(n => n.page === page);
const newId = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const noteUI = { page: null, root: null, boxing: false, pending: null, editing: null };

// 卡片里所有可以高亮的文字节点（跳过表格结构之间的空白和框选层）
function textNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => n.parentElement.closest('.note-box') || /^(TABLE|TBODY|THEAD|TR)$/.test(n.parentElement.tagName)
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const out = [];
  while (walker.nextNode()) out.push(walker.currentNode);
  return out;
}
const cardText = card => textNodes(card).map(t => t.data).join('');
function offsetIn(card, container, offset) {
  let total = 0;
  for (const t of textNodes(card)) {
    if (t === container) return total + offset;
    if (container.nodeType === 1 && container.childNodes[offset] && (container.childNodes[offset] === t || container.childNodes[offset].contains(t))) return total;
    total += t.length;
  }
  return total;
}
function wrapRange(card, start, end, note, isLast) {
  let pos = 0;
  const parts = [];
  for (const t of textNodes(card)) {
    const a = pos, b = pos + t.length;
    pos = b;
    if (b <= start || a >= end) continue;
    let node = t;
    const s = Math.max(start, a) - a, e = Math.min(end, b) - a;
    if (e < node.length) node.splitText(e);
    if (s > 0) node = node.splitText(s);
    if (!node.data.trim()) continue;
    const m = document.createElement('mark');
    m.className = `note-mark ${note.style === 'underline' ? 'note-underline' : 'hl-' + note.style}`;
    m.dataset.noteId = note.id;
    node.parentNode.insertBefore(m, node);
    m.appendChild(node);
    parts.push(m);
  }
  if (isLast && parts.length && note.note) parts[parts.length - 1].classList.add('has-note');
  return parts.length > 0;
}

// 渲染页面后调用：还原这一页的高亮和框选区域
function decorateNotes(page, root) {
  noteUI.page = page; noteUI.root = root; noteUI.boxing = false;
  const cards = [...root.querySelectorAll('.card')];
  cards.forEach((c, i) => { c.dataset.cardIndex = i; });
  for (const n of notesOf(page)) {
    const card = cards[n.card];
    n.lost = !card;
    if (!card) continue;
    if (n.type === 'box') { card.insertAdjacentHTML('beforeend', boxHTML(n)); continue; }
    n.lost = cardText(card).slice(n.start, n.end) !== n.quote || !wrapRange(card, n.start, n.end, n, true);
  }
  updateNoteCount();
}
const boxHTML = n => `<div class="note-box box-${n.color}${n.note ? ' has-note' : ''}" data-note-id="${n.id}"
  style="left:${n.box.x * 100}%;top:${n.box.y * 100}%;width:${n.box.w * 100}%;height:${n.box.h * 100}%"
  role="button" tabindex="0" aria-label="框选笔记${n.note ? '：' + esc(n.note) : ''}">${n.note ? `<span>${esc(n.note)}</span>` : ''}</div>`;

function updateNoteCount() {
  const el = document.getElementById('pageNoteCount');
  if (el) el.textContent = notesOf(noteUI.page).length;
  const nav = document.getElementById('notesCount');
  if (nav) nav.textContent = notes.length;
  renderNoteOutline();
}

// ----- 选中文字 → 浮动工具条 -----
function offsetIn(card, container, offset) {
  const point = document.createRange();
  point.setStart(container, offset);
  let total = 0;
  for (const t of textNodes(card)) {
    if (t === container) return total + offset;
    if (point.comparePoint(t, 0) >= 0) return total;   // 这个文字节点在选区边界之后
    total += t.length;
  }
  return total;
}
function selectionInCard() {
  const sel = getSelection();
  if (!sel.rangeCount || sel.isCollapsed || !noteUI.root?.isConnected) return null;
  const r = sel.getRangeAt(0);
  const anc = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
  const card = anc.closest('.card');
  if (!card || !noteUI.root.contains(card)) return null;
  const start = offsetIn(card, r.startContainer, r.startOffset), end = offsetIn(card, r.endContainer, r.endOffset);
  const quote = cardText(card).slice(start, end);
  if (!quote.trim()) return null;
  return { card: +card.dataset.cardIndex, start, end, quote, rect: r.getBoundingClientRect() };
}

const bar = () => document.getElementById('noteBar');
function showBar(rect, note) {
  const el = bar();
  const style = note ? (note.type === 'box' ? note.color : note.style) : null;
  el.innerHTML = `<div class="note-bar-group" role="group" aria-label="高亮颜色">${NOTE_COLORS.map(([c, name]) =>
      `<button type="button" class="swatch sw-${c}${style === c ? ' active' : ''}" data-note="color" data-color="${c}" aria-label="${name}色高亮"></button>`).join('')}</div>
    ${note?.type === 'box' ? '' : `<button type="button" class="note-bar-btn${style === 'underline' ? ' active' : ''}" data-note="underline">标记</button>`}
    <button type="button" class="note-bar-btn" data-note="comment">${note?.note ? '改批注' : '批注'}</button>
    ${note ? '<button type="button" class="note-bar-btn danger" data-note="delete">删除</button>' : ''}`;
  el.hidden = false;
  const w = el.offsetWidth, h = el.offsetHeight;
  // 放在选区下方：手机上系统自带的复制菜单通常在上方
  let top = rect.bottom + 10;
  if (top + h > innerHeight - 8) top = Math.max(8, rect.top - h - 10);
  el.style.top = top + 'px';
  el.style.left = Math.min(Math.max(8, rect.left + rect.width / 2 - w / 2), innerWidth - w - 8) + 'px';
  noteUI.editing = note || null;
}
function hideBar() { const el = bar(); if (el) el.hidden = true; noteUI.editing = null; }

let selTimer;
document.addEventListener('selectionchange', () => {
  clearTimeout(selTimer);
  selTimer = setTimeout(() => {
    const s = selectionInCard();
    if (s) { noteUI.pending = s; showBar(s.rect, null); }
    else if (!noteUI.editing) hideBar();
  }, 160);
});

function createTextNote(style) {
  const s = noteUI.pending;
  const n = { id: newId(), type: 'text', page: noteUI.page, card: s.card, start: s.start, end: s.end, quote: s.quote, style, note: '', time: Date.now() };
  notes.push(n); saveNotes();
  getSelection().removeAllRanges();
  return n;
}

// 工具条按钮：按下时不让选区消失
document.addEventListener('pointerdown', e => { if (e.target.closest('#noteBar')) e.preventDefault(); });
document.addEventListener('click', e => {
  const btn = e.target.closest('#noteBar [data-note]');
  if (!btn) return;
  const act = btn.dataset.note;
  let n = noteUI.editing;
  if (!n && act !== 'delete') n = createTextNote(act === 'underline' ? 'underline' : act === 'color' ? btn.dataset.color : 'yellow');
  if (act === 'color') { if (n.type === 'box') n.color = btn.dataset.color; else n.style = btn.dataset.color; }
  if (act === 'underline') n.style = 'underline';
  const isNew = !noteUI.editing;
  if (act === 'delete') { hideBar(); return removeNote(n); }
  saveNotes(); hideBar();
  if (act === 'comment') openNoteDialog(n, isNew);
  else refreshNotePage();
});

// 点已有的高亮或框选区域：打开同一个工具条（捕获阶段，先于发音）
document.addEventListener('click', e => {
  const hit = e.target.closest('#main .note-mark, #main .note-box');
  if (!hit || noteUI.boxing || !getSelection().isCollapsed) return;
  const n = notes.find(x => x.id === hit.dataset.noteId);
  if (!n) return;
  e.stopPropagation(); e.preventDefault();
  showBar(hit.getBoundingClientRect(), n);
}, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideBar(); });
addEventListener('scroll', () => { if (!bar().hidden) hideBar(); }, { passive: true });

document.addEventListener('pointerdown', e => {
  if (!e.target.closest('#noteBar, .note-mark, .note-box, #noteDialog')) { if (noteUI.editing) hideBar(); }
});

// ----- 批注对话框 -----
// isNew：这条笔记是为了写批注刚建的，点取消（或按 Esc）时一起撤回，不留下空笔记
function openNoteDialog(n, isNew = false) {
  const dlg = document.getElementById('noteDialog');
  dlg.querySelector('blockquote').textContent = n.type === 'box' ? '框选区域' : n.quote;
  const ta = dlg.querySelector('textarea');
  ta.value = n.note || '';
  dlg.returnValue = '';
  let done = false;
  finishNoteDialog = save => {
    if (done) return;
    done = true;
    if (save) { n.note = ta.value.trim(); n.time = Date.now(); saveNotes(); toast(n.note ? '批注已保存' : '已清空批注'); }
    else if (isNew) { notes = notes.filter(x => x !== n); saveNotes(); }
    refreshNotePage();
  };
  dlg.onclose = () => finishNoteDialog(dlg.returnValue === 'save');   // Esc 关闭时走这里
  dlg.showModal();
  ta.focus();
}
// 按钮直接收尾，不依赖异步的 close 事件；done 标记保证只处理一次
let finishNoteDialog = null;
document.querySelector('#noteDialog form').addEventListener('click', e => {
  const b = e.target.closest('button[value]');
  if (!b) return;
  e.preventDefault();
  document.getElementById('noteDialog').close(b.value);
  finishNoteDialog?.(b.value === 'save');
});

// 改动后原地重绘，保留滚动位置
function refreshNotePage() {
  const y = scrollY, wasBoxing = noteUI.boxing;
  if (currentView === 'knowledge') renderKnowledge();
  else if (currentView === 'reference') renderReference();
  else if (currentView === 'notes') renderNotes();
  scrollTo(0, y);
  if (wasBoxing) toggleBoxing(true, true);
  updateNoteCount();
}

// ----- 框选模式：在卡片上拖动画出矩形 -----
function toggleBoxing(on = !noteUI.boxing, quiet = false) {
  noteUI.boxing = on;
  noteUI.root?.classList.toggle('boxing', on);
  const b = document.getElementById('boxToggle');
  if (b) { b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); }
  hideBar();
  if (on && !quiet) toast(matchMedia('(pointer: coarse)').matches
    ? '手指按住约半秒再拖动来框选，直接滑动仍可滚动页面'
    : '在卡片上拖动框出区域，再点「框选」退出');
}
// 鼠标和触控笔按下就开始框选；手指要先按住不动约 0.35 秒，
// 这样框选模式下手指直接滑动仍然是滚动页面。开始框选后再拦截 touchmove，页面不会跟着滚。
const HOLD_MS = 350, HOLD_SLOP = 8;
let drawing = null, holding = null;
document.addEventListener('pointerdown', e => {
  if (!noteUI.boxing || e.button > 0) return;
  const card = e.target.closest('.kb.boxing .card');
  if (!card) return;
  if (e.pointerType === 'touch') {
    clearTimeout(holding?.timer);
    holding = { card, x: e.clientX, y: e.clientY, id: e.pointerId, timer: setTimeout(() => {
      const h = holding; holding = null;
      startDraw(h.card, h.x, h.y, h.id);
      navigator.vibrate?.(10);
    }, HOLD_MS) };
    return;
  }
  e.preventDefault();
  startDraw(card, e.clientX, e.clientY, e.pointerId);
});
function startDraw(card, cx, cy, id) {
  const r = card.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'note-box box-yellow drawing';
  card.appendChild(el);
  drawing = { card, r, x0: cx - r.left, y0: cy - r.top, el, id };
  try { card.setPointerCapture(id); } catch { /* 手指已经抬起时会失败，pointerup 会收尾 */ }
}
function cancelHold(e) {
  if (holding && e.pointerId === holding.id) { clearTimeout(holding.timer); holding = null; }
}
document.addEventListener('touchmove', e => { if (drawing) e.preventDefault(); }, { passive: false });
document.addEventListener('pointermove', e => {
  if (holding && e.pointerId === holding.id && Math.hypot(e.clientX - holding.x, e.clientY - holding.y) > HOLD_SLOP) cancelHold(e);
  if (!drawing || e.pointerId !== drawing.id) return;
  const { r, x0, y0, el } = drawing;
  const x = Math.min(Math.max(e.clientX - r.left, 0), r.width), y = Math.min(Math.max(e.clientY - r.top, 0), r.height);
  Object.assign(el.style, { left: Math.min(x, x0) + 'px', top: Math.min(y, y0) + 'px', width: Math.abs(x - x0) + 'px', height: Math.abs(y - y0) + 'px' });
});
function endDraw(e) {
  cancelHold(e);
  if (!drawing || e.pointerId !== drawing.id) return;
  const { card, r, el } = drawing;
  drawing = null;
  const w = el.offsetWidth, h = el.offsetHeight, left = el.offsetLeft, top = el.offsetTop;
  el.remove();
  if (e.type === 'pointercancel' || w < 12 || h < 12) return;
  const n = { id: newId(), type: 'box', page: noteUI.page, card: +card.dataset.cardIndex, color: 'yellow', note: '', time: Date.now(),
    box: { x: left / r.width, y: top / r.height, w: w / r.width, h: h / r.height } };
  notes.push(n); saveNotes();
  openNoteDialog(n, true);
}
document.addEventListener('pointerup', endDraw);
document.addEventListener('pointercancel', endDraw);

// ----- 页面上的笔记工具条、目录里的本章笔记、笔记页 -----
const notePageTitle = page => page === 'ref' ? '资料与核对'
  : '知识点 · ' + (KB_CHAPTERS.find(c => 'kb:' + c.id === page)?.title || page);
const noteLabel = n => n.type === 'box' ? '框选区域' : n.quote.replace(/\s+/g, ' ').slice(0, 60);
const noteSwatch = n => `<i class="swatch sw-${n.type === 'box' ? n.color : n.style}" aria-hidden="true"></i>`;

function noteToolsHTML() {
  return `<div class="note-tools" role="toolbar" aria-label="笔记工具">
    <span class="hint">选中文字即可高亮、标记或批注</span>
    <button type="button" class="btn" id="boxToggle" data-act="box" aria-pressed="false">框选</button>
    <button type="button" class="btn" data-act="go-notes">本页笔记 <span class="count" id="pageNoteCount">0</span></button>
  </div>`;
}
function renderNoteOutline() {
  const box = document.getElementById('kbNoteList');
  if (!box) return;
  const list = notesOf(noteUI.page);
  box.innerHTML = list.length ? `<div class="outline-title">本章笔记</div>` + list.map(n =>
    `<a data-act="note-jump" data-id="${n.id}" class="${n.lost ? 'lost' : ''}">${noteSwatch(n)}${esc(noteLabel(n))}</a>`).join('') : '';
}

function renderNotes() {
  const pages = [...new Set(notes.map(n => n.page))];
  $('#main').innerHTML = pageHead('笔记', '在知识点里选中文字即可高亮、标记或批注；打开「框选」可以在卡片上圈出一块区域。', '', notes.length)
    + (pages.length ? pages.map(p => {
      const list = notesOf(p).sort((a, b) => b.time - a.time);
      return `<section class="group">${groupHead(notePageTitle(p), list.length)}${list.map(n => `
        <div class="note-item">
          <div class="note-quote">${noteSwatch(n)}<span class="${n.type === 'text' && n.style === 'underline' ? 'q-underline' : ''}">${esc(noteLabel(n))}</span></div>
          ${n.note ? `<p class="note-text">${esc(n.note)}</p>` : ''}
          <div class="note-meta"><span>${new Date(n.time).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })}${n.lost ? ' · 原文位置已变化，无法在页面中显示' : ''}</span>
            <span><button class="btn" data-act="note-jump" data-id="${n.id}">查看原文</button>
            <button class="btn" data-act="note-delete" data-id="${n.id}">删除</button></span></div>
        </div>`).join('')}</section>`;
    }).join('') : '<div class="empty">还没有笔记。打开「知识点」，选中一段文字试试。</div>');
}

function jumpToNote(id) {
  const n = notes.find(x => x.id === id);
  if (!n) return;
  if (n.page === 'ref') showView('reference');
  else { kbChapter = n.page.slice(3); showView('knowledge'); }
  const el = document.querySelector(`#main [data-note-id="${id}"]`);
  if (!el) return toast('原文位置已变化，无法定位');
  el.scrollIntoView({ block: 'center' });
  document.querySelectorAll(`#main [data-note-id="${id}"]`).forEach(m => { m.classList.add('flash'); setTimeout(() => m.classList.remove('flash'), 1200); });
}
// 删除后 5 秒内可以在提示里点「撤销」放回原位
function removeNote(n) {
  const i = notes.indexOf(n);
  if (i < 0) return;
  notes.splice(i, 1); saveNotes(); refreshNotePage();
  toast('已删除笔记', { label: '撤销', fn: () => {
    if (notes.includes(n)) return;
    notes.splice(Math.min(i, notes.length), 0, n); saveNotes(); refreshNotePage(); toast('已恢复笔记');
  } });
}
const deleteNote = id => removeNote(notes.find(n => n.id === id));

updateNoteCount();
