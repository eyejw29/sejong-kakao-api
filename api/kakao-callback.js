/**
 * 카카오 OAuth 콜백 처리
 * 카카오 로그인 후 code를 받아서 토큰으로 교환
 * → Vercel API로 환경변수에 토큰 자동 저장 + 재배포
 */
const KAKAO_REST_KEY = process.env.KAKAO_REST_KEY;
const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET;
const REDIRECT_URI = process.env.KAKAO_REDIRECT_URI;
const VERCEL_TOKEN = process.env.VERCEL_API_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;

// Vercel 환경변수 업데이트 함수
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

// Vercel 재배포 트리거
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
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { code, error } = req.query;

  if (error) {
    return res.status(400).json({ error: '카카오 로그인 실패', detail: error });
  }

  if (!code) {
    return res.status(400).json({ error: 'code 파라미터가 없습니다' });
  }

  try {
    // 1. code → access_token 교환
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

    // 2. Vercel 환경변수에 토큰 저장
    let envStatus = 'skipped';
    let redeployStatus = 'skipped';

    if (VERCEL_TOKEN && VERCEL_PROJECT_ID) {
      try {
        await updateVercelEnv('KAKAO_ACCESS_TOKEN', tokenData.access_token);
        if (tokenData.refresh_token) {
          await updateVercelEnv('KAKAO_REFRESH_TOKEN', tokenData.refresh_token);
        }
        await updateVercelEnv('KAKAO_TOKEN_SAVED_AT', new Date().toISOString());
        envStatus = 'saved';

        // 3. 재배포 트리거
        await triggerRedeploy();
        redeployStatus = 'triggered';
      } catch (e) {
        envStatus = 'error: ' + e.message;
      }
    }

    // 4. 성공 HTML 응답 → 데모 페이지로 리다이렉트
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`
      <!DOCTYPE html><html><head><meta charset="utf-8"><title>카카오 연동 완료</title>
      <meta http-equiv="refresh" content="3;url=/kakao-demo.html?connected=true">
      </head>
      <body style="font-family:'Noto Sans KR',sans-serif;text-align:center;padding:60px;background:#F5F6F8;">
        <div style="max-width:420px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,.1);">
          <h2 style="color:#065F46;">✅ 카카오 로그인 연동 완료</h2>
          <p style="color:#374151;margin:16px 0;">토큰이 서버에 저장되었습니다.</p>
          <p style="color:#9CA3AF;font-size:13px;">환경변수 저장: ${envStatus}</p>
          <p style="color:#9CA3AF;font-size:13px;">재배포: ${redeployStatus}</p>
          <p style="margin-top:20px;color:#6B7280;font-size:13px;">3초 후 데모 페이지로 이동합니다...</p>
          <a href="/kakao-demo.html?connected=true" style="color:#2563EB;font-size:14px;">바로 이동 →</a>
        </div>
      </body></html>
    `);
  } catch (err) {
    return res.status(500).json({ error: '서버 오류', detail: err.message });
  }
}
