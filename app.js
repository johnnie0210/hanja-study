/* 한자 공부 — 앱 로직 */
(function () {
  'use strict';

  const DATA = window.HANJA_DATA || { entries: [], characters: [], counts: {}, typeLabel: {} };
  const $ = (id) => document.getElementById(id);

  /* ================= 저장소 ================= */
  const STORE_KEY = 'hanja-study-v1';
  const defaultStats = () => ({ viewed: {}, quiz: { total: 0, correct: 0 }, wrong: {} });
  let stats = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultStats();
      return Object.assign(defaultStats(), JSON.parse(raw));
    } catch (e) { return defaultStats(); }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(stats)); } catch (e) {}
  }

  /* ================= 유틸 ================= */
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const firstLine = (s) => String(s || '').split('\n')[0];

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 1600);
  }

  /* ================= 카드 아이템 구성 ================= */
  const entryById = new Map(DATA.entries.map((e) => [e.id, e]));

  // 성어 카드 (사자성어·성어·단어·장구 — 한자목록 제외)
  const wordCards = DATA.entries
    .filter((e) => e.type !== 'charlist')
    .map((e) => ({
      key: 'w' + e.id,
      kind: 'word',
      hanja: e.hanja,
      reading: e.reading,
      meaning: e.meaning,
      typeLabel: DATA.typeLabel[e.type] || '성어',
      chars: e.chars,
    }));

  // 개별 한자 카드
  const charCards = DATA.characters.map((c) => {
    const usedIn = c.in.map((id) => entryById.get(id)).filter(Boolean).filter((e) => e.type !== 'charlist');
    return {
      key: 'c' + c.hanja,
      kind: 'char',
      hanja: c.hanja,
      reading: c.readings.join(' · '),
      meaning: c.meanings.join(', '),
      typeLabel: '한자',
      chars: [],
      usedWords: uniq(usedIn.map((e) => e.hanja)).slice(0, 6),
    };
  });

  const decks = {
    word: wordCards,
    char: charCards,
    all: wordCards.concat(charCards),
  };

  /* ================= 탭 ================= */
  const TABS = ['card', 'quiz', 'list'];
  function switchTab(tab) {
    TABS.forEach((t) => {
      document.querySelector('.tab[data-tab="' + t + '"]').classList.toggle('active', t === tab);
      $('view-' + t).classList.toggle('hidden', t !== tab);
    });
    window.scrollTo({ top: 0 });
    if (tab === 'list') renderList();
  }
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  /* ================= 카드 학습 ================= */
  let cardDeckName = 'word';
  let cardList = [];
  let cardIndex = 0;
  let order = [];          // 셔플된 순서 (인덱스 배열)

  function buildCardList() {
    const base = decks[cardDeckName] || [];
    cardList = base.slice();
    applyCardOrder();
    cardIndex = 0;
    showCard();
  }
  function applyCardOrder() {
    order = cardList.map((_, i) => i);
    if ($('card-shuffle').checked) order = shuffle(order);
    cardIndex = 0;
  }
  function currentCard() { return cardList[order[cardIndex]]; }

  function showCard() {
    const c = currentCard();
    const fc = $('flip-card');
    fc.classList.remove('flipped');
    if (!c) {
      $('card-front-hanja').textContent = '—';
      $('card-front-type').textContent = '';
      $('card-back-reading').textContent = '';
      $('card-back-meaning').textContent = '';
      $('card-back-chars').innerHTML = '';
      $('card-progress-text').textContent = '0 / 0';
      $('card-progress-fill').style.width = '0%';
      return;
    }
    $('card-front-type').textContent = c.typeLabel;
    $('card-front-hanja').textContent = c.hanja;
    $('card-back-type').textContent = c.typeLabel;
    $('card-back-hanja').textContent = c.hanja;
    $('card-back-reading').textContent = c.reading || '';
    $('card-back-meaning').textContent = c.meaning || '';

    const cc = $('card-back-chars');
    if (c.kind === 'char' && c.usedWords && c.usedWords.length) {
      cc.className = 'card-chars used';
      cc.innerHTML = '<div class="usedwords-label">쓰인 곳</div>' +
        c.usedWords.map((w) => '<span class="uw">' + esc(w) + '</span>').join('');
    } else {
      cc.className = 'card-chars';
      cc.innerHTML = (c.chars || []).map((ch) =>
        '<div class="cc"><b>' + esc(ch.hanja) + '</b><span>' + esc(ch.reading) +
        (ch.meaning ? ' ' + esc(ch.meaning) : '') + '</span></div>'
      ).join('');
    }

    $('card-progress-text').textContent = (cardIndex + 1) + ' / ' + cardList.length;
    const pct = cardList.length ? ((cardIndex + 1) / cardList.length * 100) : 0;
    $('card-progress-fill').style.width = pct + '%';
    updateKnownStat();
  }

  function flipCard() {
    const c = currentCard();
    if (!c) return;
    const fc = $('flip-card');
    fc.classList.toggle('flipped');
    if (fc.classList.contains('flipped') && !stats.viewed[c.key]) {
      stats.viewed[c.key] = 1;
      save();
      updateKnownStat();
    }
  }
  function nextCard() {
    if (!cardList.length) return;
    cardIndex = (cardIndex + 1) % cardList.length;
    showCard();
  }
  function prevCard() {
    if (!cardList.length) return;
    cardIndex = (cardIndex - 1 + cardList.length) % cardList.length;
    showCard();
  }
  function updateKnownStat() {
    const known = cardList.filter((c) => stats.viewed[c.key]).length;
    $('card-known-count').textContent = cardList.length
      ? ('이 묶음에서 학습한 카드 ' + known + ' / ' + cardList.length)
      : '';
  }

  $('flip-card').addEventListener('click', flipCard);
  $('btn-flip').addEventListener('click', flipCard);
  $('btn-next').addEventListener('click', nextCard);
  $('btn-prev').addEventListener('click', prevCard);
  $('card-shuffle').addEventListener('change', () => { applyCardOrder(); showCard(); });
  document.querySelectorAll('#card-deck-seg .seg-btn').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#card-deck-seg .seg-btn').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      cardDeckName = b.dataset.deck;
      buildCardList();
    });
  });

  // 스와이프
  (function swipe() {
    const stage = $('card-stage');
    let x0 = null, y0 = null;
    stage.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      const dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) { dx < 0 ? nextCard() : prevCard(); }
      x0 = y0 = null;
    }, { passive: true });
  })();

  /* ================= 퀴즈 ================= */
  const quizCfg = { qtype: 'hanja2sound', scope: 'idiom', count: 20, order: 'random' };
  let quiz = null;

  document.querySelectorAll('#quiz-type-seg .seg-btn').forEach((b) =>
    b.addEventListener('click', () => { setActive(b); quizCfg.qtype = b.dataset.qtype; updateWeakInfo(); }));
  document.querySelectorAll('#quiz-scope-seg .seg-btn').forEach((b) =>
    b.addEventListener('click', () => { setActive(b); quizCfg.scope = b.dataset.scope; updateWeakInfo(); }));
  document.querySelectorAll('#quiz-count-seg .seg-btn').forEach((b) =>
    b.addEventListener('click', () => { setActive(b); quizCfg.count = parseInt(b.dataset.count, 10); }));
  document.querySelectorAll('#quiz-order-seg .seg-btn').forEach((b) =>
    b.addEventListener('click', () => { setActive(b); quizCfg.order = b.dataset.order; }));

  function setActive(btn) {
    btn.parentElement.querySelectorAll('.seg-btn').forEach((x) => x.classList.remove('active'));
    btn.classList.add('active');
  }

  function scopeItems() {
    switch (quizCfg.scope) {
      case 'idiom': return DATA.entries.filter((e) => e.type === 'idiom').map(entryToItem);
      case 'word': return DATA.entries.filter((e) => e.type !== 'charlist').map(entryToItem);
      case 'char': return charCards.slice();
      default: return wordCards.concat(charCards);
    }
  }
  function entryToItem(e) {
    return { key: 'w' + e.id, kind: 'word', hanja: e.hanja, reading: e.reading, meaning: e.meaning };
  }

  function updateWeakInfo() {
    const items = scopeItems();
    const weak = items.filter((it) => (stats.wrong[it.key] || 0) > 0).length;
    $('quiz-weak-info').textContent = stats.quiz.total
      ? ('지금까지 ' + stats.quiz.total + '문제 · 정답률 ' + Math.round(stats.quiz.correct / stats.quiz.total * 100) + '% · 틀린 항목 ' + weak + '개')
      : '아직 퀴즈 기록이 없습니다.';
  }

  $('btn-start-quiz').addEventListener('click', () => startQuiz(scopeItems()));

  function startQuiz(items) {
    let pool = items.slice();
    if (quizCfg.order === 'weak') {
      pool.sort((a, b) => (stats.wrong[b.key] || 0) - (stats.wrong[a.key] || 0));
      // 상위 절반은 약한 것 우선, 나머지는 랜덤
      const half = Math.ceil(pool.length / 2);
      pool = pool.slice(0, half).concat(shuffle(pool.slice(half)));
    } else {
      pool = shuffle(pool);
    }
    const n = quizCfg.count > 0 ? Math.min(quizCfg.count, pool.length) : pool.length;
    pool = pool.slice(0, n);
    if (pool.length < 4) { toast('문제가 너무 적습니다'); return; }

    // 보기 풀 (정답 후보 전체)
    const allAnswers = {
      sound: uniq(items.map((it) => it.reading).filter(Boolean)),
      mean: uniq(items.map((it) => firstLine(it.meaning)).filter(Boolean)),
      hanja: uniq(items.map((it) => it.hanja)),
    };
    const allSound = uniq(wordCards.concat(charCards).map((it) => it.reading).filter(Boolean));
    const allMean = uniq(wordCards.concat(charCards).map((it) => firstLine(it.meaning)).filter(Boolean));
    const allHanja = uniq(DATA.entries.filter((e) => e.type !== 'charlist').map((e) => e.hanja));

    quiz = { queue: pool, idx: 0, correct: 0, wrongList: [], answered: false };
    $('quiz-setup').classList.add('hidden');
    $('quiz-result').classList.add('hidden');
    $('quiz-play').classList.remove('hidden');
    renderQuestion(allAnswers, allSound, allMean, allHanja);
  }

  function renderQuestion(answers, allSound, allMean, allHanja) {
    if (quiz.idx >= quiz.queue.length) return showResult();
    quiz.answered = false;
    const it = quiz.queue[quiz.idx];
    const q = quizCfg.qtype;

    let prompt, questionText, questionCls, correct, distractorPool;
    if (q === 'hanja2sound') {
      prompt = it.kind === 'char' ? '다음 한자의 음은?' : '다음 한자의 음(독음)은?';
      questionText = it.hanja; questionCls = '';
      correct = it.reading;
      distractorPool = answers.sound.length >= 4 ? answers.sound : allSound;
    } else if (q === 'hanja2mean') {
      prompt = '다음 한자의 뜻은?';
      questionText = it.hanja; questionCls = '';
      correct = firstLine(it.meaning);
      distractorPool = answers.mean.length >= 4 ? answers.mean : allMean;
    } else { // sound2hanja
      prompt = it.kind === 'char' ? '다음 음에 해당하는 한자는?' : '다음 독음에 해당하는 한자는?';
      questionText = it.reading; questionCls = 'text';
      correct = it.hanja;
      distractorPool = answers.hanja.length >= 4 ? answers.hanja : allHanja;
    }

    const opts = buildOptions(correct, distractorPool);
    quiz.current = { it, correct };

    $('quiz-counter').textContent = (quiz.idx + 1) + ' / ' + quiz.queue.length;
    $('quiz-score').textContent = quiz.correct + '점';
    $('quiz-progress-fill').style.width = (quiz.idx / quiz.queue.length * 100) + '%';
    $('quiz-prompt').textContent = prompt;
    $('quiz-question').textContent = questionText;
    $('quiz-question').className = 'quiz-hanja ' + questionCls;

    const box = $('quiz-options');
    box.innerHTML = opts.map((o) =>
      '<button class="opt" data-val="' + esc(o) + '">' + esc(o) + '</button>'
    ).join('');
    box.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', onAnswer));

    $('btn-quiz-next').disabled = true;
    $('btn-quiz-next').textContent = (quiz.idx === quiz.queue.length - 1) ? '결과 보기' : '다음';
  }

  function buildOptions(correct, poolIn) {
    const pool = uniq(poolIn.filter((x) => x && x !== correct));
    const distract = shuffle(pool).slice(0, 3);
    return shuffle([correct].concat(distract));
  }

  function onAnswer(e) {
    if (quiz.answered) return;
    quiz.answered = true;
    const btn = e.currentTarget;
    const picked = btn.dataset.val;
    const { it, correct } = quiz.current;
    const ok = picked === correct;

    $('quiz-options').querySelectorAll('.opt').forEach((b) => {
      b.disabled = true;
      if (b.dataset.val === correct) b.classList.add('correct');
      else if (b === btn) b.classList.add('wrong');
    });

    stats.quiz.total += 1;
    if (ok) {
      quiz.correct += 1;
      stats.quiz.correct += 1;
      stats.wrong[it.key] = Math.max(0, (stats.wrong[it.key] || 0));
    } else {
      stats.wrong[it.key] = (stats.wrong[it.key] || 0) + 1;
      quiz.wrongList.push({ hanja: it.hanja, reading: it.reading, correct: correct, picked: picked });
    }
    save();
    $('quiz-score').textContent = quiz.correct + '점';
    $('btn-quiz-next').disabled = false;
  }

  $('btn-quiz-next').addEventListener('click', () => {
    quiz.idx += 1;
    if (quiz.idx >= quiz.queue.length) showResult();
    else renderQuestion(quizAnswers(), quizAllSound(), quizAllMean(), quizAllHanja());
  });

  // renderQuestion 에 넘길 보기 풀 재계산 (설정 유지)
  function quizAnswers() {
    const items = scopeItems();
    return {
      sound: uniq(items.map((it) => it.reading).filter(Boolean)),
      mean: uniq(items.map((it) => firstLine(it.meaning)).filter(Boolean)),
      hanja: uniq(items.map((it) => it.hanja)),
    };
  }
  const quizAllSound = () => uniq(wordCards.concat(charCards).map((it) => it.reading).filter(Boolean));
  const quizAllMean = () => uniq(wordCards.concat(charCards).map((it) => firstLine(it.meaning)).filter(Boolean));
  const quizAllHanja = () => uniq(DATA.entries.filter((e) => e.type !== 'charlist').map((e) => e.hanja));

  function showResult() {
    $('quiz-play').classList.add('hidden');
    $('quiz-result').classList.remove('hidden');
    const total = quiz.queue.length;
    const pct = Math.round(quiz.correct / total * 100);
    $('result-score').textContent = total + '문제 중 ' + quiz.correct + '개 정답 (' + pct + '%)';
    let emoji = '🎉', title = '훌륭해요!';
    if (pct < 60) { emoji = '💪'; title = '조금 더 힘내요'; }
    else if (pct < 85) { emoji = '👍'; title = '잘하고 있어요'; }
    $('result-emoji').textContent = emoji;
    $('result-title').textContent = title;

    const wl = quiz.wrongList;
    $('result-wrong').innerHTML = wl.length
      ? '<p class="field-label">틀린 항목</p>' + wl.map((w) =>
        '<div class="rw"><b>' + esc(w.hanja) + '</b><span>' + esc(w.correct) + '</span></div>').join('')
      : '<p class="result-score">틀린 문제가 없습니다! 🏆</p>';
  }

  $('btn-quiz-again').addEventListener('click', () => {
    $('quiz-result').classList.add('hidden');
    $('quiz-setup').classList.remove('hidden');
    updateWeakInfo();
  });
  $('btn-review-wrong').addEventListener('click', () => {
    const keys = Object.keys(stats.wrong).filter((k) => stats.wrong[k] > 0);
    const items = wordCards.concat(charCards).filter((it) => keys.includes(it.key));
    if (items.length < 4) { toast('복습할 틀린 항목이 부족해요'); return; }
    $('quiz-result').classList.add('hidden');
    $('quiz-play').classList.remove('hidden');
    // 복습용 퀴즈 (설정 무시, 무작위)
    quiz = { queue: shuffle(items), idx: 0, correct: 0, wrongList: [], answered: false };
    renderQuestion(quizAnswers(), quizAllSound(), quizAllMean(), quizAllHanja());
  });

  /* ================= 목록 ================= */
  let listFilter = 'all';
  document.querySelectorAll('#list-filter-seg .seg-btn').forEach((b) =>
    b.addEventListener('click', () => { setActive(b); listFilter = b.dataset.filter; renderList(); }));
  $('list-search').addEventListener('input', renderList);

  function renderList() {
    const q = $('list-search').value.trim().toLowerCase();
    let items = DATA.entries.slice();
    if (listFilter !== 'all') items = items.filter((e) => e.type === listFilter);
    if (q) {
      items = items.filter((e) =>
        (e.hanja + ' ' + e.reading + ' ' + e.meaning).toLowerCase().includes(q));
    }
    $('list-count').textContent = items.length + '개 항목';
    $('list-body').innerHTML = items.map((e) => {
      const chars = (e.chars || []).map((c) =>
        '<div class="cc"><b>' + esc(c.hanja) + '</b><span>' +
        esc(c.reading) + (c.meaning ? ' ' + esc(c.meaning) : '') + '</span></div>').join('');
      return '<div class="entry">' +
        '<div class="entry-head">' +
          '<div><div class="entry-hanja' + (e.hanja.length > 4 ? ' long' : '') + '">' + esc(e.hanja) + '</div>' +
          (e.reading ? '<div class="entry-reading">' + esc(e.reading) + '</div>' : '') + '</div>' +
          '<span class="entry-badge">' + esc(DATA.typeLabel[e.type] || '') + '</span>' +
        '</div>' +
        (e.meaning ? '<div class="entry-meaning">' + esc(e.meaning) + '</div>' : '') +
        (chars ? '<div class="entry-chars">' + chars + '</div>' : '') +
        '</div>';
    }).join('') || '<p class="list-count">결과가 없습니다.</p>';
  }

  /* ================= 정보 시트 ================= */
  $('btn-info').addEventListener('click', () => {
    $('info-source').textContent = DATA.source || '—';
    $('info-entries').textContent = (DATA.counts.entries || DATA.entries.length) + '개';
    $('info-chars').textContent = (DATA.counts.characters || DATA.characters.length) + '자';
    $('info-date').textContent = DATA.generated ? DATA.generated.slice(0, 10) : '—';
    const knownTotal = Object.keys(stats.viewed).length;
    const acc = stats.quiz.total ? Math.round(stats.quiz.correct / stats.quiz.total * 100) + '%' : '0%';
    $('stat-known').textContent = knownTotal;
    $('stat-quiz').textContent = stats.quiz.total;
    $('stat-acc').textContent = acc;
    $('sheet-backdrop').classList.remove('hidden');
  });
  $('sheet-backdrop').addEventListener('click', (e) => {
    if (e.target === $('sheet-backdrop')) $('sheet-backdrop').classList.add('hidden');
  });
  $('btn-reset').addEventListener('click', () => {
    if (confirm('학습 기록을 모두 지울까요?')) {
      stats = defaultStats();
      save();
      $('btn-info').click();
      updateKnownStat();
      toast('초기화 완료');
    }
  });

  /* ================= 헬퍼 ================= */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function uniq(arr) { return [...new Set(arr)]; }

  /* ================= 시작 ================= */
  function init() {
    const n = DATA.entries.length;
    $('load-status').textContent = n ? (n + '개 항목 · ' + DATA.characters.length + '자') : '데이터 없음';
    buildCardList();
    updateWeakInfo();
    renderList();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  init();
})();
