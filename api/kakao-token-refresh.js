/**
 * 카카오 토큰 갱신 API
 * POST /api/kakao-token-refresh
 * refresh_token으로 access_token 갱신 → Vercel 환경변수 자동 업데이트
 */
const KAKAO_REST_KEY = process.env.KAKAO_REST_KEY;
const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.KAKAO_REFRESH_TOKEN;
const VERCEL_TOKEN = process.env.VERCEL_API_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;

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
          key,
          value,
          type: 'encrypted',
          target: ['production', 'preview']
        })
      }
    );
    return await postRes.json();
  }
}

async function triggerRedeploy() {
  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) return { skipped: true };

  const deploymentsRes = await fetch(
    `https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT_ID}&limit=1`,
    { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } }
  );
  const deploymentsData = await deploymentsRes.json();
  const latest = deploymentsData.deployments?.[0];
  if (!latest) return { error: 'no deployment found' };

  const redeployRes = await fetch(
    `https://api.vercel.com/v13/deployments`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: latest.name,
        project: VERCEL_PROJECT_ID,
        target: 'production',
        gitSource: latest.gitSource || undefined
      })
    }
  );
  return await redeployRes.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (!REFRESH_TOKEN) {
    return res.status(400).json({ error: 'refresh_token이 설정되지 않았습니다. /api/kakao-login으로 먼저 로그인하세요.' });
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

    // Vercel 환경변수 자동 업데이트
    let envStatus = 'skipped';
    if (VERCEL_TOKEN && VERCEL_PROJECT_ID) {
      try {
        await updateVercelEnv('KAKAO_ACCESS_TOKEN', data.access_token);
        if (data.refresh_token) {
          await updateVercelEnv('KAKAO_REFRESH_TOKEN', data.refresh_token);
        }
        await updateVercelEnv('KAKAO_TOKEN_SAVED_AT', new Date().toISOString());
        await triggerRedeploy();
        envStatus = 'saved_and_redeploying';
      } catch (e) {
        envStatus = 'error: ' + e.message;
      }
    }

    return res.status(200).json({
      success: true,
      access_token_prefix: data.access_token.substring(0, 10) + '...',
      expires_in: data.expires_in,
      refresh_token: data.refresh_token ? '새로 발급됨' : '기존 유지',
      env_update: envStatus,
      note: envStatus === 'saved_and_redeploying'
        ? '✅ 환경변수 자동 저장 + 재배포 시작됨 (1~2분 소요)'
        : '⚠️ Vercel 환경변수를 수동으로 업데이트하세요'
    });
  } catch (err) {
    return res.status(500).json({ error: '서버 오류', detail: err.message });
  }
}
