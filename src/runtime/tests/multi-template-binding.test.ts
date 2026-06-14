import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { Application, MultiTemplateBinding, Visual } from '../index.js';
import { Border } from '../../basic/border.js';
import { ContentControl } from '../../framework/content-control.js';
import { ControlTemplate } from '../../basic/templates/control-template.js';
import { ContentPresenter } from '../../basic/templates/content-presenter.js';
import { HeadlessTarget } from '../../visual-engine/index.js';

// § 11.1 — MultiBinding for TemplateBinding. The converter runs on
// every source-property change with the latest snapshot of all watched
// values; the result is pushed through to the target DP via the standard
// one-way Binding pipeline.

describe('§ 11.1 — MultiTemplateBinding combines N properties on the templated parent', () => {

    beforeEach(() => { Application.current = null; });

    test('initial value: converter runs eagerly at construction', () => {
        new Application();

        const cc = new ContentControl();
        // Use Width / Height as the two sources — both numeric, easy to
        // distinguish from a default.
        cc.Width  = 5;
        cc.Height = 7;

        let captured: Border | undefined;
        cc.Template = new ControlTemplate(tp => {
            const b = new Border();
            captured = b;
            // Store the converter-combined sum on b.Width — also a number
            // DP, no brush plumbing needed for the test.
            b.set_property_value(Border.WidthKey,
                MultiTemplateBinding(tp,
                    ['Width', 'Height'],
                    (w: number, h: number) => w + h));
            b.SetChild(new ContentPresenter());
            return b;
        });

        new HeadlessTarget(200, 200).Content = cc;

        // 5 + 7 = 12 should be the initial Width on the template-internal
        // Border.
        assert.equal(captured!.Width, 12);
    });

    test('any source change re-fires the converter with the latest snapshot', () => {
        new Application();

        const cc = new ContentControl();
        cc.Width  = 10;
        cc.Height = 20;

        let captured: Border | undefined;
        cc.Template = new ControlTemplate(tp => {
            const b = new Border();
            captured = b;
            b.set_property_value(Border.WidthKey,
                MultiTemplateBinding(tp,
                    ['Width', 'Height'],
                    (w: number, h: number) => w * h));
            b.SetChild(new ContentPresenter());
            return b;
        });
        new HeadlessTarget(200, 200).Content = cc;

        assert.equal(captured!.Width, 200);

        // Change ONE source — converter sees the new value alongside
        // the still-current other.
        cc.Width = 11;
        assert.equal(captured!.Width, 11 * 20);

        // Change the OTHER source — converter re-fires again.
        cc.Height = 21;
        assert.equal(captured!.Width, 11 * 21);
    });

    test('converter sees three sources and re-computes whenever any one flips', () => {
        new Application();

        const cc = new ContentControl();
        cc.Width    = 1;
        cc.Height   = 2;
        cc.Opacity  = 3;

        let captured: Border | undefined;
        cc.Template = new ControlTemplate(tp => {
            const b = new Border();
            captured = b;
            // Sum three sources to verify the variadic converter call.
            b.set_property_value(Border.WidthKey,
                MultiTemplateBinding(tp,
                    ['Width', 'Height', 'Opacity'],
                    (...nums: number[]) => nums.reduce((a, b) => a + b, 0)));
            b.SetChild(new ContentPresenter());
            return b;
        });
        new HeadlessTarget(200, 200).Content = cc;

        assert.equal(captured!.Width, 6);
        cc.Opacity = 30;
        assert.equal(captured!.Width, 33);
    });

    test('dispose drops every listener when a new binding replaces the old on the same DP', () => {
        new Application();

        const cc = new ContentControl();
        cc.Width  = 1;
        cc.Height = 1;

        let captured: Border | undefined;
        cc.Template = new ControlTemplate(tp => {
            const b = new Border();
            captured = b;
            b.set_property_value(Border.WidthKey,
                MultiTemplateBinding(tp,
                    ['Width', 'Height'],
                    (w: number, h: number) => w + h));
            b.SetChild(new ContentPresenter());
            return b;
        });
        new HeadlessTarget(200, 200).Content = cc;

        assert.equal(captured!.Width, 2);

        // Replace the binding on the SAME DP — the old binding's
        // dispose() runs through the EVD's swap path, which clears the
        // listeners it installed on the templated parent. After the
        // swap, mutating cc.Width / cc.Height must NOT touch the new
        // local Width.
        captured!.set_property_value(Border.WidthKey, 42);
        cc.Width  = 999;
        cc.Height = 999;
        assert.equal(captured!.Width, 42,
            'old MultiTemplateBinding listeners removed when its DP slot was overwritten');
    });
});

// Suppress unused-import lint — `Visual` participates in the templated-
// parent type contract even though the test doesn't reference it
// directly.
void (undefined as Visual | undefined);
