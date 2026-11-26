/**
 * 데이터 저장소 & 단어장 관리 (localStorage)
 * - 여러 단어장(Deck) 생성, 전환, 삭제, 단어 추가 지원
 * - 사용자가 텍스트 목록만 붙여넣어도 자동 파싱하여 새 단어장 생성
 * - 단어별 마스터리(Box 0~3), 연속 정답, 오답 횟수, 즐겨찾기 영구 저장
 */
window.Storage = (function () {
  const KEY_DATA = 'toeic_vocab_app_v1';

  const DEFAULT_SETTINGS = {
    accent: 'en-US', // 기본 디폴트 미국발음
    rate: 1.1,       // 0.85 | 1.1 | 1.3 (일반 속도 빠르게 개선)
    autoSpeak: true,
    showTips: true,
    theme: 'system', // 'system' | 'light' | 'dark'
    chunkSize: 8,    // 집중 암기 1회당 단어 수 (밀러의 법칙 7±2)
    geminiApiKey: '' // (선택) Vercel 환경변수 대신 직접 입력할 때 사용
  };

  function getDefaultPart5() {
    return JSON.parse(JSON.stringify(window.DEFAULT_PART5 || []));
  }

  function createEmptyProgress() {
    return {
      box: 0,           // 0: 미학습, 1: 학습중, 2: 복습중, 3: 암기완료
      streak: 0,        // 연속 정답 수
      correct: 0,       // 누적 정답
      wrong: 0,         // 누적 오답
      starred: false,   // 별표 즐겨찾기
      lastSeen: 0
    };
  }

  function getExtraBuiltInDecks() {
    return Array.isArray(window.EXTRA_DECKS) ? window.EXTRA_DECKS : [];
  }

  function buildInitialState() {
    const extra = getExtraBuiltInDecks().map((d) => JSON.parse(JSON.stringify(d)));
    const decks = [JSON.parse(JSON.stringify(window.DEFAULT_DECK)), ...extra];
    const latestDeck = extra.length ? extra[extra.length - 1] : decks[0];
    return {
      activeDeckId: latestDeck.id,
      decks,
      mergedBuiltInDeckIds: decks.map((d) => d.id),
      progress: {}, // { [deckId]: { [wordId]: Progress } }
      part5: getDefaultPart5(),
      settings: { ...DEFAULT_SETTINGS },
      stats: {
        totalReviews: 0,
        sessionsCompleted: 0,
        todayDate: getTodayStr(),
        todayReviews: 0
      }
    };
  }

  function getTodayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY_DATA);
      if (!raw) {
        const init = buildInitialState();
        save(init);
        return init;
      }
      const parsed = JSON.parse(raw);
      if (!parsed.decks || !parsed.decks.length) {
        const init = buildInitialState();
        save(init);
        return init;
      }
      // 설정 기본값 병합 (기존 0.95 속도는 1.1로 자동 업그레이드, 기본 발음은 미국식)
      parsed.settings = { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) };
      if (parsed.settings.rate === 0.95) parsed.settings.rate = 1.1;
      parsed.settings.accent = 'en-US';
      parsed.progress = parsed.progress || {};
      if (!Array.isArray(parsed.part5)) {
        parsed.part5 = getDefaultPart5();
      }

      // 새로 추가된 내장 단어장(EXTRA_DECKS) 자동 병합 (기존 암기 기록 100% 유지)
      if (!Array.isArray(parsed.mergedBuiltInDeckIds)) {
        parsed.mergedBuiltInDeckIds = parsed.decks.map((d) => d.id);
      }
      let newlyMergedId = null;
      getExtraBuiltInDecks().forEach((deck) => {
        const alreadyMerged = parsed.mergedBuiltInDeckIds.includes(deck.id);
        const alreadyExists = parsed.decks.some((d) => d.id === deck.id);
        if (!alreadyMerged && !alreadyExists) {
          parsed.decks.push(JSON.parse(JSON.stringify(deck)));
          parsed.mergedBuiltInDeckIds.push(deck.id);
          newlyMergedId = deck.id;
        }
      });
      if (newlyMergedId) {
        parsed.activeDeckId = newlyMergedId;
        save(parsed);
      }

      parsed.stats = parsed.stats || {
        totalReviews: 0,
        sessionsCompleted: 0,
        todayDate: getTodayStr(),
        todayReviews: 0
      };
      if (parsed.stats.todayDate !== getTodayStr()) {
        parsed.stats.todayDate = getTodayStr();
        parsed.stats.todayReviews = 0;
      }
      if (!parsed.decks.some((d) => d.id === parsed.activeDeckId)) {
        parsed.activeDeckId = parsed.decks[0].id;
      }
      return parsed;
    } catch (_) {
      const init = buildInitialState();
      save(init);
      return init;
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY_DATA, JSON.stringify(state));
    } catch (_) {
      // storage full or private mode
    }
  }

  function getProgress(state, deckId, wordId) {
    if (!state.progress[deckId]) state.progress[deckId] = {};
    if (!state.progress[deckId][wordId]) {
      state.progress[deckId][wordId] = createEmptyProgress();
    }
    return state.progress[deckId][wordId];
  }

  function recordResult(state, deckId, wordId, isCorrect) {
    const p = getProgress(state, deckId, wordId);
    p.lastSeen = Date.now();
    state.stats.totalReviews += 1;
    if (state.stats.todayDate !== getTodayStr()) {
      state.stats.todayDate = getTodayStr();
      state.stats.todayReviews = 0;
    }
    state.stats.todayReviews += 1;

    if (isCorrect) {
      p.correct += 1;
      p.streak += 1;
      if (p.box < 3) {
        p.box = Math.min(3, p.box + 1);
      }
    } else {
      p.wrong += 1;
      p.streak = 0;
      p.box = 1; // 틀린 단어는 '학습중(1)'으로 내려 집중 복습
    }
    save(state);
    return p;
  }

  function toggleStar(state, deckId, wordId) {
    const p = getProgress(state, deckId, wordId);
    p.starred = !p.starred;
    save(state);
    return p.starred;
  }

  function cycleBox(state, deckId, wordId) {
    const p = getProgress(state, deckId, wordId);
    p.box = (p.box + 1) % 4;
    if (p.box === 3) p.streak = Math.max(p.streak, 2);
    save(state);
    return p.box;
  }

  function resetDeckProgress(state, deckId) {
    state.progress[deckId] = {};
    save(state);
  }

  /**
   * 사용자가 붙여넣은 텍스트를 단어 배열로 파싱합니다.
   * 지원 형식:
   * - "affiliation 제휴, 소속기관"
   * - "affiliation\t제휴, 소속기관"
   * - "affiliation - 제휴, 소속기관"
   * - "affiliation : 제휴, 소속기관"
   * - "1. affiliation 제휴, 소속기관"
   */
  function parseWordListText(rawText) {
    const lines = rawText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const parsed = [];
    const seen = new Set();

    lines.forEach((line, idx) => {
      // 앞쪽 번호 제거 (예: "1. ", "1) ", "- ", "• ")
      const cleaned = line.replace(/^(?:\d+[\.\)]\s*|[-•*]\s+)/, '').trim();
      if (!cleaned) return;

      let word = '';
      let meaning = '';

      // 1) 탭, " - ", " : ", " = ", " | " 구분자 우선
      const sepMatch = cleaned.match(/^([A-Za-z][A-Za-z\s'\-\/]*?)\s*(?:\t|\s-\s|\s:\s|\s=\s|\s\|\s|:)\s*(.+)$/);
      if (sepMatch) {
        word = sepMatch[1].trim();
        meaning = sepMatch[2].trim();
      } else {
        // 2) 영문 단어(들) 뒤 첫 한글/비영문 뜻 분리
        const koSplit = cleaned.match(/^([A-Za-z][A-Za-z\s'\-\/]*?)\s+([^A-Za-z].*)$/);
        if (koSplit) {
          word = koSplit[1].trim();
          meaning = koSplit[2].trim();
        } else {
          // 3) 공백 기준 첫 토큰과 나머지 분리
          const spaceIdx = cleaned.search(/\s+/);
          if (spaceIdx > 0) {
            word = cleaned.slice(0, spaceIdx).trim();
            meaning = cleaned.slice(spaceIdx).trim();
          }
        }
      }

      if (word && meaning) {
        const key = word.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        parsed.push({
          id: `cw_${Date.now()}_${idx}`,
          word,
          meaning,
          pos: '',
          phonetic: '',
          example: '',
          exampleKo: '',
          tip: ''
        });
      }
    });

    return parsed;
  }

  function createDeck(state, name, words) {
    const deck = {
      id: `deck_${Date.now()}`,
      name: name.trim() || `내 단어장 ${state.decks.length + 1}`,
      createdAt: Date.now(),
      words
    };
    state.decks.push(deck);
    state.activeDeckId = deck.id;
    state.progress[deck.id] = {};
    save(state);
    return deck;
  }

  function appendWordsToDeck(state, deckId, newWords) {
    const deck = state.decks.find((d) => d.id === deckId);
    if (!deck) return 0;
    const existing = new Set(deck.words.map((w) => w.word.toLowerCase()));
    let added = 0;
    newWords.forEach((w) => {
      if (!existing.has(w.word.toLowerCase())) {
        deck.words.push(w);
        existing.add(w.word.toLowerCase());
        added += 1;
      }
    });
    save(state);
    return added;
  }

  function deleteDeck(state, deckId) {
    if (state.decks.length <= 1) return false;
    state.decks = state.decks.filter((d) => d.id !== deckId);
    delete state.progress[deckId];
    if (state.activeDeckId === deckId) {
      state.activeDeckId = state.decks[0].id;
    }
    save(state);
    return true;
  }

  function deleteWordFromDeck(state, deckId, wordId) {
    const deck = state.decks.find((d) => d.id === deckId);
    if (!deck || deck.words.length <= 1) return false;
    deck.words = deck.words.filter((w) => w.id !== wordId);
    if (state.progress[deckId]) {
      delete state.progress[deckId][wordId];
    }
    save(state);
    return true;
  }

  function getDeckStats(state, deck) {
    const total = deck.words.length;
    let mastered = 0;
    let learning = 0;
    let unseen = 0;
    let wrongWords = 0;
    let starred = 0;

    deck.words.forEach((w) => {
      const p = getProgress(state, deck.id, w.id);
      if (p.box === 3) mastered += 1;
      else if (p.box === 0) unseen += 1;
      else learning += 1;
      if (p.wrong > 0 && p.box < 3) wrongWords += 1;
      if (p.starred) starred += 1;
    });

    const percent = total ? Math.round((mastered / total) * 100) : 0;
    return { total, mastered, learning, unseen, wrongWords, starred, percent };
  }

  function addPart5Items(state, items) {
    if (!Array.isArray(state.part5)) state.part5 = [];
    let added = 0;
    items.forEach((raw, idx) => {
      if (!raw || !raw.question || !raw.choices) return;
      const item = {
        id: `p5_${Date.now()}_${idx}`,
        testName: String(raw.testName || 'Part 5 오답').trim(),
        number: String(raw.number || '').trim(),
        category: String(raw.category || '어휘/문법').trim(),
        question: String(raw.question).trim(),
        choices: {
          A: String(raw.choices.A || '').trim(),
          B: String(raw.choices.B || '').trim(),
          C: String(raw.choices.C || '').trim(),
          D: String(raw.choices.D || '').trim()
        },
        answer: String(raw.answer || 'A').trim().toUpperCase().replace(/[^ABCD]/g, '') || 'A',
        translation: String(raw.translation || '').trim(),
        keyPoint: String(raw.keyPoint || '').trim(),
        explanation: String(raw.explanation || '').trim(),
        choiceNotes: {
          A: String(raw.choiceNotes?.A || '').trim(),
          B: String(raw.choiceNotes?.B || '').trim(),
          C: String(raw.choiceNotes?.C || '').trim(),
          D: String(raw.choiceNotes?.D || '').trim()
        },
        status: 'wrong',
        attempts: 0,
        correctCount: 0,
        createdAt: Date.now()
      };
      state.part5.unshift(item);
      added += 1;
    });
    save(state);
    return added;
  }

  function recordPart5Attempt(state, itemId, isCorrect) {
    const item = (state.part5 || []).find((q) => q.id === itemId);
    if (!item) return null;
    item.attempts = (item.attempts || 0) + 1;
    if (isCorrect) {
      item.correctCount = (item.correctCount || 0) + 1;
      item.status = item.status === 'review' || item.correctCount >= 2 ? 'mastered' : 'review';
    } else {
      item.status = 'wrong';
    }
    save(state);
    return item;
  }

  function cyclePart5Status(state, itemId) {
    const item = (state.part5 || []).find((q) => q.id === itemId);
    if (!item) return null;
    const order = ['wrong', 'review', 'mastered'];
    const idx = order.indexOf(item.status || 'wrong');
    item.status = order[(idx + 1) % order.length];
    save(state);
    return item.status;
  }

  function deletePart5Item(state, itemId) {
    state.part5 = (state.part5 || []).filter((q) => q.id !== itemId);
    save(state);
  }

  return {
    load,
    save,
    getProgress,
    recordResult,
    toggleStar,
    cycleBox,
    resetDeckProgress,
    parseWordListText,
    createDeck,
    appendWordsToDeck,
    deleteDeck,
    deleteWordFromDeck,
    getDeckStats,
    addPart5Items,
    recordPart5Attempt,
    cyclePart5Status,
    deletePart5Item
  };
})();
