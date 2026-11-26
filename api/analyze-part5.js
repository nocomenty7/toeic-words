/**
 * Vercel Serverless Function: /api/analyze-part5
 * 고속 토익 Part 5 사진/텍스트 분석 API
 *
 * 속도 최적화:
 * 1) 불필요한 /v1beta/models 사전 조회를 생략하고 초고속 Flash-Lite/Flash 모델을 즉시 호출
 * 2) thinkingBudget: 0 적용으로 불필요한 추론 지연(8~12초)을 제거하여 2~4초 내 응답
 * 3) 모델별 9초 타임아웃 + 장애/혼잡 시 즉시 다음 모델로 우회
 * 4) 사용자 촬영 패턴 최적화 (90도 회전 허용, 빨간펜 필기 무시, 중앙 완전한 1문제만 추출)
 */

let cachedWorkingModel = null;
let cachedDiscovered = null;
let cachedAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

const FAST_PATH_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-2.0-flash'
];

function scoreModelName(fullName) {
  const name = String(fullName || '').replace(/^models\//, '').toLowerCase();
  if (!name.startsWith('gemini-')) return -1;
  if (
    name.includes('embedding') ||
    name.includes('aqa') ||
    name.includes('tts') ||
    name.includes('audio') ||
    name.includes('image') ||
    name.includes('imagen') ||
    name.includes('veo') ||
    name.includes('robotics') ||
    name.includes('thinking') ||
    name.includes('learnlm') ||
    name.includes('bisect')
  ) {
    return -1;
  }

  let score = 0;
  const verMatch = name.match(/gemini-(\d+(?:\.\d+)?)/);
  const ver = verMatch ? parseFloat(verMatch[1]) : 1.0;
  score += ver * 100;

  if (name.includes('flash-lite')) score += 60;
  else if (name.includes('flash')) score += 50;
  else if (name.includes('pro')) score += 10;

  if (name.includes('preview') || name.includes('exp')) score -= 35;
  if (name.endsWith('-latest')) score += 6;
  return score;
}

async function discoverFallbackModels(apiKey) {
  const now = Date.now();
  if (cachedDiscovered && now - cachedAt < CACHE_TTL_MS) {
    return cachedDiscovered;
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3500);
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { signal: ctrl.signal }
    );
    clearTimeout(timer);
    if (resp.ok) {
      const json = await resp.json();
      const models = (json.models || [])
        .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
        .map((m) => ({
          id: String(m.name || '').replace(/^models\//, ''),
          score: scoreModelName(m.name)
        }))
        .filter((m) => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((m) => m.id);
      cachedDiscovered = models.slice(0, 6);
      cachedAt = now;
      return cachedDiscovered;
    }
  } catch (_) {
    // ignore
  }
  return [];
}

function parseJsonSafe(rawText) {
  const trimmed = String(rawText || '').trim();
  const stripped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(stripped);
}

async function callGeminiModel({ apiKey, modelId, parts, disableThinking, timeoutMs }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const generationConfig = {
    responseMimeType: 'application/json',
    temperature: 0.1,
    maxOutputTokens: 900
  };
  if (disableThinking && /2\.5|3/.test(modelId)) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig
      }),
      signal: ctrl.signal
    });
    const data = await upstream.json().catch(() => ({}));
    return { ok: upstream.ok, status: upstream.status, data };
  } catch (err) {
    if (err && err.name === 'AbortError') {
      return { ok: false, status: 504, data: { error: { message: `${modelId} 응답 시간 초과` } } };
    }
    return { ok: false, status: 502, data: { error: { message: String(err.message || err) } } };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const startedAt = Date.now();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { imageBase64, mimeType, rawText, defaultTestName, apiKey } = body;

    const key = process.env.GEMINI_API_KEY || apiKey;
    if (!key) {
      res.status(400).json({
        error: 'NO_API_KEY',
        message: 'Gemini API 키가 설정되지 않았습니다. 설정에서 API 키를 입력하거나 Vercel 환경변수(GEMINI_API_KEY)를 등록해 주세요.'
      });
      return;
    }

    if (!imageBase64 && !rawText) {
      res.status(400).json({ error: '사진 또는 문제 텍스트를 입력해 주세요.' });
      return;
    }

    const systemPrompt = `당신은 토익(TOEIC) Part 5 전문 강사입니다. 아래 규칙을 엄격히 지켜 JSON만 출력하세요.

[사진 판독 핵심 규칙]
1. 사진이 90도(또는 180도/270도) 회전되어 있을 수 있습니다. 글자 방향을 정확히 파악해 읽으세요.
2. 인쇄된 검은색 활자(본 문제와 A~D 보기)만 읽으세요. 빨간색/파란색 펜으로 손글씨로 적은 빗금, 체크, 동그라미, 밑줄, 한글·영어 필기 해설은 모두 완전히 무시하세요.
3. 사진의 정중앙(가운데)에 온전하게 찍힌 Part 5 문제 **딱 1문제**만 추출하세요. 위쪽이나 아래쪽에 잘려서 일부만 보이는 인접 문제는 무조건 무시하세요.
4. 빈칸은 반드시 "___" 로 통일하고, testName이 안 보이면 "${defaultTestName || 'Part 5 오답'}"을 넣으세요.
5. 해설은 핵심 단서 위주로 친절하고 간결하게(2~3문장), 보기별 정리는 한 줄씩 핵심만 적으세요.

출력 JSON 스키마:
{
  "items": [
    {
      "testName": "Test 2",
      "number": "115",
      "category": "어휘 · 부사",
      "question": "문장 ___ ...",
      "choices": { "A": "", "B": "", "C": "", "D": "" },
      "answer": "B",
      "translation": "자연스러운 한국어 해석",
      "keyPoint": "1줄 핵심 암기 포인트",
      "explanation": "핵심 문법/문맥 단서를 짚는 친절한 해설 (2~3문장)",
      "choiceNotes": { "A": "뜻/오답이유", "B": "뜻/정답이유", "C": "뜻/오답이유", "D": "뜻/오답이유" }
    }
  ]
}`;

    const parts = [{ text: systemPrompt }];
    if (imageBase64) {
      parts.push({
        inline_data: {
          mime_type: mimeType || 'image/jpeg',
          data: imageBase64
        }
      });
      parts.push({ text: '사진 가운데의 완전한 1문제만 추출해 JSON으로 반환하세요.' });
    } else {
      parts.push({ text: `아래 토익 Part 5 문제를 분석해 JSON으로 반환하세요.\n\n${rawText}` });
    }

    // 이전에 성공한 모델이 있으면 최우선 시도 + 빠른 기본 모델 목록
    const initialQueue = [];
    if (cachedWorkingModel) initialQueue.push(cachedWorkingModel);
    FAST_PATH_MODELS.forEach((m) => {
      if (!initialQueue.includes(m)) initialQueue.push(m);
    });

    const tried = new Set();
    let lastError = 'AI 서버 응답 지연';
    let lastStatus = 502;

    const tryList = async (models) => {
      for (const modelId of models) {
        if (tried.has(modelId)) continue;
        // 전체 서버 실행시간 23초 넘기기 전에 깔끔하게 종료
        if (Date.now() - startedAt > 23000) {
          lastStatus = 504;
          lastError = '분석 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.';
          return null;
        }
        tried.add(modelId);

        let result = await callGeminiModel({
          apiKey: key,
          modelId,
          parts,
          disableThinking: true,
          timeoutMs: 9500
        });

        // thinkingConfig 미지원 모델이면 옵션 빼고 즉시 재시도
        if (!result.ok && result.status === 400 && /thinking/i.test(result.data?.error?.message || '')) {
          result = await callGeminiModel({
            apiKey: key,
            modelId,
            parts,
            disableThinking: false,
            timeoutMs: 9500
          });
        }

        if (!result.ok) {
          lastStatus = result.status;
          lastError = result.data?.error?.message || `Gemini API 오류 (${result.status})`;
          if (result.status === 401 || result.status === 403) {
            return { fatal: true };
          }
          continue;
        }

        const rawJsonText = result.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawJsonText) {
          lastError = 'AI 응답이 비어 있습니다. 사진을 더 선명하게 찍어 다시 시도해 주세요.';
          continue;
        }

        const parsed = parseJsonSafe(rawJsonText);
        const items = Array.isArray(parsed.items) ? parsed.items : [];
        cachedWorkingModel = modelId;
        return { items, model: modelId };
      }
      return null;
    };

    let outcome = await tryList(initialQueue);

    // 빠른 기본 모델이 모두 실패(예: 종료/혼잡)했고 시간이 남았으면 동적 목록 탐색 후 추가 시도
    if (!outcome && Date.now() - startedAt < 18000) {
      const discovered = await discoverFallbackModels(key);
      outcome = await tryList(discovered);
    }

    if (outcome && !outcome.fatal) {
      res.status(200).json({
        items: outcome.items,
        model: outcome.model,
        elapsedMs: Date.now() - startedAt
      });
      return;
    }

    cachedWorkingModel = null;
    res.status(lastStatus).json({ error: 'GEMINI_ERROR', message: lastError });
  } catch (err) {
    res.status(500).json({
      error: 'ANALYZE_ERROR',
      message: '문제 분석 중 오류가 발생했습니다: ' + String(err.message || err)
    });
  }
};
