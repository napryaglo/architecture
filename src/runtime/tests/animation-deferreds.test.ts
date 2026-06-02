import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    Color,
    DoubleAnimationUsingKeyFrames,
    EasingDoubleKeyFrame,
    Easings,
    LinearDoubleKeyFrame,
    Thickness,
    cubicBezier,
} from '../index.js';

// ── EasingKeyFrame ────────────────────────────────────────────────────

describe('EasingDoubleKeyFrame', () => {
    test('Applies a per-segment easing curve between prev and Value', () => {
        // Single segment, QuadIn easing (t² shape).
        const f = new EasingDoubleKeyFrame({
            KeyTime: 100,
            Value:   100,
            Easing:  Easings.QuadIn,
        });
        // At segment-local t=0.5, QuadIn(0.5) = 0.25 →
        // interpolate(0, 100, 0.25) = 25.
        assert.equal(f.Interpolate(0, 0.5), 25);
        // Endpoints remain anchored.
        assert.equal(f.Interpolate(0, 0),   0);
        assert.equal(f.Interpolate(0, 1),   100);
    });

    test('Different easings on adjacent segments stack independently', () => {
        const a = new DoubleAnimationUsingKeyFrames({
            KeyFrames: [
                // Slow-in to 100 over the first half — QuadIn shape.
                new EasingDoubleKeyFrame({ KeyTime: 100, Value: 100, Easing: Easings.QuadIn }),
                // Linear back to 0 over the second half.
                new LinearDoubleKeyFrame({ KeyTime: 200, Value: 0 }),
            ],
        });
        // Segment 0: at t=50 (mid), QuadIn(0.5)=0.25 → 0→100 at 0.25 = 25.
        assert.equal(a.Evaluate(50, 0),  25);
        // Segment 1: at t=150 (mid), linear → 50.
        assert.equal(a.Evaluate(150, 0), 50);
    });
});

// ── cubicBezier easing factory ────────────────────────────────────────

describe('cubicBezier', () => {
    test('Endpoints map exactly to 0 → 0 and 1 → 1', () => {
        const ease = cubicBezier(0.25, 0.1, 0.25, 1);    // CSS 'ease'
        assert.equal(ease(0), 0);
        assert.equal(ease(1), 1);
    });

    test("CSS 'linear' equivalent (control points on the diagonal) matches identity", () => {
        // x1=y1, x2=y2 along the diagonal → curve == y=x.
        const ease = cubicBezier(0.25, 0.25, 0.75, 0.75);
        for (const t of [0.1, 0.25, 0.5, 0.75, 0.9])
        {
            assert.ok(Math.abs(ease(t) - t) < 1e-6,
                `cubicBezier(0.25,0.25,0.75,0.75)(${t}) ≈ ${t}`);
        }
    });

    test("CSS 'ease-in' (0.42, 0, 1, 1) curves below the diagonal", () => {
        // ease-in starts slow → ease(0.5) < 0.5.
        const ease = cubicBezier(0.42, 0, 1, 1);
        assert.ok(ease(0.5) < 0.5, 'ease-in at mid should be below the diagonal');
        // And ease(0.25) is even further below.
        assert.ok(ease(0.25) < ease(0.5));
    });

    test("CSS 'ease-out' (0, 0, 0.58, 1) curves above the diagonal", () => {
        const ease = cubicBezier(0, 0, 0.58, 1);
        assert.ok(ease(0.5) > 0.5, 'ease-out at mid should be above the diagonal');
    });

    test('Plays cleanly as the Easing on an EasingKeyFrame', () => {
        const cubic = cubicBezier(0.42, 0, 0.58, 1);    // CSS ease-in-out
        const f = new EasingDoubleKeyFrame({
            KeyTime: 100,
            Value:   100,
            Easing:  cubic,
        });
        // ease-in-out is symmetric — f(0.5) ≈ 0.5 → value 50.
        const mid = f.Interpolate(0, 0.5);
        assert.ok(Math.abs(mid - 50) < 1e-6,
            `expected ~50, got ${mid}`);
    });

    test('Out-of-range t clamps to 0 / 1 endpoints', () => {
        const ease = cubicBezier(0.25, 0.1, 0.25, 1);
        assert.equal(ease(-0.5), 0);
        assert.equal(ease(1.5),  1);
    });
});
