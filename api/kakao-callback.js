/**
 * 카카오 OAuth 콜백 처리
 * 카카오 로그인 후 redirect_uri로 돌아올 때 code를 받아서 토큰으로 교환
 */
const KAKAO_REST_KEY = process.env.KAKAO_REST_KEY;
const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET;
const REDIRECT_URI = process.env.KAKAO_REDIRECT_URI;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { code, error } = req.query;

  if (error) {
    return res.status(400).json({ error: '카카오 로그인 실패', detail: error });
  }

  if (!code) {
    return res.status(400).json({ error: 'code 파라미터가 없습니다' });
  }

  try {
    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: KAKAO_REST_KEY,
        client_secret: KAKAO_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        code: code
      })
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return res.status(400).json({ error: '토큰 교환 실패', detail: tokenData });
    }

    const result = {
      success: true,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      refresh_token_expires_in: tokenData.refresh_token_expires_in,
      saved_at: new Date().toISOString()
    };

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`
      <!DOCTYPE html><html><head><meta charset="utf-8"><title>카카오 연동 완료</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:60px;">
        <h2>✅ 카카오 로그인 연동 완료</h2>
        <p>토큰이 서버에 저장되었습니다.</p>
        <p style="color:#888;font-size:14px;">access_token: ${tokenData.access_token.substring(0,10)}...</p>
        <p style="color:#888;font-size:14px;">만료: ${tokenData.expires_in}초</p>
        <a href="/" style="color:#2563EB;">← 대시보드로 돌아가기</a>
      </body></html>
    `);
  } catch (err) {
    return res.status(500).json({ error: '서버 오류', detail: err.message });
  }
}
