import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    Application,
    Color,
    Setter,
    Style,
} from '../index.js';
import { Border } from '../../basic/border.js';
import { ContentControl } from '../../framework/content-control.js';
import { ControlTemplate } from '../../basic/templates/control-template.js';
import { ContentPresenter } from '../../basic/templates/content-presenter.js';
import { HeadlessTarget, SolidColorBrush } from '../../visual-engine/index.js';

// § 11.2 — A Style[TargetType=Button] (or any [TargetType=X]) sitting on
// app-level / consumer-side Resources must reach Visuals living INSIDE
// another control's ControlTemplate. WPF parity: implicit styles
// "punch through" template boundaries via the templatedParent fallback.

describe('§ 11.2 — implicit Style crosses template boundaries', () => {

    beforeEach(() => { Application.current = null; });

    test('Style[TargetType=Border] at app root reaches a Border inside another control\'s template', () => {
        const app = new Application();

        // App-level implicit style for ALL Borders. Sets Background to a
        // distinctive brush so we can identify which path won.
        const accent = new SolidColorBrush(Color.FromHex('#bada55'));
        const borderStyle = new Style(
            Border,
            [new Setter(Border, 'Background', accent)],
        );
        app.Resources.Set(Border, borderStyle);

        // A custom ContentControl with a template that embeds a Border.
        // The Border is template-internal: its visualParent is the
        // template root chain, logicalParent stays undefined,
        // templatedParent = the ContentControl.
        let capturedInnerBorder: Border | undefined;
        const cc = new ContentControl();
        cc.Template = new ControlTemplate(_tp => {
            const root = new Border();
            const inner = new Border();
            capturedInnerBorder = inner;
            const presenter = new ContentPresenter();
            inner.SetChild(presenter);
            root.SetChild(inner);
            return root;
        });

        // Mount the whole thing so AttachLogical fires and styles
        // resolve through the full chain.
        const target = new HeadlessTarget(200, 200);
        target.Content = cc;

        assert.ok(capturedInnerBorder !== undefined,
            'template factory ran and captured the inner Border');
        // Without 11.2, the inner Border can't see the app-level Style →
        // Background stays at its default. With 11.2, the templatedParent
        // fallback in TryFindResource carries the lookup up to Application
        // and the Style applies.
        assert.equal(capturedInnerBorder!.Background, accent,
            'app-level Style[TargetType=Border] applied to template-internal Border');
    });

    test('Style on the TEMPLATED CONTROL\'s own Resources reaches its template internals', () => {
        new Application();

        // No app-level style. Style lives on the ContentControl itself —
        // typical pattern for restyling chrome bits per-usage.
        const accent = new SolidColorBrush(Color.FromHex('#ff8800'));
        const borderStyle = new Style(
            Border,
            [new Setter(Border, 'Background', accent)],
        );

        let capturedInnerBorder: Border | undefined;
        const cc = new ContentControl();
        cc.Resources.Set(Border, borderStyle);
        cc.Template = new ControlTemplate(_tp => {
            const root = new Border();
            const inner = new Border();
            capturedInnerBorder = inner;
            const presenter = new ContentPresenter();
            inner.SetChild(presenter);
            root.SetChild(inner);
            return root;
        });

        const target = new HeadlessTarget(200, 200);
        target.Content = cc;

        assert.equal(capturedInnerBorder!.Background, accent,
            'consumer-side Style on ContentControl.Resources applied to its template-internal Border');
    });

    test('Style added to app Resources AFTER the templated control is attached re-resolves through templatedParent', () => {
        const app = new Application();

        let capturedInnerBorder: Border | undefined;
        const cc = new ContentControl();
        cc.Template = new ControlTemplate(_tp => {
            const root = new Border();
            const inner = new Border();
            capturedInnerBorder = inner;
            const presenter = new ContentPresenter();
            inner.SetChild(presenter);
            root.SetChild(inner);
            return root;
        });

        const target = new HeadlessTarget(200, 200);
        target.Content = cc;

        // No style yet — Background should be the Border default
        // (transparent / undefined).
        const originalBackground = capturedInnerBorder!.Background;

        // Now register the style. The Application.Resources subscription
        // wired by subscribe_styles must fire and re-resolve the implicit
        // style for the template-internal Border.
        const accent = new SolidColorBrush(Color.FromHex('#0099cc'));
        const borderStyle = new Style(
            Border,
            [new Setter(Border, 'Background', accent)],
        );
        app.Resources.Set(Border, borderStyle);

        assert.notEqual(capturedInnerBorder!.Background, originalBackground);
        assert.equal(capturedInnerBorder!.Background, accent,
            'late-arriving app-level Style cascaded into template-internal Border via the subscription chain');
    });
});
