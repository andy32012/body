import { salaries, stages } from './data.js?v=68d6ef5cce4a';
import { salaryAmount, monthlyRemainder, parsePositiveRate } from './calculators.js?v=7b30582ec46f';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const digits = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });
let period = 'year';
let display = 'native';
let statistic = 'median';
const fx = $('#exchange-rate');
const currencyLabel = code => code === 'USD' ? 'US$' : 'NT$';

$$('[data-enhanced]').forEach(element => { element.hidden = false; });

function renderSalaries() {
  let rateError = '';
  for (const salary of salaries) {
    const card = $(`[data-salary="${salary.id}"]`);
    const method = salary.id === 'tw' ? 'mean' : statistic;
    try {
      const amount = salaryAmount({ annual: salary.annual[method], currency: salary.currency, period, display, exchangeRate: fx.value });
      card.querySelector('[data-money]').textContent = digits.format(amount);
      card.querySelector('[data-currency]').textContent = currencyLabel(display === 'TWD' ? 'TWD' : salary.currency);
    } catch (error) {
      card.querySelector('[data-money]').textContent = '—';
      card.querySelector('[data-currency]').textContent = 'NT$';
      rateError = error.message;
    }
    card.querySelector('[data-period-label]').textContent = period === 'year' ? '／年' : '／月（年薪 ÷ 12）';
    card.querySelector('[data-method]').textContent = method === 'mean' ? '平均數' : '中位數';
  }
  $('#salary-error').textContent = rateError;
  if (rateError) fx.setAttribute('aria-invalid', 'true');
  else fx.removeAttribute('aria-invalid');
  $('#salary-mode').textContent = `目前顯示${period === 'year' ? '全年薪資' : '全年薪資除以 12 的月均值'}；台灣為平均數，美國為${statistic === 'median' ? '中位數' : '平均數'}。`;
}

$$('[data-period]').forEach(button => button.addEventListener('click', () => {
  period = button.dataset.period;
  $$('[data-period]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  renderSalaries();
}));
$$('[data-display]').forEach(button => button.addEventListener('click', () => {
  display = button.dataset.display;
  $$('[data-display]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  renderSalaries();
}));
$('#us-statistic').addEventListener('change', event => { statistic = event.target.value; renderSalaries(); });

function showRole(role) {
  $$('[data-role-panel]').forEach(panel => { panel.hidden = panel.dataset.rolePanel !== role; });
  $$('[data-role-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.roleChoice === role)));
}
$$('[data-role-choice]').forEach(button => button.addEventListener('click', () => showRole(button.dataset.roleChoice)));
showRole('rn');

function showStage(key) {
  const stage = Object.hasOwn(stages, key) ? stages[key] : stages.student;
  $('#stage-title').textContent = stage.title;
  $('#stage-summary').textContent = stage.summary;
  $('#stage-actions').replaceChildren(...stage.actions.map(text => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
  $$('[data-stage]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.stage === key)));
}
$$('[data-stage]').forEach(button => button.addEventListener('click', () => showStage(button.dataset.stage)));
showStage('student');

const budgetFields = ['annual-gross', 'monthly-deductions', 'monthly-living'];
let budgetTouched = false;
function renderBudget() {
  if (!budgetTouched) return;
  const missing = budgetFields.some(id => !$('#' + id).value.trim());
  if (missing) {
    budgetFields.forEach(id => {
      const field = $('#' + id);
      const value = field.value.trim();
      if (value && (!Number.isFinite(Number(value)) || Number(value) < 0)) field.setAttribute('aria-invalid', 'true');
      else field.removeAttribute('aria-invalid');
    });
    $('#budget-usd').textContent = '—';
    $('#budget-twd').textContent = '填完三個欄位後顯示結果';
    $('#budget-note').textContent = '沒有支出時可填 0；空白不會視為 0。';
    $('#budget-error').textContent = '';
    $('#budget-output').classList.remove('is-negative');
    return;
  }
  try {
    const amount = monthlyRemainder({ annualGross: $('#annual-gross').value, monthlyDeductions: $('#monthly-deductions').value, monthlyLiving: $('#monthly-living').value });
    $('#budget-usd').textContent = `US$ ${digits.format(amount)}`;
    try {
      const converted = amount * parsePositiveRate(fx.value);
      if (!Number.isFinite(converted)) throw new Error('換算結果超出可顯示範圍。');
      $('#budget-twd').textContent = `約 NT$ ${digits.format(converted)}／月，依上方自訂匯率`;
    } catch {
      $('#budget-twd').textContent = '台幣換算需填入上方有效匯率；美元結果仍可查看。';
    }
    $('#budget-note').textContent = amount < 0 ? '這個情境的每月扣款與生活費，高於換算後的稅前月均收入。' : '餘額依你填入的條件計算；未填入的學費、搬遷或其他支出尚未扣除。';
    $('#budget-error').textContent = '';
    $('#budget-output').classList.toggle('is-negative', amount < 0);
    budgetFields.forEach(id => $('#' + id).removeAttribute('aria-invalid'));
  } catch (error) {
    $('#budget-usd').textContent = '—';
    $('#budget-twd').textContent = '請修正輸入後重新查看';
    $('#budget-error').textContent = error.message;
    $('#budget-note').textContent = '';
    $('#budget-output').classList.remove('is-negative');
    budgetFields.forEach(id => {
      const field = $('#' + id);
      if (!Number.isFinite(Number(field.value)) || Number(field.value) < 0) field.setAttribute('aria-invalid', 'true');
      else field.removeAttribute('aria-invalid');
    });
  }
}
budgetFields.forEach(id => $('#' + id).addEventListener('input', () => { budgetTouched = true; renderBudget(); }));
$$('[data-fill-salary]').forEach(button => button.addEventListener('click', () => {
  const salary = salaries.find(record => record.id === button.dataset.fillSalary);
  if (!salary) return;
  $('#annual-gross').value = salary.annual.median;
  budgetTouched = true;
  renderBudget();
}));
fx.addEventListener('input', () => { renderSalaries(); renderBudget(); });
renderSalaries();

// Citations and shared deep links reveal the section that contains their target.
function revealHashTarget() {
  let target;
  try { target = document.getElementById(decodeURIComponent(location.hash.slice(1))); }
  catch { return; }
  if (!target) return;
  let revealed = false;
  const rolePanel = target.closest('[data-role-panel]');
  if (rolePanel?.hidden) {
    showRole(rolePanel.dataset.rolePanel);
    revealed = true;
  }
  for (let element = target; element; element = element.parentElement) {
    if (element instanceof HTMLDetailsElement && !element.open) {
      element.open = true;
      revealed = true;
    }
  }
  if (revealed) target.scrollIntoView({ block: 'start' });
}
window.addEventListener('hashchange', revealHashTarget);
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (link && link.getAttribute('href') === location.hash) revealHashTarget();
});
revealHashTarget();
