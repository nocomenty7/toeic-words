/**
 * 네이티브 발음 엔진 (Web Speech API)
 * - iOS Safari / Android Chrome / macOS / Windows 환경에서 가장 자연스러운 네이티브 음성을 자동 우선 선택
 * - 미국식(en-US) / 영국식(en-GB) 토글 및 속도 조절 지원
 */
window.TTS = (function () {
  const synth = window.speechSynthesis || null;
  let voices = [];
  let unlocked = false;

  // 플랫폼별 자연스러운 네이티브 음성 우선순위
  const PREFERRED_US = [
    'Samantha',
    'Aaron',
    'Nicky',
    'Alex',
    'Ava',
    'Allison',
    'Google US English',
    'Microsoft Aria Online (Natural)',
    'Microsoft Jenny Online (Natural)',
    'Microsoft Guy Online (Natural)',
    'Zira',
    'David'
  ];

  const PREFERRED_GB = [
    'Daniel',
    'Martha',
    'Serena',
    'Arthur',
    'Kate',
    'Google UK English Female',
    'Google UK English Male',
    'Microsoft Libby Online (Natural)',
    'Microsoft Ryan Online (Natural)'
  ];

  function loadVoices() {
    if (!synth) return [];
    voices = synth.getVoices() || [];
    return voices;
  }

  if (synth) {
    loadVoices();
    if (typeof synth.onvoiceschanged !== 'undefined') {
      synth.onvoiceschanged = loadVoices;
    }
  }

  function unlock() {
    if (!synth || unlocked) return;
    try {
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      synth.speak(u);
      unlocked = true;
    } catch (_) {
      // ignore
    }
  }

  function pickVoice(lang) {
    if (!voices.length) loadVoices();
    if (!voices.length) return null;

    if (lang === 'ko-KR') {
      const koVoices = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('ko'));
      const preferredKo = ['Yuna', 'Sora', 'Google 한국의', 'Microsoft SunHi'];
      for (const name of preferredKo) {
        const hit = koVoices.find((v) => v.name.includes(name));
        if (hit) return hit;
      }
      return koVoices[0] || null;
    }

    const isGB = lang === 'en-GB';
    const prefList = isGB ? PREFERRED_GB : PREFERRED_US;
    const targetPrefix = isGB ? 'en-gb' : 'en-us';

    const exactLangVoices = voices.filter(
      (v) => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith(targetPrefix)
    );

    // 1) 선호 리스트 + Enhanced/Premium 우선
    for (const name of prefList) {
      const enhanced = exactLangVoices.find(
        (v) => v.name.includes(name) && (v.name.includes('Enhanced') || v.name.includes('Premium') || v.name.includes('Natural'))
      );
      if (enhanced) return enhanced;
      const normal = exactLangVoices.find((v) => v.name.includes(name));
      if (normal) return normal;
    }

    // 2) Enhanced/Premium/Natural 포함 음성
    const anyNatural = exactLangVoices.find(
      (v) => v.name.includes('Natural') || v.name.includes('Enhanced') || v.name.includes('Premium') || v.name.includes('Google')
    );
    if (anyNatural) return anyNatural;

    // 3) 해당 국가 영어 음성 중 첫 번째
    if (exactLangVoices.length) return exactLangVoices[0];

    // 4) 아무 영어 음성
    return voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('en')) || null;
  }

  function stop() {
    if (!synth) return;
    try {
      synth.cancel();
    } catch (_) {
      // ignore
    }
  }

  /**
   * 텍스트를 발음합니다.
   * @param {string} text
   * @param {{ lang?: string, rate?: number, onEnd?: Function, onError?: Function }} options
   */
  function speak(text, options = {}) {
    if (!synth || !text) {
      if (options.onEnd) options.onEnd();
      return;
    }

    const lang = options.lang || 'en-US';
    const rate = typeof options.rate === 'number' ? options.rate : 0.95;

    stop();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voice = pickVoice(lang);
    if (voice) {
      utterance.voice = voice;
    }

    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      if (options.onEnd) options.onEnd();
    };

    utterance.onend = done;
    utterance.onerror = () => {
      if (options.onError) options.onError();
      done();
    };

    // 일부 모바일 브라우저에서 onend가 누락되는 현상 방지용 안전 타이머
    const estimatedMs = Math.max(2200, Math.min(9000, text.length * 140 / Math.max(0.5, rate)));
    const fallbackTimer = setTimeout(() => {
      if (!synth.speaking) done();
    }, estimatedMs + 1500);

    const origDone = done;
    utterance.onend = () => {
      clearTimeout(fallbackTimer);
      origDone();
    };

    try {
      synth.speak(utterance);
    } catch (_) {
      clearTimeout(fallbackTimer);
      origDone();
    }
  }

  function getActiveVoiceLabel(lang = 'en-US') {
    const v = pickVoice(lang);
    return v ? `${v.name} (${v.lang})` : '시스템 기본 음성';
  }

  return {
    speak,
    stop,
    unlock,
    getActiveVoiceLabel,
    isSupported: Boolean(synth)
  };
})();
