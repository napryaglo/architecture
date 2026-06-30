// Regression: dragging the Transparency control rebuilds + reassigns the
// FillEditor's Fill brush. An in-place `brush.Opacity =` mutates the shared
// instance without firing the TwoWay binding, so a shape that receives Fill
// by value never re-renders — the editor must hand back a fresh brush.

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SolidColorBrush, Color } from '../../../visual-engine/index.js';
import { FillEditor } from '../fill-editor.js';
import { SliderSpinEdit } from '../../../basic/slider-spin-edit.js';
import { initTestApp } from '../../../basic/tests/test-app.js';

function transparencyEdit(fe: FillEditor): SliderSpinEdit
{
    return fe.GetTemplateChild('PART_OpacityEdit') as SliderSpinEdit;
}

describe('FillEditor transparency', () => {
    beforeEach(() => { initTestApp(); });

    test('dragging the Transparency control reassigns Fill with the new opacity', () => {
        const fe = new FillEditor();
        const original = new SolidColorBrush(Color.FromHex('#1976d2'));
        fe.Fill = original;                       // Solid, opacity 1 → transparency 0

        const t = transparencyEdit(fe);
        assert.equal(t.Value, 0);                 // editor shows transparency = 100 − opacity

        t.Value = 25;                             // 25% transparent → opacity 0.75

        const out = fe.Fill;
        assert.ok(out instanceof SolidColorBrush);
        assert.notEqual(out, original);           // a fresh brush, not the same instance
        assert.ok(Math.abs(out!.Opacity - 0.75) < 1e-9);
        assert.equal(fe.FillOpacity, 75);         // internal opacity tracks 100 − transparency
    });

    test('a direct FillOpacity write also reassigns Fill', () => {
        const fe = new FillEditor();
        const original = new SolidColorBrush(Color.FromHex('#1976d2'));
        fe.Fill = original;

        fe.FillOpacity = 40;

        const out = fe.Fill;
        assert.ok(out instanceof SolidColorBrush);
        assert.notEqual(out, original);
        assert.ok(Math.abs(out!.Opacity - 0.4) < 1e-9);
        assert.equal(transparencyEdit(fe).Value, 60);   // transparency = 100 − 40
    });
});
