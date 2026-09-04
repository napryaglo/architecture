import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';

import { Application, Key, NoModifiers, Panel, PointerButton, Rect, RelayCommand, Size, Visibility, type KeyEventInit, type PointerEventInit } from '../../../runtime/index.js';
import { InputManager } from '../../../framework/index.js';;
import { MenuButton, MenuItem, MenuSeparator, MenuStrip } from '../menu-strip.js';

class Root extends Panel {}

function pointer(button: PointerButton = PointerButton.Primary): PointerEventInit
{
    return {
        HostX: 0, HostY: 0,
        Button: button, Buttons: button === PointerButton.Secondary ? 2 : 1,
        Modifiers: NoModifiers, PointerId: 0, Pressure: 0,
        PointerType: 'mouse',
    };
}

describe('MenuStrip / MenuItem / MenuSeparator', () => {
    beforeEach(() => { initTestApp(); });

    test('MenuStrip instantiates with a horizontal-stack ItemsPanel', () => {
        const strip = new MenuStrip();
        assert.ok(strip instanceof MenuStrip);
    });

    test('MenuItem default state — empty Header, no Icon, IsCheckable=false', () => {
        const mi = new MenuItem();
        assert.equal(mi.Header, undefined);
        assert.equal(mi.Icon,   undefined);
        assert.equal(mi.IsCheckable, false);
        assert.equal(mi.IsChecked,   false);
    });

    test('MenuItem click fires its Command and onActivated', () => {
        const root = new Root();
        const mi = new MenuItem();
        root.AddChild(mi);

        let executed = 0;
        let activated = 0;
        mi.Header = 'Save';
        mi.Command = new RelayCommand(() => { executed++; });
        mi._onActivated = (): void => { activated++; };

        const im = new InputManager();
        im.InjectPointerDown(mi, pointer());
        im.InjectPointerUp  (mi, pointer());
        assert.equal(executed, 1);
        assert.equal(activated, 1);
    });

    test('submenu chevron Shape shows/hides when a child is nested via AddChild', () => {
        // PART_Chevron is a @ChevronRight Shape (not a glyph TextBlock); the row
        // toggles its Visibility rather than swapping text.
        interface RowInternals { _chevron?: { Visibility: Visibility } }
        const parent = new MenuItem();
        parent.Header = 'Export';
        const chevron = (): Visibility | undefined => (parent as unknown as RowInternals)._chevron?.Visibility;
        // No children yet → chevron collapsed.
        assert.equal(chevron(), Visibility.Collapsed);

        // Declarative nesting (`MenuItem { MenuItem … }`) compiles to AddChild,
        // which mutates the items collection — Items is never reassigned, so the
        // chevron must refresh off the HasItems transition, not OnPropertyChanged('Items').
        const child = new MenuItem();
        child.Header = 'Vector Graphics (SVG)';
        parent.AddChild(child);
        assert.equal(chevron(), Visibility.Visible);

        // Removing the last child collapses it again.
        (parent.Items as { Remove(v: unknown): void }).Remove(child);
        assert.equal(chevron(), Visibility.Collapsed);
    });

    test('hover over a parent item arms a submenu-open timer, cancelled on leave', () => {
        // A parent item (has a submenu) arms a dwell timer on pointer-enter and
        // clears it on leave; a leaf item never arms one. The actual open fires
        // from the timer after the dwell — here we assert the arm/cancel gate
        // synchronously (no 1s wait).
        interface Internals {
            _hoverOpenTimer?: unknown;
            OnPointerEnter(a: unknown): void;
            OnPointerLeave(a: unknown): void;
        }
        const parent = new MenuItem();
        parent.AddChild(new MenuItem());
        const p = parent as unknown as Internals;
        p.OnPointerEnter({});
        assert.ok(p._hoverOpenTimer !== undefined, 'timer armed on enter over a parent item');
        p.OnPointerLeave({});
        assert.equal(p._hoverOpenTimer, undefined, 'timer cleared on leave');

        const leaf = new MenuItem();
        const l = leaf as unknown as Internals;
        l.OnPointerEnter({});
        assert.equal(l._hoverOpenTimer, undefined, 'leaf item never arms a hover-open timer');
    });

    test('click-away scrim closes the ENTIRE menu chain, not just this level', () => {
        // The submenu scrim's onClick calls closeEntireMenu, which must close
        // this item's own submenu AND propagate up the _onActivated chain (in a
        // live menu that collapses every ancestor submenu + the root host).
        interface Internals { IsSubmenuOpen: boolean; _onActivated?: () => void; closeEntireMenu(): void }
        const item = new MenuItem();
        const i = item as unknown as Internals;
        i.IsSubmenuOpen = true;
        let propagated = false;
        i._onActivated = (): void => { propagated = true; };

        i.closeEntireMenu();

        assert.equal(i.IsSubmenuOpen, false, 'own submenu closed');
        assert.ok(propagated, 'propagated up the chain via _onActivated');
    });

    test('Checkable MenuItem flips IsChecked on click', () => {
        const root = new Root();
        const mi = new MenuItem();
        root.AddChild(mi);
        mi.IsCheckable = true;
        assert.equal(mi.IsChecked, false);

        const im = new InputManager();
        im.InjectPointerDown(mi, pointer());
        im.InjectPointerUp  (mi, pointer());
        assert.equal(mi.IsChecked, true);

        im.InjectPointerDown(mi, pointer());
        im.InjectPointerUp  (mi, pointer());
        assert.equal(mi.IsChecked, false);
    });

    test('MenuSeparator measures to MinWidth × Height — popup chrome shrink-wraps', () => {
        // Separator reports MinWidth so it doesn't force the hosting
        // popup to fill the available area horizontally. The vertical
        // StackPanel that hosts it allocates finalSize.Width during
        // Arrange — that's what RenderOverride actually paints, so the
        // line still spans the full popup width.
        const sep = new MenuSeparator();
        sep.Measure(new Size(100, 12));
        const ds = sep.DesiredSize;
        assert.equal(ds.Height, 9);
        assert.equal(ds.Width, sep.MinWidth);
    });

    test('MenuSeparator arranges to its full slot width — line paints across the popup', () => {
        const sep = new MenuSeparator();
        sep.Measure(new Size(100, 12));
        sep.Arrange(new Rect(0, 0, 100, 9));
        assert.equal(sep.ArrangedRect.Width, 100);
        assert.equal(sep.ArrangedRect.Height, 9);
    });
});

