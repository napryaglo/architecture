// Sanity tests for the §19.8 corpus verifier itself.
//
// Wires `runOpCorpus` and `runSimplifyCorpus` against a handful of
// hand-written tests with known-correct expected geometry. If the
// verifier itself is broken, the whole corpus run is meaningless;
// these tests guard that. Force-set `RUN_PATHOPS_CORPUS` so the
// self-test always runs even when the wider corpus is gated off —
// it's small and fast (~ten Op() calls on rect inputs that the
// engine has nailed since §19.7 round 3).
process.env.RUN_PATHOPS_CORPUS = '1';

import { runOpCorpus, runSimplifyCorpus } from './corpus-verifier.js';

runOpCorpus('verifier self-test (Op)', [
    // Two overlapping unit-ish rects with all four ops.
    { name: 'overlap-rects union', op: 'union',
      a: 'M 0 0 L 10 0 L 10 10 L 0 10 Z',
      b: 'M 5 5 L 15 5 L 15 15 L 5 15 Z' },
    { name: 'overlap-rects intersect', op: 'sect',
      a: 'M 0 0 L 10 0 L 10 10 L 0 10 Z',
      b: 'M 5 5 L 15 5 L 15 15 L 5 15 Z' },
    { name: 'overlap-rects difference', op: 'diff',
      a: 'M 0 0 L 10 0 L 10 10 L 0 10 Z',
      b: 'M 5 5 L 15 5 L 15 15 L 5 15 Z' },
    { name: 'overlap-rects xor', op: 'xor',
      a: 'M 0 0 L 10 0 L 10 10 L 0 10 Z',
      b: 'M 5 5 L 15 5 L 15 15 L 5 15 Z' },
    // B fully inside A.
    { name: 'B-in-A intersect', op: 'sect',
      a: 'M 0 0 L 20 0 L 20 20 L 0 20 Z',
      b: 'M 5 5 L 15 5 L 15 15 L 5 15 Z' },
    { name: 'B-in-A difference', op: 'diff',
      a: 'M 0 0 L 20 0 L 20 20 L 0 20 Z',
      b: 'M 5 5 L 15 5 L 15 15 L 5 15 Z' },
]);

runSimplifyCorpus('verifier self-test (Simplify)', [
    // Single non-self-intersecting rect — Simplify is identity.
    { name: 'simple rect', p: 'M 0 0 L 10 0 L 10 10 L 0 10 Z' },
]);
