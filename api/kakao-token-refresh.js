/**
 * 카카오 토큰 갱신 API
 * POST /api/kakao-token-refresh
 * refresh_token으로 access_token을 갱신
 */
const KAKAO_REST_KEY = process.env.KAKAO_REST_KEY;
const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.KAKAO_REFRESH_TOKEN;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (!REFRESH_TOKEN) {
    return res.status(400).json({ error: 'refresh_token이 설정되지 않았습니다' });
  }

  try {
    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: KAKAO_REST_KEY,
        client_secret: KAKAO_CLIENT_SECRET,
        refresh_token: REFRESH_TOKEN
      })
    });

    const data = await tokenRes.json();

    if (data.error) {
      return res.status(400).json({ error: '토큰 갱신 실패', detail: data });
    }

    return res.status(200).json({
      success: true,
      access_token: data.access_token,
      expires_in: data.expires_in,
      refresh_token: data.refresh_token || '(기존 유지)',
      note: '⚠️ Vercel 환경변수 KAKAO_ACCESS_TOKEN을 이 값으로 업데이트하세요'
    });
  } catch (err) {
    return res.status(500).json({ error: '서버 오류', detail: err.message });
  }
}
