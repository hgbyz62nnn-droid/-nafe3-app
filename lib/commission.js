// نظام عمولة المنصة على الكوتشات: النسبة بتقل كل ما عدد عملاء الكوتش
// (الاشتراكات المدفوعة) زاد، عشان نشجّع الكوتشات اللي بتجيب عملاء كتير.
const TIERS = [
  { max: 10, rate: 0.4 },
  { max: 30, rate: 0.35 },
  { max: 60, rate: 0.25 },
  { max: 100, rate: 0.2 },
  { max: Infinity, rate: 0.15 },
];

function commissionRateForClientNumber(clientNumber) {
  return TIERS.find((tier) => clientNumber <= tier.max).rate;
}

function computeCommission(amount, clientNumber) {
  const rate = commissionRateForClientNumber(clientNumber);
  const commissionAmount = Math.round(amount * rate);
  const coachPayout = amount - commissionAmount;
  return { rate, commissionAmount, coachPayout };
}

module.exports = { commissionRateForClientNumber, computeCommission };
