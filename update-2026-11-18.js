/*
 * TJM Korean Study — 2026.11.18 更新
 * 运行在原站 app.js、notes.js 之后。覆盖闪卡显示层，不改历史记录字段、FSRS储存。
 * 闪卡右上「+」表示加入错题本（替代旧版双击）。
 */
(function () {
  'use strict';
  // 与原站的 FSRS 评分保持一致：遗忘=1 Again，模糊=2 Hard，掌握=3 Good。
  // 不使用 grade 4，以免「掌握」被当作过度简单跳过较长间隔。
  ratingRowHTML = function (id) {
    if (!scheduler) return '';
    const p = previewRatings(id);
    const labels = [[1,'遗忘','bad'],[2,'模糊',''],[3,'掌握','good']];
    return `<div class="rate-row tjm-flash-ratings" role="group" aria-label="单词掌握程度">${labels.map(([g,label,cl]) =>
      `<button type="button" class="btn rate ${cl}" data-act="rate" data-grade="${g}">${label}<small>${fmtInterval(p[g].card.due)}后</small></button>`
    ).join('')}</div>`;
  };

  function cardTools(item) {
    const id = esc(item.id), ko = esc(item.ko);
    return `<div class="tjm-card-tools" role="group" aria-label="闪卡快捷操作">
      <button type="button" class="tjm-circle-btn" data-act="speak" data-text="${ko}" title="播放韩语发音" aria-label="播放韩语发音">▶</button>
      <button type="button" class="tjm-circle-btn${wrongBook[item.id] ? ' tjm-marked' : ''}" data-act="mark-wrong" data-id="${id}" title="加入错题本" aria-label="加入错题本">+</button>
    </div>`;
  }
  function wrongFlag(item) {
    const w = wrongBook[item.id];
    return w ? `<span class="wrong-flag">错题本 ×${w.count}</span>` : '';
  }

  renderFlash = function () {
    const opts = [['due', `今日待复习（${dueItems().length}）`], ['all','全部（单词+句子）'],
      ['words','全部单词'], ['sentences','全部句子'],
      ...ALL_LESSONS.map(l => ['L:' + l, /^\d/.test(l) ? l + ' 课件' : l]),
      ['wrong','错题本'],['vocab','生词本']];
    const item = flash.queue[flash.pos];
    let html = pageHead('闪卡复习', '点击卡面翻面；右上圆形按钮负责发音和加入错题本。根据实际掌握情况进行评分。',
      `<select id="deckSel" aria-label="选择复习范围">${opts.map(([v,t]) =>
        `<option value="${esc(v)}"${v === flash.deck ? ' selected' : ''}>${esc(t)}</option>`
      ).join('')}</select> <button class="btn" data-act="shuffle">打乱顺序</button>`);
    if (!item) {
      html += `<div class="empty">${flash.queue.length ? '本轮复习完成！' : flash.deck === 'due' ? '没有到期卡片。可以选择新课件开始复习。' : '这一组还没有卡片'}</div>
      ${flash.queue.length ? '<button class="btn primary" data-act="restart">再来一轮</button>' : ''}`;
      $('#main').innerHTML = html;
      bindDeckSel();
      return;
    }
    const isSentence = item.type === 'sentence';
    const sizeClass = isSentence ? ' sent' : '';
    html += `<div class="progress">第 ${flash.pos + 1} / ${flash.queue.length} 张</div>
      <div class="card-wrap tjm-flash-card">
        <div id="card" class="card${flash.flipped ? ' flipped' : ''}" aria-label="闪卡，点击翻面">
          <div class="face front">
            <span class="tag">${isSentence ? '句子 · ' + esc(item.src) : '单词 · ' + esc(item.lessons.join('、'))}</span>
            ${cardTools(item)}${wrongFlag(item)}
            <div class="big${sizeClass}">${esc(item.ko)}</div>
            <div class="rom">[${esc(romanize(item.ko))}]</div>
          </div>
          <div class="face back">
            <span class="tag">中文</span>${cardTools(item)}
            <div class="big${sizeClass}">${esc(item.zh)}</div>
            ${isSentence ? glossHTML(item, false) : ''}
          </div>
        </div>
      </div>
      <div class="tjm-flash-controls" role="group" aria-label="闪卡导航">
        <button class="btn" type="button" data-act="prev"${flash.pos === 0 ? ' disabled' : ''}>上一张</button>
        <button class="btn primary" type="button" data-act="flip">翻面</button>
        <button class="btn" type="button" data-act="next">下一张</button>
      </div>
      ${ratingRowHTML(item.id)}
      <div class="tjm-flash-hint">${srs[item.id] ? '下次复习：' + new Date(srs[item.id].due).toLocaleDateString('zh-CN') : '新卡'} · “下一张”不计入评分</div>`;
    $('#main').innerHTML = html;
    bindDeckSel();
    const card = $('#card');
    // 移除旧的单击播放、双击错题规则。卡面点击只翻面，按钮独立操作。
    card.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      flipCard();
    });
  };

  // 采用捕获事件处理新的「加入错题本」按钮，并阻止与原站冒泡委托冲突。
  document.addEventListener('click', e => {
    const el = e.target.closest('#main [data-act="mark-wrong"]');
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    const id = el.dataset.id;
    if (!ITEMS.has(id)) return;
    addWrong(id);
    document.querySelectorAll('#card .tjm-circle-btn[data-act="mark-wrong"]').forEach(btn => btn.classList.add('tjm-marked'));
    const face = document.querySelector('#card .face.front');
    if (face) {
      const existing = face.querySelector('.wrong-flag');
      if (existing) existing.textContent = `错题本 ×${wrongBook[id].count}`;
      else face.insertAdjacentHTML('beforeend', `<span class="wrong-flag">错题本 ×${wrongBook[id].count}</span>`);
    }
  }, true);

  // 2026.11.18：将新课件内容并入原有知识点卡片，不新增章节、目录或独立课堂板块。
  // 第2页48个词汇已由 lesson-1118.js 加入原有单词库；此处只处理知识点内容。
  const page4Groups = [
    ['11.18 읽기1','1. 가다（去）／오다（来）与时间、场所'],
    ['11.18 읽기2','2. 많다（多）／적다（少）与数量描述'],
    ['11.18 읽기3','3. 넓다（宽／大）／좁다（窄／小）与空间描述'],
  ];
  const page5Groups = [
    ['11.18 읽기4','4. 있다（有／在）／없다（没有／不在）与存在表达'],
    ['11.18 읽기5','5. 보다（看）与动作场所'],
    ['11.18 읽기7','7. 만나다（见面）与时间、场所'],
    ['11.18 읽기8','8. 이다（是）／아니다（不是）与身份判断'],
  ];
  const sportGroups = [
    {verb:'하다', desc:'课件图示归类', items:[['축구','足球'],['등산','登山'],['야구','棒球'],['농구','篮球'],['배구','排球'],['태권도','跆拳道']]},
    {verb:'치다', desc:'课件图示归类', items:[['골프','高尔夫'],['테니스','网球'],['탁구','乒乓球'],['당구','台球'],['배드민턴','羽毛球']]},
    {verb:'타다', desc:'课件图示归类', items:[['스키','滑雪'],['스케이트','滑冰'],['스노보드','单板滑雪'],['자전거','自行车']]},
  ];
  const addedSportTerms = new Set(LESSON_1118_WORDS.slice(48).map(([ko]) => ko));

  function sourceLabel(page) {
    return `<div class="tjm-source-label">文件名日期 2026.11.18 | PDF第${page}页</div>`;
  }
  function lessonSentenceHTML(sentence) {
    return `<div class="tjm-lesson-sent">${glossHTML(sentence,false)}<div class="sent-zh">${esc(sentence.zh)}</div></div>`;
  }
  function lessonGroupHTML(key,title,filterFn) {
    const list = SENTENCES.filter(s => s.src === key && (!filterFn || filterFn(s)));
    if (!list.length) return '';
    return `<div class="tjm-lesson-group"><h5>${esc(title)}</h5>${list.map(lessonSentenceHTML).join('')}</div>`;
  }
  function lessonInlineBlock(page,title,description,body,key) {
    return `<div class="tjm-lesson-block tjm-lesson-inline" data-tjm-lesson="${esc(key)}">
      ${sourceLabel(page)}
      <h4>${esc(title)}</h4>
      ${description ? `<p class="tjm-lesson-caption">${esc(description)}</p>` : ''}
      ${body}
    </div>`;
  }
  function sportHTML() {
    return `<p class="tjm-lesson-caption">按原课件第3页图示整理运动项目与常见动词搭配，保留原始分类图。</p>
      <img class="tjm-sport-figure" alt="2026年11月18日课件第3页：运动项目按하다、치다、타다分类" src="lesson-1118-sports.png" loading="lazy">
      <div class="tjm-sport-groups">${sportGroups.map(group =>
        `<div class="tjm-sport-group"><div class="tjm-sport-title"><b>${esc(group.verb)}</b><span>${esc(group.desc)}</span></div><div class="tjm-sport-chips">${group.items.map(([ko,zh]) =>
          `<span class="tjm-sport-chip${addedSportTerms.has(ko) ? ' is-new' : ''}"><b>${esc(ko)}</b><small>${esc(zh)}</small></span>`
        ).join('')}</div></div>`
      ).join('')}</div>
      <div class="tjm-lesson-examples">
        <div><b class="ko">축구를 하다</b><span>踢足球</span></div>
        <div><b class="ko">탁구를 치다</b><span>打乒乓球</span></div>
      </div>
      <p class="tjm-lesson-caption">图解补充词汇：${[...addedSportTerms].map(esc).join('、')}。这些词也已加入原有11.18单词组。</p>`;
  }

  // 先移除上一版误加的独立章节；只操作原数组中的旧项，不创建新目录项。
  for (let i = KB_CHAPTERS.length - 1; i >= 0; i--) {
    const ch = KB_CHAPTERS[i];
    if (ch && (ch.id === 'lesson1118' || /11\.18课堂|11月18日课堂知识点整合/.test(String(ch.title || '')))) {
      KB_CHAPTERS.splice(i, 1);
    }
  }

  function normalizeHeading(s) {
    return String(s || '').replace(/\s+/g,' ').replace(/[：:]/g,'').trim();
  }
  function appendToExistingKnowledgeCard(targetPattern, block, reportKey, fallbackPattern) {
    const chapters = KB_CHAPTERS.filter(ch => ch && ch.id !== 'lesson1118');
    // 优先在已有知识点 HTML 中定位对应的小节标题，将内容放进该小节的原卡片。
    for (const chapter of chapters) {
      if (typeof chapter.html !== 'string' || !chapter.html) continue;
      const doc = new DOMParser().parseFromString(chapter.html, 'text/html');
      const headings = [...doc.querySelectorAll('h1,h2,h3,h4,h5')];
      const heading = headings.find(h => targetPattern.test(normalizeHeading(h.textContent)));
      if (!heading) continue;
      const card = heading.closest('[data-knowledge-id]') || heading.closest('.card') || heading.parentElement;
      if (!card) continue;
      if (card.querySelector(`[data-tjm-lesson="${reportKey}"]`)) {
        window.__tjm1118MergeReport[reportKey] = 'already-present';
        return true;
      }
      card.insertAdjacentHTML('beforeend', block);
      chapter.html = doc.body.innerHTML;
      window.__tjm1118MergeReport[reportKey] = `merged:${chapter.id || chapter.title || 'existing-card'}`;
      return true;
    }

    // 如果标题不是独立小节，而是由原章节标题承载，则并入对应的原章节 HTML。
    const chapter = chapters.find(ch =>
      targetPattern.test(normalizeHeading(`${ch.title || ''} ${ch.desc || ''}`))
    ) || (fallbackPattern ? chapters.find(ch =>
      fallbackPattern.test(normalizeHeading(`${ch.title || ''} ${ch.desc || ''}`))
    ) : null);

    if (chapter && typeof chapter.html === 'string') {
      if (!chapter.html.includes(`data-tjm-lesson="${reportKey}"`)) chapter.html += block;
      window.__tjm1118MergeReport[reportKey] = `merged:${chapter.id || chapter.title || 'existing-chapter'}`;
      return true;
    }

    window.__tjm1118MergeReport[reportKey] = 'target-not-found';
    return false;
  }

  window.__tjm1118MergeReport = {};

  // 3.11 하다：运动项目与 하다／치다／타다 搭配，放入原有“하다／动词”知识卡。
  appendToExistingKnowledgeCard(
    /3\.11(?:\s|$)|하다.*万能动词|万能动词.*하다|하다.*动词|动词.*하다/i,
    lessonInlineBlock(3,'运动项目与 하다／치다／타다 的搭配',
      '按原课件运动分类图整理；运动词汇已同步进入原有单词库。',
      sportHTML(),'2026.11.18-p3-sports'),
    '2026.11.18-p3-sports',
    /语法|动词|句子结构/i
  );

  // 3.2 助词系统：去向、所在位置和动作发生地点；5条例句完整保留。
  const locativeBody = [
    lessonGroupHTML('11.18 읽기1','가다／오다：时间与目的地'),
    lessonGroupHTML('11.18 읽기5','에서：动作发生的场所',s => s.ko.includes('미술관')),
    lessonGroupHTML('11.18 읽기7','에서：见面的地点',s => s.ko.includes('공항')),
  ].join('');
  appendToExistingKnowledgeCard(
    /3\.2(?:\s|$)|助词系统|地点助词|场所助词/i,
    lessonInlineBlock(4,'地点助词 에／에서：去向、所在位置与动作场所',
      '将课件中的 가다／오다、미술馆에서、机场에서 例句并入原有助词知识点。',
      locativeBody,'2026.11.18-p4-location-particles'),
    '2026.11.18-p4-location-particles',
    /语法体系|助词|句子结构/i
  );

  // 3.5 词干、语尾与句子类型：形容词谓语的数量、空间描述例句。
  const adjectiveBody = [
    lessonGroupHTML('11.18 읽기2','많다／적다：数量描述'),
    lessonGroupHTML('11.18 읽기3','넓다／좁다：空间描述'),
  ].join('');
  appendToExistingKnowledgeCard(
    /3\.5(?:\s|$)|词干.*语尾|语尾.*句子类型|形容词谓语|形容词/i,
    lessonInlineBlock(4,'形容词谓语：数量与空间描述',
      '将 많다／적다、넓다／좁다 的课件例句并入原有谓语与句子类型知识点。',
      adjectiveBody,'2026.11.18-p4-adjectives'),
    '2026.11.18-p4-adjectives',
    /语法体系|句子结构|谓语/i
  );

  // 3.6 基本句型：있다／없다 与存在表达。
  const existenceBody = lessonGroupHTML('11.18 읽기4','있다／없다：存在表达');
  appendToExistingKnowledgeCard(
    /3\.6(?:\s|$)|基本句型与句子结构|存在句型|存在表达/i,
    lessonInlineBlock(5,'있다／없다：存在表达',
      '将银行、邮局及洗手间位置的课件例句并入原有基本句型知识点。',
      existenceBody,'2026.11.18-p5-existence'),
    '2026.11.18-p5-existence',
    /语法体系|句子结构|谓语/i
  );

  // 3.10 宾语格助词：영화를、친구를 两条例句放入原有 을／를 知识卡。
  const objectBody = [
    lessonGroupHTML('11.18 읽기5','보다：动作对象',s => s.ko.includes('영화를')),
    lessonGroupHTML('11.18 읽기7','만나다：动作对象',s => s.ko.includes('친구를')),
  ].join('');
  appendToExistingKnowledgeCard(
    /3\.10(?:\s|$)|宾语格助词|宾语格|을\s*\/?\s*를/i,
    lessonInlineBlock(5,'宾语格助词 을／를：动作对象',
      '将 보다、만나다 的课件例句并入原有宾语格助词知识点。',
      objectBody,'2026.11.18-p5-object-particle'),
    '2026.11.18-p5-object-particle',
    /语法体系|助词系统|助词/i
  );

  // 3.8 이다 与 3.12 아니다：身份、地点判断分别归入已有知识卡。
  const identityBody = [
    lessonGroupHTML('11.18 읽기8','이다：地点判断',s => s.ko.includes('입니다') || s.ko.includes('입니까')),
  ].join('');
  appendToExistingKnowledgeCard(
    /3\.8(?:\s|$)|명사.*이다|名词.*이다|叙述格助词|名词谓语/i,
    lessonInlineBlock(5,'이다：地点与身份判断',
      '将 여기는 우체국입니다、여기는 병원입니까? 两条例句并入原有 이다 知识点。',
      identityBody,'2026.11.18-p5-identity'),
    '2026.11.18-p5-identity',
    /语法体系|名词谓语|句子结构/i
  );

  const negativeIdentityBody = lessonGroupHTML(
    '11.18 읽기8','아니다：身份否定',s => s.ko.includes('아닙니다')
  );
  appendToExistingKnowledgeCard(
    /3\.12(?:\s|$)|아니다(?:\s|（|$)|否定身份/i,
    lessonInlineBlock(5,'아니다：身份否定',
      '将 저 사람은 직원이 아닙니다 并入原有 아니다／否定表达知识点。',
      negativeIdentityBody,'2026.11.18-p5-negative-identity'),
    '2026.11.18-p5-negative-identity',
    /语法体系|否定|名词谓语/i
  );

  // 3.7 书写规则：保留课件中的两项拼写及两项中文释义核对，仍在原有知识卡内。
  const correctionHTML = `<div class="tjm-errata">
    <b>原课件拼写与释义核对</b>
    ${LESSON_1118_CORRECTIONS.map(([old,correct,why]) =>
      `<p><b>${esc(old)}</b> → <b>${esc(correct)}</b>：${esc(why)}</p>`).join('')}
  </div>`;
  appendToExistingKnowledgeCard(
    /3\.7(?:\s|$)|书写基本规则|书写规则|拼写规则/i,
    lessonInlineBlock(2,'课件词汇拼写与释义核对',
      '以下核对内容对应原课件第2页，不另设新的知识点章节。',
      correctionHTML,'2026.11.18-p2-corrections'),
    '2026.11.18-p2-corrections',
    /文字基础|书写|拼写|语法体系/i
  );

  // 确保所有阅读例句均已分配到原有知识点；不创建新的 KB_CHAPTERS 项。
  window.__tjm1118MergeReport.totalReadingSentences = LESSON_1118_SENTENCES.filter(s => /^11\.18 읽기/.test(s.src)).length;
  window.__tjm1118MergeReport.totalVocabulary = LESSON_1118_WORDS.length;
  window.__tjm1118MergeReport.chapterCountAfterMerge = KB_CHAPTERS.length;
  // 框选／本页笔记：移动原生工具条本身到视口右下角，横向并排。
  // 保留原始按钮节点及事件监听；笔记数量继续读取原按钮中的动态计数。
  const main = document.getElementById('main');
  const pencilSVG = `<svg class="tjm-note-icon" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M550.4 292.48l180.992 180.992-422.4 422.4H128v-181.034667l422.4-422.4z m60.330667-60.373333l90.496-90.496a42.666667 42.666667 0 0 1 60.330666 0l120.704 120.661333a42.666667 42.666667 0 0 1 0 60.373333l-90.538666 90.496-180.992-181.034666z" fill="currentColor"/></svg>`;
  const bookSVG = `<svg class="tjm-note-icon" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M320 64h576v768H320z" fill="currentColor"/><path d="M184.6 896c0-64 29.4-64 56.7-64H256V64h-64c-35.4 0-64 28.6-64 64v768c0 35.4 28.6 64 64 64h704v-64H184.6z" fill="currentColor"/></svg>`;

  function readNoteCount(button) {
    const existingBadge = button.querySelector('.tjm-note-count-badge:not([data-tjm-generated="true"])');
    if (existingBadge && /^\s*\d+\s*$/.test(existingBadge.textContent || ''))
      return {value:(existingBadge.textContent || '').trim(), node:existingBadge};

    const numericChild = [...button.querySelectorAll('span,small,b,strong,em,i,[data-count],[class*="count"],[class*="badge"]')]
      .find(el => !el.classList.contains('tjm-note-count-badge') &&
        !el.classList.contains('tjm-note-icon') &&
        /^\s*\d+\s*$/.test(el.textContent || ''));
    if (numericChild) return {value:(numericChild.textContent || '').trim(), node:numericChild};

    const attr = button.getAttribute('data-note-count') ||
      button.getAttribute('data-notes-count') || button.getAttribute('data-count');
    if (attr != null && /^\s*\d+\s*$/.test(attr)) return {value:attr.trim(), node:null};

    const clone = button.cloneNode(true);
    clone.querySelectorAll('.tjm-note-icon,.tjm-note-count-badge').forEach(el => el.remove());
    const rawText = (clone.textContent || '').replace(/\s+/g, ' ').trim();
    const match = rawText.match(/(?:本页笔记|笔记)\s*[:：]?\s*(\d+)/) || rawText.match(/\b(\d+)\b/);
    return match ? {value:match[1], node:null} : null;
  }

  function syncNoteCount(button) {
    const found = readNoteCount(button);
    if (found && found.node) {
      found.node.classList.add('tjm-note-count-badge');
      found.node.setAttribute('aria-hidden', 'true');
      found.node.hidden = false;
      const generated = button.querySelector(':scope > .tjm-note-count-badge[data-tjm-generated="true"]');
      if (generated) generated.remove();
      return found.value;
    }

    let badge = button.querySelector(':scope > .tjm-note-count-badge[data-tjm-generated="true"]');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'tjm-note-count-badge';
      badge.dataset.tjmGenerated = 'true';
      badge.setAttribute('aria-hidden', 'true');
      button.append(badge);
    }
    if (found) {
      if (badge.textContent !== found.value) badge.textContent = found.value;
      badge.hidden = false;
      return found.value;
    }
    badge.hidden = true;
    return null;
  }

  function applyFixedNoteTools() {
    const tools = main.querySelector('.note-tools');
    if (!tools) return;
    tools.classList.add('tjm-fixed-note-tools');

    [['box', pencilSVG, '框选'], ['go-notes', bookSVG, '本页笔记']].forEach(([action, svg, label]) => {
      const button = tools.querySelector(`[data-act="${action}"]`);
      if (!button) return;
      if (!button.querySelector('.tjm-note-icon')) button.insertAdjacentHTML('afterbegin', svg);
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
      button.classList.add('tjm-note-circle');
      if (action === 'go-notes') {
        const count = syncNoteCount(button);
        button.setAttribute('aria-label', count == null ? label : `${label}，${count}条`);
      }
    });
  }

  // 页面切换或笔记数变化后重新应用样式与角标。
  const noteToolsObserver = new MutationObserver(() => requestAnimationFrame(applyFixedNoteTools));
  noteToolsObserver.observe(main, {childList:true, subtree:true, characterData:true});
  applyFixedNoteTools();

  // iPad 选区浮动标记菜单：现有 notes.js 在 scroll 时直接 hideBar，
  // 使用捕获阶段标记滚动原因，仅对滚动引发的 hideBar 放行菜单悬浮。
  let scrolling = false;
  addEventListener('scroll', () => {
    scrolling = true;
    requestAnimationFrame(() => { scrolling = false; });
  }, {capture:true, passive:true});
  const oldHideBar = hideBar;
  const oldShowBar = showBar;
  hideBar = function (...args) {
    const el = document.getElementById('noteBar');
    if (scrolling && el && el.classList.contains('tjm-note-pinned')) return;
    el?.classList.remove('tjm-note-pinned');
    return oldHideBar(...args);
  };
  showBar = function (rect,note) {
    oldShowBar(rect,note);
    const el = document.getElementById('noteBar');
    const isPad = matchMedia('(pointer:coarse) and (max-width:1199px)').matches;
    el?.classList.toggle('tjm-note-pinned', isPad);
  };

  // 原站脚本初始化时已渲染一次，用新闪卡模板刷新，不丢失当前的复习状态。
  if (currentView === 'flash') renderFlash();
  else if (currentView === 'knowledge') renderKnowledge();
  applyFixedNoteTools();
})();
