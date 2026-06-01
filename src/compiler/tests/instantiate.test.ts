import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { instantiate } from '../compile.js';
import * as runtime from '../../runtime/index.js';
import * as controls from '../../Controls/index.js';
import * as engine from '../../visual-engine/index.js';
import { Application, Style, Color, Thickness } from '../../runtime/index.js';
import { Border, Canvas } from '../../Controls/index.js';
import { SolidColorBrush } from '../../visual-engine/index.js';

// End-to-end smoke. Compiles source to JS, evals against the real
// runtime, and asserts on the resulting object graph. Catches integration
// bugs between the emitter and the existing runtime APIs that pure
// source-string tests miss.

const CTX: Record<string, unknown> = {
    ...runtime,
    ...controls,
    ...engine,
};

function buildApp(src: string): Application
{
    const result = instantiate(src, CTX);
    return result as Application;
}

describe('instantiate — happy path', () => {
    beforeEach(() => { Application.current = null; });

    test('Application with no resources mounts cleanly', () => {
        const app = buildApp(`Application{ resources: {} }`);
        assert.ok(app instanceof Application);
        assert.equal(app.Root, undefined);
    });

    test('@primary brush registered as a runtime SolidColorBrush', () => {
        const app = buildApp(`
            Application{ resources: {
                @primary = #4caf50
            } }
        `);
        const brush = app.Resources.Resolve('primary');
        assert.ok(brush instanceof SolidColorBrush);
        // The brush carries a Color built from the hex.
        const c = (brush as SolidColorBrush).Color;
        assert.equal(c.R, 0x4c);
        assert.equal(c.G, 0xaf);
        assert.equal(c.B, 0x50);
    });

    test('Border marked x:root becomes Application.Root', () => {
        const app = buildApp(`
            Application{ resources: {
                Border x:root[Padding=(16)]{}
            } }
        `);
        assert.ok(app.Root instanceof Border);
        // Padding=(16) → Thickness(16) all sides.
        const padding = (app.Root as Border).Padding as Thickness;
        assert.equal(padding.Left,   16);
        assert.equal(padding.Top,    16);
        assert.equal(padding.Right,  16);
        assert.equal(padding.Bottom, 16);
    });

    test('Canvas with attached Canvas.Left / Canvas.Top placement', () => {
        const app = buildApp(`
            Application{ resources: {
                Canvas x:root{
                    Border[Canvas.Left=10, Canvas.Top=20]{}
                    Border[Canvas.Left=30, Canvas.Top=40]{}
                }
            } }
        `);
        const canvas = app.Root as Canvas;
        const kids = [...canvas.Children];
        assert.equal(kids.length, 2);
        assert.equal(Canvas.GetLeft(kids[0]!), 10);
        assert.equal(Canvas.GetTop(kids[0]!),  20);
        assert.equal(Canvas.GetLeft(kids[1]!), 30);
        assert.equal(Canvas.GetTop(kids[1]!),  40);
    });

    test('Border > Border parent-child via single-element slot', () => {
        const app = buildApp(`
            Application{ resources: {
                Border x:root{
                    Border[Padding=(4)]{}
                }
            } }
        `);
        const outer = app.Root as Border;
        const inner = outer.child as Border;
        assert.ok(inner instanceof Border);
        assert.equal((inner.Padding as Thickness).Left, 4);
    });

    test('implicit Style registered by TargetType — runtime auto-applies', () => {
        const app = buildApp(`
            Application{ resources: {
                @primary = #4caf50
                style[targettype=Border]{ Background = @primary; }
                Border x:root{}
            } }
        `);
        // The Style sits in Resources keyed by Border.
        const s = app.Resources.Resolve(Border);
        assert.ok(s instanceof Style);
        // Border's resolved Background — Style is implicit, target is
        // the rooted Border. The style applies via the existing
        // resolve_implicit_style path. The actual property resolution
        // requires the Visual to attach to the logical tree; here it
        // hasn't, so just verify the registration shape.
        assert.equal((s as Style).TargetType, Border);
        assert.equal((s as Style).Setters.length, 1);
    });

    test('Style with PropertyTrigger lands with its setters', () => {
        const app = buildApp(`
            Application{ resources: {
                style[targettype=Border]{
                    Background = #ffffff;
                    when( IsMouseOver ){
                        Background = #eeeeee;
                    }
                }
            } }
        `);
        const s = app.Resources.Resolve(Border) as Style;
        assert.equal(s.Triggers.length, 1);
        const trig = s.Triggers[0]!;
        assert.equal(trig.propertyName, 'IsMouseOver');
        assert.equal(trig.value,         true);
        assert.equal(trig.setters.length, 1);
    });

    test('Application.current points at the freshly-built app', () => {
        const app = buildApp(`Application{ resources: {} }`);
        assert.equal(Application.current, app);
    });
});
