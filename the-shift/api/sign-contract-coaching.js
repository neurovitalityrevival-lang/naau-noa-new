const { Resend } = require('resend');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { name, address, phone, email, signatureData, agreedAt, programType } = req.body || {};

  if (!name || !email || !signatureData) {
    return res.status(400).json({ error: '必須項目が不足しています' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'RESEND_API_KEY が Vercel 環境変数に設定されていません' });
  }

  const BRAND_NAME = process.env.BRAND_NAME || 'THE SHIFT';
  const OWNER_NAME = process.env.OWNER_NAME || '中川裕幸';
  const NOTIFY_EMAIL =
    process.env.CONTRACT_NOTIFY_EMAIL ||
    process.env['オーナーのメールアドレス'] ||
    process.env.OWNER_EMAIL ||
    'komaka.nakagawa@gmail.com';
  const FROM = process.env.RESEND_FROM || `${BRAND_NAME} <onboarding@resend.dev>`;

  try {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || '';
    const dateStr = new Date(agreedAt || Date.now()).toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const base64Data = signatureData.replace(/^data:image\/png;base64,/, '');
    const program = programType || `${BRAND_NAME} コミュニティ入会`;
    const resend = new Resend(apiKey);

    const clientHtml = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#faf8f5;border-radius:12px;overflow:hidden;">
        <div style="background:#4A6B5D;padding:28px 32px;text-align:center;">
          <p style="color:#fff;font-size:1.2rem;letter-spacing:.12em;margin:0 0 4px;">${BRAND_NAME}</p>
          <p style="color:rgba(255,255,255,.75);font-size:.82rem;margin:0;">${OWNER_NAME}</p>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#2C3531;font-size:1.1rem;margin-bottom:20px;">電子署名が完了しました</h2>
          <p style="color:#555;line-height:1.9;margin-bottom:6px;">${name} 様</p>
          <p style="color:#555;line-height:1.9;margin-bottom:24px;">
            ${program}の利用規約への電子署名が完了しました。<br>
            内容をご確認の上、大切に保存してください。
          </p>
          <div style="background:#F7F5F0;border-radius:8px;padding:18px 22px;margin-bottom:24px;font-size:.9rem;color:#2C3531;line-height:2.2;">
            <strong>署名日時：</strong>${dateStr}<br>
            <strong>プログラム：</strong>${program}<br>
            <strong>お名前：</strong>${name}<br>
            <strong>メール：</strong>${email}<br>
            <strong>電話番号：</strong>${phone || '—'}<br>
            <strong>ご住所：</strong>${address || '—'}
          </div>
          <p style="color:#888;font-size:.82rem;line-height:1.8;">${BRAND_NAME}　${OWNER_NAME}</p>
        </div>
      </div>`;

    const ownerHtml = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#2C3531;border-bottom:2px solid #E8985E;padding-bottom:8px;">新しい契約署名が届きました</h2>
        <p style="color:#888;font-size:.85rem;margin-bottom:16px;">${BRAND_NAME} / ${OWNER_NAME}</p>
        <table style="border-collapse:collapse;width:100%;font-size:.9rem;margin-bottom:20px;">
          <tr><td style="padding:10px 14px;background:#F7F5F0;font-weight:bold;width:30%;">署名日時</td><td style="padding:10px 14px;">${dateStr}</td></tr>
          <tr><td style="padding:10px 14px;background:#F7F5F0;font-weight:bold;">プログラム</td><td style="padding:10px 14px;"><strong>${program}</strong></td></tr>
          <tr><td style="padding:10px 14px;background:#F7F5F0;font-weight:bold;">お名前</td><td style="padding:10px 14px;"><strong>${name}</strong></td></tr>
          <tr><td style="padding:10px 14px;background:#F7F5F0;font-weight:bold;">メール</td><td style="padding:10px 14px;">${email}</td></tr>
          <tr><td style="padding:10px 14px;background:#F7F5F0;font-weight:bold;">電話番号</td><td style="padding:10px 14px;">${phone || '—'}</td></tr>
          <tr><td style="padding:10px 14px;background:#F7F5F0;font-weight:bold;">ご住所</td><td style="padding:10px 14px;">${address || '—'}</td></tr>
          <tr><td style="padding:10px 14px;background:#F7F5F0;font-weight:bold;">IPアドレス</td><td style="padding:10px 14px;">${clientIp || '—'}</td></tr>
        </table>
        <p style="color:#555;font-size:.85rem;">署名画像は添付ファイルをご確認ください。</p>
      </div>`;

    const attachment = {
      filename: `署名_${name}.png`,
      content: base64Data,
    };

    const clientResult = await resend.emails.send({
      from: FROM,
      to: [email],
      subject: `【${BRAND_NAME}】${program} 契約書への電子署名を受け付けました`,
      html: clientHtml,
      attachments: [attachment],
    });

    if (clientResult.error) {
      console.error('Resend client mail error:', clientResult.error);
      return res.status(502).json({ error: clientResult.error.message || '確認メールの送信に失敗しました' });
    }

    const ownerResult = await resend.emails.send({
      from: FROM,
      to: [NOTIFY_EMAIL],
      subject: `【契約署名】${name} 様が署名しました（${program}）`,
      html: ownerHtml,
      attachments: [attachment],
    });

    if (ownerResult.error) {
      console.error('Resend owner mail error:', ownerResult.error);
      return res.status(502).json({ error: ownerResult.error.message || '通知メールの送信に失敗しました' });
    }

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('sign-contract-coaching error:', e);
    return res.status(500).json({ error: e.message || 'メール送信に失敗しました' });
  }
};