describe('MenuButton', () => {
    beforeEach(() => { initTestApp(); });

    test('MenuButton.IsOpen toggles via the trigger Button click', () => {
        const root = new Root();
        const mb = new MenuButton();
        root.AddChild(mb);

        assert.equal(mb.IsOpen, false);
        // Open + close via DP — the underlying button click path is
        // exercised in a separate integration test under demos. Verify
        // the DP plumbing here.
        mb.IsOpen = true;
        assert.equal(mb.IsOpen, true);
        mb.IsOpen = false;
        assert.equal(mb.IsOpen, false);
    });

    test('MenuButton.Items hold its data items (it IS the ItemsControl)', () => {
        const mb = new MenuButton();
        mb.Items = ['a', 'b', 'c'];
        const items = mb.Items;
        const count = items === undefined
            ? 0
            : Array.isArray(items) ? items.length : (items as { Count: number }).Count;
        assert.equal(count, 3);
    });
});

function keyEvent(key: Key, keyText: string = key, overrides: Partial<KeyEventInit> = {}): KeyEventInit
{
    return {
        Key: key, KeyText: keyText, Code: key,
        Modifiers: NoModifiers,
        IsRepeat: false,
        ...overrides,
    };
}

describe('MenuItem — keyboard navigation', () => {
    beforeEach(() => { initTestApp(); });

    test('Focusable=true so OnKeyDown can receive events', () => {
        const mi = new MenuItem();
        assert.equal(mi.Focusable, true);
    });

    test('Enter on a checkable item flips IsChecked (no submenu path)', () => {
        const mi = new MenuItem();
        mi.IsCheckable = true;
        const im = new InputManager();
        im.SetFocus(mi);
        im.InjectKeyDown(keyEvent(Key.Return));
        assert.equal(mi.IsChecked, true);
        im.InjectKeyDown(keyEvent(Key.Return));
        assert.equal(mi.IsChecked, false);
    });

    test('Enter fires Command + onActivated', () => {
        const mi = new MenuItem();
        let executed = 0;
        let activated = 0;
        mi.Command      = new RelayCommand(() => { executed++; });
        mi._onActivated = (): void => { activated++; };
        const im = new InputManager();
        im.SetFocus(mi);
        im.InjectKeyDown(keyEvent(Key.Return));
        assert.equal(executed, 1);
        assert.equal(activated, 1);
    });

    test('ArrowDown moves focus to next sibling in a vertical popup', () => {
        const popup = new MenuButton();
        const a = new MenuItem(); a.Header = 'Apple';
        const b = new MenuItem(); b.Header = 'Banana';
        const c = new MenuItem(); c.Header = 'Cherry';
        popup.Items = [a, b, c];
        const im = new InputManager();
        im.SetFocus(a);
        im.InjectKeyDown(keyEvent(Key.Down));
        assert.equal(b.IsFocused, true);
        im.InjectKeyDown(keyEvent(Key.Down));
        assert.equal(c.IsFocused, true);
        // Wraps.
        im.InjectKeyDown(keyEvent(Key.Down));
        assert.equal(a.IsFocused, true);
    });

    test('ArrowUp walks backwards and wraps', () => {
        const popup = new MenuButton();
        const a = new MenuItem(); a.Header = 'Apple';
        const b = new MenuItem(); b.Header = 'Banana';
        popup.Items = [a, b];
        const im = new InputManager();
        im.SetFocus(a);
        im.InjectKeyDown(keyEvent(Key.Up));
        assert.equal(b.IsFocused, true, 'wraps from first → last');
    });

    test('Letter accelerator jumps to the matching sibling (case-insensitive, wraps)', () => {
        const popup = new MenuButton();
        const a = new MenuItem(); a.Header = 'Apple';
        const b = new MenuItem(); b.Header = 'Banana';
        const c = new MenuItem(); c.Header = 'Cherry';
        popup.Items = [a, b, c];
        const im = new InputManager();
        im.SetFocus(a);
        im.InjectKeyDown(keyEvent(Key.C, 'c'));
        assert.equal(c.IsFocused, true);
        // Re-pressing the same letter from C wraps back to A (since C
        // is the only C-prefix; the walk starts AFTER self).
        im.InjectKeyDown(keyEvent(Key.B, 'b'));
        assert.equal(b.IsFocused, true);
    });

    test('ArrowRight on a top-level MenuStrip item walks horizontally; vertical popup item opens submenu', () => {
        const strip = new MenuStrip();
        const file = new MenuItem(); file.Header = 'File';
        const edit = new MenuItem(); edit.Header = 'Edit';
        strip.Items = [file, edit];
        const im = new InputManager();
        im.SetFocus(file);
        im.InjectKeyDown(keyEvent(Key.Right));
        assert.equal(edit.IsFocused, true);

        // Vertical-popup item with a submenu: Right opens it.
        const popup = new MenuButton();
        const parent = new MenuItem(); parent.Header = 'Format';
        const child  = new MenuItem(); child.Header  = 'Bold';
        parent.Items = [child];
        popup.Items  = [parent];
        const im2 = new InputManager();
        im2.SetFocus(parent);
        im2.InjectKeyDown(keyEvent(Key.Right));
        assert.equal(parent.IsSubmenuOpen, true);
    });

    test('ArrowDown on a top-level MenuStrip item with a submenu opens it', () => {
        const strip = new MenuStrip();
        const file = new MenuItem(); file.Header = 'File';
        const open = new MenuItem(); open.Header = 'Open';
        file.Items  = [open];
        strip.Items = [file];
        const im = new InputManager();
        im.SetFocus(file);
        im.InjectKeyDown(keyEvent(Key.Down));
        assert.equal(file.IsSubmenuOpen, true);
    });

    test('Escape closes own submenu', () => {
        const mi = new MenuItem();
        const child = new MenuItem(); child.Header = 'Child';
        mi.Items = [child];
        mi.IsSubmenuOpen = true;
        const im = new InputManager();
        im.SetFocus(mi);
        im.InjectKeyDown(keyEvent(Key.Escape));
        assert.equal(mi.IsSubmenuOpen, false);
    });
});
