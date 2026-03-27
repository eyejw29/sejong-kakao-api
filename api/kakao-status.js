/**
 * 카카오 토큰 상태 확인 API
 * GET /api/kakao-status
 * 토큰 존재 여부 + 유효성 확인 (실제 카카오 API 호출 없이)
 */
const KAKAO_TOKEN = process.env.KAKAO_ACCESS_TOKEN;
const KAKAO_TOKEN_SAVED_AT = process.env.KAKAO_TOKEN_SAVED_AT;

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!KAKAO_TOKEN) {
    return res.status(200).json({
      connected: false,
      reason: '토큰 미설정',
      message: '카카오 로그인이 필요합니다'
    });
  }

  // 카카오 토큰 정보 확인 API (실제 메시지 발송 없이 토큰 유효성만 체크)
  try {
    const infoRes = await fetch('https://kapi.kakao.com/v1/user/access_token_info', {
      headers: { Authorization: `Bearer ${KAKAO_TOKEN}` }
    });

    if (infoRes.status === 200) {
      const info = await infoRes.json();
      return res.status(200).json({
        connected: true,
        message: '카카오 연동됨 · 토큰 유효',
        expires_in_seconds: info.expires_in,
        app_id: info.app_id,
        token_saved_at: KAKAO_TOKEN_SAVED_AT || 'unknown'
      });
    } else if (infoRes.status === 401) {
      return res.status(200).json({
        connected: false,
        reason: '토큰 만료',
        message: '토큰이 만료되었습니다. 재로그인 또는 토큰 갱신이 필요합니다',
        token_saved_at: KAKAO_TOKEN_SAVED_AT || 'unknown'
      });
    } else {
      return res.status(200).json({
        connected: false,
        reason: 'api_error',
        message: '카카오 API 응답 오류',
        status: infoRes.status
      });
    }
  } catch (err) {
    // 네트워크 오류 등 → 토큰은 있으니 일단 connected로 표시
    return res.status(200).json({
      connected: true,
      message: '토큰 존재 (API 확인 불가)',
      token_saved_at: KAKAO_TOKEN_SAVED_AT || 'unknown',
      note: '카카오 API 연결 확인 실패, 토큰은 저장되어 있습니다'
    });
  }
}
