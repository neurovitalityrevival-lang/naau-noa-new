import { Resend } from 'resend';
import crypto from 'crypto';
import https from 'https';

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

  for (const attempt of attempts) {
    const result = await resend.emails.send(attempt);
    if (!result.error) return result;
    if (!isTestLimitError(result.error)) break;
  }

  return { error: { message: 'メール送信に失敗しました' } };
}

// ── Meta CAPI ──
function sha256(str) {
  return str ? crypto.createHash('sha256').update(str.trim().toLowerCase()).digest('hex') : null;
}

function sendCAPI({ name, email, phone, clientIp, userAgent, fbc, fbp, menu, sourceUrl }) {
  const PID = '2080933312746435';
  const AT  = 'EAAU7PbtGoZAIBReDwLpfbbo6AvazK5yqebVjLuEZCN2IKvNoh9Y4Gkbb2jrD9v2HWHpgUkKKJhZCvsba65MKnj3wLP1ZAzE5R7GKr8j4lwZBEcPcdC3FVGmLefu3HsjVV66Wf7EZCCRVi5M4SqM0HXlxPnHGz85zmmqpWUVNSBvS95wO3S1dASP3ag2vRPXkEa';
  const ud = {};
  if (email) ud.em = [sha256(email)];
  if (phone) ud.ph = [sha256(phone.replace(/\D/g,''))];
  if (name) {
    const parts = name.trim().split(/\s+/);
    ud.fn = [sha256(parts[0])];
    if (parts.length > 1) ud.ln = [sha256(parts[parts.length - 1])];
  }
  if (clientIp)  ud.client_ip_address = clientIp;
  if (userAgent) ud.client_user_agent = userAgent;
  if (fbc) ud.fbc = fbc;
  if (fbp) ud.fbp = fbp;

  const payload = JSON.stringify({
    data: [{
      event_name: 'CompleteRegistration',
      event_time: Math.floor(Date.now() / 1000),
      event_id: `sms_reg_${Date.now()}`,
      action_source: 'website',
      event_source_url: sourceUrl || 'https://skill-monetize-school.vercel.app/booking.html',
      user_data: ud,
      custom_data: {
        content_name: menu || 'スキルマネタイズスクール 無料相談',
        content_category: 'skill-monetize',
        currency: 'JPY',
        value: 0
      }
    }]
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'graph.facebook.com',
      path: `/v19.0/${PID}/events?access_token=${AT}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (r) => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>resolve(d)); });
    req.on('error', (e) => { console.error('CAPI error:', e.message); resolve(null); });
    req.write(payload);
    req.end();
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
  const { slotId, name, email, phone, menu, message, sourceUrl, fbc, fbp } = req.body;
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || '';
  const userAgent = req.headers['user-agent'] || '';
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(503).json({ error: 'SUPABASE_URL と API キーが Vercel 環境変数に設定されていません' });
  }

  const OWNER_EMAIL =
    process.env.BOOKING_NOTIFY_EMAIL ||
    process.env['オーナーのメールアドレス'] ||
    process.env.OWNER_EMAIL ||
    'komaka.nakagawa@gmail.com';
  const ZOOM_URL     = process.env['ズームURL'] || process.env.ZOOM_URL;
  const BRAND_NAME   = process.env.BRAND_NAME || 'THE SHIFT';
  const OWNER_NAME   = process.env.OWNER_NAME || '中川裕幸';
  const FROM         = process.env.RESEND_FROM || `${BRAND_NAME} 予約 <onboarding@resend.dev>`;

  // スロット確認
  const slotRes = await fetch(
    `${SUPABASE_URL}/rest/v1/slots?id=eq.${slotId}&is_available=eq.true&is_booked=eq.false`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const slots = await slotRes.json();
  if (!slots.length) return res.status(409).json({ error: 'この枠はすでに埋まっています' });

  const slot = slots[0];
  const dateLabel = new Date(slot.date + 'T00:00:00+09:00').toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
  });
  const startTime = slot.start_time.slice(0, 5);

  // 連続60分（15分×4枠）確認
  const allSlotsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/slots?date=eq.${slot.date}&is_available=eq.true&is_booked=eq.false&order=start_time`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const daySlots = await allSlotsRes.json();
  const startIdx = daySlots.findIndex(s => s.id === slotId);
  const consecutive = daySlots.slice(startIdx, startIdx + 4);
  if (consecutive.length < 4) return res.status(409).json({ error: '連続枠が不足しています' });

  const consecutiveIds = consecutive.map(s => s.id);

  // bookings INSERT
  await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({ slot_id: slotId, name, email, phone, menu, message })
  });

  // 連続スロットをis_booked=trueに更新
  await fetch(
    `${SUPABASE_URL}/rest/v1/slots?id=in.(${consecutiveIds.join(',')})`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ is_booked: true })
    }
  );

  // メール送信（失敗しても予約は成功扱い）
  let mailSent = false;
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('RESEND_API_KEY が未設定のためメールをスキップ');
    } else {
      const resend = new Resend(apiKey);

      const ownerHtml = `<h2>新しい予約が入りました</h2>
<p><strong>日時：</strong>${dateLabel} ${startTime}〜</p>
<p><strong>メニュー：</strong>${menu}</p>
<p><strong>お名前：</strong>${name}</p>
<p><strong>メール：</strong>${email}</p>
<p><strong>電話：</strong>${phone}</p>
<p><strong>ご相談内容：</strong>${message || 'なし'}</p>
<hr>
<p>Zoom: <a href="${ZOOM_URL}">${ZOOM_URL}</a></p>`;

      const customerHtml = `<h2>${name} 様</h2>
<p>ご予約ありがとうございます。以下の内容でご予約を承りました。</p>
<table border="1" cellpadding="8" style="border-collapse:collapse;">
<tr><td><strong>日時</strong></td><td>${dateLabel} ${startTime}〜</td></tr>
<tr><td><strong>メニュー</strong></td><td>${menu}</td></tr>
<tr><td><strong>形式</strong></td><td>Zoom（オンライン）</td></tr>
</table>
<h3>Zoom接続先</h3>
<p><a href="${ZOOM_URL}">${ZOOM_URL}</a></p>
<p>セッション当日は5分前までにZoomにご入室ください。</p>
<p>ご不明な点は ${OWNER_EMAIL} までご連絡ください。</p>
<p style="margin-top:24px;">${BRAND_NAME}<br>${OWNER_NAME}</p>`;

      const ownerResult = await sendMail(resend, {
        from: FROM,
        to: [OWNER_EMAIL],
        subject: `【予約通知】${name}様 ${dateLabel} ${startTime}〜`,
        html: ownerHtml,
      });

      const customerResult = await sendMail(resend, {
        from: FROM.replace(' 予約', ''),
        to: [email],
        subject: `ご予約を承りました（${dateLabel} ${startTime}〜）`,
        html: customerHtml,
      });

      if (ownerResult.error) console.error('Owner mail:', ownerResult.error);
      else console.log('Owner mail sent:', ownerResult.data?.id);

      if (customerResult.error) console.error('Customer mail:', customerResult.error);
      else console.log('Customer mail sent:', customerResult.data?.id);

      mailSent = !ownerResult.error && !customerResult.error;
    }
  } catch (mailErr) {
    console.error('メール送信エラー:', mailErr);
  }

  // Meta CAPI（失敗しても予約は成功扱い）
  try {
    await sendCAPI({ name, email, phone, clientIp, userAgent, fbc, fbp, menu, sourceUrl });
  } catch(e) {
    console.error('CAPI送信エラー:', e.message);
  }

  res.status(200).json({ success: true, mailSent });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || '予約処理中にエラーが発生しました' });
  }
}
