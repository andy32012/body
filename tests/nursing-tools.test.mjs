import test from 'node:test';
import assert from 'node:assert/strict';
import { salaryAmount, monthlyRemainder, parsePositiveRate } from '../america/nursing/calculators.js';

const salary = { annual: 123456.78, currency: 'USD', period: 'year', display: 'native' };
const incompleteOrNonfinite = ['', ' ', '\n\t', undefined, null, NaN, Infinity, -Infinity,
  'NaN', 'Infinity', '10abc', '1,000', '0x10', true, [], {}];

test('salary periods preserve precision and accept numbers or complete numeric strings', () => {
  assert.equal(salaryAmount(salary), 123456.78);
  assert.equal(salaryAmount({ ...salary, period: 'month' }), 123456.78 / 12);
  assert.equal(salaryAmount({ ...salary, annual: ' 123456.78 ', period: 'month' }), 123456.78 / 12);
  assert.equal(salaryAmount({ ...salary, annual: 0 }), 0);
  assert.equal(salaryAmount({ ...salary, annual: '0', period: 'month' }), 0);
});

test('currency conversion applies TWD per USD only when needed', () => {
  assert.equal(salaryAmount({ ...salary, display: 'TWD', exchangeRate: '32.5' }), 123456.78 * 32.5);
  assert.equal(salaryAmount({ ...salary, period: 'month', display: 'TWD', exchangeRate: 32.5 }), 123456.78 / 12 * 32.5);
  for (const exchangeRate of [...incompleteOrNonfinite, 0, -1]) {
    assert.equal(salaryAmount({ ...salary, exchangeRate }), 123456.78);
    assert.equal(salaryAmount({ ...salary, currency: 'TWD', exchangeRate }), 123456.78);
    assert.equal(salaryAmount({ ...salary, currency: 'TWD', display: 'TWD', exchangeRate }), 123456.78);
  }
});

test('salary rejects incomplete, nonfinite, negative, or unknown inputs', () => {
  for (const annual of [...incompleteOrNonfinite, -1, '-0.01']) {
    assert.throws(() => salaryAmount({ ...salary, annual }), Error);
  }
  for (const [key, invalid] of [
    ['currency', 'EUR'], ['currency', undefined], ['period', 'week'], ['period', undefined],
    ['display', 'USD'], ['display', undefined],
  ]) {
    assert.throws(() => salaryAmount({ ...salary, [key]: invalid }), Error);
  }
});

test('exchange rates must be complete positive finite numbers and errors are Chinese', () => {
  assert.equal(parsePositiveRate(' 32.75 '), 32.75);
  assert.equal(parsePositiveRate(1), 1);
  assert.equal(parsePositiveRate('3.2e1'), 32);
  assert.equal(parsePositiveRate('.5'), 0.5);
  for (const value of [...incompleteOrNonfinite, 0, -0, '0', -1, '-0.1', '1e309']) {
    assert.throws(() => parsePositiveRate(value), /[\u3400-\u9fff]/u);
    assert.throws(() => salaryAmount({ ...salary, display: 'TWD', exchangeRate: value }), Error);
  }
});

test('salary conversion rejects overflow but permits a finite monthly result', () => {
  assert.throws(() => salaryAmount({ ...salary, annual: Number.MAX_VALUE, display: 'TWD', exchangeRate: 2 }), Error);
  assert.equal(salaryAmount({ ...salary, annual: Number.MAX_VALUE, period: 'month', display: 'TWD', exchangeRate: 2 }), Number.MAX_VALUE / 12 * 2);
});

test('monthly remainder uses user-entered deductions and costs, including zero and a deficit', () => {
  assert.equal(monthlyRemainder({ annualGross: 120000, monthlyDeductions: 2000, monthlyLiving: 4000 }), 4000);
  assert.equal(monthlyRemainder({ annualGross: '120000', monthlyDeductions: '2000', monthlyLiving: '4000' }), 4000);
  assert.equal(monthlyRemainder({ annualGross: 12000, monthlyDeductions: 200, monthlyLiving: 1000 }), -200);
  assert.equal(monthlyRemainder({ annualGross: '0', monthlyDeductions: 0, monthlyLiving: 0 }), 0);
  assert.equal(monthlyRemainder({ annualGross: 10000, monthlyDeductions: 0.25, monthlyLiving: 0.5 }), 10000 / 12 - 0.75);
});

test('all monthly budget fields must be present, finite, and nonnegative', () => {
  const budget = { annualGross: 120000, monthlyDeductions: 2000, monthlyLiving: 4000 };
  for (const field of Object.keys(budget)) {
    for (const value of [...incompleteOrNonfinite, -1, '-0.01']) {
      assert.throws(() => monthlyRemainder({ ...budget, [field]: value }), Error, field);
    }
  }
});

test('monthly remainder rejects an overflowing deficit', () => {
  assert.throws(() => monthlyRemainder({ annualGross: 0, monthlyDeductions: Number.MAX_VALUE, monthlyLiving: Number.MAX_VALUE }), Error);
  assert.equal(monthlyRemainder({ annualGross: 0, monthlyDeductions: Number.MAX_VALUE, monthlyLiving: 0 }), -Number.MAX_VALUE);
});
