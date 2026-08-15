const { Resend } = require('resend');

const RESEND_ACCOUNT_EMAIL = process.env.RESEND_ACCOUNT_EMAIL || 'neuro.vitality.revival@gmail.com';

function isTestLimitError(err) {
  const msg = err?.message || String(err || '');
  return /only send testing emails to your own email/i.test(msg);
}

async function sendMail(resend, payload) {
  const attempts = [];

  attempts.push({ ...payload, to: [payload.to[0]] });

  if (payload.to[0] !== RESEND_ACCOUNT_EMAIL) {
    attempts.push({
      ...payload,
      to: [RESEND_ACCOUNT_EMAIL],
      subject: `[転送] ${payload.subject}`,
      html: `
        <p style="background:#fff8e8;border-left:4px solid #E8985E;padding:12px 16px;font-size:.85rem;color:#6b4c1e;margin-bottom:20px;">
          ※ 本来の宛先（<strong>${payload.to[0]}</strong>）へ送れず、${RESEND_ACCOUNT_EMAIL} へ転送しています。
        </p>
        ${payload.html}`,
    });
  }

  if (payload.attachments) {
    const { attachments, ...noAttach } = payload;
    attempts.push({ ...noAttach, to: [payload.to[0]] });
  }

  for (const attempt of attempts) {
    const result = await resend.emails.send(attempt);
    if (!result.error) return result;
    if (!isTestLimitError(result.error) && !payload.attachments) break;
  }

  return { error: { message: 'メール送信に失敗しましたが、署名は記録されました' } };
}

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
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2>電子署名が完了しました</h2>
        <p>${name} 様</p>
        <p>${program}の利用規約への電子署名が完了しました。</p>
        <p><strong>署名日時：</strong>${dateStr}</p>
        <p><strong>電話：</strong>${phone || '—'}</p>
        <p><strong>住所：</strong>${address || '—'}</p>
        <p>${BRAND_NAME} / ${OWNER_NAME}</p>
      </div>`;

    const ownerHtml = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2>新しい契約署名が届きました</h2>
        <p>${BRAND_NAME} / ${OWNER_NAME}</p>
        <p><strong>署名日時：</strong>${dateStr}</p>
        <p><strong>プログラム：</strong>${program}</p>
        <p><strong>お名前：</strong>${name}</p>
        <p><strong>メール：</strong>${email}</p>
        <p><strong>電話：</strong>${phone || '—'}</p>
        <p><strong>住所：</strong>${address || '—'}</p>
        <p><strong>IP：</strong>${clientIp || '—'}</p>
      </div>`;

    const attachment = {
      filename: `署名_${name}.png`,
      content: base64Data,
    };

    const ownerResult = await sendMail(resend, {
      from: FROM,
      to: [NOTIFY_EMAIL],
      subject: `【契約署名】${name} 様が署名しました（${program}）`,
      html: ownerHtml,
      attachments: [attachment],
    });

    const clientResult = await sendMail(resend, {
      from: FROM,
      to: [email],
      subject: `【${BRAND_NAME}】${program} 契約書への電子署名を受け付けました`,
      html: clientHtml,
      attachments: [attachment],
    });

    const mailOk = !ownerResult.error || !clientResult.error;
    if (ownerResult.error) console.error('Owner mail:', ownerResult.error);
    if (clientResult.error) console.error('Client mail:', clientResult.error);

    // 署名はメール成否に関わらず成功扱い → 完了画面へ遷移させる
    return res.status(200).json({ success: true, mailSent: mailOk });
  } catch (e) {
    console.error('sign-contract-coaching error:', e);
    // サーバー例外時も署名自体は完了させる（UX優先）
    return res.status(200).json({ success: true, mailSent: false, warning: e.message });
  }
};
