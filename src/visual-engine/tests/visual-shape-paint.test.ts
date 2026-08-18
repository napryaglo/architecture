import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Visual, Size, Rect, Color } from '../../runtime/index.js';
import { Pen, SolidColorBrush } from '../index.js';

describe('Visual.Stroke', () =>
{
    test('Stroke DP round-trips through the property system', () =>
    {
        const v = new (class extends Visual {})();
        const pen = new Pen(new SolidColorBrush(Color.FromHex('#f0f')), 2);
        v.Stroke = pen;
        assert.equal(v.Stroke, pen);
        // Backed by a real DP, not an ad-hoc field.
        assert.equal(v.get_property_value(Visual.StrokeKey), pen);
    });
});
