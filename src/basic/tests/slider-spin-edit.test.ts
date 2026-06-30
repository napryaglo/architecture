import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from './test-app.js';

import { SliderSpinEdit } from '../slider-spin-edit.js';
import { Slider } from '../slider.js';
import { SpinEdit } from '../spin-edit.js';

function parts(c: SliderSpinEdit): { slider: Slider; spin: SpinEdit }
{
    return {
        slider: c.GetTemplateChild('PART_Slider')   as Slider,
        spin:   c.GetTemplateChild('PART_SpinEdit') as SpinEdit,
    };
}

describe('SliderSpinEdit', () => {
    beforeEach(() => { initTestApp(); });

    test('materialises a Slider + SpinEdit from its default template', () => {
        const c = new SliderSpinEdit();
        const { slider, spin } = parts(c);
        assert.ok(slider instanceof Slider);
        assert.ok(spin instanceof SpinEdit);
    });

    test('Value propagates to both children', () => {
        const c = new SliderSpinEdit();
        c.Value = 31;
        const { slider, spin } = parts(c);
        assert.equal(slider.Value, 31);
        assert.equal(spin.Value, 31);
    });

    test('a slider drag flows into Value and the spin', () => {
        const c = new SliderSpinEdit();
        const { slider, spin } = parts(c);
        slider.Value = 42;
        assert.equal(c.Value, 42);
        assert.equal(spin.Value, 42);
    });

    test('a spin edit flows into Value and the slider', () => {
        const c = new SliderSpinEdit();
        const { slider, spin } = parts(c);
        spin.Value = 17;
        assert.equal(c.Value, 17);
        assert.equal(slider.Value, 17);
    });

    test('Value clamps to [Minimum, Maximum] and rounds to DecimalPlaces', () => {
        const c = new SliderSpinEdit();        // Min 0, Max 100, DP 0
        c.Value = 250;  assert.equal(c.Value, 100);
        c.Value = -5;   assert.equal(c.Value, 0);
        c.Value = 31.7; assert.equal(c.Value, 32);
    });

    test('a continuous slider drag snaps to whole steps at DecimalPlaces=0', () => {
        const c = new SliderSpinEdit();
        const { slider } = parts(c);
        slider.Value = 31.4;
        assert.equal(c.Value, 31);
        assert.equal(slider.Value, 31);        // snapped back
    });

    test('range + step config forwards to both children', () => {
        const c = new SliderSpinEdit();
        c.Minimum = 10; c.Maximum = 90; c.SmallChange = 5; c.LargeChange = 25;
        const { slider, spin } = parts(c);
        assert.equal(slider.Minimum, 10);
        assert.equal(slider.Maximum, 90);
        assert.equal(spin.Minimum,   10);
        assert.equal(spin.Maximum,   90);
        assert.equal(slider.SmallChange, 5);
        assert.equal(spin.LargeChange,   25);
    });
});
