// إرسال إيميلات عبر Resend
function getResendApiKey() {
  return process.env.RESEND_API_KEY;
}

async function sendVerificationEmail(to, code) {
  const RESEND_API_KEY = getResendApiKey();
  if (!RESEND_API_KEY) {
    const similarKeys = Object.keys(process.env).filter((k) => /resend/i.test(k));
    console.log(
      '⚠️ RESEND_API_KEY مش موجود - الكود:',
      code,
      similarKeys.length
        ? `(لقيت متغيرات باسم مشابه على Railway: ${similarKeys.join(', ')} - تأكد إن الاسم مطابق تماماً لـ RESEND_API_KEY)`
        : '(مفيش أي متغير بيئة اسمه فيه RESEND خالص - تأكد إنه مضاف على نفس الـ service والـ environment اللي شغالة عليه)'
    );
    return { mock: true };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Traino <noreply@gettraino.com>',
      to,
      subject: 'كود التأكيد - Traino',
      html: `
        <div dir="rtl" style="font-family: sans-serif; text-align: center; padding: 20px;">
          <h2>أهلاً بيك في Traino 👋</h2>
          <p>كود التأكيد بتاعك هو:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; background: #f0f0f0; padding: 15px; border-radius: 10px; display: inline-block;">
            ${code}
          </div>
          <p style="color: #888; margin-top: 20px;">الكود صالح لمدة 15 دقيقة.</p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.log('❌ خطأ في إرسال الإيميل:', err);
    throw new Error('فشل إرسال الإيميل');
  }
  const data = await res.json();
  console.log('✅ إيميل التحقق اتقبل من Resend - id:', data.id, '- to:', to);
  return { mock: false };
}

async function sendBroadcastEmail(to, subject, message) {
  const RESEND_API_KEY = getResendApiKey();
  if (!RESEND_API_KEY) return { mock: true };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Traino <noreply@gettraino.com>',
      to,
      subject,
      html: `<div dir="rtl" style="font-family: sans-serif; padding: 20px;">${message}</div>`,
    }),
  });
  if (!res.ok) throw new Error('فشل إرسال الإيميل');
  return { mock: false };
}

module.exports = { sendVerificationEmail, sendBroadcastEmail };
