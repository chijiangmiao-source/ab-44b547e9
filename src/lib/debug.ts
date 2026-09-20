import { audit } from './solver';

const r = audit({
  times: [4, 8, 16, 22, 28, 34, 43],
  prfs: [3, 4],
  maxMissed: 2,
});
console.log(r.sequenceCount, r.missedTotal, r.tieUnderCombined);
console.log(JSON.stringify(r.sequences, null, 1));
