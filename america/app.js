import { regions, states } from './data.js?v=11b6adc6f695';
import { taipeiInputValue, parseTaipeiInput, describeTime, convertUnit } from './tools.js?v=3963f5c54243';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const stateByCode = new Map(states.map(state => [state.code, state]));
let activeRegion = 'west';

function chooseRegion(key, selectedCode = '') {
  const region = regions[key];
  if (!region) return;
  const changedRegion = key !== activeRegion;
  activeRegion = key;
  $$('.region-button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.region === key)));
  $$('.map-state').forEach(path => {
    path.classList.toggle('in-region', path.dataset.region === key);
    path.setAttribute('aria-pressed', String(path.dataset.state === selectedCode));
  });
  $('#region-english').textContent = region.english.toUpperCase();
  $('#region-count').textContent = region.count;
  $('#region-title').textContent = region.name;
  $('#region-lead').textContent = region.lead;
  $('#region-description').textContent = region.description;
  $('#region-places').textContent = region.places;
  const state = stateByCode.get(selectedCode);
  $('#selected-state').textContent = state
    ? `${state.zh} · ${state.name} (${state.code})${state.code === 'DC' ? '｜聯邦特區' : ''}`
    : '選一個州，認識它的中英文名字。';
  const list = $('#region-states');
  if (changedRegion || !list.querySelector('button')) {
    list.replaceChildren(...states.filter(s => s.region === key).sort((a, b) => a.name.localeCompare(b.name)).map(item => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.state = item.code;
      button.textContent = `${item.zh} ${item.name}`;
      button.addEventListener('click', () => chooseRegion(key, item.code));
      li.append(button);
      return li;
    }));
  }
  list.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.state === selectedCode)));
}

$$('.region-button').forEach(button => button.addEventListener('click', () => chooseRegion(button.dataset.region)));
$$('.map-state').forEach(path => {
  const choose = () => chooseRegion(path.dataset.region, path.dataset.state);
  path.addEventListener('click', choose);
  path.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose();
    }
  });
});
chooseRegion('west');

$$('[data-city-filter]').forEach(button => button.addEventListener('click', () => {
  const filter = button.dataset.cityFilter;
  $$('[data-city-filter]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  let count = 0;
  $$('[data-city-region]').forEach(card => {
    const visible = filter === 'all' || card.dataset.cityRegion === filter;
    card.hidden = !visible;
    count += Number(visible);
  });
  $('#city-count').textContent = `${count} 座城市`;
}));

let plannedInstant = null;
const timeInput = $('#taiwan-time');
timeInput.value = taipeiInputValue();

function updateClocks() {
  const instant = plannedInstant || new Date();
  const select = $('#city-zone');
  const zone = select.value;
  const local = describeTime('Asia/Taipei', instant);
  const remote = describeTime(zone, instant);
  $('#taiwan-clock').textContent = local.time;
  $('#taiwan-date').textContent = `${local.date} ${local.weekday}`;
  $('#us-clock').textContent = remote.time;
  $('#us-date').textContent = `${remote.date} ${remote.weekday}`;
  $('#us-zone').textContent = `${zone} · ${remote.zoneLabel}`;
  $('#us-place').textContent = select.selectedOptions[0].textContent.split(' ')[0];
  $('#time-difference').textContent = `比台灣慢 ${remote.behindTaiwan} 小時 · 當地是${remote.dayRelation}`;
  $('#time-mode').textContent = plannedInstant ? '指定時間' : '現在時間';
  if (!plannedInstant && document.activeElement !== timeInput && !timeInput.hasAttribute('aria-invalid')) timeInput.value = taipeiInputValue(instant);
}

$('#city-zone').addEventListener('change', updateClocks);
timeInput.addEventListener('input', () => {
  try {
    if (!timeInput.validity.valid) throw new Error('請選擇 2000 至 2100 年之間的有效日期與時間。');
    plannedInstant = parseTaipeiInput(timeInput.value);
    timeInput.removeAttribute('aria-invalid');
    $('#time-error').textContent = '';
    updateClocks();
  } catch (error) {
    timeInput.setAttribute('aria-invalid', 'true');
    $('#time-error').textContent = error.message;
  }
});
$('#reset-time').addEventListener('click', () => {
  plannedInstant = null;
  timeInput.value = taipeiInputValue();
  timeInput.removeAttribute('aria-invalid');
  $('#time-error').textContent = '';
  updateClocks();
});
updateClocks();
setInterval(() => {
  if (!plannedInstant && !document.hidden) updateClocks();
}, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) updateClocks(); });

const unitSettings = {
  temperature: { labels: ['華氏 °F', '攝氏 °C'], value: 68, example: '記一個常見數字：68°F = 20°C。' },
  distance: { labels: ['英里 mi', '公里 km'], value: 1, example: '1 英里約等於 1.61 公里；路標上的距離先換算就好懂。' },
  weight: { labels: ['磅 lb', '公斤 kg'], value: 10, example: '10 磅約等於 4.54 公斤。' },
  height: { labels: ['英吋 in', '公分 cm'], value: 67, example: '1 英呎 = 12 英吋；5 呎 7 吋 = 67 英吋，約 170.18 公分。' },
};
let activeUnit = 'temperature';
let reverse = false;
const unitInput = $('#unit-value');
const numberFormatter = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 });

function renderConversion() {
  const settings = unitSettings[activeUnit];
  $('#unit-label').textContent = settings.labels[Number(reverse)];
  $('#unit-example').textContent = settings.example;
  if (activeUnit === 'temperature') unitInput.removeAttribute('min');
  else unitInput.min = '0';
  try {
    const value = convertUnit(activeUnit, unitInput.value, reverse);
    $('#unit-result strong').textContent = numberFormatter.format(value);
    $('#unit-result span').textContent = settings.labels[Number(!reverse)];
    $('#unit-error').textContent = '';
    unitInput.removeAttribute('aria-invalid');
  } catch (error) {
    $('#unit-result strong').textContent = '—';
    $('#unit-result span').textContent = settings.labels[Number(!reverse)];
    $('#unit-error').textContent = error.message;
    unitInput.setAttribute('aria-invalid', 'true');
  }
}
$$('[data-unit]').forEach(button => button.addEventListener('click', () => {
  activeUnit = button.dataset.unit;
  reverse = false;
  $$('[data-unit]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  unitInput.value = String(unitSettings[activeUnit].value);
  renderConversion();
}));
unitInput.addEventListener('input', renderConversion);
$('#reverse-unit').addEventListener('click', () => {
  try {
    const converted = convertUnit(activeUnit, unitInput.value, reverse);
    // Keep precision during direction changes; only the displayed output is rounded.
    unitInput.value = String(Number(converted.toPrecision(12)));
  } catch { /* Preserve invalid input so the user can fix it. */ }
  reverse = !reverse;
  renderConversion();
});
renderConversion();
