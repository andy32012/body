const TAIPEI_ZONE = 'Asia/Taipei';
const formatters = new Map();

function validDate(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error('請輸入有效的日期與時間。');
  }
  return date;
}

function calendarParts(zone, date) {
  const key = `calendar:${zone}`;
  if (!formatters.has(key)) {
    formatters.set(key, new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      timeZoneName: 'shortOffset',
    }));
  }
  return Object.fromEntries(formatters.get(key).formatToParts(validDate(date))
    .filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

function dateString(parts, separator = '/') {
  return [parts.year.padStart(4, '0'), parts.month, parts.day].join(separator);
}

/** A datetime-local value that always describes Taiwan time. */
export function taipeiInputValue(date = new Date()) {
  const parts = calendarParts(TAIPEI_ZONE, date);
  return `${dateString(parts, '-')}T${parts.hour}:${parts.minute}`;
}

/** Parse a Taiwan wall-clock value without using the device's time zone. */
export function parseTaipeiInput(value) {
  const match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error('請填入完整的台灣日期與時間。');
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    throw new Error('請輸入有效的日期與時間。');
  }
  const date = new Date(`${value}:00+08:00`);
  // Date can silently roll February 30 into March; reject that normalization.
  if (!Number.isFinite(date.getTime()) || new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16) !== value) {
    throw new Error('請輸入有效的日期與時間。');
  }
  return date;
}

/** Describe the same instant in a chosen city, including its actual DST offset. */
export function describeTime(zone, date) {
  const parts = calendarParts(zone, date);
  const taipeiDate = dateString(calendarParts(TAIPEI_ZONE, date));
  const localDate = dateString(parts);
  const weekdayKey = `weekday:${zone}`;
  if (!formatters.has(weekdayKey)) {
    formatters.set(weekdayKey, new Intl.DateTimeFormat('zh-TW', { timeZone: zone, weekday: 'short' }));
  }
  const zoneLabel = parts.timeZoneName;
  const offset = zoneLabel.match(/^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/);
  if (!offset) throw new Error('無法讀取這個時區，請重新選擇城市。');
  const offsetHours = offset[1]
    ? (Number(offset[2]) + Number(offset[3] || 0) / 60) * (offset[1] === '-' ? -1 : 1)
    : 0;
  return {
    time: `${parts.hour}:${parts.minute}`,
    date: localDate,
    weekday: formatters.get(weekdayKey).format(date),
    zoneLabel,
    behindTaiwan: 8 - offsetHours,
    dayRelation: localDate === taipeiDate ? '同一天' : localDate < taipeiDate ? '前一天' : '後一天',
  };
}

const unitFactors = { distance: 1.609344, weight: 0.45359237, height: 2.54 };

/** U.S. customary → metric; reverse=true converts metric → U.S. customary. */
export function convertUnit(kind, value, reverse = false) {
  if (kind !== 'temperature' && !Object.hasOwn(unitFactors, kind)) {
    throw new Error('請選擇支援的換算單位。');
  }
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && value.trim() === '')) {
    throw new Error('請先輸入數值。');
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('請輸入有效的數值。');
  if (kind !== 'temperature' && number < 0) throw new Error('這個單位的數值不能小於 0。');
  const result = kind === 'temperature'
    ? (reverse ? number * 1.8 + 32 : (number - 32) / 1.8)
    : (reverse ? number / unitFactors[kind] : number * unitFactors[kind]);
  if (!Number.isFinite(result)) throw new Error('數值太大，請輸入較小的數值。');
  return result === 0 ? 0 : result;
}
