import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    Application,
    NoModifiers,
    PointerButton,
    type KeyEventInit,
    type ModifierKeys,
    type PointerEventInit,
} from '../../runtime/index.js';
import { HeadlessTarget } from '../../visual-engine/index.js';
import { SpinEdit } from '../spin-edit.js';
import { TextBox } from '../text-box.js';
import { ClickableBorder } from '../combo-box.js';

function pointer(overrides: Partial<PointerEventInit> = {}): PointerEventInit
{
    return {
        HostX:       0,
        HostY:       0,
        Button:      PointerButton.Primary,
        Buttons:     1,
        Modifiers:   NoModifiers,
        PointerId:   0,
        Pressure:    0,
        PointerType: 'mouse',
        ...overrides,
    };
}

function key(k: string, mods: Partial<ModifierKeys> = {}, code?: string): KeyEventInit
{
    return {
        Key:       k,
        Code:      code ?? k,
        Modifiers: { ...NoModifiers, ...mods },
        IsRepeat:  false,
    };
}

// Stand up a SpinEdit inside a HeadlessTarget so pointer + keyboard
// dispatch and measure all flow end-to-end. Mounting directly as the
// target's Content (no Panel wrapper) keeps the SpinEdit's Measure
// pass running — a wrapping Panel's default MeasureOverride returns
// Size.Zero and never measures children, which would leave the inner
// TextBox's editor unmeasured.
function fixture(): {
    sp:        SpinEdit;
    target:    HeadlessTarget;
    inner:     TextBox;
    up:        ClickableBorder;
    down:      ClickableBorder;
}
{
    const sp = new SpinEdit();
    const target = new HeadlessTarget(200, 60);
    target.Content = sp;
    target.Flush();

    // Reach into the SpinEdit's private template parts so tests can
    // assert against them and route pointer events at them. Keeps the
    // public surface small — the inner TextBox + buttons are
    // implementation details consumers shouldn't depend on.
    const inner = (sp as unknown as { _textBox:    TextBox }       )._textBox;
    const up    = (sp as unknown as { _upButton:   ClickableBorder })._upButton;
    const down  = (sp as unknown as { _downButton: ClickableBorder })._downButton;
    return { sp, target, inner, up, down };
}

describe('SpinEdit — defaults', () => {
    beforeEach(() => { Application.current = null; });

    test('Default Value is 0, DecimalPlaces=0, SmallChange=1, LargeChange=10', () => {
        const sp = new SpinEdit();
        assert.equal(sp.Value,         0);
        assert.equal(sp.DecimalPlaces, 0);
        assert.equal(sp.SmallChange,   1);
        assert.equal(sp.LargeChange,   10);
        assert.equal(sp.IsReadOnly,    false);
    });

    test('Inner TextBox display reflects the formatted Value at construction', () => {
        const { inner } = fixture();
        assert.equal(inner.Text, '0');
    });
});

describe('SpinEdit — buttons', () => {
    beforeEach(() => { Application.current = null; });

    test('Click ▴ increments by SmallChange', () => {
        const { sp, target, up } = fixture();
        sp.Value = 5;

        target.InputManager.InjectPointerDown(up, pointer());
        target.InputManager.InjectPointerUp  (up, pointer());
        assert.equal(sp.Value, 6);

        sp.SmallChange = 3;
        target.InputManager.InjectPointerDown(up, pointer());
        target.InputManager.InjectPointerUp  (up, pointer());
        assert.equal(sp.Value, 9);
    });

    test('Click ▾ decrements by SmallChange', () => {
        const { sp, target, down } = fixture();
        sp.Value = 5;

        target.InputManager.InjectPointerDown(down, pointer());
        target.InputManager.InjectPointerUp  (down, pointer());
        assert.equal(sp.Value, 4);
    });

    test('Display updates after a button click', () => {
        const { sp, target, inner, up } = fixture();
        sp.Value = 7;
        assert.equal(inner.Text, '7');

        target.InputManager.InjectPointerDown(up, pointer());
        target.InputManager.InjectPointerUp  (up, pointer());
        assert.equal(inner.Text, '8');
    });

    test('Click ▴ clamps at Maximum', () => {
        const { sp, target, up } = fixture();
        sp.Maximum = 10;
        sp.Value   = 10;
        target.InputManager.InjectPointerDown(up, pointer());
        target.InputManager.InjectPointerUp  (up, pointer());
        assert.equal(sp.Value, 10);
    });

    test('Click ▾ clamps at Minimum', () => {
        const { sp, target, down } = fixture();
        sp.Minimum = 0;
        sp.Value   = 0;
        target.InputManager.InjectPointerDown(down, pointer());
        target.InputManager.InjectPointerUp  (down, pointer());
        assert.equal(sp.Value, 0);
    });

    test('IsReadOnly suppresses button clicks', () => {
        const { sp, target, up, down } = fixture();
        sp.Value      = 5;
        sp.IsReadOnly = true;
        target.InputManager.InjectPointerDown(up, pointer());
        target.InputManager.InjectPointerUp  (up, pointer());
        target.InputManager.InjectPointerDown(down, pointer());
        target.InputManager.InjectPointerUp  (down, pointer());
        assert.equal(sp.Value, 5);
    });
});

