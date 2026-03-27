/**
 * 카카오톡 메시지 발송 API
 * POST /api/kakao-send
 * Body: { type: "friend"|"self"|"both", message: "..." }
 */
const KAKAO_TOKEN = process.env.KAKAO_ACCESS_TOKEN;
const FRIEND_UUID = process.env.KAKAO_FRIEND_UUID;
const DASHBOARD_URL = 'https://eyejw29.github.io/sejong-gugak-dashboard/';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { type = 'both', message } = req.body || {};

  if (!message) return res.status(400).json({ error: 'message 필드가 필요합니다' });
  if (!KAKAO_TOKEN) return res.status(500).json({ error: '토큰이 설정되지 않았습니다. /api/kakao-login으로 로그인하세요.' });

  const templateObject = JSON.stringify({
    object_type: 'text',
    text: message,
    link: { web_url: DASHBOARD_URL, mobile_web_url: DASHBOARD_URL },
    button_title: '대시보드 보기'
  });

  const results = {};

  // 1. 친구 메시지 (장모님)
  if (type === 'friend' || type === 'both') {
    try {
      const friendRes = await fetch('https://kapi.kakao.com/v1/api/talk/friends/message/default/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${KAKAO_TOKEN}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          receiver_uuids: JSON.stringify([FRIEND_UUID]),
          template_object: templateObject
        })
      });
      const friendData = await friendRes.json();
      results.friend = { status: friendRes.status, data: friendData };
    } catch (e) {
      results.friend = { status: 'error', error: e.message };
    }
  }

  // 2. 나에게 보내기 (은재님)
  if (type === 'self' || type === 'both') {
    try {
      const selfRes = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${KAKAO_TOKEN}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          template_object: templateObject
        })
      });
      const selfData = await selfRes.json();
      results.self = { status: selfRes.status, data: selfData };
    } catch (e) {
      results.self = { status: 'error', error: e.message };
    }
  }

  const isExpired = (results.friend?.status === 401) || (results.self?.status === 401);
  if (isExpired) {
    return res.status(401).json({
      error: '토큰 만료. /api/kakao-login으로 재로그인 필요',
      results
    });
  }

  return res.status(200).json({
    success: true,
    results,
    timestamp: new Date().toISOString()
  });
}
