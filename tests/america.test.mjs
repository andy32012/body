import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { taipeiInputValue, parseTaipeiInput, describeTime, convertUnit } from '../america/tools.js';

test('New York uses the selected date for winter and summer offsets', () => {
  const winter = describeTime('America/New_York', parseTaipeiInput('2026-01-15T20:00'));
  assert.deepEqual(winter, {
    time: '07:00', date: '2026/01/15', weekday: '週四',
    zoneLabel: 'GMT-5', behindTaiwan: 13, dayRelation: '同一天',
  });
  const summer = describeTime('America/New_York', parseTaipeiInput('2026-07-15T20:00'));
  assert.equal(summer.time, '08:00');
  assert.equal(summer.zoneLabel, 'GMT-4');
  assert.equal(summer.behindTaiwan, 12);
});

test('DST transitions use the actual instant, including the skipped and repeated hours', () => {
  assert.equal(describeTime('America/New_York', new Date('2026-03-08T06:59:00Z')).time, '01:59');
  assert.equal(describeTime('America/New_York', new Date('2026-03-08T07:00:00Z')).time, '03:00');
  const first = describeTime('America/New_York', new Date('2026-11-01T05:30:00Z'));
  const second = describeTime('America/New_York', new Date('2026-11-01T06:30:00Z'));
  assert.equal(first.time, second.time);
  assert.equal(first.zoneLabel, 'GMT-4');
  assert.equal(second.zoneLabel, 'GMT-5');
});

test('West Coast clocks identify the previous day across a year boundary', () => {
  const local = describeTime('America/Los_Angeles', parseTaipeiInput('2026-01-01T08:00'));
  assert.equal(local.time, '16:00');
  assert.equal(local.date, '2025/12/31');
  assert.equal(local.dayRelation, '前一天');
  assert.equal(local.behindTaiwan, 16);
  const midnight = describeTime('America/Los_Angeles', parseTaipeiInput('2026-07-16T15:00'));
  assert.equal(midnight.time, '00:00', 'midnight must not be displayed as 24:00');
  assert.equal(midnight.dayRelation, '同一天');
  assert.equal(midnight.behindTaiwan, 15);
});

test('Taiwan datetime input parses and formats independently of the device time zone', () => {
  const moduleUrl = new URL('../america/tools.js', import.meta.url).href;
  const code = `import { parseTaipeiInput, taipeiInputValue } from ${JSON.stringify(moduleUrl)};
    const date = parseTaipeiInput('2026-07-15T20:30');
    process.stdout.write(JSON.stringify([date.toISOString(), taipeiInputValue(date)]));`;
  for (const zone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
    const actual = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], {
      env: { ...process.env, TZ: zone }, encoding: 'utf8',
    }));
    assert.deepEqual(actual, ['2026-07-15T12:30:00.000Z', '2026-07-15T20:30'], zone);
  }
});

test('Taiwan input rejects absent, malformed, impossible, and normalized dates', () => {
  for (const value of ['', ' ', null, undefined, '2026-01-01', '2026-01-01T08:00Z',
    '2026-1-1T08:00', '2026-01-01T24:00', '2026-01-01T23:60', '2026-13-01T12:00',
    '2026-00-01T12:00', '2026-04-31T12:00', '2026-02-29T12:00', '1900-02-29T12:00', '0000-01-01T12:00']) {
    assert.throws(() => parseTaipeiInput(value), Error, String(value));
  }
  assert.equal(taipeiInputValue(parseTaipeiInput('2028-02-29T00:00')), '2028-02-29T00:00');
  assert.equal(parseTaipeiInput('2000-02-29T08:00').toISOString(), '2000-02-29T00:00:00.000Z');
  assert.equal(parseTaipeiInput('1900-01-01T08:00').toISOString(), '1900-01-01T00:00:00.000Z', 'parser explicitly uses +08:00 even for older dates');
  assert.throws(() => taipeiInputValue(new Date('invalid')), Error);
  assert.throws(() => describeTime('America/New_York', new Date('invalid')), Error);
});

test('all four unit conversions work in both directions, including freezing and negative temperatures', () => {
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≠ ${expected}`);
  close(convertUnit('temperature', 68), 20);
  close(convertUnit('temperature', 20, true), 68);
  close(convertUnit('temperature', 32), 0);
  close(convertUnit('temperature', -40), -40);
  close(convertUnit('temperature', -40, true), -40);
  close(convertUnit('distance', '1'), 1.609344);
  close(convertUnit('distance', 1.609344, true), 1);
  close(convertUnit('weight', 10), 4.5359237);
  close(convertUnit('weight', 4.5359237, true), 10);
  close(convertUnit('height', 67), 170.18);
  close(convertUnit('height', 170.18, true), 67);
});

test('unit input rejects empty or nonfinite values and negative physical quantities', () => {
  for (const value of ['', ' ', null, undefined, NaN, Infinity, -Infinity, 'NaN', 'Infinity', 'abc', true, []]) {
    assert.throws(() => convertUnit('temperature', value), Error, String(value));
  }
  for (const kind of ['distance', 'weight', 'height']) {
    assert.throws(() => convertUnit(kind, -1), Error, kind);
    assert.throws(() => convertUnit(kind, '-1', true), Error, kind);
    assert.equal(convertUnit(kind, 0), 0);
  }
  assert.throws(() => convertUnit('unsupported', 1), Error);
  assert.throws(() => convertUnit('distance', Number.MAX_VALUE), Error);
});
