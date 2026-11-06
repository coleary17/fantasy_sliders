#!/usr/bin/env node
// Runs the collector from this machine, saving to public/data/wp for local viewing.
// Usage: node scripts/collect-local.mjs [--loop]
import { collect } from '../lib/collector.mjs';
import { store } from './local-store.mjs';

const INTERVAL_MS = 5 * 60 * 1000;

async function tick() {
  try {
    console.log(new Date().toISOString(), JSON.stringify(await collect({ store })));
  } catch (err) {
    console.error(new Date().toISOString(), 'collect failed:', err.message);
    if (!process.argv.includes('--loop')) process.exitCode = 1;
  }
}

await tick();
if (process.argv.includes('--loop')) setInterval(tick, INTERVAL_MS);
