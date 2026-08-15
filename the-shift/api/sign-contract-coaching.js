const nodemailer = require('nodemailer');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { name, address, phone, email, signatureData, agreedAt, programType } = req.body || {};

  if (!name || !email || !signatureData) {
    return res.status(400).json({ error: '必須項目が不足しています' });
  }

  const BRAND_NAME = process.env.BRAND_NAME || 'THE SHIFT';
  const OWNER_NAME = process.env.OWNER_NAME || '中川裕幸';
  const NOTIFY_EMAIL =
    process.env.CONTRACT_NOTIFY_EMAIL ||
    process.env['オーナーのメールアドレス'] ||
    process.env.OWNER_EMAIL ||
    'komaka.nakagawa@gmail.com';

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailPass) {
    return res.status(503).json({
      error: 'GMAIL_USER / GMAIL_APP_PASSWORD が Vercel 環境変数に設定されていません',
    });
  }

  try {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || '';
    const dateStr = new Date(agreedAt || Date.now()).toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: gmailPass },
    });

    const base64Data = signatureData.replace(/^data:image\/png;base64,/, '');
    const sigBuffer = Buffer.from(base64Data, 'base64');

    const program = programType || `${BRAND_NAME} コミュニティ入会`;

    // ── クライアント宛確認メール ──
    await transporter.sendMail({
      from: `"${BRAND_NAME}" <${gmailUser}>`,
      to: email,
      subject: `【${BRAND_NAME}】${program} 契約書への電子署名を受け付けました`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#faf8f5;border-radius:12px;overflow:hidden;">
          <div style="background:#1a3a3a;padding:28px 32px;text-align:center;">
            <p style="color:#b8976a;font-size:1.2rem;letter-spacing:0.12em;margin:0 0 4px;">${BRAND_NAME}</p>
            <p style="color:#c8b89a;font-size:0.82rem;margin:0;">${OWNER_NAME}</p>
          </div>
          <div style="padding:32px;">
            <h2 style="color:#1a3a3a;font-size:1.1rem;margin-bottom:20px;">電子署名が完了しました</h2>
            <p style="color:#555;line-height:1.9;margin-bottom:6px;">${name} 様</p>
            <p style="color:#555;line-height:1.9;margin-bottom:24px;">
              ${program}の利用規約への電子署名が完了しました。<br>
              内容をご確認の上、大切に保存してください。
            </p>

            <div style="background:#f0ebe3;border-radius:8px;padding:18px 22px;margin-bottom:24px;font-size:0.9rem;color:#1a3a3a;line-height:2.2;">
              <strong>署名日時：</strong>${dateStr}<br>
              <strong>プログラム：</strong>${program}<br>
              <strong>お名前：</strong>${name}<br>
              <strong>メール：</strong>${email}<br>
              <strong>電話番号：</strong>${phone || '—'}<br>
              <strong>ご住所：</strong>${address || '—'}
            </div>

            <div style="margin-bottom:24px;">
              <p style="color:#1a3a3a;font-weight:bold;font-size:0.9rem;margin-bottom:10px;">【あなたの電子署名】</p>
              <div style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;display:inline-block;">
                <img src="cid:client_signature" style="max-width:100%;height:auto;display:block;" alt="${name}様の署名">
              </div>
            </div>

            <div style="background:#fff8e8;border-left:4px solid #b8976a;border-radius:4px;padding:14px 18px;margin-bottom:24px;font-size:0.85rem;color:#7a5c2a;line-height:1.9;">
              ご不明な点がございましたら、Instagram の DM またはメールにてお気軽にご連絡ください。
            </div>

            <div style="padding-top:20px;border-top:1px solid #e0d8cc;color:#888;font-size:0.82rem;line-height:1.8;">
              ${BRAND_NAME}　${OWNER_NAME}
            </div>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `署名_${name}.png`,
          content: sigBuffer,
          contentType: 'image/png',
          cid: 'client_signature',
        },
      ],
    });

    // ── 運営宛通知メール（中田さん） ──
    await transporter.sendMail({
      from: `"${BRAND_NAME} System" <${gmailUser}>`,
      to: NOTIFY_EMAIL,
      subject: `【契約署名】${name} 様が署名しました（${program}）`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#1a3a3a;border-bottom:2px solid #b8976a;padding-bottom:8px;">新しい契約署名が届きました</h2>
          <p style="color:#888;font-size:0.85rem;margin-bottom:16px;">${BRAND_NAME} / ${OWNER_NAME}</p>
          <table style="border-collapse:collapse;width:100%;font-size:0.9rem;margin-bottom:20px;">
            <tr><td style="padding:10px 14px;background:#f0ebe3;font-weight:bold;width:30%;border-bottom:1px solid #e0d8cc;">署名日時</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">${dateStr}</td></tr>
            <tr><td style="padding:10px 14px;background:#f0ebe3;font-weight:bold;border-bottom:1px solid #e0d8cc;">プログラム</td><td style="padding:10px 14px;border-bottom:1px solid #eee;"><strong>${program}</strong></td></tr>
            <tr><td style="padding:10px 14px;background:#f0ebe3;font-weight:bold;border-bottom:1px solid #e0d8cc;">お名前</td><td style="padding:10px 14px;border-bottom:1px solid #eee;"><strong>${name}</strong></td></tr>
            <tr><td style="padding:10px 14px;background:#f0ebe3;font-weight:bold;border-bottom:1px solid #e0d8cc;">メール</td><td style="padding:10px 14px;border-bottom:1px solid #eee;"><a href="mailto:${email}">${email}</a></td></tr>
            <tr><td style="padding:10px 14px;background:#f0ebe3;font-weight:bold;border-bottom:1px solid #e0d8cc;">電話番号</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">${phone || '—'}</td></tr>
            <tr><td style="padding:10px 14px;background:#f0ebe3;font-weight:bold;border-bottom:1px solid #e0d8cc;">ご住所</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">${address || '—'}</td></tr>
            <tr><td style="padding:10px 14px;background:#f0ebe3;font-weight:bold;border-bottom:1px solid #e0d8cc;">IPアドレス</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">${clientIp}</td></tr>
          </table>
          <p style="color:#555;margin-bottom:10px;font-weight:bold;">署名画像：</p>
          <img src="cid:owner_signature" style="border:1px solid #ddd;border-radius:8px;max-width:100%;" alt="署名">
        </div>
      `,
      attachments: [
        {
          filename: `署名_${name}_${dateStr.replace(/[/:年月日\s]/g, '_')}.png`,
          content: sigBuffer,
          contentType: 'image/png',
          cid: 'owner_signature',
        },
      ],
    });

    return res.status(200).json({ success: true });

  } catch (e) {
    console.error('sign-contract-coaching error:', e);
    return res.status(500).json({ error: e.message || 'メール送信に失敗しました' });
  }
};
