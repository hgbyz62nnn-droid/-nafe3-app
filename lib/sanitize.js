function clampStr(v, max) {
  return String(v ?? '').slice(0, max);
}

// Number(null) === 0 و Number(undefined) === NaN، فمينفعش نعتمد على
// Number.isFinite(Number(v)) لوحده عشان نميّز "الحقل فاضي" عن "الحقل صفر" -
// لازم نستبعد null/undefined/'' يدويًا الأول قبل التحويل. الباگ ده اتلقى
// مرتين في نظام الخطط (sets/rpe وبعدين daily_calories)، فبقى دالة مشتركة
// بدل ما يتكرر تاني في أي route جديد بيتعامل مع أرقام اختيارية.
function toNullableNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clampNumber(v, min, max) {
  if (v === null) return null;
  return Math.min(max, Math.max(min, v));
}

module.exports = { clampStr, toNullableNumber, clampNumber };
