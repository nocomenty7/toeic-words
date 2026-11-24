/**
 * Vercel Serverless Function: /api/tts
 * 모바일(iOS Safari / Android Chrome)에서도 무음모드·WebSpeech 버그 없이
 * 100% 안정적으로 네이티브 발음 MP3를 재생하기 위한 경량 오디오 프록시
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const text = String(req.query.text || '').trim().slice(0, 200);
  const rawLang = String(req.query.lang || 'en-US');

  if (!text) {
    res.status(400).json({ error: 'Missing text parameter' });
    return;
  }

  // 허용 언어 매핑 (미국 / 영국 / 호주 / 한국어)
  const langMap = {
    'en-US': 'en-US',
    'en-GB': 'en-GB',
    'en-AU': 'en-AU',
    'ko-KR': 'ko'
  };
  const tl = langMap[rawLang] || 'en-US';

  const ttsUrl =
    `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(text)}`;

  try {
    const upstream = await fetch(ttsUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Referer: 'https://translate.google.com/'
      }
    });

    if (!upstream.ok) {
      res.status(502).json({ error: 'Upstream TTS failed', status: upstream.status });
      return;
    }

    const arrayBuffer = await upstream.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    res.status(200).send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'TTS proxy error', detail: String(err.message || err) });
  }
};
