/**
 * Vercel Serverless Function: /api/analyze-part5
 * 사진(채점된 토익 Part 5 오답 문제) 또는 텍스트를 Gemini Vision으로 분석하여
 * 문제, 보기(A~D), 정답, 친절한 한국어 해설을 JSON으로 자동 생성합니다.
 */
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
      "keyPoint": "1줄 핵심 암기 포인트 (예: last week(단발성 과거) + 방향 변경 → abruptly)",
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

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`;

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

    const data = await upstream.json();

    if (!upstream.ok) {
      const msg = data?.error?.message || `Gemini API 오류 (${upstream.status})`;
      res.status(upstream.status).json({ error: 'GEMINI_ERROR', message: msg });
      return;
    }

    const rawJsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJsonText) {
      res.status(502).json({ error: 'EMPTY_RESPONSE', message: 'AI 응답이 비어 있습니다. 사진을 더 선명하게 찍어 다시 시도해 주세요.' });
      return;
    }

    const parsed = JSON.parse(rawJsonText);
    const items = Array.isArray(parsed.items) ? parsed.items : [];

    res.status(200).json({ items });
  } catch (err) {
    res.status(500).json({
      error: 'ANALYZE_ERROR',
      message: '문제 분석 중 오류가 발생했습니다: ' + String(err.message || err)
    });
  }
};