describe('SpinEdit — keyboard', () => {
    beforeEach(() => { Application.current = null; });

    test('ArrowUp increments by SmallChange (intercepted in tunnel)', () => {
        const { sp, target, inner } = fixture();
        sp.Value = 5;
        target.InputManager.SetFocus(inner);

        const handled = target.InputManager.InjectKeyDown(key('ArrowUp'));
        assert.equal(handled, true, 'SpinEdit should mark ArrowUp Handled in preview');
        assert.equal(sp.Value, 6);
    });

    test('ArrowDown decrements by SmallChange', () => {
        const { sp, target, inner } = fixture();
        sp.Value = 5;
        target.InputManager.SetFocus(inner);

        target.InputManager.InjectKeyDown(key('ArrowDown'));
        assert.equal(sp.Value, 4);
    });

    test('PageUp / PageDown use LargeChange', () => {
        const { sp, target, inner } = fixture();
        sp.LargeChange = 25;
        sp.Value       = 100;
        target.InputManager.SetFocus(inner);

        target.InputManager.InjectKeyDown(key('PageUp'));
        assert.equal(sp.Value, 125);

        target.InputManager.InjectKeyDown(key('PageDown'));
        assert.equal(sp.Value, 100);
    });

    test('ArrowUp does NOT reach the inner TextBox caret model', () => {
        const { sp, target, inner } = fixture();
        sp.Value = 5;
        target.InputManager.SetFocus(inner);
        // Make sure inner's CaretIndex isn't touched — TextBox's own
        // ArrowUp moves to text edge; SpinEdit intercepts before that.
        const caretBefore = inner.CaretIndex;
        target.InputManager.InjectKeyDown(key('ArrowUp'));
        assert.equal(inner.CaretIndex, caretBefore);
    });

    test('IsReadOnly suppresses Arrow / Page steps but still marks Handled', () => {
        const { sp, target, inner } = fixture();
        sp.Value      = 5;
        sp.IsReadOnly = true;
        target.InputManager.SetFocus(inner);

        const handled = target.InputManager.InjectKeyDown(key('ArrowUp'));
        // Still Handled — we don't want ArrowUp to leak through and
        // step the TextBox's caret even in read-only mode.
        assert.equal(handled, true);
        assert.equal(sp.Value, 5);
    });
});

