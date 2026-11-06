import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const DATA = new URL('./data.js', import.meta.url).href;

// Node reads a time zone as it starts, so each one gets its own process.
function inTimeZone(TZ, snapshots) {
  const script = `
    const { formatTime, layoutTimeline } = await import(${JSON.stringify(DATA)});
    const snapshots = ${JSON.stringify(snapshots)};
    const { ticks } = layoutTimeline(snapshots);
    console.log(JSON.stringify({ first: formatTime(snapshots[0].t), ticks: ticks.map((tick) => formatTime(tick.t)) }));
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, TZ, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' },
    encoding: 'utf8',
  });
  return JSON.parse(output);
}

// A 1:00 pm Eastern kickoff, read every 15 minutes for three hours.
const KICKOFF = Date.UTC(2026, 10, 8, 18, 0);
const game = Array.from({ length: 13 }, (_, i) => ({ t: KICKOFF + i * 15 * 60 * 1000, live: true }));

test('times read in the viewer\'s own time zone', () => {
  assert.equal(inTimeZone('America/New_York', game).first, 'Sun 1:00 PM');
  assert.equal(inTimeZone('America/Los_Angeles', game).first, 'Sun 10:00 AM');
  assert.equal(inTimeZone('Europe/Dublin', game).first, 'Sun 6:00 PM');
  assert.equal(inTimeZone('Asia/Tokyo', game).first, 'Mon 3:00 AM', 'the day moves too');
});

test('chart ticks land on the viewer\'s hour, even half an hour off UTC', () => {
  assert.deepEqual(inTimeZone('America/New_York', game).ticks, ['Sun 1:00 PM', 'Sun 2:00 PM', 'Sun 3:00 PM', 'Sun 4:00 PM']);
  assert.deepEqual(inTimeZone('Asia/Kolkata', game).ticks, ['Sun 11:30 PM', 'Mon 1:00 AM', 'Mon 2:00 AM'], 'midnight is too close to the first label to fit');
});
