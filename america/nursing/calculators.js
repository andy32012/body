const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function inputNumber(value, label) {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error(`請輸入有效的${label}。`);
  }
  if (typeof value === 'string' && !DECIMAL.test(value.trim())) {
    throw new Error(`請填入完整的${label}數字。`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`請輸入有限的${label}數值。`);
  return number;
}

function nonnegative(value, label) {
  const number = inputNumber(value, label);
  if (number < 0) throw new Error(`${label}不能小於 0。`);
  return number;
}

function finiteResult(value) {
  if (!Number.isFinite(value)) throw new Error('計算結果太大，請輸入較小的數值。');
  return value === 0 ? 0 : value;
}

/** TWD per USD, supplied by the user; this does not fetch an exchange rate. */
export function parsePositiveRate(value) {
  const rate = inputNumber(value, '匯率');
  if (rate <= 0) throw new Error('匯率必須大於 0。');
  return rate;
}

/** Return an unrounded annual amount or annual / 12, optionally in TWD. */
export function salaryAmount({ annual, currency, period, display, exchangeRate } = {}) {
  if (!['USD', 'TWD'].includes(currency)) throw new Error('請選擇美元（USD）或新臺幣（TWD）。');
  if (!['year', 'month'].includes(period)) throw new Error('請選擇年薪或月薪換算。');
  if (!['native', 'TWD'].includes(display)) throw new Error('請選擇原幣或新臺幣顯示。');

  const gross = nonnegative(annual, '年薪');
  const amount = period === 'month' ? gross / 12 : gross;
  // A blank or invalid exchange rate must not block an amount in its own currency.
  const result = currency === 'USD' && display === 'TWD'
    ? amount * parsePositiveRate(exchangeRate)
    : amount;
  return finiteResult(result);
}

/** A user-entered cash-flow scenario, not a tax or take-home-pay estimate. */
export function monthlyRemainder({ annualGross, monthlyDeductions, monthlyLiving } = {}) {
  const gross = nonnegative(annualGross, '稅前年收入');
  const deductions = nonnegative(monthlyDeductions, '每月扣款');
  const living = nonnegative(monthlyLiving, '每月生活費');
  return finiteResult(gross / 12 - deductions - living);
}
