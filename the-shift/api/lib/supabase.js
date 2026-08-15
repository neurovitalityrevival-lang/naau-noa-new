function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    const err = new Error('SUPABASE_URL と API キーが Vercel 環境変数に設定されていません');
    err.code = 'ENV_MISSING';
    throw err;
  }

  return { url, key };
}

async function supabaseFetch(path, options = {}) {
  const { url, key } = getSupabaseConfig();
  const res = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return { ok: res.ok, status: res.status, data };
}

function handleApiError(res, error) {
  console.error(error);
  if (error.code === 'ENV_MISSING') {
    return res.status(503).json({ error: error.message });
  }
  return res.status(500).json({ error: error.message || 'サーバーエラーが発生しました' });
}

module.exports = { getSupabaseConfig, supabaseFetch, handleApiError };
