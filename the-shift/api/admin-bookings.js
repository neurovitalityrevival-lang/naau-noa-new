const { getSupabaseConfig, handleApiError, supabaseFetch } = require('./lib/supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  try {
    getSupabaseConfig();

    const adminPass = process.env.ADMIN_PASSWORD;
    if (!adminPass) {
      return res.status(503).json({ error: 'ADMIN_PASSWORD が Vercel 環境変数に設定されていません' });
    }
    if (req.headers['x-admin-password'] !== adminPass) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const r = await supabaseFetch(
      '/rest/v1/bookings?select=*,slots(date,start_time)&order=created_at.desc'
    );

    if (!r.ok) {
      return res.status(502).json({ error: '予約データの取得に失敗しました', detail: r.data });
    }

    return res.status(200).json(Array.isArray(r.data) ? r.data : []);
  } catch (error) {
    return handleApiError(res, error);
  }
};
