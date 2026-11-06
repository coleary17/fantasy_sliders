import { playoffOdds } from '../../lib/playoffs.mjs';

self.onmessage = ({ data: { inputs, iterations } }) => {
  self.postMessage(playoffOdds({ ...inputs, iterations }));
};
