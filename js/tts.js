/**
 * 네이티브 발음 엔진 (모바일 iOS/Android 100% 호환)
 * - 1순위: Vercel /api/tts MP3 오디오 (단일 HTMLAudioElement 재사용 + 메모리 캐시)
 *   → 아이폰 Safari 무음/WebSpeech 버그 없이 또렷한 네이티브 발음 & 귀로암기 자동재생 완벽 지원
 * - 2순위(오프라인/로컬): 개선된 Web Speech API 폴백
 */
window.TTS = (function () {
  const synth = window.speechSynthesis || null;
  let voices = [];

  // iOS Safari 오토플레이 잠금 해제를 위한 단일 재사용 Audio 객체
  const audio = new Audio();
  audio.preload = 'auto';
  audio.playsInline = true;
  let audioUnlocked = false;
  let currentSpeakToken = 0;

  // 같은 단어 재재생 시 지연 0ms를 위한 Blob URL 캐시
  const blobCache = new Map();

  // 아주 짧은 무음 WAV (iOS Safari 오디오 세션 언락용)
  const SILENT_WAV =
    'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

  const PREFERRED_US = [
    'Samantha', 'Aaron', 'Nicky', 'Alex', 'Ava', 'Allison',
    'Google US English', 'Microsoft Aria Online (Natural)', 'Microsoft Jenny Online (Natural)'
  ];
  const PREFERRED_GB = [
    'Daniel', 'Martha', 'Serena', 'Arthur', 'Kate',
    'Google UK English Female', 'Google UK English Male'
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
    if (audioUnlocked) return;
    audioUnlocked = true;
    try {
      audio.src = SILENT_WAV;
      audio.volume = 0.01;
      const p = audio.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = 1.0;
        }).catch(() => {
          audioUnlocked = false;
          audio.volume = 1.0;
        });
      }
    } catch (_) {
      audioUnlocked = false;
      audio.volume = 1.0;
    }
  }

  // 첫 터치/클릭 시 자동으로 iOS 오디오 잠금 해제
  ['touchstart', 'pointerdown', 'click'].forEach((evt) => {
    window.addEventListener(evt, unlock, { once: true, capture: true, passive: true });
  });

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

    for (const name of prefList) {
      const hit = exactLangVoices.find((v) => v.name.includes(name));
      if (hit) return hit;
    }
    if (exactLangVoices.length) return exactLangVoices[0];
    return voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('en')) || null;
  }

  function stop() {
    currentSpeakToken += 1;
    try {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.currentTime = 0;
    } catch (_) {
      // ignore
    }
    if (synth && (synth.speaking || synth.pending)) {
      try {
        synth.cancel();
      } catch (_) {
        // ignore
      }
    }
  }

  function canUseApiTts() {
    return location.protocol === 'http:' || location.protocol === 'https:';
  }

  async function fetchAudioBlobUrl(text, lang) {
    const cacheKey = `${lang}|${text}`;
    if (blobCache.has(cacheKey)) {
      return blobCache.get(cacheKey);
    }

    const url = `/api/tts?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(lang)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('API TTS unavailable');
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('audio')) throw new Error('Not audio response');

    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    blobCache.set(cacheKey, objUrl);
    return objUrl;
  }

  function speakViaWebSpeech(text, lang, rate, token, onDone) {
    if (!synth) {
      onDone();
      return;
    }

    const run = () => {
      if (token !== currentSpeakToken) return;
      try {
        if (synth.paused) synth.resume();
      } catch (_) {
        // ignore
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = rate;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      const voice = pickVoice(lang);
      if (voice) utterance.voice = voice;

      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        clearTimeout(safetyTimer);
        if (token === currentSpeakToken) onDone();
      };

      const estimatedMs = Math.max(2000, Math.min(9000, (text.length * 140) / Math.max(0.5, rate)));
      const safetyTimer = setTimeout(done, estimatedMs + 1500);

      utterance.onend = done;
      utterance.onerror = done;

      try {
        synth.speak(utterance);
      } catch (_) {
        done();
      }
    };

    if (synth.speaking || synth.pending) {
      try {
        synth.cancel();
      } catch (_) {
        // ignore
      }
      setTimeout(run, 60);
    } else {
      run();
    }
  }

  /**
   * 텍스트를 네이티브 발음으로 재생합니다.
   */
  function speak(text, options = {}) {
    const cleanText = String(text || '').trim();
    if (!cleanText) {
      if (options.onEnd) options.onEnd();
      return;
    }

    const lang = options.lang || 'en-US';
    const rate = typeof options.rate === 'number' ? options.rate : 0.95;
    const onDone = typeof options.onEnd === 'function' ? options.onEnd : () => {};

    stop();
    const token = currentSpeakToken;

    if (!canUseApiTts()) {
      speakViaWebSpeech(cleanText, lang, rate, token, onDone);
      return;
    }

    fetchAudioBlobUrl(cleanText, lang)
      .then((blobUrl) => {
        if (token !== currentSpeakToken) return;

        let finished = false;
        const done = () => {
          if (finished) return;
          finished = true;
          audio.onended = null;
          audio.onerror = null;
          if (token === currentSpeakToken) onDone();
        };

        audio.volume = 1.0;
        audio.src = blobUrl;
        audio.playbackRate = Math.max(0.5, Math.min(1.5, rate));
        audio.onended = done;
        audio.onerror = () => {
          if (token !== currentSpeakToken) return;
          speakViaWebSpeech(cleanText, lang, rate, token, onDone);
        };

        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {
            if (token !== currentSpeakToken) return;
            speakViaWebSpeech(cleanText, lang, rate, token, onDone);
          });
        }
      })
      .catch(() => {
        if (token !== currentSpeakToken) return;
        speakViaWebSpeech(cleanText, lang, rate, token, onDone);
      });
  }

  function getActiveVoiceLabel(lang = 'en-US') {
    if (canUseApiTts()) {
      return lang === 'en-GB'
        ? '클라우드 네이티브 영국 발음 (MP3)'
        : '클라우드 네이티브 미국 발음 (MP3)';
    }
    const v = pickVoice(lang);
    return v ? `${v.name} (${v.lang})` : '시스템 기본 음성';
  }

  return {
    speak,
    stop,
    unlock,
    getActiveVoiceLabel,
    isSupported: true
  };
})();
