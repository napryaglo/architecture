// Regression: inherited values reach a templated control's TEMPLATE
// PARTS — including parts that are themselves nested templated controls.
//
// The template root attaches as a VISUAL child, so it sits outside the
// base inheritance cascade (logical + overlay children only).
// TemplatedControl bridges the cascade onto the template subtree; this
// test pins that bridge using SpinEdit, whose PART_TextBox is a nested
// templated control (TextBox) — the case the bare visual-tree fallback
// never reached reactively.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    ThemeManager, Density, SolidColorBrush, Color, HeadlessTarget,
} from '../../visual-engine/index.js';
import { TextBlock } from '../text-block.js';
import { SpinEdit } from '../spin-edit.js';
import { Border } from '../border.js';
import { initTestApp } from './test-app.js';

const dc = new Proxy({}, { get: () => () => {} }) as never;

function innerTextBox(se: SpinEdit): object
{
    return (se as unknown as { GetTemplateChild(n: string): unknown })
        .GetTemplateChild('PART_TextBox') as object;
}

describe('TemplatedControl — inheritance reaches template parts', () => {

    function mountUnderDensity(d: Density): SpinEdit
    {
        const host = new Border(); host.Width = 160; host.Height = 120;
        ThemeManager.SetDensity(host, d);
        const se = new SpinEdit();
        host.SetChild(se);
        new HeadlessTarget(300, 200, host).Render(dc);
        return se;
    }

    test('density inherits into a nested-control template part (PART_TextBox)', () => {
        initTestApp();
        for (const d of [Density.Regular, Density.Compact, Density.Comfortable])
        {
            const se = mountUnderDensity(d);
            assert.equal(ThemeManager.GetDensity(se as never), d, 'control inherits density');
            assert.equal(ThemeManager.GetDensity(innerTextBox(se) as never), d,
                `inner TextBox inherits ${d} (was stuck at Regular before the cascade bridge)`);
        }
    });

    test('density change reactively re-flows into the template part', () => {
        initTestApp();
        const host = new Border(); host.Width = 160; host.Height = 120;
        ThemeManager.SetDensity(host, Density.Regular);
        const se = new SpinEdit();
        host.SetChild(se);
        const target = new HeadlessTarget(300, 200, host);
        target.Render(dc);
        assert.equal(ThemeManager.GetDensity(innerTextBox(se) as never), Density.Regular);

        ThemeManager.SetDensity(host, Density.Compact);
        target.Render(dc);
        assert.equal(ThemeManager.GetDensity(innerTextBox(se) as never), Density.Compact,
            'inner TextBox tracks an ancestor density change');
    });

    test('foreground inherits into the nested-control template part', () => {
        initTestApp();
        const host = new Border(); host.Width = 160; host.Height = 120;
        const ink = new SolidColorBrush(Color.FromHex('#ff0000'));
        host.set_property_value(TextBlock.ForegroundKey, ink);
        const se = new SpinEdit();
        host.SetChild(se);
        new HeadlessTarget(300, 200, host).Render(dc);
        const fg = (innerTextBox(se) as { get_property_value(k: unknown): unknown })
            .get_property_value(TextBlock.ForegroundKey);
        assert.equal(fg, ink, 'inner TextBox inherits the ancestor foreground');
    });
});
