import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Color } from '../../runtime/index.js';
import { SolidColorBrush } from '../brush.js';
import { SolidColorBrushAnimation } from '../solid-color-brush-animation.js';

describe('SolidColorBrushAnimation', () => {
    test('Evaluate at t=0 returns a fresh SolidColorBrush with From colour', () => {
        const a = new SolidColorBrushAnimation({
            From: new Color(255, 0, 0, 255),
            To:   new Color(0, 0, 255, 255),
            Duration: 100,
        });
        const b = a.Evaluate(0, undefined);
        assert.ok(b instanceof SolidColorBrush);
        assert.equal(b.Color.R, 255);
        assert.equal(b.Color.B, 0);
    });

    test('Evaluate at mid interpolates per channel', () => {
        const a = new SolidColorBrushAnimation({
            From: new Color(0, 0, 0, 255),
            To:   new Color(200, 100, 50, 255),
            Duration: 100,
        });
        const b = a.Evaluate(50, undefined);
        assert.equal(b.Color.R, 100);
        assert.equal(b.Color.G, 50);
        assert.equal(b.Color.B, 25);
    });

    test('Evaluate at t=Duration returns the final brush', () => {
        const a = new SolidColorBrushAnimation({
            From: new Color(0, 0, 0),
            To:   new Color(255, 255, 255),
            Duration: 100,
        });
        const b = a.Evaluate(100, undefined);
        assert.equal(b.Color.R, 255);
        assert.equal(b.Color.G, 255);
    });

    test('From=undefined uses the baseValue brush\'s colour as the starting point', () => {
        const a = new SolidColorBrushAnimation({
            To: new Color(0, 0, 255, 255),
            Duration: 100,
        });
        const startBrush = new SolidColorBrush(new Color(255, 0, 0, 255));
        // At t=0, From defaults to the base brush's colour → red.
        const b0 = a.Evaluate(0, startBrush);
        assert.equal(b0.Color.R, 255);
        // At t=50, interpolated half toward To (blue).
        const bMid = a.Evaluate(50, startBrush);
        assert.equal(bMid.Color.R, 127.5);
        assert.equal(bMid.Color.B, 127.5);
    });

    test('Non-SolidColorBrush baseValue falls back to Transparent as From', () => {
        const a = new SolidColorBrushAnimation({
            To: new Color(255, 255, 255, 255),
            Duration: 100,
        });
        // baseValue is undefined — From defaults to Transparent (alpha 0).
        const b = a.Evaluate(0, undefined);
        assert.equal(b.Color.A, 0);
    });

    test('Every Evaluate returns a NEW SolidColorBrush instance (no aliasing)', () => {
        const a = new SolidColorBrushAnimation({
            From: new Color(0, 0, 0),
            To:   new Color(255, 255, 255),
            Duration: 100,
        });
        const b1 = a.Evaluate(50, undefined);
        const b2 = a.Evaluate(50, undefined);
        assert.notEqual(b1, b2, 'each tick must produce a fresh brush');
        // ...but with equal colour values.
        assert.equal(b1.Color.R, b2.Color.R);
    });
});
