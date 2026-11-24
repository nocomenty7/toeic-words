/**
 * Vercel Serverless Function: /api/analyze-part5
 * 사진(채점된 토익 Part 5 오답 문제) 또는 텍스트를 Gemini Vision으로 분석하여
 * 문제, 보기(A~D), 정답, 친절한 한국어 해설을 JSON으로 자동 생성합니다.
 *
 * - Google AI Studio의 모델 종료/변경에도 깨지지 않도록 /v1beta/models에서
 *   현재 사용 가능한 최신 Gemini Flash 비전 모델을 자동 탐색·캐시하여 호출합니다.
 */

let cachedModels = null;
let cachedAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

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
  // 버전 번호 추출 (예: gemini-3.0-flash -> 3.0, gemini-2.5-flash -> 2.5)
  const verMatch = name.match(/gemini-(\d+(?:\.\d+)?)/);
  const ver = verMatch ? parseFloat(verMatch[1]) : 1.0;
  score += ver * 100;

  // 빠르고 무료 할당량이 넉넉한 flash 우선
  if (name.includes('flash')) score += 50;
  if (name.includes('flash-lite')) score -= 12;
  if (name.includes('pro')) score += 10;

  // 안정(정식) 버전을 preview/exp보다 우선 (preview는 503 트래픽 과부하가 잦음)
  if (name.includes('preview') || name.includes('exp')) score -= 35;
  if (name.endsWith('-latest')) score += 6;

  return score;
}

async function getCandidateModels(apiKey) {
  const now = Date.now();
  if (cachedModels && cachedModels.length && now - cachedAt < CACHE_TTL_MS) {
    return cachedModels;
  }

  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(listUrl);
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
        cachedModels = models.slice(0, 8);
        cachedAt = now;
        return cachedModels;
      }
    }
  } catch (_) {
    // 목록 조회 실패 시 기본 후보군 사용
  }

  return ['gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-3-flash-preview', 'gemini-2.0-flash'];
}

function parseJsonSafe(rawText) {
  const trimmed = String(rawText || '').trim();
  // 혹시 마크다운 코드블록(```json ... ```)으로 감싸져 있을 경우 제거
  const stripped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(stripped);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

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
사용자가 보낸 사진(또는 텍스트)에서 토익 Part 5 문제를 추출하고, 정확한 정답과 이해하기 쉬운 한국어 해설을 JSON으로 반환하세요.

규칙:
1. 사진에 여러 문제가 보일 경우:
   - 빨간펜/색펜으로 틀렸다고 표시(빗금, 체크, 별표, 동그라미, V표 등)된 오답 문제를 우선 추출하세요.
   - 특정 표시가 안 보이면 사진에 온전하게 보이는 Part 5 문제를 모두 추출하세요.
2. 빈칸은 반드시 "___" 로 통일하세요.
3. testName이 사진에 보이면 추출하고, 안 보이면 "${defaultTestName || 'Part 5 오답'}"을 사용하세요.
4. 해설(explanation)은 초보자도 바로 이해할 수 있게 핵심 문법/문맥 단서를 짚어주며 친절하게 2~4문장으로 작성하세요.
5. choiceNotes에는 A, B, C, D 각 보기의 품사/뜻과 정답 또는 오답인 이유를 간결하게 적어주세요.
6. 반드시 아래 JSON 스키마만 출력하세요:
{
  "items": [
    {
      "testName": "Test 2",
      "number": "115",
      "category": "어휘 · 부사",
      "question": "Conradia Computers ___ changed the direction of its marketing strategy last week.",
      "choices": {
        "A": "thickly",
        "B": "abruptly",
        "C": "formerly",
        "D": "frequently"
      },
      "answer": "B",
      "translation": "자연스러운 한국어 문장 해석",
      "keyPoint": "1줄 핵심 암기 포인트",
      "explanation": "친절하고 명확한 핵심 해설",
      "choiceNotes": {
        "A": "(부) 두껍게, 빽빽하게 - 문맥 부적합",
        "B": "(부) 갑자기, 돌연 - 정답!",
        "C": "(부) 이전에 - 주로 과거 상태·직함에 사용",
        "D": "(부) 자주, 빈번하게 - 단발성 과거 시점(last week)과 어색함"
      }
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
      parts.push({
        text: '위 사진 속 토익 Part 5 오답 문제를 분석하여 지정된 JSON 형식으로 반환해 주세요.'
      });
    } else {
      parts.push({
        text: `아래 토익 Part 5 문제를 분석하여 지정된 JSON 형식으로 반환해 주세요.\n\n${rawText}`
      });
    }

    const candidates = await getCandidateModels(key);
    let lastError = '알 수 없는 오류';
    let lastStatus = 502;

    for (const modelId of candidates) {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(key)}`;

      const upstream = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        })
      });

      const data = await upstream.json().catch(() => ({}));

      if (!upstream.ok) {
        lastStatus = upstream.status;
        lastError = data?.error?.message || `Gemini API 오류 (${upstream.status})`;
        // 인증(401/403) 오류가 아닌 이상(503 혼잡, 429 한도, 404 종료, 500 등) 다음 후보 모델로 자동 우회
        if (upstream.status !== 401 && upstream.status !== 403) {
          continue;
        }
        break;
      }

      const rawJsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawJsonText) {
        lastError = 'AI 응답이 비어 있습니다. 사진을 더 선명하게 찍어 다시 시도해 주세요.';
        continue;
      }

      const parsed = parseJsonSafe(rawJsonText);
      const items = Array.isArray(parsed.items) ? parsed.items : [];
      res.status(200).json({ items, model: modelId });
      return;
    }

    // 모든 후보 실패 시 캐시 무효화
    cachedModels = null;
    res.status(lastStatus).json({ error: 'GEMINI_ERROR', message: lastError });
  } catch (err) {
    res.status(500).json({
      error: 'ANALYZE_ERROR',
      message: '문제 분석 중 오류가 발생했습니다: ' + String(err.message || err)
    });
  }
};
