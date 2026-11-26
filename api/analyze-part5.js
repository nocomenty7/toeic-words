/**
 * Vercel Serverless Function: /api/analyze-part5
 * 토익 Part 5 사진/텍스트 분석 API
 *
 * - /v1beta/models에서 현재 계정의 실제 활성 최신 Gemini Flash 모델을 자동 탐색·캐시
 * - 저렴한 lite 모델보다 비전 정확도가 높은 정식 Flash 모델을 우선 선택
 * - 90도 회전, 연필 밑줄/동그라미 및 빨간펜 필기 무시, 중앙 1문제만 추출
 */

let cachedModels = null;
let cachedWorkingModel = null;
let cachedAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          testName: { type: 'STRING' },
          number: { type: 'STRING' },
          category: { type: 'STRING' },
          question: { type: 'STRING' },
          choices: {
            type: 'OBJECT',
            properties: {
              A: { type: 'STRING' },
              B: { type: 'STRING' },
              C: { type: 'STRING' },
              D: { type: 'STRING' }
            },
            required: ['A', 'B', 'C', 'D']
          },
          answer: { type: 'STRING' },
          translation: { type: 'STRING' },
          keyPoint: { type: 'STRING' },
          explanation: { type: 'STRING' },
          choiceNotes: {
            type: 'OBJECT',
            properties: {
              A: { type: 'STRING' },
              B: { type: 'STRING' },
              C: { type: 'STRING' },
              D: { type: 'STRING' }
            },
            required: ['A', 'B', 'C', 'D']
          }
        },
        required: [
          'testName', 'number', 'category', 'question', 'choices',
          'answer', 'translation', 'keyPoint', 'explanation', 'choiceNotes'
        ]
      }
    }
  },
  required: ['items']
};

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

  // 비전 인식 정확도가 높은 정식 flash를 lite보다 우선!
  if (name.includes('flash') && !name.includes('lite')) score += 60;
  else if (name.includes('flash-lite')) score += 40;
  else if (name.includes('pro')) score += 20;

  if (name.includes('preview') || name.includes('exp')) score -= 25;
  if (name.endsWith('-latest')) score += 8;

  return score;
}

async function getCandidateModels(apiKey) {
  const now = Date.now();
  if (cachedModels && cachedModels.length && now - cachedAt < CACHE_TTL_MS) {
    return cachedModels;
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
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

      if (models.length) {
        cachedModels = models.slice(0, 6);
        cachedAt = now;
        return cachedModels;
      }
    }
  } catch (_) {
    // ignore
  }

  return ['gemini-flash-latest', 'gemini-3-flash-preview', 'gemini-2.5-flash'];
}

function parseJsonSafe(rawText) {
  const trimmed = String(rawText || '').trim();
  const stripped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(stripped);
}

async function callGeminiModel({ apiKey, modelId, parts, useSchema, timeoutMs }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const generationConfig = {
    responseMimeType: 'application/json',
    temperature: 0.15,
    maxOutputTokens: 2048
  };
  if (useSchema) {
    generationConfig.responseSchema = RESPONSE_SCHEMA;
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

    const systemPrompt = `당신은 친절하고 정확한 토익(TOEIC) Part 5 전문 강사입니다.

[사진 판독 규칙]
1. 사진이 90도(또는 180도/270도) 회전되어 있을 수 있습니다. 글자 방향을 정확히 파악해 읽으세요.
2. 인쇄된 활자(본 문제 문장과 A~D 보기)만 읽으세요. 연필로 친 밑줄·동그라미·필기와 빨간펜/파란펜 채점 빗금·손글씨 해설은 모두 무시하세요.
3. 사진의 정중앙(가운데)에 온전하게 찍힌 Part 5 문제 **딱 1문제**만 추출하세요. 위·아래에 잘려서 일부만 보이는 인접 문제는 무시하세요.
4. 빈칸은 반드시 "___" 로 통일하고, testName이 사진에 없으면 "${defaultTestName || 'Part 5 오답'}"을 넣으세요.
5. 정답(answer)은 "A", "B", "C", "D" 중 하나만 적고, 해설(explanation)은 핵심 문법/문맥 단서를 짚어 2~3문장으로 친절하게 작성하세요.
6. choiceNotes에는 A~D 각 보기의 뜻과 정답/오답 이유를 한 줄씩 간결하게 적으세요.`;

    const parts = [{ text: systemPrompt }];
    if (imageBase64) {
      parts.push({
        inline_data: {
          mime_type: mimeType || 'image/jpeg',
          data: imageBase64
        }
      });
      parts.push({ text: '사진 정중앙의 완전한 Part 5 1문제만 추출해 지정된 JSON 스키마로 반환하세요.' });
    } else {
      parts.push({ text: `아래 토익 Part 5 문제를 분석해 지정된 JSON 스키마로 반환하세요.\n\n${rawText}` });
    }

    const discovered = await getCandidateModels(key);
    const queue = [];
    if (cachedWorkingModel && discovered.includes(cachedWorkingModel)) {
      queue.push(cachedWorkingModel);
    }
    discovered.forEach((m) => {
      if (!queue.includes(m)) queue.push(m);
    });

    const errorLog = [];
    let lastStatus = 502;

    for (const modelId of queue) {
      const remainingMs = 26500 - (Date.now() - startedAt);
      if (remainingMs < 3500) break;

      let result = await callGeminiModel({
        apiKey: key,
        modelId,
        parts,
        useSchema: true,
        timeoutMs: Math.min(18000, remainingMs)
      });

      // responseSchema 미지원 모델이면 스키마 빼고 1회 재시도
      if (!result.ok && result.status === 400 && /schema/i.test(result.data?.error?.message || '')) {
        const rem2 = 26500 - (Date.now() - startedAt);
        if (rem2 >= 3500) {
          result = await callGeminiModel({
            apiKey: key,
            modelId,
            parts,
            useSchema: false,
            timeoutMs: Math.min(15000, rem2)
          });
        }
      }

      if (!result.ok) {
        lastStatus = result.status;
        const msg = result.data?.error?.message || `HTTP ${result.status}`;
        errorLog.push(`${modelId}: ${msg}`);
        if (result.status === 401 || result.status === 403) break;
        continue;
      }

      const rawJsonText = result.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawJsonText) {
        errorLog.push(`${modelId}: 빈 응답`);
        continue;
      }

      try {
        const parsed = parseJsonSafe(rawJsonText);
        const items = Array.isArray(parsed.items) ? parsed.items : [];
        cachedWorkingModel = modelId;
        res.status(200).json({
          items,
          model: modelId,
          elapsedMs: Date.now() - startedAt
        });
        return;
      } catch (parseErr) {
        errorLog.push(`${modelId}: JSON 파싱 실패`);
        continue;
      }
    }

    cachedWorkingModel = null;
    cachedModels = null;
    const summary = errorLog.length ? errorLog[errorLog.length - 1] : '응답 시간 초과';
    res.status(lastStatus).json({
      error: 'GEMINI_ERROR',
      message: `AI 분석 실패 (${summary})`
    });
  } catch (err) {
    res.status(500).json({
      error: 'ANALYZE_ERROR',
      message: '문제 분석 중 오류가 발생했습니다: ' + String(err.message || err)
    });
  }
};
