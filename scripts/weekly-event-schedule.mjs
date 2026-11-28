import { addCalendarDays, dateOnly, dateValue } from '../site/assets/sources.js';
import { localMarketTime as brusselsTime } from '../site/assets/market-events.js';

const day = (value) => Boolean(dateOnly(value) && dateValue(value));
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const clock = (value) => /^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::00)?$/.test(value ?? '');

// Opt-in for a finite edition with its own published weekly visiting schedule.
// These are calendar display slots, not separate events or a venue's opening hours.
export function weeklyEventSessions({ start, end, timezone, frequency, days, opens, closes, exceptions }) {
  const datedOnly = opens == null && closes == null;
  if (timezone !== 'Europe/Brussels' || frequency !== 'P1W' || !day(start) || !day(end) ||
      end < start || end > addCalendarDays(start, 365) ||
      !Array.isArray(days) || days.length < 1 || days.length > 7 || new Set(days).size !== days.length ||
      days.some((name) => !dayNames.includes(name)) || (!datedOnly && (!clock(opens) || !clock(closes) ||
      opens.slice(0, 5) >= closes.slice(0, 5))) || !Array.isArray(exceptions) || exceptions.length > 366 ||
      exceptions.some((date) => !day(date) || date < start || date > end)) {
    throw new Error('De wekelijkse evenementuren zijn niet eenduidig of niet begrensd.');
  }
  const off = new Set(exceptions);
  const sessions = [];
  for (let date = start; date <= end; date = addCalendarDays(date, 1)) {
    if (off.has(date) || !days.includes(dayNames[new Date(date + 'T12:00:00Z').getUTCDay()])) continue;
    if (datedOnly) {
      sessions.push({ start: date });
      continue;
    }
    const open = brusselsTime(date, opens.slice(0, 5));
    const close = brusselsTime(date, closes.slice(0, 5));
    if (!open || !close || Date.parse(close) - Date.parse(open) > 18 * 60 * 60_000) {
      throw new Error('Een wekelijks evenementuur is niet ondubbelzinnig in Brussel.');
    }
    sessions.push({ start: open, end: close });
  }
  if (!sessions.length) throw new Error('De wekelijkse evenementuren bevatten geen bezoekdagen.');
  return sessions;
}
