// When the collector runs. Inside a game window it runs every minute. Outside one it still
// runs every 5 minutes, so a flexed or rescheduled game is recorded rather than missed.
// Times are Eastern, and each window runs from the time given until LAST_RUN_NEXT_DAY.

// Earliest kickoffs are 1:00 pm Sunday and 8:15 pm Thursday and Monday. A Sunday night
// game in overtime can run past 12:30 am, so every window stays open until 2:00 am.
const DEFAULT_SCHEDULE = { Thu: '18:30', Sun: '12:00', Mon: '18:30' };
const INTERNATIONAL_SCHEDULE = { ...DEFAULT_SCHEDULE, Sun: '08:00' }; // 9:30 am kickoffs

// Sundays in 2026 with a morning kickoff abroad. Rio and Mexico City kick off inside the
// default Sunday window, so they aren't listed.
const INTERNATIONAL_SUNDAYS = new Set([
  '2026-10-04', // London
  '2026-10-11', // London
  '2026-10-18', // London
  '2026-10-25', // Paris
  '2026-11-08', // Madrid
  '2026-11-15', // Munich
]);

// Games on days neither schedule covers.
const EXTRA_GAME_DAYS = {
  '2026-11-25': '18:30', // Wednesday before Thanksgiving
  '2026-11-26': '12:00', // Thanksgiving
  '2026-11-27': '12:00', // Black Friday
  '2026-12-19': '16:00', // Saturday
  '2026-12-25': '12:00', // Christmas
};

const LAST_RUN_NEXT_DAY = 2 * 60;
const IDLE_EVERY_MINUTES = 5;

const easternFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function eastern(t) {
  const parts = Object.fromEntries(easternFormat.formatToParts(t).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

const toMinutes = (time) => {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
};

// When a day's window opens, or null if that day has none.
function windowStart({ date, weekday }) {
  const schedule = INTERNATIONAL_SUNDAYS.has(date) ? INTERNATIONAL_SCHEDULE : DEFAULT_SCHEDULE;
  const starts = [schedule[weekday], EXTRA_GAME_DAYS[date]].filter(Boolean).map(toMinutes);
  return starts.length > 0 ? Math.min(...starts) : null;
}

export function inGameWindow(t) {
  const today = eastern(t);
  const start = windowStart(today);
  if (start !== null && today.minutes >= start) return true;
  // Stepping back past midnight rather than a full day stays correct when the clocks change.
  const yesterday = eastern(t - (today.minutes + 1) * 60_000);
  return today.minutes < LAST_RUN_NEXT_DAY && windowStart(yesterday) !== null;
}

export function shouldCollect(t) {
  return inGameWindow(t) || Math.floor(t / 60_000) % IDLE_EVERY_MINUTES === 0;
}
