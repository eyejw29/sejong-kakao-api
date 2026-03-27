/**
 * 카카오 로그인 URL 생성 및 리다이렉트
 * 브라우저에서 /api/kakao-login 접속 시 카카오 로그인 페이지로 이동
 */
const KAKAO_REST_KEY = process.env.KAKAO_REST_KEY;
const REDIRECT_URI = process.env.KAKAO_REDIRECT_URI;

export default function handler(req, res) {
  const scope = 'talk_message,friends';
  const authUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_REST_KEY}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}`;

  res.redirect(302, authUrl);
}
