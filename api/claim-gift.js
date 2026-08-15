const { Resend } = require('resend');

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { name, email, sourceUrl } = req.body || {};
    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim();
    if (!cleanName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: '必須項目が不足しています' });
    }

    const adminEmail = 'neuro.vitality.revival@gmail.com';
    const downloadUrl = 'https://naau-noa.vercel.app/gifts/belief-list.pdf';
    const resendKey = process.env.RESEND_API_KEY;
    const gmailPass = process.env.GMAIL_PASS || process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS;

    const adminHtml = `
<!DOCTYPE html>
<html lang="ja"><body style="font-family:sans-serif;background:#f0ebe3;padding:20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;padding:24px;">
    <h1 style="color:#b8976a;font-size:16px;">ビリーフ観念一覧の受け取り</h1>
    <p>リール特典ページから新しい申し込みがありました。</p>
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:8px 0;color:#888;">お名前</td><td>${escapeHtml(cleanName)}</td></tr>
      <tr><td style="padding:8px 0;color:#888;">メール</td><td>${escapeHtml(cleanEmail)}</td></tr>
      <tr><td style="padding:8px 0;color:#888;">流入元</td><td>${escapeHtml(sourceUrl || '')}</td></tr>
    </table>
  </div>
</body></html>`;

    const customerHtml = `
<!DOCTYPE html>
<html lang="ja"><body style="font-family:sans-serif;background:#f0ebe3;padding:20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;padding:28px;">
    <p style="color:#b8976a;letter-spacing:0.16em;font-size:12px;">NA'AU NOA</p>
    <h1 style="font-size:18px;color:#1a1f18;">${escapeHtml(cleanName)} さんへ</h1>
    <p style="color:#444;line-height:1.9;">ビリーフ観念一覧をお受け取りいただき、ありがとうございます。<br>下のボタンからPDFを保存できます。</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${downloadUrl}" style="display:inline-block;background:#b8976a;color:#111;padding:12px 24px;text-decoration:none;font-weight:700;">PDFをダウンロード</a>
    </p>
    <p style="color:#888;font-size:12px;line-height:1.8;">このメールに心当たりがない場合は、破棄してください。</p>
  </div>
</body></html>`;

    if (resendKey) {
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: "Na'au Noa <onboarding@resend.dev>",
        to: adminEmail,
        subject: `【特典】${cleanName} さんがビリーフ観念一覧を受け取りました`,
        html: adminHtml
      });
    }

    let customerEmailSent = false;
    if (gmailPass) {
      try {
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: adminEmail, pass: gmailPass }
        });
        await transporter.sendMail({
          from: `"Na'au Noa" <${adminEmail}>`,
          to: cleanEmail,
          replyTo: adminEmail,
          subject: 'ビリーフ観念一覧をお受け取りください | Na\'au Noa',
          html: customerHtml
        });
        customerEmailSent = true;
      } catch (e) {
        console.error('Gmail SMTP error:', e.message);
      }
    }

    if (!customerEmailSent && resendKey) {
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: "Na'au Noa <onboarding@resend.dev>",
        to: cleanEmail,
        bcc: adminEmail,
        reply_to: adminEmail,
        subject: 'ビリーフ観念一覧をお受け取りください | Na\'au Noa',
        html: customerHtml
      });
    }

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error(e);
    return res.status(200).json({ success: true, warning: e.message });
  }
};
