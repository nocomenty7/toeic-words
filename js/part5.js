/**
 * 토익 Part 5 오답노트 모듈
 * - 오답풀기 (실전 4지선다 + 친절한 해설 + 완성문장 네이티브 발음)
 * - 오답목록 (검색, 상태 필터, 펼치기)
 * - 사진/텍스트 AI 자동 등록 (카메라 촬영 → Gemini Vision 자동 추출 & 해설 생성)
 */
window.Part5Module = (function () {
  'use strict';

  const savedTestNum = Math.max(1, parseInt(localStorage.getItem('p5_last_test_num') || '2', 10) || 2);

  const p5State = {
    quizTest: 'all',          // 'all' | 'Test 1' | 'Test 2' ...
    quizFilter: 'unmastered', // unmastered | all | mastered
    quizShuffled: false,
    quizOrderIds: [],
    quizIndex: 0,
    selectedChoice: null,
    listTest: 'all',          // 'all' | 'Test 1' | 'Test 2' ...
    listFilter: 'all',
    listQuery: '',
    expandedId: null,
    addMode: 'photo', // photo | text | manual
    testNum: savedTestNum,
    defaultTestName: `Test ${savedTestNum}`,
    analyzing: false,
    progressPct: 0,
    progressLabel: '',
    elapsedSec: 0,
    lastElapsedSec: 0,
    abortCtrl: null,
    progressTimer: null,
    lastImagePayload: null,
    errorMsg: '',
    previewImageUrl: '',
    pendingItems: []
  };

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function highlightBlank(sentence, filledWord) {
    const safe = escapeHtml(sentence);
    if (filledWord) {
      return safe.replace(/_{2,}|-{3,}|—{2,}|\(\s*\)/g, `<span class="p5-blank filled">${escapeHtml(filledWord)}</span>`);
    }
    return safe.replace(/_{2,}|-{3,}|—{2,}|\(\s*\)/g, '<span class="p5-blank">-------</span>');
  }

  function buildFullSentence(item) {
    const ansWord = (item.choices && item.choices[item.answer]) || '';
    return String(item.question || '').replace(/_{2,}|-{3,}|—{2,}|\(\s*\)/g, ansWord);
  }

  function statusLabel(status) {
    if (status === 'mastered') return '완전정복';
    if (status === 'review') return '복습중';
    return '미해결';
  }

  function extractNum(str) {
    const m = String(str || '').match(/\d+/);
    return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER;
  }

  function getUniqueTests(all) {
    const set = new Set();
    all.forEach((q) => {
      if (q.testName) set.add(q.testName);
    });
    return Array.from(set).sort((a, b) => {
      const na = extractNum(a);
      const nb = extractNum(b);
      if (na !== nb) return na - nb;
      return a.localeCompare(b);
    });
  }

  function sortByTestAndNumber(items) {
    return items.slice().sort((a, b) => {
      const ta = extractNum(a.testName);
      const tb = extractNum(b.testName);
      if (ta !== tb) return ta - tb;
      const cmpTest = String(a.testName || '').localeCompare(String(b.testName || ''));
      if (cmpTest !== 0) return cmpTest;
      const na = extractNum(a.number);
      const nb = extractNum(b.number);
      if (na !== nb) return na - nb;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }

  function shuffleArray(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function filterByTest(all, testFilter) {
    if (!testFilter || testFilter === 'all') return all;
    return all.filter((q) => q.testName === testFilter);
  }

  function filterItems(all, filter) {
    if (filter === 'unmastered') return all.filter((q) => q.status !== 'mastered');
    if (filter === 'wrong') return all.filter((q) => q.status === 'wrong');
    if (filter === 'review') return all.filter((q) => q.status === 'review');
    if (filter === 'mastered') return all.filter((q) => q.status === 'mastered');
    return all;
  }

  function getOrderedQuizItems(all) {
    const byTest = filterByTest(all, p5State.quizTest);
    const filtered = filterItems(byTest, p5State.quizFilter);
    if (!p5State.quizShuffled) {
      return sortByTestAndNumber(filtered);
    }
    const map = new Map(filtered.map((q) => [q.id, q]));
    const ordered = [];
    p5State.quizOrderIds.forEach((id) => {
      if (map.has(id)) {
        ordered.push(map.get(id));
        map.delete(id);
      }
    });
    // 새로 추가된 항목이 있으면 뒤에 랜덤 추가
    if (map.size) {
      shuffleArray(Array.from(map.values())).forEach((q) => ordered.push(q));
    }
    p5State.quizOrderIds = ordered.map((q) => q.id);
    return ordered;
  }

  function reshuffleQuizItems(all) {
    const byTest = filterByTest(all, p5State.quizTest);
    const filtered = filterItems(byTest, p5State.quizFilter);
    p5State.quizOrderIds = shuffleArray(filtered).map((q) => q.id);
    p5State.quizIndex = 0;
    p5State.selectedChoice = null;
  }

  /* =========================================================
     1. 오답풀기 탭 (p5_quiz)
     ========================================================= */
  function renderQuiz(ctx) {
    const { state, mainEl, showToast, speakWord, switchTab } = ctx;
    const all = state.part5 || [];
    const tests = getUniqueTests(all);
    if (p5State.quizTest !== 'all' && !tests.includes(p5State.quizTest)) {
      p5State.quizTest = 'all';
    }

    const inTest = filterByTest(all, p5State.quizTest);
    const items = getOrderedQuizItems(all);

    const masteredCount = inTest.filter((q) => q.status === 'mastered').length;
    const unmasteredCount = inTest.length - masteredCount;

    if (p5State.quizIndex >= items.length) {
      p5State.quizIndex = 0;
    }
    const item = items[p5State.quizIndex];

    const filters = [
      { id: 'unmastered', label: `미정복 (${unmasteredCount})` },
      { id: 'all', label: `전체 (${inTest.length})` },
      { id: 'mastered', label: `완전정복 (${masteredCount})` }
    ];

    mainEl.innerHTML = `
      <div class="chip-scroll">
        <button class="filter-chip ${p5State.quizTest === 'all' ? 'active' : ''}" data-p5-qtest="all" type="button">
          전체 Test (${all.length})
        </button>
        ${tests.map((t) => {
          const cnt = all.filter((q) => q.testName === t).length;
          return `
            <button class="filter-chip ${p5State.quizTest === t ? 'active' : ''}" data-p5-qtest="${escapeHtml(t)}" type="button">
              ${escapeHtml(t)} (${cnt})
            </button>
          `;
        }).join('')}
      </div>

      <div class="p5-toolbar-row">
        <div class="chip-scroll" style="flex: 1;">
          ${filters.map((f) => `
            <button class="filter-chip ${p5State.quizFilter === f.id ? 'active' : ''}" data-p5-qfilter="${f.id}" type="button">${f.label}</button>
          `).join('')}
        </div>
        <button class="p5-shuffle-btn ${p5State.quizShuffled ? 'active' : ''}" id="btnP5Shuffle" type="button" title="문제 순서 섞기/순서대로">
          ${p5State.quizShuffled ? '🔀 섞임' : '🔀 섞기'}
        </button>
      </div>

      ${!item ? `
        <div class="card empty-state mt-12">
          <div style="font-size: 40px; margin-bottom: 8px;">${inTest.length ? '🏆' : '📝'}</div>
          <div style="font-weight: 800; font-size: 16px;">
            ${inTest.length ? '선택한 범위의 오답을 모두 정복했어요!' : '아직 등록된 오답 문제가 없어요'}
          </div>
          <div style="font-size: 13px; margin-top: 6px;">
            ${inTest.length ? '위에서 "전체"를 눌러 다시 복습하거나 다른 Test를 선택해 보세요.' : '아래 "사진등록" 탭에서 틀린 문제를 찍어 바로 등록해 보세요!'}
          </div>
          <button class="btn btn-primary mt-16" id="btnP5GoAdd" type="button">📸 오답 사진 찍어 등록하기</button>
        </div>
      ` : `
        <section class="card p5-card mt-12">
          <div class="p5-meta-row">
            <div class="p5-badges">
              <span class="p5-badge-test">${escapeHtml(item.testName)}${item.number ? ` · ${escapeHtml(item.number)}번` : ''}</span>
              ${item.category ? `<span class="p5-badge-cat">${escapeHtml(item.category)}</span>` : ''}
            </div>
            <span class="p5-counter">${p5State.quizIndex + 1} / ${items.length}</span>
          </div>

          <div class="p5-question">
            ${highlightBlank(item.question, p5State.selectedChoice ? item.choices[item.answer] : '')}
          </div>

          <div class="choices-grid mt-12">
            ${['A', 'B', 'C', 'D'].map((key) => {
              let cls = 'choice-btn';
              if (p5State.selectedChoice) {
                if (key === item.answer) cls += ' correct';
                else if (key === p5State.selectedChoice) cls += ' wrong';
              }
              return `
                <button class="${cls}" data-p5-choice="${key}" type="button" ${p5State.selectedChoice ? 'disabled' : ''}>
                  <span class="choice-num">${key}</span>
                  <span>${escapeHtml(item.choices[key] || '')}</span>
                </button>
              `;
            }).join('')}
          </div>

          ${p5State.selectedChoice ? `
            <div class="p5-explain-wrap">
              <div class="p5-result-banner ${p5State.selectedChoice === item.answer ? 'ok' : 'no'}">
                ${p5State.selectedChoice === item.answer
                  ? `✅ 정답입니다! (${item.answer}) ${escapeHtml(item.choices[item.answer])}`
                  : `❌ 아쉽네요! 정답은 (${item.answer}) ${escapeHtml(item.choices[item.answer])}`}
              </div>

              ${ctx.renderAudioControls('en-US', '🔊 완성 문장 듣기')}

              ${item.keyPoint ? `
                <div class="p5-keypoint">
                  <strong>💡 핵심 포인트</strong>
                  <div>${escapeHtml(item.keyPoint)}</div>
                </div>
              ` : ''}

              ${item.translation ? `
                <div class="p5-section">
                  <div class="p5-section-title">📖 문장 해석</div>
                  <div class="p5-section-body">${escapeHtml(item.translation)}</div>
                </div>
              ` : ''}

              ${item.explanation ? `
                <div class="p5-section">
                  <div class="p5-section-title">👩‍🏫 친절한 해설</div>
                  <div class="p5-section-body">${escapeHtml(item.explanation)}</div>
                </div>
              ` : ''}

              <div class="p5-section">
                <div class="p5-section-title">🔎 보기별 정리</div>
                <div class="p5-choice-notes">
                  ${['A', 'B', 'C', 'D'].map((k) => {
                    const note = item.choiceNotes && item.choiceNotes[k];
                    if (!note) return '';
                    return `
                      <div class="p5-choice-note ${k === item.answer ? 'is-ans' : ''}">
                        <strong>(${k}) ${escapeHtml(item.choices[k] || '')}</strong>
                        <span>${escapeHtml(note)}</span>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            </div>
          ` : ''}
        </section>

        <div class="btn-row mt-12">
          <button class="btn btn-outline" id="btnP5Prev" type="button" ${items.length <= 1 ? 'disabled' : ''}>← 이전 문제</button>
          <button class="btn btn-primary" id="btnP5Next" type="button">
            ${p5State.selectedChoice ? (items.length > 1 ? '다음 문제 →' : '다시 풀기 ↻') : '건너뛰기 →'}
          </button>
        </div>
      `}
    `;

    document.querySelectorAll('[data-p5-qtest]').forEach((btn) => {
      btn.addEventListener('click', () => {
        p5State.quizTest = btn.dataset.p5Qtest;
        p5State.quizIndex = 0;
        p5State.selectedChoice = null;
        if (p5State.quizShuffled) reshuffleQuizItems(all);
        renderQuiz(ctx);
      });
    });

    document.querySelectorAll('[data-p5-qfilter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        p5State.quizFilter = btn.dataset.p5Qfilter;
        p5State.quizIndex = 0;
        p5State.selectedChoice = null;
        if (p5State.quizShuffled) reshuffleQuizItems(all);
        renderQuiz(ctx);
      });
    });

    const shuffleBtn = document.getElementById('btnP5Shuffle');
    if (shuffleBtn) {
      shuffleBtn.addEventListener('click', () => {
        p5State.quizShuffled = !p5State.quizShuffled;
        if (p5State.quizShuffled) {
          reshuffleQuizItems(all);
          showToast('🔀 문제를 무작위로 섞었어요!');
        } else {
          p5State.quizOrderIds = [];
          p5State.quizIndex = 0;
          p5State.selectedChoice = null;
          showToast('📋 Test · 번호 순서대로 정렬했어요');
        }
        renderQuiz(ctx);
      });
    }

    const goAddBtn = document.getElementById('btnP5GoAdd');
    if (goAddBtn) {
      goAddBtn.addEventListener('click', () => switchTab('p5_add'));
    }

    if (!item) return;

    document.querySelectorAll('[data-p5-choice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (p5State.selectedChoice) return;
        const picked = btn.dataset.p5Choice;
        const isCorrect = picked === item.answer;
        p5State.selectedChoice = picked;
        window.Storage.recordPart5Attempt(state, item.id, isCorrect);
        if (isCorrect) {
          showToast('🎉 정답! 복습 단계가 올라갔어요');
        } else {
          showToast(`정답은 (${item.answer}) ${item.choices[item.answer]}`);
        }
        renderQuiz(ctx);
      });
    });

    ctx.bindAudioControls(mainEl, buildFullSentence(item));

    const prevBtn = document.getElementById('btnP5Prev');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        p5State.quizIndex = (p5State.quizIndex - 1 + items.length) % items.length;
        p5State.selectedChoice = null;
        renderQuiz(ctx);
      });
    }

    const nextBtn = document.getElementById('btnP5Next');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        p5State.selectedChoice = null;
        if (items.length > 1) {
          p5State.quizIndex = (p5State.quizIndex + 1) % items.length;
        }
        renderQuiz(ctx);
        mainEl.scrollTop = 0;
      });
    }
  }

  /* =========================================================
     2. 오답목록 탭 (p5_list)
     ========================================================= */
  function renderList(ctx) {
    const { state, mainEl, showToast, speakWord, switchTab } = ctx;
    const all = state.part5 || [];
    const tests = getUniqueTests(all);
    if (p5State.listTest !== 'all' && !tests.includes(p5State.listTest)) {
      p5State.listTest = 'all';
    }

    const inTest = filterByTest(all, p5State.listTest);
    let items = sortByTestAndNumber(filterItems(inTest, p5State.listFilter));

    if (p5State.listQuery.trim()) {
      const q = p5State.listQuery.trim().toLowerCase();
      items = items.filter((item) =>
        (item.question || '').toLowerCase().includes(q) ||
        (item.testName || '').toLowerCase().includes(q) ||
        (item.category || '').toLowerCase().includes(q) ||
        (item.explanation || '').toLowerCase().includes(q) ||
        Object.values(item.choices || {}).some((c) => c.toLowerCase().includes(q))
      );
    }

    const filters = [
      { id: 'all', label: `전체 (${inTest.length})` },
      { id: 'wrong', label: `미해결 (${inTest.filter((q) => q.status === 'wrong').length})` },
      { id: 'review', label: `복습중 (${inTest.filter((q) => q.status === 'review').length})` },
      { id: 'mastered', label: `완전정복 (${inTest.filter((q) => q.status === 'mastered').length})` }
    ];

    mainEl.innerHTML = `
      <input id="p5SearchInput" class="search-input" type="search" placeholder="🔍 문제, 보기, Test 번호, 유형 검색..." value="${escapeHtml(p5State.listQuery)}" />

      <div class="chip-scroll">
        <button class="filter-chip ${p5State.listTest === 'all' ? 'active' : ''}" data-p5-ltest="all" type="button">
          전체 Test (${all.length})
        </button>
        ${tests.map((t) => {
          const cnt = all.filter((q) => q.testName === t).length;
          return `
            <button class="filter-chip ${p5State.listTest === t ? 'active' : ''}" data-p5-ltest="${escapeHtml(t)}" type="button">
              ${escapeHtml(t)} (${cnt})
            </button>
          `;
        }).join('')}
      </div>

      <div class="chip-scroll mt-8">
        ${filters.map((f) => `
          <button class="filter-chip ${p5State.listFilter === f.id ? 'active' : ''}" data-p5-lfilter="${f.id}" type="button">${f.label}</button>
        `).join('')}
      </div>

      ${inTest.length ? `
        <div class="btn-row mt-8">
          <button class="btn btn-secondary btn-sm" id="btnP5ListStudyOrder" type="button">
            📝 ${p5State.listTest === 'all' ? '전체' : escapeHtml(p5State.listTest)} 순서대로 풀기
          </button>
          <button class="btn btn-primary btn-sm" id="btnP5ListStudyShuffle" type="button">
            🔀 ${p5State.listTest === 'all' ? '전체' : escapeHtml(p5State.listTest)} 섞어서 풀기
          </button>
        </div>
      ` : ''}

      <div class="word-list mt-12">
        ${!items.length ? `
          <div class="card empty-state">조건에 맞는 오답 문제가 없어요.</div>
        ` : items.map((item) => {
          const isOpen = p5State.expandedId === item.id;
          return `
            <div class="p5-list-card" data-p5-id="${item.id}">
              <div class="p5-list-head" data-p5-toggle="${item.id}">
                <div class="p5-badges">
                  <span class="p5-badge-test">${escapeHtml(item.testName)}${item.number ? ` · ${escapeHtml(item.number)}번` : ''}</span>
                  ${item.category ? `<span class="p5-badge-cat">${escapeHtml(item.category)}</span>` : ''}
                </div>
                <button class="p5-status-pill st-${item.status || 'wrong'}" data-p5-status="${item.id}" type="button">
                  ${statusLabel(item.status)}
                </button>
              </div>
              <div class="p5-list-q" data-p5-toggle="${item.id}">
                ${highlightBlank(item.question, isOpen ? item.choices[item.answer] : '')}
              </div>
              <div class="p5-list-foot" data-p5-toggle="${item.id}">
                <span>정답: <strong>(${item.answer}) ${escapeHtml(item.choices[item.answer] || '')}</strong></span>
                <span style="color: var(--primary); font-weight: 700;">${isOpen ? '접기 ▴' : '해설 보기 ▾'}</span>
              </div>

              ${isOpen ? `
                <div class="p5-explain-wrap" style="margin-top: 12px;">
                  ${item.keyPoint ? `<div class="p5-keypoint"><strong>💡 핵심 포인트</strong><div>${escapeHtml(item.keyPoint)}</div></div>` : ''}
                  ${item.translation ? `<div class="p5-section"><div class="p5-section-title">📖 해석</div><div class="p5-section-body">${escapeHtml(item.translation)}</div></div>` : ''}
                  ${item.explanation ? `<div class="p5-section"><div class="p5-section-title">👩‍🏫 해설</div><div class="p5-section-body">${escapeHtml(item.explanation)}</div></div>` : ''}
                  <div class="p5-section">
                    <div class="p5-section-title">🔎 보기별 정리</div>
                    <div class="p5-choice-notes">
                      ${['A', 'B', 'C', 'D'].map((k) => {
                        const note = item.choiceNotes && item.choiceNotes[k];
                        return `
                          <div class="p5-choice-note ${k === item.answer ? 'is-ans' : ''}">
                            <strong>(${k}) ${escapeHtml(item.choices[k] || '')}</strong>
                            ${note ? `<span>${escapeHtml(note)}</span>` : ''}
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </div>
                  <div class="btn-row mt-12">
                    <button class="btn btn-secondary btn-sm" data-p5-speak="${item.id}" type="button">🔊 문장 듣기</button>
                    <button class="btn btn-danger-outline btn-sm" data-p5-del="${item.id}" type="button">🗑️ 삭제</button>
                  </div>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;

    const searchInput = document.getElementById('p5SearchInput');
    searchInput.addEventListener('input', (e) => {
      p5State.listQuery = e.target.value;
      renderList(ctx);
      const restored = document.getElementById('p5SearchInput');
      if (restored) {
        restored.focus();
        restored.setSelectionRange(restored.value.length, restored.value.length);
      }
    });

    document.querySelectorAll('[data-p5-ltest]').forEach((btn) => {
      btn.addEventListener('click', () => {
        p5State.listTest = btn.dataset.p5Ltest;
        renderList(ctx);
      });
    });

    document.querySelectorAll('[data-p5-lfilter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        p5State.listFilter = btn.dataset.p5Lfilter;
        renderList(ctx);
      });
    });

    const launchStudy = (shuffled) => {
      p5State.quizTest = p5State.listTest;
      p5State.quizFilter = p5State.listFilter === 'mastered' ? 'mastered' : p5State.listFilter === 'all' ? 'all' : 'unmastered';
      p5State.quizShuffled = shuffled;
      p5State.quizIndex = 0;
      p5State.selectedChoice = null;
      if (shuffled) reshuffleQuizItems(all);
      else p5State.quizOrderIds = [];
      switchTab('p5_quiz');
    };

    const btnOrder = document.getElementById('btnP5ListStudyOrder');
    if (btnOrder) btnOrder.addEventListener('click', () => launchStudy(false));
    const btnShuf = document.getElementById('btnP5ListStudyShuffle');
    if (btnShuf) btnShuf.addEventListener('click', () => launchStudy(true));

    document.querySelectorAll('[data-p5-toggle]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const id = el.dataset.p5Toggle;
        p5State.expandedId = p5State.expandedId === id ? null : id;
        renderList(ctx);
      });
    });

    document.querySelectorAll('[data-p5-status]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = window.Storage.cyclePart5Status(state, btn.dataset.p5Status);
        showToast(`상태 변경 → ${statusLabel(next)}`);
        renderList(ctx);
      });
    });

    document.querySelectorAll('[data-p5-speak]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = all.find((q) => q.id === btn.dataset.p5Speak);
        if (target) speakWord(buildFullSentence(target), false);
      });
    });

    document.querySelectorAll('[data-p5-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!confirm('이 오답 문제를 삭제할까요?')) return;
        window.Storage.deletePart5Item(state, btn.dataset.p5Del);
        p5State.expandedId = null;
        showToast('삭제했어요');
        renderList(ctx);
      });
    });
  }

  /* =========================================================
     3. 사진 / 텍스트 자동 등록 탭 (p5_add)
     ========================================================= */
  function stopProgressTicker() {
    if (p5State.progressTimer) {
      clearInterval(p5State.progressTimer);
      p5State.progressTimer = null;
    }
  }

  function updateProgressDom() {
    const fill = document.getElementById('p5ProgFill');
    const pctEl = document.getElementById('p5ProgPct');
    const lblEl = document.getElementById('p5ProgLabel');
    const timeEl = document.getElementById('p5ProgTime');
    if (fill) fill.style.width = `${Math.min(100, Math.round(p5State.progressPct))}%`;
    if (pctEl) pctEl.textContent = `${Math.min(100, Math.round(p5State.progressPct))}%`;
    if (lblEl) lblEl.textContent = p5State.progressLabel;
    if (timeEl) timeEl.textContent = `${p5State.elapsedSec.toFixed(1)}초`;
  }

  function setProgress(pct, label) {
    p5State.progressPct = pct;
    if (label) p5State.progressLabel = label;
    updateProgressDom();
  }

  function startProgressTicker(startedAt) {
    stopProgressTicker();
    p5State.progressTimer = setInterval(() => {
      if (!p5State.analyzing) {
        stopProgressTicker();
        return;
      }
      const sec = (Date.now() - startedAt) / 1000;
      p5State.elapsedSec = sec;
      // 40%에서 92%까지 시간에 따라 자연스럽게 증가 (멈춘 듯한 느낌 제거)
      if (p5State.progressPct >= 35 && p5State.progressPct < 92) {
        const target = Math.min(92, 38 + (1 - Math.exp(-sec / 5.5)) * 54);
        p5State.progressPct = Math.max(p5State.progressPct, target);
      }
      if (sec > 9 && p5State.progressLabel.includes('AI가')) {
        p5State.progressLabel = '🤖 AI 응답 대기 중... (혼잡 시 다른 모델로 자동 전환 중)';
      }
      updateProgressDom();
    }, 150);
  }

  function compressImageToBase64(file, maxSide = 1200, quality = 0.80) {
    return new Promise((resolve, reject) => {
      // FileReader 대신 ObjectURL + 1200px 선명 압축으로 메모리 초과 방지 + 연필/빨간펜 밑줄 속 활자 선명도 유지
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('이미지 디코딩 실패 (JPG/PNG 사진으로 다시 시도해 주세요)'));
      };
      img.onload = () => {
        try {
          let { naturalWidth: width, naturalHeight: height } = img;
          if (!width || !height) {
            width = img.width;
            height = img.height;
          }
          if (width > maxSide || height > maxSide) {
            if (width >= height) {
              height = Math.round((height * maxSide) / width);
              width = maxSide;
            } else {
              width = Math.round((width * maxSide) / height);
              height = maxSide;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx2d = canvas.getContext('2d');
          ctx2d.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          canvas.width = 1;
          canvas.height = 1;
          URL.revokeObjectURL(objectUrl);
          const base64 = dataUrl.split(',')[1];
          resolve({ base64, dataUrl, mimeType: 'image/jpeg' });
        } catch (err) {
          URL.revokeObjectURL(objectUrl);
          reject(err);
        }
      };
      img.src = objectUrl;
    });
  }

  async function callAnalyzeApi(payload, state) {
    const ctrl = new AbortController();
    p5State.abortCtrl = ctrl;
    // 클라이언트 30초 하드 타임아웃 (무한 대기 방지)
    const timeoutId = setTimeout(() => {
      ctrl.abort('TIMEOUT');
    }, 30000);

    try {
      const res = await fetch('/api/analyze-part5', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          defaultTestName: p5State.defaultTestName,
          apiKey: state.settings.geminiApiKey || ''
        }),
        signal: ctrl.signal
      });

      const rawText = await res.text();
      let data = null;
      try {
        data = JSON.parse(rawText);
      } catch (_) {
        // Vercel 504/502 HTML/텍스트 응답을 안전하게 처리
        if (res.status === 504 || /timeout|timed out/i.test(rawText)) {
          throw new Error('서버 응답 시간(타임아웃)이 초과되었습니다. 다시 시도해 주세요.');
        }
        throw new Error(`서버 일시 오류 (HTTP ${res.status}). 잠시 후 다시 시도해 주세요.`);
      }

      if (!res.ok) {
        const err = new Error(data.message || data.error || `분석 실패 (HTTP ${res.status})`);
        err.code = data.error;
        throw err;
      }
      return data;
    } catch (err) {
      if (err && err.name === 'AbortError') {
        if (ctrl.signal.reason === 'USER_CANCEL') {
          const cancelErr = new Error('분석을 취소했습니다.');
          cancelErr.code = 'CANCELLED';
          throw cancelErr;
        }
        throw new Error('분석 시간이 24초를 초과해 자동 중단되었습니다. 다시 시도해 주세요.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
      if (p5State.abortCtrl === ctrl) p5State.abortCtrl = null;
    }
  }

  function renderAdd(ctx) {
    const { state, mainEl, showToast, switchTab } = ctx;

    const runPhotoAnalysis = async (imagePayload) => {
      const startedAt = Date.now();
      p5State.analyzing = true;
      p5State.errorMsg = '';
      p5State.pendingItems = [];
      p5State.elapsedSec = 0;
      p5State.progressPct = 35;
      p5State.progressLabel = '🤖 AI가 중앙 문제 인식 및 해설 작성 중...';
      renderAdd(ctx);
      startProgressTicker(startedAt);

      try {
        const data = await callAnalyzeApi(imagePayload, state);
        const items = data.items || [];
        setProgress(100, '✅ 분석 완료!');
        p5State.lastElapsedSec = (Date.now() - startedAt) / 1000;
        if (!items.length) {
          p5State.errorMsg = '사진 가운데에서 완전한 Part 5 문제를 찾지 못했어요. 문제가 중앙에 오도록 다시 찍어 주세요.';
          showToast('사진에서 문제를 찾지 못했어요');
        } else {
          p5State.pendingItems = items;
          showToast(`✨ ${p5State.lastElapsedSec.toFixed(1)}초 만에 분석 완료!`);
        }
      } catch (err) {
        if (err.code === 'CANCELLED') {
          showToast('분석을 취소했어요');
        } else if (err.code === 'NO_API_KEY') {
          p5State.errorMsg = 'Gemini API 키가 필요합니다. 우측 상단 ⚙️ 설정에서 무료 키를 입력하거나 Vercel 환경변수(GEMINI_API_KEY)를 등록해 주세요.';
          showToast('API 키 설정이 필요합니다');
        } else {
          p5State.errorMsg = err.message || '사진 분석 중 오류가 발생했어요';
          showToast('분석 실패 — 아래 안내를 확인해 주세요');
        }
      } finally {
        stopProgressTicker();
        p5State.analyzing = false;
        renderAdd(ctx);
      }
    };

    const setTestNum = (num) => {
      const clamped = Math.max(1, Math.min(99, Number(num) || 1));
      p5State.testNum = clamped;
      p5State.defaultTestName = `Test ${clamped}`;
      try {
        localStorage.setItem('p5_last_test_num', String(clamped));
      } catch (_) {
        // ignore
      }
      renderAdd(ctx);
    };

    const renderTestPicker = () => `
      <div class="test-picker">
        <div class="test-picker-head">
          <span class="test-picker-label">회차 선택</span>
          <div class="test-stepper">
            <button type="button" class="stepper-btn" data-test-step="-1" aria-label="이전 회차">−</button>
            <span class="stepper-val">Test ${p5State.testNum}</span>
            <button type="button" class="stepper-btn" data-test-step="1" aria-label="다음 회차">+</button>
          </div>
        </div>
        <div class="test-num-pills">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `
            <button type="button" class="test-num-pill ${p5State.testNum === n ? 'active' : ''}" data-test-num="${n}">
              Test ${n}
            </button>
          `).join('')}
        </div>
      </div>
    `;

    mainEl.innerHTML = `
      <div class="segmented full-width" style="display: grid; grid-template-columns: repeat(3, 1fr);">
        <button type="button" data-add-mode="photo" class="${p5State.addMode === 'photo' ? 'active' : ''}">📸 사진 촬영</button>
        <button type="button" data-add-mode="text" class="${p5State.addMode === 'text' ? 'active' : ''}">📋 텍스트 분석</button>
        <button type="button" data-add-mode="manual" class="${p5State.addMode === 'manual' ? 'active' : ''}">✏️ 직접 입력</button>
      </div>

      ${p5State.addMode === 'photo' ? `
        <section class="card mt-12">
          <div style="font-size: 15px; font-weight: 800;">📸 틀린 문제 사진만 찍으면 끝!</div>
          <p class="helper-desc mt-8">
            <strong>90도 회전 OK · 연필/빨간펜 필기 자동 무시 · 중앙 1문제만 추출</strong>됩니다. 따로 자르지 말고 그대로 올리세요!
          </p>

          ${renderTestPicker()}

          <div class="btn-row mt-12">
            <label class="btn btn-primary file-label ${p5State.analyzing ? 'disabled' : ''}">
              📷 카메라로 찍기
              <input id="inputP5Camera" type="file" accept="image/*" capture="environment" hidden />
            </label>
            <label class="btn btn-secondary file-label ${p5State.analyzing ? 'disabled' : ''}">
              🖼️ 앨범에서 선택
              <input id="inputP5Gallery" type="file" accept="image/*" hidden />
            </label>
          </div>

          ${p5State.previewImageUrl ? `
            <div class="p5-img-preview-wrap mt-12">
              <img src="${p5State.previewImageUrl}" alt="업로드된 문제 사진" class="p5-img-preview" />
            </div>
          ` : ''}

          ${p5State.analyzing ? `
            <div class="p5-progress-box mt-12">
              <div class="p5-progress-top">
                <span id="p5ProgLabel">${escapeHtml(p5State.progressLabel || '분석 준비 중...')}</span>
                <span class="p5-progress-nums"><strong id="p5ProgPct">${Math.round(p5State.progressPct)}%</strong> · <span id="p5ProgTime">${p5State.elapsedSec.toFixed(1)}초</span></span>
              </div>
              <div class="p5-progress-track">
                <div id="p5ProgFill" class="p5-progress-fill" style="width: ${Math.round(p5State.progressPct)}%"></div>
              </div>
              <button id="btnP5Cancel" class="btn btn-outline btn-sm full-width mt-8" type="button">✕ 분석 취소</button>
            </div>
          ` : ''}

          ${p5State.errorMsg ? `
            <div class="p5-result-banner no mt-12" style="font-size: 13px; line-height: 1.5; word-break: break-word;">
              ⚠️ ${escapeHtml(p5State.errorMsg)}
              ${p5State.lastImagePayload ? `
                <button id="btnP5RetryPhoto" class="btn btn-danger btn-sm full-width mt-8" type="button">🔄 같은 사진 다시 분석하기</button>
              ` : ''}
            </div>
          ` : ''}
        </section>
      ` : p5State.addMode === 'text' ? `
        <section class="card mt-12">
          <div style="font-size: 15px; font-weight: 800;">📋 문제 텍스트 → AI 자동 해설</div>
          <p class="helper-desc mt-8">
            Part 5 문제와 보기(A~D)를 붙여넣으면 AI가 정답과 해설을 자동으로 완성해 줍니다.
          </p>
          ${renderTestPicker()}
          <textarea id="p5RawTextInput" class="text-area mt-8" rows="6" placeholder="예:&#10;115. Conradia Computers ___ changed the direction of its marketing strategy last week.&#10;(A) thickly&#10;(B) abruptly&#10;(C) formerly&#10;(D) frequently"></textarea>
          <button id="btnP5AnalyzeText" class="btn btn-primary full-width" type="button" ${p5State.analyzing ? 'disabled' : ''}>
            ${p5State.analyzing ? '⏳ AI 분석 중...' : '✨ AI로 정답·해설 자동 생성'}
          </button>
          ${p5State.analyzing ? `
            <div class="p5-progress-box mt-12">
              <div class="p5-progress-top">
                <span id="p5ProgLabel">${escapeHtml(p5State.progressLabel || 'AI 분석 중...')}</span>
                <span class="p5-progress-nums"><strong id="p5ProgPct">${Math.round(p5State.progressPct)}%</strong> · <span id="p5ProgTime">${p5State.elapsedSec.toFixed(1)}초</span></span>
              </div>
              <div class="p5-progress-track">
                <div id="p5ProgFill" class="p5-progress-fill" style="width: ${Math.round(p5State.progressPct)}%"></div>
              </div>
              <button id="btnP5Cancel" class="btn btn-outline btn-sm full-width mt-8" type="button">✕ 분석 취소</button>
            </div>
          ` : ''}
          ${p5State.errorMsg ? `
            <div class="p5-result-banner no mt-12" style="font-size: 13px; line-height: 1.5; word-break: break-word;">
              ⚠️ ${escapeHtml(p5State.errorMsg)}
            </div>
          ` : ''}
        </section>
      ` : `
        <section class="card mt-12">
          <div style="font-size: 15px; font-weight: 800;">✏️ 직접 오답 문제 입력</div>
          <div class="mt-8">${renderTestPicker()}</div>
          <input id="mNum" class="text-input mt-8" type="text" placeholder="문제 번호 (예: 115)" />
          <textarea id="mQuestion" class="text-area" rows="3" placeholder="문제 문장 (빈칸은 ___ 로 입력)"></textarea>
          <div class="btn-row">
            <input id="mA" class="text-input" type="text" placeholder="(A) 보기" />
            <input id="mB" class="text-input" type="text" placeholder="(B) 보기" />
          </div>
          <div class="btn-row">
            <input id="mC" class="text-input" type="text" placeholder="(C) 보기" />
            <input id="mD" class="text-input" type="text" placeholder="(D) 보기" />
          </div>
          <div class="btn-row">
            <input id="mAns" class="text-input" type="text" placeholder="정답 (A/B/C/D)" maxlength="1" />
            <input id="mCat" class="text-input" type="text" placeholder="유형 (예: 어휘 · 부사)" />
          </div>
          <textarea id="mExp" class="text-area" rows="3" placeholder="해설 메모 (선택)"></textarea>
          <button id="btnP5ManualSave" class="btn btn-primary full-width" type="button">✅ 오답노트에 저장</button>
        </section>
      `}

      ${p5State.pendingItems.length ? `
        <section class="card mt-12">
          <div style="font-size: 15px; font-weight: 800; color: var(--success);">
            ✨ 인식 완료! (${p5State.pendingItems.length}문제${p5State.lastElapsedSec ? ` · ${p5State.lastElapsedSec.toFixed(1)}초` : ''})
          </div>
          <div class="helper-desc mt-8">내용을 확인하고 저장 버튼을 누르면 바로 오답풀기에 추가됩니다.</div>

          ${p5State.pendingItems.map((it, idx) => `
            <div class="p5-preview-box">
              <div class="p5-badges">
                <span class="p5-badge-test">${escapeHtml(it.testName)}${it.number ? ` · ${escapeHtml(it.number)}번` : ''}</span>
                ${it.category ? `<span class="p5-badge-cat">${escapeHtml(it.category)}</span>` : ''}
              </div>
              <div style="font-weight: 700; margin-top: 8px; line-height: 1.45;">${highlightBlank(it.question)}</div>
              <div style="font-size: 13px; color: var(--text-sub); margin-top: 6px;">
                (A) ${escapeHtml(it.choices?.A || '')} &nbsp; (B) ${escapeHtml(it.choices?.B || '')}<br/>
                (C) ${escapeHtml(it.choices?.C || '')} &nbsp; (D) ${escapeHtml(it.choices?.D || '')}
              </div>
              <div style="margin-top: 8px; font-size: 13.5px; font-weight: 800; color: var(--primary);">
                정답: (${escapeHtml(it.answer)}) ${escapeHtml(it.choices?.[it.answer] || '')}
              </div>
              ${it.keyPoint ? `<div style="font-size: 12.5px; margin-top: 4px;">💡 ${escapeHtml(it.keyPoint)}</div>` : ''}
              ${it.explanation ? `<div style="font-size: 12.5px; color: var(--text-sub); margin-top: 4px; line-height: 1.45;">${escapeHtml(it.explanation)}</div>` : ''}
              <button class="btn btn-danger-outline btn-sm mt-8" data-remove-pending="${idx}" type="button">이 문제 제외</button>
            </div>
          `).join('')}

          <button id="btnSavePendingP5" class="btn btn-success full-width mt-12" type="button">
            ✅ ${p5State.pendingItems.length}개 문제 오답노트에 저장하기
          </button>
        </section>
      ` : ''}
    `;

    // 모드 전환
    document.querySelectorAll('[data-add-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        p5State.addMode = btn.dataset.addMode;
        p5State.errorMsg = '';
        renderAdd(ctx);
      });
    });

    // Test 번호 버튼 & +/- 스테퍼 바인딩
    document.querySelectorAll('[data-test-num]').forEach((btn) => {
      btn.addEventListener('click', () => setTestNum(btn.dataset.testNum));
    });
    document.querySelectorAll('[data-test-step]').forEach((btn) => {
      btn.addEventListener('click', () => setTestNum(p5State.testNum + Number(btn.dataset.testStep)));
    });

    const cancelBtn = document.getElementById('btnP5Cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        if (p5State.abortCtrl) p5State.abortCtrl.abort('USER_CANCEL');
      });
    }

    const retryPhotoBtn = document.getElementById('btnP5RetryPhoto');
    if (retryPhotoBtn && p5State.lastImagePayload) {
      retryPhotoBtn.addEventListener('click', () => runPhotoAnalysis(p5State.lastImagePayload));
    }

    // 사진 업로드 처리
    const handleFileSelect = async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      p5State.analyzing = true;
      p5State.errorMsg = '';
      p5State.pendingItems = [];
      p5State.elapsedSec = 0;
      p5State.progressPct = 15;
      p5State.progressLabel = '📷 사진 압축 및 최적화 중...';
      renderAdd(ctx);

      try {
        const { base64, dataUrl, mimeType } = await compressImageToBase64(file);
        p5State.previewImageUrl = dataUrl;
        p5State.lastImagePayload = { imageBase64: base64, mimeType };
        await runPhotoAnalysis(p5State.lastImagePayload);
      } catch (err) {
        stopProgressTicker();
        p5State.analyzing = false;
        p5State.errorMsg = err.message || '사진 처리 중 오류가 발생했어요';
        showToast('사진 처리 실패');
        renderAdd(ctx);
      }
    };

    const camInput = document.getElementById('inputP5Camera');
    const galInput = document.getElementById('inputP5Gallery');
    if (camInput) camInput.addEventListener('change', handleFileSelect);
    if (galInput) galInput.addEventListener('change', handleFileSelect);

    // 텍스트 AI 분석
    const analyzeTextBtn = document.getElementById('btnP5AnalyzeText');
    if (analyzeTextBtn) {
      analyzeTextBtn.addEventListener('click', async () => {
        const rawText = (document.getElementById('p5RawTextInput').value || '').trim();
        if (!rawText) {
          showToast('문제 텍스트를 먼저 붙여넣어 주세요');
          return;
        }
        const startedAt = Date.now();
        p5State.analyzing = true;
        p5State.errorMsg = '';
        p5State.pendingItems = [];
        p5State.elapsedSec = 0;
        p5State.progressPct = 35;
        p5State.progressLabel = '🤖 AI가 정답 및 해설 작성 중...';
        renderAdd(ctx);
        startProgressTicker(startedAt);

        try {
          const data = await callAnalyzeApi({ rawText }, state);
          setProgress(100, '✅ 분석 완료!');
          p5State.lastElapsedSec = (Date.now() - startedAt) / 1000;
          p5State.pendingItems = data.items || [];
          showToast(`✨ ${p5State.lastElapsedSec.toFixed(1)}초 만에 해설 생성 완료!`);
        } catch (err) {
          if (err.code === 'CANCELLED') {
            showToast('분석을 취소했어요');
          } else if (err.code === 'NO_API_KEY') {
            p5State.errorMsg = '⚙️ 설정(톱니바퀴)에서 Gemini API 키를 입력하거나 Vercel 환경변수 GEMINI_API_KEY를 설정해 주세요.';
          } else {
            p5State.errorMsg = err.message || '텍스트 분석 실패';
          }
        } finally {
          stopProgressTicker();
          p5State.analyzing = false;
          renderAdd(ctx);
        }
      });
    }

    // 직접 입력 저장
    const manualSaveBtn = document.getElementById('btnP5ManualSave');
    if (manualSaveBtn) {
      manualSaveBtn.addEventListener('click', () => {
        const question = (document.getElementById('mQuestion').value || '').trim();
        const ans = (document.getElementById('mAns').value || 'A').trim().toUpperCase();
        if (!question) {
          showToast('문제 문장을 입력해 주세요');
          return;
        }
        window.Storage.addPart5Items(state, [{
          testName: p5State.defaultTestName,
          number: document.getElementById('mNum').value || '',
          category: document.getElementById('mCat').value || '어휘/문법',
          question,
          choices: {
            A: document.getElementById('mA').value || '',
            B: document.getElementById('mB').value || '',
            C: document.getElementById('mC').value || '',
            D: document.getElementById('mD').value || ''
          },
          answer: ['A', 'B', 'C', 'D'].includes(ans) ? ans : 'A',
          explanation: document.getElementById('mExp').value || ''
        }]);
        showToast('✅ 오답노트에 저장했어요!');
        p5State.quizIndex = 0;
        p5State.selectedChoice = null;
        switchTab('p5_quiz');
      });
    }

    // 인식 결과 제외/저장
    document.querySelectorAll('[data-remove-pending]').forEach((btn) => {
      btn.addEventListener('click', () => {
        p5State.pendingItems.splice(Number(btn.dataset.removePending), 1);
        renderAdd(ctx);
      });
    });

    const savePendingBtn = document.getElementById('btnSavePendingP5');
    if (savePendingBtn) {
      savePendingBtn.addEventListener('click', () => {
        const count = window.Storage.addPart5Items(state, p5State.pendingItems);
        p5State.pendingItems = [];
        p5State.previewImageUrl = '';
        p5State.quizIndex = 0;
        p5State.selectedChoice = null;
        showToast(`✅ ${count}개 오답 문제가 등록되었어요!`);
        switchTab('p5_quiz');
      });
    }
  }

  return {
    renderQuiz,
    renderList,
    renderAdd
  };
})();
