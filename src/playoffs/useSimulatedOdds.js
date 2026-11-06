import { useEffect, useRef, useState } from 'react';
import { playoffOdds, SIMULATIONS } from '../../lib/playoffs.mjs';

const QUICK_SIMULATIONS = 4_000;
const SETTLE_MS = 250;

// Runs one simulation at a time off the main thread. A request made during a run replaces any
// already waiting, so a dragged slider only ever queues its newest position.
function createSimulator(onResult) {
  let worker = null;
  let busy = false;
  let waiting = null;
  const send = (job) => {
    busy = true;
    worker.postMessage(job);
  };
  const runHere = ({ inputs, iterations }) => onResult(playoffOdds({ ...inputs, iterations }));
  try {
    worker = new Worker(new URL('./odds.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      busy = false;
      onResult(data);
      if (waiting) {
        send(waiting);
        waiting = null;
      }
    };
    worker.onerror = () => {
      worker = null;
      busy = false;
      if (waiting) runHere(waiting);
      waiting = null;
    };
  } catch {
    worker = null; // the odds still work, just on the main thread
  }
  return {
    run(inputs, iterations) {
      const job = { inputs, iterations };
      if (!worker) runHere(job);
      else if (busy) waiting = job;
      else send(job);
    },
    stop() {
      worker?.terminate();
    },
  };
}

// Odds for `inputs`, or null while there are none yet. The last odds stay up during a new run.
// With `quick`, a smaller run answers straight away and the full run follows once inputs settle.
export default function useSimulatedOdds(inputs, { quick = false } = {}) {
  const [odds, setOdds] = useState(null);
  const simulator = useRef(null);

  useEffect(() => {
    const current = createSimulator(setOdds);
    simulator.current = current;
    return () => current.stop();
  }, []);

  useEffect(() => {
    if (!inputs) return undefined;
    if (!quick) {
      simulator.current.run(inputs, SIMULATIONS);
      return undefined;
    }
    simulator.current.run(inputs, QUICK_SIMULATIONS);
    const settle = setTimeout(() => simulator.current.run(inputs, SIMULATIONS), SETTLE_MS);
    return () => clearTimeout(settle);
  }, [inputs, quick]);

  return inputs ? odds : null;
}
