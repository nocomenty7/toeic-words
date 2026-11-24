/**
 * TOEIC 100% 단어 암기 - 메인 앱 컨트롤러
 */
(function () {
  'use strict';

  const state = window.Storage.load();
  let currentSection = 'vocab'; // 'vocab' | 'part5'
  let currentTab = 'learn';     // vocab: learn|flashcard|audio|list | part5: p5_quiz|p5_list|p5_add

  try {
    const savedNav = JSON.parse(sessionStorage.getItem('toeic_nav_state') || 'null');
    if (savedNav && (savedNav.section === 'vocab' || savedNav.section === 'part5')) {
      currentSection = savedNav.section;
      currentTab = savedNav.tab || (currentSection === 'part5' ? 'p5_quiz' : 'learn');
    }
  } catch (_) {
    // ignore
  }

  function saveNavState() {
    try {
      sessionStorage.setItem('toeic_nav_state', JSON.stringify({ section: currentSection, tab: currentTab }));
    } catch (_) {
      // ignore
    }
  }

  // 세션 상태 (집중 암기)
  let session = null;

  // 플래시카드 상태
  const fcState = {
    filter: 'unmastered', // all | unmastered | wrong | starred | mastered
    frontMode: 'en',      // en | ko | audio
    cards: [],
    index: 0,
    flipped: false
  };

  // 귀로 암기 상태
  const audioState = {
    filter: 'unmastered',
    cards: [],
    index: 0,
    playing: false,
    revealMeaning: false,
    repeatEn: 2,
    pauseSec: 2.5,
    speakKo: true,
    shuffle: false,
    timerId: null,
    runId: 0
  };

  // 단어장 리스트 상태
  const listState = {
    filter: 'all',
    query: '',
    hideKo: false,
    hideEn: false,
    peekedIds: new Set()
  };

  // DOM 참조
  const mainEl = document.getElementById('mainContent');
  const bottomNavEl = document.getElementById('bottomNav');
  const activeDeckNameEl = document.getElementById('activeDeckName');
  const btnDeckPicker = document.getElementById('btnDeckPicker');
  const toastEl = document.getElementById('toast');
  const deckDialog = document.getElementById('deckDialog');
  const settingsDialog = document.getElementById('settingsDialog');

  // 현재 카드의 임시 선택 억양 (새 카드마다 기본 'en-US' 미국발음)
  let cardAccent = 'en-US';

  let toastTimer = null;

  /* =========================================================
     유틸리티
     ========================================================= */
  function getActiveDeck() {
    return state.decks.find((d) => d.id === state.activeDeckId) || state.decks[0];
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function shuffleArray(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2200);
  }

  function speakWord(text, slow = false, onEnd, accentOverride) {
    const baseRate = state.settings.rate || 1.1;
    window.TTS.speak(text, {
      lang: accentOverride || 'en-US',
      rate: slow ? 0.75 : baseRate,
      onEnd
    });
  }

  function renderAudioControls(activeAccent = 'en-US', label = '🔊 발음 듣기') {
    return `
      <div class="audio-controls" data-audio-bar>
        <button class="speak-btn" data-audio-play="normal" type="button">${label}</button>
        <button class="speak-btn-slow" data-audio-play="slow" type="button">🐢 천천히</button>
        <span class="flag-group" role="group" aria-label="발음 국가 선택">
          <button class="flag-btn ${activeAccent === 'en-US' ? 'active' : ''}" data-audio-accent="en-US" type="button" title="미국 발음">🇺🇸</button>
          <button class="flag-btn ${activeAccent === 'en-GB' ? 'active' : ''}" data-audio-accent="en-GB" type="button" title="영국 발음">🇬🇧</button>
          <button class="flag-btn ${activeAccent === 'en-AU' ? 'active' : ''}" data-audio-accent="en-AU" type="button" title="호주 발음">🇦🇺</button>
        </span>
      </div>
    `;
  }

  function bindAudioControls(rootEl, text) {
    if (!rootEl) return;
    rootEl.querySelectorAll('[data-audio-bar]').forEach((bar) => {
      const playNormal = bar.querySelector('[data-audio-play="normal"]');
      const playSlow = bar.querySelector('[data-audio-play="slow"]');
      const flagBtns = bar.querySelectorAll('[data-audio-accent]');

      if (playNormal) {
        playNormal.addEventListener('click', (e) => {
          e.stopPropagation();
          speakWord(text, false, null, cardAccent);
        });
      }
      if (playSlow) {
        playSlow.addEventListener('click', (e) => {
          e.stopPropagation();
          speakWord(text, true, null, cardAccent);
        });
      }
      flagBtns.forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          cardAccent = btn.dataset.audioAccent;
          rootEl.querySelectorAll('[data-audio-accent]').forEach((b) => {
            b.classList.toggle('active', b.dataset.audioAccent === cardAccent);
          });
          speakWord(text, false, null, cardAccent);
        });
      });
    });
  }

  function applyTheme() {
    const theme = state.settings.theme || 'system';
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }

  function updateHeader() {
    const deck = getActiveDeck();
    if (currentSection === 'part5') {
      const p5Count = (state.part5 || []).length;
      activeDeckNameEl.textContent = `Part 5 오답노트 (${p5Count})`;
      btnDeckPicker.style.opacity = '0.9';
    } else {
      activeDeckNameEl.textContent = deck.name;
      btnDeckPicker.style.opacity = '1';
    }

    document.querySelectorAll('.sec-tab').forEach((btn) => {
      const active = btn.dataset.section === currentSection;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
  }

  function renderBottomNav() {
    const tabs = currentSection === 'part5'
      ? [
          { id: 'p5_quiz', icon: '📝', label: '오답풀기' },
          { id: 'p5_list', icon: '📋', label: '오답목록' },
          { id: 'p5_add', icon: '📸', label: '사진등록' }
        ]
      : [
          { id: 'learn', icon: '⚡', label: '집중암기' },
          { id: 'flashcard', icon: '🃏', label: '플래시카드' },
          { id: 'audio', icon: '🎧', label: '귀로암기' },
          { id: 'list', icon: '📋', label: '단어장' }
        ];

    bottomNavEl.classList.toggle('cols-3', tabs.length === 3);
    bottomNavEl.innerHTML = tabs.map((t) => `
      <button class="nav-item ${currentTab === t.id ? 'active' : ''}" data-tab="${t.id}" type="button">
        <span class="nav-icon">${t.icon}</span>
        <span class="nav-label">${t.label}</span>
      </button>
    `).join('');

    bottomNavEl.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
  }

  function switchSection(section) {
    if (currentSection === section) return;
    stopAudioAutoplay();
    window.TTS.stop();
    session = null;
    currentSection = section;
    currentTab = section === 'part5' ? 'p5_quiz' : 'learn';
    saveNavState();
    renderBottomNav();
    render();
    mainEl.scrollTop = 0;
  }

  function filterDeckWords(deck, filter) {
    return deck.words.filter((w) => {
      const p = window.Storage.getProgress(state, deck.id, w.id);
      if (filter === 'unmastered') return p.box < 3;
      if (filter === 'wrong') return p.wrong > 0 && p.box < 3;
      if (filter === 'starred') return p.starred;
      if (filter === 'mastered') return p.box === 3;
      return true;
    });
  }

  function makeHintPattern(word) {
    return word
      .split(' ')
      .map((part) => {
        if (part.length <= 2) return part[0] + '_'.repeat(Math.max(0, part.length - 1));
        return `${part[0]} ${'_ '.repeat(part.length - 2)}${part[part.length - 1]}`;
      })
      .join('   ');
  }

  /* =========================================================
     탭 전환 & 렌더링 라우터
     ========================================================= */
  function switchTab(tab) {
    stopAudioAutoplay();
    window.TTS.stop();
    currentTab = tab;
    saveNavState();
    if (tab !== 'learn') {
      session = null;
    }

    renderBottomNav();
    render();
    mainEl.scrollTop = 0;
  }

  function render() {
    updateHeader();
    if (currentSection === 'part5') {
      const p5Ctx = { state, mainEl, showToast, speakWord, switchTab, renderAudioControls, bindAudioControls };
      if (currentTab === 'p5_list') window.Part5Module.renderList(p5Ctx);
      else if (currentTab === 'p5_add') window.Part5Module.renderAdd(p5Ctx);
      else window.Part5Module.renderQuiz(p5Ctx);
      return;
    }

    if (currentTab === 'learn') {
      if (session) renderSession();
      else renderHome();
    } else if (currentTab === 'flashcard') {
      renderFlashcardView();
    } else if (currentTab === 'audio') {
      renderAudioView();
    } else if (currentTab === 'list') {
      renderListView();
    }
  }

  /* =========================================================
     1. 홈 대시보드 & 집중 암기 세션 (Smart Mastery)
     ========================================================= */
  function renderHome() {
    const deck = getActiveDeck();
    const stats = window.Storage.getDeckStats(state, deck);
    const chunk = Math.min(state.settings.chunkSize || 8, deck.words.length);
    const remainingCount = stats.unseen + stats.learning;

    mainEl.innerHTML = `
      <section class="card hero-card">
        <div class="hero-top">
          <span class="hero-badge">🎯 ${escapeHtml(deck.name)}</span>
          <span class="hero-badge">오늘 ${state.stats.todayReviews}회 학습</span>
        </div>
        <div class="hero-percent">${stats.percent}%</div>
        <div class="hero-sub">
          ${stats.mastered === stats.total
            ? '🎉 모든 단어를 100% 암기했어요! 반복 복습으로 완벽 고정하세요.'
            : `총 ${stats.total}개 중 ${stats.mastered}개 암기 완료 · ${remainingCount}개 남음`}
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width: ${stats.percent}%"></div>
        </div>
        <div class="stat-grid">
          <div class="stat-box">
            <div class="stat-num">${stats.mastered}</div>
            <div class="stat-label">암기완료</div>
          </div>
          <div class="stat-box">
            <div class="stat-num">${stats.learning}</div>
            <div class="stat-label">복습필요</div>
          </div>
          <div class="stat-box">
            <div class="stat-num">${stats.unseen}</div>
            <div class="stat-label">미학습</div>
          </div>
        </div>
      </section>

      <div class="section-heading">
        <span>최고 효율 암기 시작하기</span>
      </div>

      <div class="mode-list">
        <button class="mode-card featured" id="btnStartSmart" type="button">
          <div class="mode-icon">⚡</div>
          <div class="mode-info">
            <div class="mode-title">
              3단계 집중 암기 (${chunk}개 묶음)
              <span class="mode-tag">추천</span>
            </div>
            <div class="mode-desc">
              빠른 스캔 → 4지선다·듣기 퀴즈 → 최종 각인까지<br/>
              틀린 단어는 맞출 때까지 자동 재출제
            </div>
          </div>
          <span class="mode-arrow">›</span>
        </button>

        <button class="mode-card" id="btnStartWrong" type="button">
          <div class="mode-icon">🔥</div>
          <div class="mode-info">
            <div class="mode-title">오답 집중 폭격 (${stats.wrongWords}개)</div>
            <div class="mode-desc">한 번이라도 틀린 취약 단어만 모아 완벽 교정</div>
          </div>
          <span class="mode-arrow">›</span>
        </button>

        <button class="mode-card" id="btnStartFullTest" type="button">
          <div class="mode-icon">🎯</div>
          <div class="mode-info">
            <div class="mode-title">전체 ${stats.total}개 실전 스피드 테스트</div>
            <div class="mode-desc">영→한, 한→영, 리스닝을 섞어 100% 암기 검증</div>
          </div>
          <span class="mode-arrow">›</span>
        </button>

        <button class="mode-card" id="btnStartStarred" type="button">
          <div class="mode-icon">⭐</div>
          <div class="mode-info">
            <div class="mode-title">즐겨찾기 집중 암기 (${stats.starred}개)</div>
            <div class="mode-desc">별표 해둔 핵심 단어만 골라 빠르게 반복</div>
          </div>
          <span class="mode-arrow">›</span>
        </button>
      </div>

      <section class="card mt-16">
        <div style="font-size: 13.5px; font-weight: 800;">🧠 적용된 검증 암기 원리</div>
        <div class="method-pills">
          <span class="method-pill">청킹 (7±2개 분할)</span>
          <span class="method-pill">능동적 회상 (Active Recall)</span>
          <span class="method-pill">오답 즉시 재출제</span>
          <span class="method-pill">네이티브 청각 각인</span>
          <span class="method-pill">어원·예문 이중 부호화</span>
        </div>
      </section>
    `;

    document.getElementById('btnStartSmart').addEventListener('click', () => startSmartSession('smart'));
    document.getElementById('btnStartWrong').addEventListener('click', () => startSmartSession('wrong'));
    document.getElementById('btnStartFullTest').addEventListener('click', () => startSmartSession('fulltest'));
    document.getElementById('btnStartStarred').addEventListener('click', () => startSmartSession('starred'));
  }

  function startSmartSession(mode) {
    window.TTS.unlock();
    const deck = getActiveDeck();
    let pool = [];

    if (mode === 'wrong') {
      pool = deck.words.filter((w) => {
        const p = window.Storage.getProgress(state, deck.id, w.id);
        return p.wrong > 0 && p.box < 3;
      });
      if (!pool.length) {
        showToast('현재 틀린 단어가 없어요! 집중 암기를 시작해 보세요.');
        return;
      }
    } else if (mode === 'starred') {
      pool = deck.words.filter((w) => window.Storage.getProgress(state, deck.id, w.id).starred);
      if (!pool.length) {
        showToast('별표(⭐) 해둔 단어가 없어요. 단어장에서 별표를 눌러보세요.');
        return;
      }
    } else if (mode === 'fulltest') {
      pool = shuffleArray(deck.words);
    } else {
      // 'smart': 학습중/오답 우선 -> 미학습 -> 이미 다 외웠으면 전체 랜덤
      const chunkSize = Math.min(state.settings.chunkSize || 8, deck.words.length);
      const learning = deck.words.filter((w) => {
        const p = window.Storage.getProgress(state, deck.id, w.id);
        return p.box === 1 || p.box === 2;
      });
      const unseen = deck.words.filter((w) => window.Storage.getProgress(state, deck.id, w.id).box === 0);

      // 오답이 많은 순으로 정렬
      learning.sort((a, b) => {
        const pa = window.Storage.getProgress(state, deck.id, a.id);
        const pb = window.Storage.getProgress(state, deck.id, b.id);
        return pb.wrong - pa.wrong;
      });

      pool = [...learning, ...unseen].slice(0, chunkSize);
      if (!pool.length) {
        pool = shuffleArray(deck.words).slice(0, chunkSize);
        showToast('모두 암기완료! 복습 묶음으로 시작합니다.');
      }
    }

    // 세션 태스크 큐 구성
    const queue = [];
    if (mode === 'fulltest') {
      pool.forEach((w, idx) => {
        const qTypes = ['en2ko', 'ko2en', 'listen'];
        queue.push({
          word: w,
          type: qTypes[idx % qTypes.length],
          isRetry: false
        });
      });
    } else {
      // 1단계: 빠른 스캔 (Flashcard Peek)
      pool.forEach((w) => {
        queue.push({ word: w, type: 'peek', isRetry: false });
      });
      // 2단계: 능동 회상 퀴즈 (영→한 / 한→영 / 듣기 믹스)
      const shuffledForQuiz = shuffleArray(pool);
      shuffledForQuiz.forEach((w, idx) => {
        const qTypes = ['en2ko', 'listen', 'ko2en'];
        queue.push({
          word: w,
          type: qTypes[idx % qTypes.length],
          isRetry: false
        });
      });
      // 3단계: 최종 각인 (첫글자 힌트 회상)
      shuffleArray(pool).forEach((w) => {
        queue.push({ word: w, type: 'recall', isRetry: false });
      });
    }

    session = {
      mode,
      deckId: deck.id,
      words: pool,
      queue,
      completed: 0,
      totalInitial: queue.length,
      correctCount: 0,
      wrongCount: 0,
      missedMap: new Map(), // wordId -> word
      currentRevealed: false,
      answered: false,
      selectedChoiceIdx: null,
      choices: null,
      recallChecked: false,
      recallCorrect: false,
      recallTyped: ''
    };

    prepareCurrentTask();
    renderSession();
  }

  function prepareCurrentTask() {
    if (!session || !session.queue.length) return;
    const task = session.queue[0];
    cardAccent = 'en-US';
    session.currentRevealed = false;
    session.answered = false;
    session.selectedChoiceIdx = null;
    session.recallChecked = false;
    session.recallCorrect = false;
    session.recallTyped = '';

    if (task.type === 'en2ko' || task.type === 'ko2en' || task.type === 'listen') {
      session.choices = buildChoices(task.word);
    } else {
      session.choices = null;
    }

    // 자동 발음 (디폴트 미국 발음)
    if (state.settings.autoSpeak && (task.type === 'peek' || task.type === 'en2ko' || task.type === 'listen')) {
      setTimeout(() => {
        if (session && session.queue[0] === task) {
          speakWord(task.word.word, false, null, 'en-US');
        }
      }, 150);
    }
  }

  function buildChoices(targetWord) {
    const deck = getActiveDeck();
    const others = deck.words.filter((w) => w.id !== targetWord.id);
    // 같은 품사 단어를 우선 오답 보기로 섞어 변별력 강화
    const samePos = shuffleArray(others.filter((w) => targetWord.pos && w.pos === targetWord.pos));
    const diffPos = shuffleArray(others.filter((w) => !targetWord.pos || w.pos !== targetWord.pos));
    const distractors = [...samePos, ...diffPos].slice(0, 3);
    return shuffleArray([targetWord, ...distractors]);
  }

  function renderSession() {
    if (!session) {
      renderHome();
      return;
    }
    if (!session.queue.length) {
      renderSessionSummary();
      return;
    }

    const task = session.queue[0];
    const w = task.word;
    const deck = getActiveDeck();
    const prog = window.Storage.getProgress(state, deck.id, w.id);
    const pct = Math.min(99, Math.round((session.completed / Math.max(1, session.completed + session.queue.length)) * 100));

    let phaseLabel = '';
    if (task.isRetry) phaseLabel = '🔁 오답 재도전 (맞출 때까지 반복)';
    else if (task.type === 'peek') phaseLabel = '1단계 · 빠른 스캔 & 발음 각인';
    else if (task.type === 'en2ko') phaseLabel = '2단계 · 영→한 능동 회상';
    else if (task.type === 'ko2en') phaseLabel = '2단계 · 한→영 능동 회상';
    else if (task.type === 'listen') phaseLabel = '2단계 · 네이티브 발음 듣고 맞추기';
    else if (task.type === 'recall') phaseLabel = '3단계 · 100% 최종 회상 확인';

    let bodyHtml = '';

    if (task.type === 'peek') {
      bodyHtml = `
        <div class="prompt-card">
          <button class="star-corner ${prog.starred ? 'starred' : ''}" id="btnSessionStar" type="button" aria-label="별표">${prog.starred ? '★' : '☆'}</button>
          ${w.pos ? `<div class="prompt-pos">${escapeHtml(w.pos)}</div>` : ''}
          <div class="prompt-word">${escapeHtml(w.word)}</div>
          ${w.phonetic ? `<div class="prompt-phonetic">${escapeHtml(w.phonetic)}</div>` : ''}
          ${renderAudioControls(cardAccent, '🔊 발음 듣기')}

          ${session.currentRevealed ? `
            <div class="reveal-box">
              <div class="reveal-meaning">${escapeHtml(w.meaning)}</div>
              ${renderTipAndExample(w)}
            </div>
          ` : `
            <div style="margin-top: 14px;">
              <button class="btn btn-secondary full-width" id="btnRevealPeek" type="button">👀 뜻 확인하기</button>
            </div>
          `}
        </div>

        ${session.currentRevealed ? `
          <div class="btn-row mt-12">
            <button class="btn btn-danger-outline" id="btnPeekUnknown" type="button">🤔 헷갈려요</button>
            <button class="btn btn-success" id="btnPeekKnown" type="button">👌 이해했어요</button>
          </div>
        ` : ''}
      `;
    } else if (task.type === 'en2ko' || task.type === 'ko2en' || task.type === 'listen') {
      const isEnPrompt = task.type === 'en2ko';
      const isListenPrompt = task.type === 'listen';

      bodyHtml = `
        <div class="prompt-card">
          <button class="star-corner ${prog.starred ? 'starred' : ''}" id="btnSessionStar" type="button" aria-label="별표">${prog.starred ? '★' : '☆'}</button>
          ${isEnPrompt ? `
            ${w.pos ? `<div class="prompt-pos">${escapeHtml(w.pos)}</div>` : ''}
            <div class="prompt-word">${escapeHtml(w.word)}</div>
            ${w.phonetic ? `<div class="prompt-phonetic">${escapeHtml(w.phonetic)}</div>` : ''}
            ${renderAudioControls(cardAccent, '🔊 발음 듣기')}
          ` : isListenPrompt ? `
            <div style="font-size: 12.5px; color: var(--text-sub); margin-bottom: 4px;">발음을 듣고 알맞은 뜻을 고르세요</div>
            ${renderAudioControls(cardAccent, '🔊 다시 듣기')}
            ${session.answered ? `
              <div class="reveal-box">
                <div class="prompt-word" style="font-size: 22px;">${escapeHtml(w.word)}</div>
                ${w.phonetic ? `<div class="prompt-phonetic">${escapeHtml(w.phonetic)}</div>` : ''}
              </div>
            ` : ''}
          ` : `
            ${w.pos ? `<div class="prompt-pos">${escapeHtml(w.pos)}</div>` : ''}
            <div class="prompt-meaning-main">${escapeHtml(w.meaning)}</div>
            ${session.answered ? renderAudioControls(cardAccent, `🔊 ${escapeHtml(w.word)}`) : ''}
          `}

          ${session.answered ? renderTipAndExample(w) : ''}
        </div>

        <div class="choices-grid">
          ${session.choices.map((c, idx) => {
            let cls = 'choice-btn';
            if (session.answered) {
              if (c.id === w.id) cls += ' correct';
              else if (idx === session.selectedChoiceIdx) cls += ' wrong';
            }
            const label = task.type === 'ko2en' ? c.word : c.meaning;
            return `
              <button class="${cls}" data-choice="${idx}" type="button" ${session.answered ? 'disabled' : ''}>
                <span class="choice-num">${idx + 1}</span>
                <span>${escapeHtml(label)}</span>
              </button>
            `;
          }).join('')}
        </div>

        ${session.answered ? `
          <button class="btn btn-primary full-width mt-12" id="btnNextTask" type="button">
            다음 문제로 →
          </button>
        ` : ''}
      `;
    } else if (task.type === 'recall') {
      bodyHtml = `
        <div class="prompt-card">
          <button class="star-corner ${prog.starred ? 'starred' : ''}" id="btnSessionStar" type="button" aria-label="별표">${prog.starred ? '★' : '☆'}</button>
          ${w.pos ? `<div class="prompt-pos">${escapeHtml(w.pos)}</div>` : ''}
          <div class="prompt-meaning-main">${escapeHtml(w.meaning)}</div>
          <div class="hint-letters">${escapeHtml(makeHintPattern(w.word))}</div>

          ${!session.recallChecked ? `
            <div style="font-size: 12.5px; color: var(--text-sub); margin: 4px 0 12px;">
              영단어와 발음을 머릿속으로 떠올린 뒤 확인해 보세요
            </div>
            <button class="btn btn-primary full-width" id="btnRecallPeek" type="button">👀 정답 & 발음 확인하기</button>
          ` : `
            <div class="reveal-box">
              <div class="prompt-word" style="color: var(--primary);">${escapeHtml(w.word)}</div>
              ${w.phonetic ? `<div class="prompt-phonetic">${escapeHtml(w.phonetic)}</div>` : ''}
              ${renderAudioControls(cardAccent, '🔊 발음 듣기')}
              ${renderTipAndExample(w)}
            </div>
          `}
        </div>

        ${session.recallChecked ? `
          <div class="btn-row mt-12">
            <button class="btn btn-danger-outline" id="btnRecallWrong" type="button">😅 못 떠올렸어요</button>
            <button class="btn btn-success" id="btnRecallRight" type="button">👌 떠올렸어요!</button>
          </div>
        ` : ''}
      `;
    }

    mainEl.innerHTML = `
      <div class="session-header">
        <button class="icon-btn" id="btnExitSession" type="button" aria-label="세션 나가기" style="width: 32px; height: 32px;">✕</button>
        <div class="session-bar-wrap">
          <div class="session-meta">
            <span class="phase-badge ${task.isRetry ? 'retry' : ''}">${phaseLabel}</span>
            <span>${pct}% · 남음 ${session.queue.length}</span>
          </div>
          <div class="session-track">
            <div class="session-fill" style="width: ${pct}%"></div>
          </div>
        </div>
      </div>

      ${bodyHtml}
    `;

    bindSessionEvents(task);
  }

  function renderTipAndExample(w) {
    if (!state.settings.showTips) return '';
    if (!w.tip && !w.example) return '';
    return `
      <div class="tip-box">
        ${w.tip ? `<div>💡 <strong>암기 팁:</strong> ${escapeHtml(w.tip)}</div>` : ''}
        ${w.example ? `<div class="example-en">${escapeHtml(w.example)}</div>` : ''}
        ${w.exampleKo ? `<div class="example-ko">${escapeHtml(w.exampleKo)}</div>` : ''}
      </div>
    `;
  }

  function bindSessionEvents(task) {
    const w = task.word;
    const deck = getActiveDeck();

    const exitBtn = document.getElementById('btnExitSession');
    if (exitBtn) {
      exitBtn.addEventListener('click', () => {
        window.TTS.stop();
        session = null;
        renderHome();
      });
    }

    const starBtn = document.getElementById('btnSessionStar');
    if (starBtn) {
      starBtn.addEventListener('click', () => {
        const starred = window.Storage.toggleStar(state, deck.id, w.id);
        starBtn.classList.toggle('starred', starred);
        starBtn.textContent = starred ? '★' : '☆';
      });
    }

    bindAudioControls(mainEl, w.word);

    // Peek 이벤트
    const revealBtn = document.getElementById('btnRevealPeek');
    if (revealBtn) {
      revealBtn.addEventListener('click', () => {
        session.currentRevealed = true;
        renderSession();
      });
    }

    const peekUnknown = document.getElementById('btnPeekUnknown');
    if (peekUnknown) {
      peekUnknown.addEventListener('click', () => {
        session.missedMap.set(w.id, w);
        // 헷갈린 단어는 2단계 퀴즈에 한 번 더 삽입하여 집중 강화
        insertRetryTask(w, 'en2ko', 3);
        advanceSession();
      });
    }

    const peekKnown = document.getElementById('btnPeekKnown');
    if (peekKnown) {
      peekKnown.addEventListener('click', () => {
        advanceSession();
      });
    }

    // 4지선다 이벤트
    document.querySelectorAll('[data-choice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (session.answered) return;
        const idx = Number(btn.dataset.choice);
        const chosen = session.choices[idx];
        const isCorrect = chosen.id === w.id;

        session.answered = true;
        session.selectedChoiceIdx = idx;

        window.Storage.recordResult(state, deck.id, w.id, isCorrect);
        if (isCorrect) {
          session.correctCount += 1;
          if (task.type === 'ko2en' && state.settings.autoSpeak) {
            speakWord(w.word);
          }
        } else {
          session.wrongCount += 1;
          session.missedMap.set(w.id, w);
          speakWord(w.word);
          // 오답 즉시 재출제 (2~3문제 뒤)
          insertRetryTask(w, task.type === 'ko2en' ? 'en2ko' : 'ko2en', 2);
        }
        renderSession();
      });
    });

    // Recall 이벤트 (원터치 회상 확인 - 영타 입력 제거)
    const recallPeek = document.getElementById('btnRecallPeek');
    if (recallPeek) {
      recallPeek.addEventListener('click', () => {
        session.recallChecked = true;
        speakWord(w.word);
        renderSession();
      });
    }

    const recallWrong = document.getElementById('btnRecallWrong');
    if (recallWrong) {
      recallWrong.addEventListener('click', () => {
        session.wrongCount += 1;
        session.missedMap.set(w.id, w);
        window.Storage.recordResult(state, deck.id, w.id, false);
        insertRetryTask(w, 'en2ko', 2);
        advanceSession();
      });
    }

    const recallRight = document.getElementById('btnRecallRight');
    if (recallRight) {
      recallRight.addEventListener('click', () => {
        session.correctCount += 1;
        window.Storage.recordResult(state, deck.id, w.id, true);
        advanceSession();
      });
    }

    const nextBtn = document.getElementById('btnNextTask');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => advanceSession());
    }
  }

  function insertRetryTask(word, type, offset) {
    if (!session) return;
    const pos = Math.min(session.queue.length, offset + 1);
    session.queue.splice(pos, 0, {
      word,
      type,
      isRetry: true
    });
  }

  function advanceSession() {
    if (!session) return;
    session.queue.shift();
    session.completed += 1;
    if (!session.queue.length) {
      state.stats.sessionsCompleted += 1;
      window.Storage.save(state);
    } else {
      prepareCurrentTask();
    }
    renderSession();
    mainEl.scrollTop = 0;
  }

  function renderSessionSummary() {
    const totalAnswered = session.correctCount + session.wrongCount;
    const accuracy = totalAnswered ? Math.round((session.correctCount / totalAnswered) * 100) : 100;
    const missedWords = Array.from(session.missedMap.values());

    mainEl.innerHTML = `
      <section class="card summary-hero">
        <div class="summary-emoji">${accuracy >= 90 ? '🏆' : accuracy >= 70 ? '🎉' : '💪'}</div>
        <div class="summary-title">학습 라운드 완료!</div>
        <div class="summary-sub">
          이번 세션 정확도 <strong>${accuracy}%</strong> · ${session.words.length}개 단어 집중 훈련 완료
        </div>

        ${missedWords.length ? `
          <div class="weak-list">
            <div style="font-size: 13px; font-weight: 800; color: var(--danger); margin-bottom: 4px;">
              🔥 이번에 헷갈렸던 단어 (${missedWords.length}개)
            </div>
            ${missedWords.map((w) => `
              <div class="weak-item">
                <strong>${escapeHtml(w.word)}</strong>
                <span>${escapeHtml(w.meaning)}</span>
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="margin-top: 16px; padding: 12px; border-radius: 12px; background: var(--success-soft); color: var(--success); font-weight: 800; font-size: 14px;">
            ✨ 단 하나의 실수도 없이 완벽하게 통과했어요!
          </div>
        `}

        <div class="mt-16" style="display: flex; flex-direction: column; gap: 10px;">
          ${missedWords.length ? `
            <button class="btn btn-danger full-width" id="btnRetryMissed" type="button">
              🔥 헷갈린 ${missedWords.length}개만 바로 다시 암기
            </button>
          ` : ''}
          <button class="btn btn-primary full-width" id="btnNextChunk" type="button">
            ⚡ 다음 묶음 이어서 암기하기
          </button>
          <button class="btn btn-outline full-width" id="btnBackHome" type="button">
            홈 대시보드로 돌아가기
          </button>
        </div>
      </section>
    `;

    const retryBtn = document.getElementById('btnRetryMissed');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => startSmartSession('wrong'));
    }
    document.getElementById('btnNextChunk').addEventListener('click', () => startSmartSession('smart'));
    document.getElementById('btnBackHome').addEventListener('click', () => {
      session = null;
      renderHome();
    });
  }

  /* =========================================================
     2. 플래시카드 (3D Flip & Swipe)
     ========================================================= */
  function refreshFlashcards(shuffle = false) {
    const deck = getActiveDeck();
    let list = filterDeckWords(deck, fcState.filter);
    if (shuffle) list = shuffleArray(list);
    fcState.cards = list;
    fcState.index = 0;
    fcState.flipped = false;
  }

  function renderFlashcardView() {
    const deck = getActiveDeck();
    if (!fcState.cards.length) {
      fcState.cards = filterDeckWords(deck, fcState.filter);
    }
    if (fcState.index >= fcState.cards.length) {
      fcState.index = 0;
    }
    cardAccent = 'en-US';

    const filters = [
      { id: 'unmastered', label: '미암기' },
      { id: 'all', label: '전체' },
      { id: 'wrong', label: '오답' },
      { id: 'starred', label: '⭐ 별표' },
      { id: 'mastered', label: '암기완료' }
    ];

    const frontModes = [
      { id: 'en', label: '영어 앞면' },
      { id: 'ko', label: '뜻 앞면' },
      { id: 'audio', label: '발음만' }
    ];

    const card = fcState.cards[fcState.index];
    const prog = card ? window.Storage.getProgress(state, deck.id, card.id) : null;

    mainEl.innerHTML = `
      <div class="chip-scroll">
        ${filters.map((f) => `
          <button class="filter-chip ${fcState.filter === f.id ? 'active' : ''}" data-fc-filter="${f.id}" type="button">${f.label}</button>
        `).join('')}
      </div>

      <div class="fc-toolbar mt-8">
        <div class="segmented">
          ${frontModes.map((m) => `
            <button class="${fcState.frontMode === m.id ? 'active' : ''}" data-fc-front="${m.id}" type="button">${m.label}</button>
          `).join('')}
        </div>
        <button class="btn btn-outline btn-sm" id="btnFcShuffle" type="button">🔀 섞기</button>
      </div>

      ${!card ? `
        <div class="card empty-state">
          <div style="font-size: 36px; margin-bottom: 8px;">🎉</div>
          <div style="font-weight: 800; font-size: 16px;">해당 조건의 단어가 없어요!</div>
          <div style="font-size: 13px; margin-top: 4px;">위 필터에서 '전체'를 선택해 다시 복습할 수 있어요.</div>
        </div>
      ` : `
        <div class="flashcard-stage" id="fcStage">
          <div class="flashcard ${fcState.flipped ? 'flipped' : ''}" id="fcCard">
            <!-- 앞면 -->
            <div class="fc-face fc-front">
              <div class="fc-counter">${fcState.index + 1} / ${fcState.cards.length}</div>
              <button class="star-corner ${prog.starred ? 'starred' : ''}" id="btnFcStar" type="button">${prog.starred ? '★' : '☆'}</button>

              ${fcState.frontMode === 'en' ? `
                ${card.pos ? `<div class="prompt-pos">${escapeHtml(card.pos)}</div>` : ''}
                <div class="prompt-word">${escapeHtml(card.word)}</div>
                ${card.phonetic ? `<div class="prompt-phonetic">${escapeHtml(card.phonetic)}</div>` : ''}
                ${renderAudioControls(cardAccent, '🔊 발음 듣기')}
              ` : fcState.frontMode === 'ko' ? `
                ${card.pos ? `<div class="prompt-pos">${escapeHtml(card.pos)}</div>` : ''}
                <div class="prompt-meaning-main">${escapeHtml(card.meaning)}</div>
              ` : `
                <div style="font-size: 13px; color: var(--text-sub); margin-bottom: 10px;">발음만 듣고 단어와 뜻을 떠올려 보세요</div>
                ${renderAudioControls(cardAccent, '🔊 발음 듣기')}
              `}
              <div class="fc-tap-hint">카드를 탭하면 뒷면이 열립니다 · 좌/우 스와이프</div>
            </div>

            <!-- 뒷면 -->
            <div class="fc-face fc-back">
              <div class="fc-counter">${fcState.index + 1} / ${fcState.cards.length}</div>
              <div class="prompt-word" style="font-size: 24px;">${escapeHtml(card.word)}</div>
              ${card.phonetic ? `<div class="prompt-phonetic">${escapeHtml(card.phonetic)}</div>` : ''}
              <div class="reveal-meaning" style="margin-top: 8px;">${escapeHtml(card.meaning)}</div>
              ${renderAudioControls(cardAccent, '🔊 발음 듣기')}
              <div style="width: 100%;">${renderTipAndExample(card)}</div>
            </div>
          </div>
        </div>

        <div class="btn-row">
          <button class="btn btn-danger-outline" id="btnFcAgain" type="button">← 다시 볼래요</button>
          <button class="btn btn-success" id="btnFcKnow" type="button">외웠어요 →</button>
        </div>

        <div class="btn-row mt-8">
          <button class="btn btn-outline btn-sm" id="btnFcPrev" type="button">이전 카드</button>
          <button class="btn btn-outline btn-sm" id="btnFcNext" type="button">다음 카드</button>
        </div>
      `}
    `;

    // 필터 이벤트
    document.querySelectorAll('[data-fc-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        fcState.filter = btn.dataset.fcFilter;
        refreshFlashcards(false);
        renderFlashcardView();
      });
    });

    document.querySelectorAll('[data-fc-front]').forEach((btn) => {
      btn.addEventListener('click', () => {
        fcState.frontMode = btn.dataset.fcFront;
        fcState.flipped = false;
        renderFlashcardView();
      });
    });

    document.getElementById('btnFcShuffle').addEventListener('click', () => {
      refreshFlashcards(true);
      showToast('카드를 무작위로 섞었어요');
      renderFlashcardView();
    });

    if (!card) return;

    // 자동 발음 (앞면이 영어 또는 발음만일 때)
    if (state.settings.autoSpeak && !fcState.flipped && (fcState.frontMode === 'en' || fcState.frontMode === 'audio')) {
      setTimeout(() => {
        if (currentTab === 'flashcard' && fcState.cards[fcState.index] === card) {
          speakWord(card.word);
        }
      }, 160);
    }

    const fcCard = document.getElementById('fcCard');
    fcCard.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      fcState.flipped = !fcState.flipped;
      fcCard.classList.toggle('flipped', fcState.flipped);
      if (fcState.flipped && fcState.frontMode === 'ko' && state.settings.autoSpeak) {
        speakWord(card.word);
      }
    });

    // 모바일 스와이프 제스처
    let startX = 0;
    let startY = 0;
    fcCard.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    fcCard.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        if (dx > 0) handleFcGrade(true);
        else handleFcGrade(false);
      }
    }, { passive: true });

    bindAudioControls(mainEl, card.word);

    const starBtn = document.getElementById('btnFcStar');
    if (starBtn) {
      starBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const starred = window.Storage.toggleStar(state, deck.id, card.id);
        starBtn.classList.toggle('starred', starred);
        starBtn.textContent = starred ? '★' : '☆';
      });
    }

    document.getElementById('btnFcAgain').addEventListener('click', () => handleFcGrade(false));
    document.getElementById('btnFcKnow').addEventListener('click', () => handleFcGrade(true));
    document.getElementById('btnFcPrev').addEventListener('click', () => {
      fcState.index = (fcState.index - 1 + fcState.cards.length) % fcState.cards.length;
      fcState.flipped = false;
      renderFlashcardView();
    });
    document.getElementById('btnFcNext').addEventListener('click', () => {
      fcState.index = (fcState.index + 1) % fcState.cards.length;
      fcState.flipped = false;
      renderFlashcardView();
    });
  }

  function handleFcGrade(known) {
    const deck = getActiveDeck();
    const card = fcState.cards[fcState.index];
    if (!card) return;
    window.Storage.recordResult(state, deck.id, card.id, known);
    showToast(known ? '✅ 암기 단계 UP!' : '🔁 복습 목록에 유지했어요');
    fcState.flipped = false;
    fcState.index = (fcState.index + 1) % fcState.cards.length;
    renderFlashcardView();
  }

  /* =========================================================
     3. 귀로 암기 (Hands-Free Auto-Play)
     ========================================================= */
  function refreshAudioCards() {
    const deck = getActiveDeck();
    let list = filterDeckWords(deck, audioState.filter);
    if (audioState.shuffle) list = shuffleArray(list);
    audioState.cards = list;
    audioState.index = 0;
    audioState.revealMeaning = false;
  }

  function stopAudioAutoplay() {
    audioState.playing = false;
    audioState.runId += 1;
    clearTimeout(audioState.timerId);
    window.TTS.stop();
  }

  function startAudioAutoplay() {
    window.TTS.unlock();
    if (!audioState.cards.length) refreshAudioCards();
    if (!audioState.cards.length) {
      showToast('재생할 단어가 없어요.');
      return;
    }
    audioState.playing = true;
    audioState.runId += 1;
    const myRun = audioState.runId;
    renderAudioView();
    playAudioStep(myRun);
  }

  function playAudioStep(myRun) {
    if (!audioState.playing || audioState.runId !== myRun || !audioState.cards.length) return;
    const card = audioState.cards[audioState.index];
    audioState.revealMeaning = false;
    updateAudioCardDom();

    let count = 0;
    const speakNextEn = () => {
      if (!audioState.playing || audioState.runId !== myRun) return;
      count += 1;
      speakWord(card.word, false, () => {
        if (!audioState.playing || audioState.runId !== myRun) return;
        if (count < audioState.repeatEn) {
          audioState.timerId = setTimeout(speakNextEn, 650);
        } else {
          // 머릿속으로 뜻을 떠올리는 짧은 침묵 시간 (Active Recall Pause)
          audioState.timerId = setTimeout(() => {
            if (!audioState.playing || audioState.runId !== myRun) return;
            audioState.revealMeaning = true;
            updateAudioCardDom();

            const goNext = () => {
              if (!audioState.playing || audioState.runId !== myRun) return;
              audioState.timerId = setTimeout(() => {
                if (!audioState.playing || audioState.runId !== myRun) return;
                audioState.index = (audioState.index + 1) % audioState.cards.length;
                playAudioStep(myRun);
              }, 1100);
            };

            if (audioState.speakKo) {
              window.TTS.speak(card.meaning, {
                lang: 'ko-KR',
                rate: 1.05,
                onEnd: goNext
              });
            } else {
              audioState.timerId = setTimeout(goNext, 1300);
            }
          }, audioState.pauseSec * 1000);
        }
      });
    };

    speakNextEn();
  }

  function updateAudioCardDom() {
    const card = audioState.cards[audioState.index];
    if (!card) return;
    const counterEl = document.getElementById('audioCounter');
    const wordEl = document.getElementById('audioWord');
    const phonEl = document.getElementById('audioPhonetic');
    const meanEl = document.getElementById('audioMeaning');
    if (counterEl) counterEl.textContent = `${audioState.index + 1} / ${audioState.cards.length}`;
    if (wordEl) wordEl.textContent = card.word;
    if (phonEl) phonEl.textContent = card.phonetic || '';
    if (meanEl) {
      meanEl.textContent = card.meaning;
      meanEl.classList.toggle('hidden-meaning', !audioState.revealMeaning);
    }
  }

  function renderAudioView() {
    const deck = getActiveDeck();
    if (!audioState.cards.length) {
      audioState.cards = filterDeckWords(deck, audioState.filter);
    }
    const card = audioState.cards[audioState.index];

    const filters = [
      { id: 'unmastered', label: '미암기' },
      { id: 'all', label: '전체' },
      { id: 'wrong', label: '오답' },
      { id: 'starred', label: '⭐ 별표' }
    ];

    mainEl.innerHTML = `
      <div class="chip-scroll">
        ${filters.map((f) => `
          <button class="filter-chip ${audioState.filter === f.id ? 'active' : ''}" data-audio-filter="${f.id}" type="button">${f.label}</button>
        `).join('')}
      </div>

      <section class="card audio-stage mt-12">
        ${!card ? `
          <div class="empty-state" style="padding: 20px 0;">
            <div style="font-weight: 800;">재생할 단어가 없어요</div>
            <div style="font-size: 13px; margin-top: 4px;">위 필터에서 '전체'를 선택해 보세요.</div>
          </div>
        ` : `
          <div id="audioCounter" style="font-size: 12px; font-weight: 800; color: var(--text-muted); margin-bottom: 12px;">
            ${audioState.index + 1} / ${audioState.cards.length}
          </div>
          <div class="audio-wave ${audioState.playing ? 'playing' : ''}">🎧</div>
          <div id="audioWord" class="prompt-word">${escapeHtml(card.word)}</div>
          <div id="audioPhonetic" class="prompt-phonetic">${escapeHtml(card.phonetic || '')}</div>
          <div id="audioMeaning" class="audio-meaning-reveal ${audioState.playing && !audioState.revealMeaning ? 'hidden-meaning' : ''}">
            ${escapeHtml(card.meaning)}
          </div>

          <div class="btn-row mt-16">
            <button class="btn btn-outline" id="btnAudioPrev" type="button">⏮ 이전</button>
            <button class="btn ${audioState.playing ? 'btn-danger' : 'btn-primary'}" id="btnAudioToggle" type="button">
              ${audioState.playing ? '⏸ 정지' : '▶ 자동 재생'}
            </button>
          </div>
          <button class="btn btn-outline btn-sm full-width mt-8" id="btnAudioNext" type="button">다음 단어 ⏭</button>
        `}
      </section>

      <section class="card mt-12">
        <div class="setting-row" style="padding-top: 2px;">
          <div>
            <div class="setting-title">영어 발음 반복</div>
            <div class="setting-sub">단어당 발음 횟수</div>
          </div>
          <div class="segmented" id="segAudioRepeat">
            <button type="button" data-val="1" class="${audioState.repeatEn === 1 ? 'active' : ''}">1회</button>
            <button type="button" data-val="2" class="${audioState.repeatEn === 2 ? 'active' : ''}">2회</button>
            <button type="button" data-val="3" class="${audioState.repeatEn === 3 ? 'active' : ''}">3회</button>
          </div>
        </div>

        <div class="setting-row">
          <div>
            <div class="setting-title">뜻 떠올리는 대기 시간</div>
            <div class="setting-sub">영단어 후 침묵 간격</div>
          </div>
          <div class="segmented" id="segAudioPause">
            <button type="button" data-val="1.5" class="${audioState.pauseSec === 1.5 ? 'active' : ''}">1.5초</button>
            <button type="button" data-val="2.5" class="${audioState.pauseSec === 2.5 ? 'active' : ''}">2.5초</button>
            <button type="button" data-val="3.5" class="${audioState.pauseSec === 3.5 ? 'active' : ''}">3.5초</button>
          </div>
        </div>

        <div class="setting-row">
          <div>
            <div class="setting-title">한글 뜻 음성 읽어주기</div>
            <div class="setting-sub">화면 안 보고 귀로만 암기</div>
          </div>
          <label class="switch">
            <input id="toggleAudioKo" type="checkbox" ${audioState.speakKo ? 'checked' : ''} />
            <span class="slider"></span>
          </label>
        </div>

        <div class="setting-row">
          <div>
            <div class="setting-title">무작위 순서 재생</div>
            <div class="setting-sub">순서 암기 방지</div>
          </div>
          <label class="switch">
            <input id="toggleAudioShuffle" type="checkbox" ${audioState.shuffle ? 'checked' : ''} />
            <span class="slider"></span>
          </label>
        </div>
      </section>
    `;

    document.querySelectorAll('[data-audio-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        stopAudioAutoplay();
        audioState.filter = btn.dataset.audioFilter;
        refreshAudioCards();
        renderAudioView();
      });
    });

    const toggleBtn = document.getElementById('btnAudioToggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        if (audioState.playing) {
          stopAudioAutoplay();
          renderAudioView();
        } else {
          startAudioAutoplay();
        }
      });
    }

    const prevBtn = document.getElementById('btnAudioPrev');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        const wasPlaying = audioState.playing;
        stopAudioAutoplay();
        audioState.index = (audioState.index - 1 + audioState.cards.length) % audioState.cards.length;
        if (wasPlaying) startAudioAutoplay();
        else renderAudioView();
      });
    }

    const nextBtn = document.getElementById('btnAudioNext');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const wasPlaying = audioState.playing;
        stopAudioAutoplay();
        audioState.index = (audioState.index + 1) % audioState.cards.length;
        if (wasPlaying) startAudioAutoplay();
        else renderAudioView();
      });
    }

    document.querySelectorAll('#segAudioRepeat button').forEach((b) => {
      b.addEventListener('click', () => {
        audioState.repeatEn = Number(b.dataset.val);
        renderAudioView();
      });
    });
    document.querySelectorAll('#segAudioPause button').forEach((b) => {
      b.addEventListener('click', () => {
        audioState.pauseSec = Number(b.dataset.val);
        renderAudioView();
      });
    });
    document.getElementById('toggleAudioKo').addEventListener('change', (e) => {
      audioState.speakKo = e.target.checked;
    });
    document.getElementById('toggleAudioShuffle').addEventListener('change', (e) => {
      stopAudioAutoplay();
      audioState.shuffle = e.target.checked;
      refreshAudioCards();
      renderAudioView();
    });
  }

  /* =========================================================
     4. 단어장 리스트 (암기판 가리기 모드)
     ========================================================= */
  function renderListView() {
    const deck = getActiveDeck();
    const stats = window.Storage.getDeckStats(state, deck);
    let words = filterDeckWords(deck, listState.filter);

    if (listState.query.trim()) {
      const q = listState.query.trim().toLowerCase();
      words = words.filter((w) => w.word.toLowerCase().includes(q) || w.meaning.toLowerCase().includes(q));
    }

    const filters = [
      { id: 'all', label: `전체 (${stats.total})` },
      { id: 'unmastered', label: `미암기 (${stats.unseen + stats.learning})` },
      { id: 'wrong', label: `오답 (${stats.wrongWords})` },
      { id: 'starred', label: `⭐ (${stats.starred})` },
      { id: 'mastered', label: `완료 (${stats.mastered})` }
    ];

    mainEl.innerHTML = `
      <input id="listSearchInput" class="search-input" type="search" placeholder="🔍 영단어 또는 한글 뜻 검색..." value="${escapeHtml(listState.query)}" />

      <div class="chip-scroll">
        ${filters.map((f) => `
          <button class="filter-chip ${listState.filter === f.id ? 'active' : ''}" data-list-filter="${f.id}" type="button">${f.label}</button>
        `).join('')}
      </div>

      <div class="cover-bar">
        <button class="cover-toggle ${listState.hideKo ? 'active' : ''}" id="btnHideKo" type="button">
          ${listState.hideKo ? '👁️ 뜻 보이기' : '🙈 뜻 가리기 (암기판)'}
        </button>
        <button class="cover-toggle ${listState.hideEn ? 'active' : ''}" id="btnHideEn" type="button">
          ${listState.hideEn ? '👁️ 영어 보이기' : '🙈 영어 가리기'}
        </button>
      </div>

      <div style="font-size: 11.5px; color: var(--text-muted); margin: 0 2px 8px; display: flex; justify-content: space-between;">
        <span>가린 항목은 탭해서 확인 · 점(●) 탭으로 암기상태 변경</span>
        <span>${words.length}개</span>
      </div>

      <div class="word-list">
        ${!words.length ? `
          <div class="card empty-state">표시할 단어가 없어요.</div>
        ` : words.map((w) => {
          const p = window.Storage.getProgress(state, deck.id, w.id);
          const peeked = listState.peekedIds.has(w.id);
          const maskEn = listState.hideEn && !peeked;
          const maskKo = listState.hideKo && !peeked;
          return `
            <div class="word-row" data-word-id="${w.id}">
              <button class="status-dot box-${p.box}" data-action="cycle" type="button" title="암기 상태 변경"></button>
              <div class="word-row-main" data-action="peek">
                <div class="word-row-en">
                  <span class="${maskEn ? 'masked' : ''}">${escapeHtml(w.word)}</span>
                  ${w.pos ? `<span class="word-row-pos">${escapeHtml(w.pos)}</span>` : ''}
                </div>
                <div class="word-row-ko">
                  <span class="${maskKo ? 'masked' : ''}">${escapeHtml(w.meaning)}</span>
                </div>
              </div>
              <div class="word-row-actions">
                <button class="row-icon-btn" data-action="speak" type="button" aria-label="발음 듣기">🔊</button>
                <button class="row-icon-btn ${p.starred ? 'starred' : ''}" data-action="star" type="button" aria-label="별표">${p.starred ? '★' : '☆'}</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    const searchInput = document.getElementById('listSearchInput');
    searchInput.addEventListener('input', (e) => {
      listState.query = e.target.value;
      renderListView();
      const restored = document.getElementById('listSearchInput');
      if (restored) {
        restored.focus();
        restored.setSelectionRange(restored.value.length, restored.value.length);
      }
    });

    document.querySelectorAll('[data-list-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        listState.filter = btn.dataset.listFilter;
        renderListView();
      });
    });

    document.getElementById('btnHideKo').addEventListener('click', () => {
      listState.hideKo = !listState.hideKo;
      listState.peekedIds.clear();
      renderListView();
    });

    document.getElementById('btnHideEn').addEventListener('click', () => {
      listState.hideEn = !listState.hideEn;
      listState.peekedIds.clear();
      renderListView();
    });

    document.querySelectorAll('.word-row').forEach((row) => {
      const wid = row.dataset.wordId;
      const wordObj = deck.words.find((w) => w.id === wid);
      if (!wordObj) return;

      row.querySelector('[data-action="speak"]').addEventListener('click', () => {
        speakWord(wordObj.word);
      });

      row.querySelector('[data-action="star"]').addEventListener('click', () => {
        window.Storage.toggleStar(state, deck.id, wid);
        renderListView();
      });

      row.querySelector('[data-action="cycle"]').addEventListener('click', () => {
        const nextBox = window.Storage.cycleBox(state, deck.id, wid);
        const labels = ['미학습', '학습중', '복습중', '암기완료'];
        showToast(`"${wordObj.word}" → ${labels[nextBox]}`);
        renderListView();
      });

      row.querySelector('[data-action="peek"]').addEventListener('click', () => {
        if (listState.hideKo || listState.hideEn) {
          if (listState.peekedIds.has(wid)) listState.peekedIds.delete(wid);
          else listState.peekedIds.add(wid);
          renderListView();
        } else {
          speakWord(wordObj.word);
        }
      });
    });
  }

  /* =========================================================
     모달: 단어장 관리 & 새 단어 추가
     ========================================================= */
  function openDeckDialog() {
    renderDeckDialogList();
    updateParsePreview();
    deckDialog.showModal();
  }

  function renderDeckDialogList() {
    const container = document.getElementById('deckListContainer');
    container.innerHTML = state.decks.map((d) => {
      const s = window.Storage.getDeckStats(state, d);
      const isActive = d.id === state.activeDeckId;
      return `
        <div class="deck-item ${isActive ? 'active' : ''}">
          <button class="deck-item-info" data-select-deck="${d.id}" type="button">
            <div class="deck-item-name">${isActive ? '✓ ' : ''}${escapeHtml(d.name)}</div>
            <div class="deck-item-meta">${s.total}단어 · 암기율 ${s.percent}% (${s.mastered}/${s.total})</div>
          </button>
          ${state.decks.length > 1 ? `
            <button class="row-icon-btn" data-delete-deck="${d.id}" type="button" aria-label="단어장 삭제">🗑️</button>
          ` : ''}
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-select-deck]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeDeckId = btn.dataset.selectDeck;
        window.Storage.save(state);
        session = null;
        stopAudioAutoplay();
        fcState.cards = [];
        audioState.cards = [];
        deckDialog.close();
        showToast(`"${getActiveDeck().name}" 선택됨`);
        render();
      });
    });

    container.querySelectorAll('[data-delete-deck]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = state.decks.find((d) => d.id === btn.dataset.deleteDeck);
        if (!target) return;
        if (!confirm(`"${target.name}" 단어장을 삭제할까요?`)) return;
        window.Storage.deleteDeck(state, target.id);
        session = null;
        fcState.cards = [];
        audioState.cards = [];
        renderDeckDialogList();
        render();
        showToast('단어장을 삭제했어요');
      });
    });
  }

  function updateParsePreview() {
    const raw = document.getElementById('newDeckWordsInput').value;
    const parsed = window.Storage.parseWordListText(raw);
    document.getElementById('parsePreviewCount').textContent = `인식된 단어: ${parsed.length}개`;
    return parsed;
  }

  /* =========================================================
     모달: 설정
     ========================================================= */
  function openSettingsDialog() {
    syncSettingsModal();
    settingsDialog.showModal();
  }

  function syncSettingsModal() {
    document.getElementById('activeVoiceName').textContent = window.TTS.getActiveVoiceLabel(state.settings.accent);
    document.getElementById('toggleAutoSpeak').checked = Boolean(state.settings.autoSpeak);
    document.getElementById('toggleShowTips').checked = Boolean(state.settings.showTips);
    const keyInput = document.getElementById('inputGeminiKey');
    if (keyInput) keyInput.value = state.settings.geminiApiKey || '';

    const setSeg = (id, val) => {
      document.querySelectorAll(`#${id} button`).forEach((b) => {
        b.classList.toggle('active', String(b.dataset.val) === String(val));
      });
    };
    setSeg('segRate', state.settings.rate);
    setSeg('segChunk', state.settings.chunkSize);
    setSeg('segTheme', state.settings.theme);
  }

  /* =========================================================
     초기 이벤트 바인딩
     ========================================================= */
  function initEvents() {
    // 큰 틀 2개 전환 (단어암기 / Part 5 오답노트)
    document.querySelectorAll('.sec-tab').forEach((btn) => {
      btn.addEventListener('click', () => switchSection(btn.dataset.section));
    });

    // 상단 바
    btnDeckPicker.addEventListener('click', () => {
      if (currentSection === 'part5') {
        switchTab('p5_list');
      } else {
        openDeckDialog();
      }
    });
    document.getElementById('btnOpenSettings').addEventListener('click', openSettingsDialog);

    // 모달 닫기 버튼 & 백드롭 클릭
    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.getElementById(btn.dataset.close).close();
      });
    });

    [deckDialog, settingsDialog].forEach((dlg) => {
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg) dlg.close();
      });
    });

    // 새 단어장 입력 실시간 파싱 미리보기
    document.getElementById('newDeckWordsInput').addEventListener('input', updateParsePreview);

    document.getElementById('btnCreateDeck').addEventListener('click', () => {
      const parsed = updateParsePreview();
      if (!parsed.length) {
        showToast('단어 목록을 먼저 붙여넣어 주세요 (예: word 뜻)');
        return;
      }
      const nameInput = document.getElementById('newDeckNameInput');
      const deck = window.Storage.createDeck(state, nameInput.value, parsed);
      nameInput.value = '';
      document.getElementById('newDeckWordsInput').value = '';
      session = null;
      fcState.cards = [];
      audioState.cards = [];
      deckDialog.close();
      showToast(`"${deck.name}" (${parsed.length}단어) 생성 완료!`);
      render();
    });

    document.getElementById('btnAppendDeck').addEventListener('click', () => {
      const parsed = updateParsePreview();
      if (!parsed.length) {
        showToast('추가할 단어 목록을 붙여넣어 주세요');
        return;
      }
      const deck = getActiveDeck();
      const added = window.Storage.appendWordsToDeck(state, deck.id, parsed);
      document.getElementById('newDeckWordsInput').value = '';
      fcState.cards = [];
      audioState.cards = [];
      deckDialog.close();
      showToast(`${added}개의 새 단어를 추가했어요 (중복 제외)`);
      render();
    });

    // JSON 내보내기 / 불러오기 / 초기화
    document.getElementById('btnExportJson').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `toeic-vocab-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('백업 파일을 다운로드했어요');
    });

    document.getElementById('inputImportJson').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = JSON.parse(reader.result);
          if (!imported.decks || !Array.isArray(imported.decks)) throw new Error('Invalid');
          Object.assign(state, imported);
          window.Storage.save(state);
          session = null;
          fcState.cards = [];
          audioState.cards = [];
          deckDialog.close();
          showToast('백업 데이터를 불러왔어요!');
          render();
        } catch (_) {
          showToast('올바른 JSON 백업 파일이 아닙니다');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    document.getElementById('btnResetProgress').addEventListener('click', () => {
      const deck = getActiveDeck();
      if (!confirm(`"${deck.name}"의 암기 기록을 모두 초기화하고 처음부터 다시 시작할까요?`)) return;
      window.Storage.resetDeckProgress(state, deck.id);
      session = null;
      fcState.cards = [];
      audioState.cards = [];
      deckDialog.close();
      showToast('암기 기록이 초기화되었습니다. 다시 도전해보세요!');
      render();
    });

    // 설정 모달 바인딩
    document.querySelectorAll('#segRate button').forEach((b) => {
      b.addEventListener('click', () => {
        state.settings.rate = Number(b.dataset.val);
        window.Storage.save(state);
        syncSettingsModal();
      });
    });

    document.querySelectorAll('#segChunk button').forEach((b) => {
      b.addEventListener('click', () => {
        state.settings.chunkSize = Number(b.dataset.val);
        window.Storage.save(state);
        syncSettingsModal();
        if (currentTab === 'learn' && !session) renderHome();
      });
    });

    document.querySelectorAll('#segTheme button').forEach((b) => {
      b.addEventListener('click', () => {
        state.settings.theme = b.dataset.val;
        window.Storage.save(state);
        applyTheme();
        syncSettingsModal();
      });
    });

    document.getElementById('toggleAutoSpeak').addEventListener('change', (e) => {
      state.settings.autoSpeak = e.target.checked;
      window.Storage.save(state);
    });

    document.getElementById('toggleShowTips').addEventListener('change', (e) => {
      state.settings.showTips = e.target.checked;
      window.Storage.save(state);
    });

    const keyInput = document.getElementById('inputGeminiKey');
    if (keyInput) {
      keyInput.addEventListener('input', (e) => {
        state.settings.geminiApiKey = e.target.value.trim();
        window.Storage.save(state);
      });
    }

    document.getElementById('btnTestVoice').addEventListener('click', () => {
      speakWord('unanimously');
    });
  }

  // 앱 초기화
  applyTheme();
  initEvents();
  renderBottomNav();
  render();
})();