describe('SpinEdit — Text commit', () => {
    beforeEach(() => { Application.current = null; });

    test('Enter commits the inner Text into Value', () => {
        const { sp, target, inner } = fixture();
        target.InputManager.SetFocus(inner);
        inner.Text = '42';

        const handled = target.InputManager.InjectKeyDown(key('Enter'));
        assert.equal(handled, true);
        assert.equal(sp.Value,   42);
        assert.equal(inner.Text, '42');
    });

    test('Blur (focus leaves the inner TextBox) commits the typed text', () => {
        const { sp, target, inner } = fixture();
        target.InputManager.SetFocus(inner);
        inner.Text = '17';

        target.InputManager.SetFocus(undefined);
        assert.equal(sp.Value,   17);
        assert.equal(inner.Text, '17');
    });

    test('Invalid text on commit reverts the display to the current Value', () => {
        const { sp, target, inner } = fixture();
        sp.Value = 5;
        target.InputManager.SetFocus(inner);
        inner.Text = 'not a number';

        target.InputManager.InjectKeyDown(key('Enter'));
        assert.equal(sp.Value,   5);
        assert.equal(inner.Text, '5');
    });

    test('Commit clamps to [Minimum, Maximum]', () => {
        const { sp, target, inner } = fixture();
        sp.Minimum = 0;
        sp.Maximum = 100;
        target.InputManager.SetFocus(inner);

        inner.Text = '999';
        target.InputManager.InjectKeyDown(key('Enter'));
        assert.equal(sp.Value,   100);
        assert.equal(inner.Text, '100');

        inner.Text = '-50';
        target.InputManager.InjectKeyDown(key('Enter'));
        assert.equal(sp.Value,   0);
        assert.equal(inner.Text, '0');
    });

    test('Infinity / NaN typed text is rejected (display reverts)', () => {
        const { sp, target, inner } = fixture();
        sp.Value = 7;
        target.InputManager.SetFocus(inner);

        inner.Text = 'Infinity';
        target.InputManager.InjectKeyDown(key('Enter'));
        assert.equal(sp.Value,   7,   'Infinity must not commit');
        assert.equal(inner.Text, '7');

        inner.Text = 'NaN';
        target.InputManager.InjectKeyDown(key('Enter'));
        assert.equal(sp.Value,   7);
        assert.equal(inner.Text, '7');
    });

    test('Empty text on commit reverts to the current Value', () => {
        const { sp, target, inner } = fixture();
        sp.Value = 3;
        target.InputManager.SetFocus(inner);

        inner.Text = '';
        target.InputManager.InjectKeyDown(key('Enter'));
        assert.equal(sp.Value,   3);
        assert.equal(inner.Text, '3');
    });
});

describe('SpinEdit — DecimalPlaces formatting + rounding', () => {
    beforeEach(() => { Application.current = null; });

    test('DecimalPlaces=2 formats the display with two decimals', () => {
        const { sp, inner } = fixture();
        sp.DecimalPlaces = 2;
        sp.Value         = 5;
        assert.equal(inner.Text, '5.00');

        sp.Value = 3.1;
        assert.equal(inner.Text, '3.10');
    });

    test('Commit rounds typed text to DecimalPlaces precision', () => {
        const { sp, target, inner } = fixture();
        sp.DecimalPlaces = 0;
        target.InputManager.SetFocus(inner);

        inner.Text = '1.999';
        target.InputManager.InjectKeyDown(key('Enter'));
        assert.equal(sp.Value, 2, '1.999 with DP=0 rounds to 2 before commit');
        assert.equal(inner.Text, '2');
    });

    test('Display reformats when Value setter is called even if rounded result equals current', () => {
        const { sp, target, inner } = fixture();
        sp.DecimalPlaces = 0;
        sp.Value         = 2;
        target.InputManager.SetFocus(inner);

        // Typing "2.0" then committing leaves Value=2 (same), but the
        // display must clean up to "2" (not "2.0") so SpinEdit doesn't
        // leak the user's intermediate text after blur.
        inner.Text = '2.0';
        target.InputManager.InjectKeyDown(key('Enter'));
        assert.equal(sp.Value,   2);
        assert.equal(inner.Text, '2');
    });
});

describe('SpinEdit — clamping + NaN', () => {
    beforeEach(() => { Application.current = null; });

    test('Value setter clamps to [Minimum, Maximum]', () => {
        const sp = new SpinEdit();
        sp.Minimum = 0;
        sp.Maximum = 10;

        sp.Value = 99;
        assert.equal(sp.Value, 10);

        sp.Value = -5;
        assert.equal(sp.Value, 0);
    });

    test('Value setter ignores NaN, preserving the prior value', () => {
        const sp = new SpinEdit();
        sp.Value = 4;
        sp.Value = Number.NaN;
        assert.equal(sp.Value, 4);
    });

    test('Programmatic Value write keeps display in sync', () => {
        const { sp, inner } = fixture();
        sp.Value = 17;
        assert.equal(inner.Text, '17');

        sp.Value = -3;
        assert.equal(inner.Text, '-3');
    });
});

describe('SpinEdit — IsReadOnly propagation', () => {
    beforeEach(() => { Application.current = null; });

    test('IsReadOnly is forwarded to the inner TextBox', () => {
        const { sp, inner } = fixture();
        assert.equal(inner.IsReadOnly, false);

        sp.IsReadOnly = true;
        assert.equal(inner.IsReadOnly, true);

        sp.IsReadOnly = false;
        assert.equal(inner.IsReadOnly, false);
    });
});
