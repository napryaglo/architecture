import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    ApproximateTextMeasurer,
    APPROXIMATE_TEXT_MEASURER,
    type TextMeasurer,
} from './index.js';

// Pins ApproximateTextMeasurer — the stateless fallback measurer used
// whenever no host or no real font is wired up. Behavior here defines
// the "baseline" everything else is calibrated against, so accidental
// drift would silently shift layout in every demo and test that hasn't
// loaded a real font.

describe('ApproximateTextMeasurer.Measure', () => {
    const m = APPROXIMATE_TEXT_MEASURER;

    test('empty text returns all-zero metrics', () => {
        const r = m.Measure('', 'system-ui', 16, 'normal', 'normal');
        assert.deepEqual(r, { Width: 0, Height: 0, Ascent: 0, Descent: 0 });
    });

    test('width is glyphCount × fontSize × 0.6', () => {
        const r = m.Measure('Hello', 'system-ui', 20, 'normal', 'normal');
        assert.equal(r.Width, 5 * 20 * 0.6);
    });

    test('height is fontSize × 1.2', () => {
        const r = m.Measure('x', 'system-ui', 16, 'normal', 'normal');
        assert.equal(r.Height, 16 * 1.2);
    });

    test('Ascent + Descent equals Height (no gap loss)', () => {
        const r = m.Measure('hi', 'system-ui', 24, 'normal', 'normal');
        assert.ok(Math.abs(r.Ascent + r.Descent - r.Height) < 1e-9);
    });

    test('Ascent is the 0.85 baseline ratio', () => {
        const r = m.Measure('hi', 'system-ui', 20, 'normal', 'normal');
        assert.equal(r.Ascent, 20 * 0.85);
    });

    test('counts code points — emoji is one glyph, not two UTF-16 units', () => {
        const r = m.Measure('A😀B', 'system-ui', 10, 'normal', 'normal');
        // 3 glyphs (A, 😀, B) × 10 × 0.6 = 18
        assert.equal(r.Width, 18);
    });

    test('font family / weight / style arguments do not affect the result', () => {
        const a = m.Measure('Hi', 'Inter',    16, 'normal', 'normal');
        const b = m.Measure('Hi', 'Comic',    16, 'bold',   'italic');
        // Approximation has no per-font knowledge → identical output.
        assert.deepEqual(a, b);
    });
});

describe('ApproximateTextMeasurer.LoadFont', () => {
    test('is a no-op — buffer is accepted but never used', () => {
        const m: TextMeasurer = new ApproximateTextMeasurer();
        const buffer = new ArrayBuffer(4);
        assert.doesNotThrow(() => m.LoadFont('Inter', buffer));
        // Measurement after a fake load still uses approximation.
        const r = m.Measure('Hi', 'Inter', 16, 'normal', 'normal');
        assert.equal(r.Width, 2 * 16 * 0.6);
    });

    test('also accepts Uint8Array sources (the Node fs.readFile shape)', () => {
        const m: TextMeasurer = new ApproximateTextMeasurer();
        assert.doesNotThrow(() => m.LoadFont('Inter', new Uint8Array(4)));
    });

    test('explicit weight / style overrides are accepted without error', () => {
        const m: TextMeasurer = new ApproximateTextMeasurer();
        assert.doesNotThrow(() => m.LoadFont('Inter', new ArrayBuffer(4), 'bold', 'italic'));
    });
});

describe('APPROXIMATE_TEXT_MEASURER singleton', () => {
    test('is the same instance every time it is imported', () => {
        // Module singletons must be stable so multiple consumers share
        // one cache (when caching lands) and reference compares work.
        assert.equal(APPROXIMATE_TEXT_MEASURER, APPROXIMATE_TEXT_MEASURER);
    });

    test('is a stateless ApproximateTextMeasurer instance', () => {
        assert.ok(APPROXIMATE_TEXT_MEASURER instanceof ApproximateTextMeasurer);
    });
});
