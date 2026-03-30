/**
 * 카카오톡 메시지 발송 API
 * POST /api/kakao-send
 * Body: { type: "friend"|"self"|"both", message: "..." }
 *
 * 토큰 만료 시 자동 갱신 후 재시도
 */
const KAKAO_REST_KEY = process.env.KAKAO_REST_KEY;
const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.KAKAO_REFRESH_TOKEN;
const VERCEL_TOKEN = process.env.VERCEL_API_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;
const FRIEND_UUID = process.env.KAKAO_FRIEND_UUID;
const DASHBOARD_URL = 'https://eyejw29.github.io/sejong-gugak-dashboard/';

// Vercel 환경변수 업데이트
async function updateVercelEnv(key, value) {
  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) return { skipped: true };

  const listRes = await fetch(
    `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env`,
    { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } }
  );
  const listData = await listRes.json();
  const existing = listData.envs?.find(e => e.key === key);

  if (existing) {
    const patchRes = await fetch(
      `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env/${existing.id}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${VERCEL_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ value, type: 'encrypted' })
      }
    );
    return await patchRes.json();
  } else {
    const postRes = await fetch(
      `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${VERCEL_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          key, value, type: 'encrypted',
          target: ['production', 'preview']
        })
      }
    );
    return await postRes.json();
  }
}

// 토큰 자동 갱신 (refresh_token 사용)
async function refreshAccessToken() {
  if (!REFRESH_TOKEN || !KAKAO_REST_KEY) return null;

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
  if (data.error) return null;

  // Vercel 환경변수에 새 토큰 저장 (재배포는 안 함 - 현재 요청에서 바로 사용)
  try {
    await updateVercelEnv('KAKAO_ACCESS_TOKEN', data.access_token);
    if (data.refresh_token) {
      await updateVercelEnv('KAKAO_REFRESH_TOKEN', data.refresh_token);
    }
    await updateVercelEnv('KAKAO_TOKEN_SAVED_AT', new Date().toISOString());
  } catch (e) {
    // 환경변수 저장 실패해도 메시지 발송은 진행
  }

  return data.access_token;
}

// 메시지 발송 함수
async function sendMessages(token, type, templateObject) {
  const results = {};

  if (type === 'friend' || type === 'both') {
    try {
      const friendRes = await fetch('https://kapi.kakao.com/v1/api/talk/friends/message/default/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
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

  if (type === 'self' || type === 'both') {
    try {
      const selfRes = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
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

  return results;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { type = 'both', message } = req.body || {};

  if (!message) return res.status(400).json({ error: 'message 필드가 필요합니다' });

  let token = process.env.KAKAO_ACCESS_TOKEN;
  if (!token) return res.status(500).json({ error: '토큰이 설정되지 않았습니다. /api/kakao-login으로 로그인하세요.' });

  const templateObject = JSON.stringify({
    object_type: 'text',
    text: message,
    link: { web_url: DASHBOARD_URL, mobile_web_url: DASHBOARD_URL },
    button_title: '대시보드 보기'
  });

  // 1차 시도
  let results = await sendMessages(token, type, templateObject);
  let isExpired = (results.friend?.status === 401) || (results.self?.status === 401);

  // 토큰 만료 시 → 자동 갱신 후 재시도
  if (isExpired) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      token = newToken;
      results = await sendMessages(token, type, templateObject);
      isExpired = (results.friend?.status === 401) || (results.self?.status === 401);

      if (!isExpired) {
        return res.status(200).json({
          success: true,
          results,
          token_refreshed: true,
          timestamp: new Date().toISOString()
        });
      }
    }

    // 갱신도 실패한 경우
    return res.status(401).json({
      error: 'refresh_token도 만료됨. /api/kakao-login으로 재로그인 필요',
      results
    });
  }

  return res.status(200).json({
    success: true,
    results,
    timestamp: new Date().toISOString()
  });
}
