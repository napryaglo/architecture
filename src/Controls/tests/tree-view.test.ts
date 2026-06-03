import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    Application,
    InputManager,
    NoModifiers,
    PointerButton,
    Rect,
    Size,
    type PointerEventInit,
    type ModifierKeys,
} from '../../runtime/index.js';
import { HeadlessTarget } from '../../visual-engine/index.js';
import { ItemsPresenter } from '../items-presenter.js';
import { ScrollViewer } from '../scroll-viewer.js';
import { StackPanel } from '../stack-panel.js';
import { CollapsibleStack, TreeView, TreeViewItem } from '../tree-view.js';

function pointer(mods: Partial<ModifierKeys> = {}): PointerEventInit
{
    return {
        HostX:       0,
        HostY:       0,
        Button:      PointerButton.Primary,
        Buttons:     1,
        Modifiers:   { ...NoModifiers, ...mods },
        PointerId:   0,
        Pressure:    0,
        PointerType: 'mouse',
    };
}

// Build the typical "Root → A, B" tree with B having two leaf children
// for tests that need an interesting visible-items list.
function buildFixture() {
    const tree = new TreeView();
    const root = new TreeViewItem(); root.Header = 'Root';
    const a    = new TreeViewItem(); a.Header    = 'A';
    const b    = new TreeViewItem(); b.Header    = 'B';
    const b1   = new TreeViewItem(); b1.Header   = 'B1';
    const b2   = new TreeViewItem(); b2.Header   = 'B2';
    root.AddChild(a);
    root.AddChild(b);
    b.AddChild(b1);
    b.AddChild(b2);
    tree.AddChild(root);
    return { tree, root, a, b, b1, b2 };
}

// Drill into a TreeViewItem to its clickable row Border — the bubble
// origin for selection and expand actions. Row is at
//   item._outerStack.children[0]  → _row
function rowOf(item: TreeViewItem) {
    const outerStack = item.visualChildren[0]!;
    return outerStack.visualChildren[0]!;
}

// The chevron sits inside the row inner StackPanel as the second
// child (after the indent spacer).
function chevronOf(item: TreeViewItem) {
    const row = rowOf(item);
    const inner = row.visualChildren[0]!;
    return inner.visualChildren[1]!;
}

// Spacer = first child of the row's inner horizontal stack — its
// Width DP is how much horizontal indent the row applies.
function spacerOf(item: TreeViewItem) {
    const row = rowOf(item);
    const inner = row.visualChildren[0]!;
    return inner.visualChildren[0]!;
}

describe('TreeView — composed-markup tree shape', () => {
    beforeEach(() => { Application.current = null; });

    test('AddChild on TreeView attaches root items both visually and logically', () => {
        const tree = new TreeView();
        const a = new TreeViewItem(); a.Header = 'A';
        tree.AddChild(a);

        // logical via the public read-only views. Identity-compare the
        // items rather than deepEqual'ing the full Visual graph (each
        // TreeViewItem holds a circular tree of template parts that
        // would take minutes to diff).
        assert.equal(tree.logicalChildren.length, 1);
        assert.equal(tree.logicalChildren[0], a);
        assert.equal(tree.RootItems.length, 1);
        assert.equal(tree.RootItems[0], a);
        // ItemsControl-shape visual tree: TreeView → ScrollViewer →
        // ItemsPresenter → items panel (StackPanel) → root rows. The
        // extra ItemsPresenter layer is the slot the ItemsControl
        // base wires the panel into; the StackPanel is built by
        // TreeView.ItemsPanel.
        const sv = tree.visualChildren[0]!;
        assert.ok(sv instanceof ScrollViewer);
        const presenter = sv.visualChildren[0]!;
        assert.ok(presenter instanceof ItemsPresenter);
        const stack = presenter.visualChildren[0]!;
        assert.ok(stack instanceof StackPanel);
        assert.equal(stack.visualChildren.length, 1);
        assert.equal(stack.visualChildren[0], a);
    });

    test('AddChild on TreeViewItem makes the child its logical child but visual child of the wrapper', () => {
        const parent = new TreeViewItem(); parent.Header = 'P';
        const child  = new TreeViewItem(); child.Header  = 'C';
        parent.AddChild(child);

        assert.deepEqual(parent.logicalChildren, [child]);
        assert.deepEqual(parent.SubItems, [child]);
        // ItemsControl-shape visual tree: TreeViewItem's outer stack
        // hosts the row first, then an ItemsPresenter slotting a
        // CollapsibleStack (the items panel) whose children are the
        // sub-rows.
        const outerStack = parent.visualChildren[0]!;
        const childHost  = outerStack.visualChildren[1]!;
        assert.ok(childHost instanceof ItemsPresenter);
        const childWrap  = childHost.visualChildren[0]!;
        assert.ok(childWrap instanceof CollapsibleStack);
        assert.deepEqual(childWrap.visualChildren, [child]);
    });

    test('TreeView rejects non-TreeViewItem children with a clear error', () => {
        const tree = new TreeView();
        assert.throws(() => tree.AddChild(new TreeView()),
            /TreeView only accepts TreeViewItem/);
    });

    test('TreeViewItem rejects non-TreeViewItem children too', () => {
        const item = new TreeViewItem();
        assert.throws(() => item.AddChild(new TreeView()),
            /TreeViewItem only accepts TreeViewItem/);
    });
});

describe('TreeViewItem — expansion behaviour', () => {
    beforeEach(() => { Application.current = null; });

    test('chevron click toggles IsExpanded', () => {
        const item = new TreeViewItem();
        const child = new TreeViewItem();
        item.AddChild(child);
        assert.equal(item.IsExpanded, false);

        const chevron = chevronOf(item);
        const im = new InputManager();
        im.InjectPointerDown(chevron, pointer());
        im.InjectPointerUp  (chevron, pointer());
        assert.equal(item.IsExpanded, true);

        im.InjectPointerDown(chevron, pointer());
        im.InjectPointerUp  (chevron, pointer());
        assert.equal(item.IsExpanded, false);
    });

    test('chevron click stops the row from also selecting (Handled marks the down event)', () => {
        const tree = new TreeView();
        const root = new TreeViewItem();
        const child = new TreeViewItem();
        root.AddChild(child);
        tree.AddChild(root);

        const chevron = chevronOf(root);
        const im = new InputManager();
        im.InjectPointerDown(chevron, pointer());
        im.InjectPointerUp  (chevron, pointer());

        assert.equal(root.IsExpanded, true);
        assert.equal(tree.SelectedItem, undefined,
            'a chevron click must not select the row underneath');
    });

    test('collapsed child rows are arranged at zero size — invisible without detach', () => {
        const { tree, b, b1 } = buildFixture();
        const target = new HeadlessTarget(300, 400);
        target.Content = tree;
        target.Flush();

        // b is collapsed by default → b1 should be arranged at 0×0.
        assert.equal(b.IsExpanded, false);
        assert.equal(b1.ArrangedRect.Width,  0);
        assert.equal(b1.ArrangedRect.Height, 0);

        // Expand b and re-flush — b1 should now have non-zero height.
        b.IsExpanded = true;
        target.Flush();
        assert.ok(b1.ArrangedRect.Height > 0);
    });
});

describe('TreeView — depth indent', () => {
    beforeEach(() => { Application.current = null; });

    test('indent spacer width = depth × TreeView.Indent', () => {
        const { tree, root, a, b1 } = buildFixture();
        // Expand both so b1 actually gets measured at a non-zero size.
        root.IsExpanded = true;
        const b = tree.RootItems[0]!.SubItems[1]!;
        b.IsExpanded = true;

        const target = new HeadlessTarget(300, 400);
        target.Content = tree;
        target.Flush();

        // root sits at depth 0 → no indent.
        assert.equal(spacerOf(root).ArrangedRect.Width, 0);
        // a is a direct child of root → depth 1 → 16 DIPs.
        assert.equal(spacerOf(a).ArrangedRect.Width, 16);
        // b1 is a grandchild → depth 2 → 32 DIPs.
        assert.equal(spacerOf(b1).ArrangedRect.Width, 32);
    });

    test('changing TreeView.Indent re-measures the whole subtree', () => {
        const { tree, root, a } = buildFixture();
        root.IsExpanded = true;
        const target = new HeadlessTarget(300, 400);
        target.Content = tree;
        target.Flush();
        assert.equal(spacerOf(a).ArrangedRect.Width, 16);

        tree.Indent = 24;
        target.Flush();
        assert.equal(spacerOf(a).ArrangedRect.Width, 24);
    });
});

describe('TreeView — selection (multi-select via Ctrl / Shift)', () => {
    beforeEach(() => { Application.current = null; });

    test('plain click selects one item and moves the anchor', () => {
        const { tree, root, a } = buildFixture();
        root.IsExpanded = true;
        const target = new HeadlessTarget(300, 400);
        target.Content = tree;
        target.Flush();

        const im = new InputManager();
        im.InjectPointerDown(rowOf(a), pointer());
        im.InjectPointerUp  (rowOf(a), pointer());

        assert.equal(tree.SelectedItem, a);
        assert.deepEqual(tree.SelectedItems, [a]);
        assert.equal(a.IsSelected, true);
    });

    test('plain click on a different row clears the previous selection', () => {
        const { tree, root, a, b } = buildFixture();
        root.IsExpanded = true;
        const target = new HeadlessTarget(300, 400);
        target.Content = tree;
        target.Flush();

        const im = new InputManager();
        im.InjectPointerDown(rowOf(a), pointer());
        im.InjectPointerUp  (rowOf(a), pointer());
        im.InjectPointerDown(rowOf(b), pointer());
        im.InjectPointerUp  (rowOf(b), pointer());

        assert.equal(a.IsSelected, false);
        assert.equal(b.IsSelected, true);
        assert.deepEqual(tree.SelectedItems, [b]);
    });

    test('Ctrl+click toggles individual rows without clearing the rest', () => {
        const { tree, root, a, b } = buildFixture();
        root.IsExpanded = true;
        const target = new HeadlessTarget(300, 400);
        target.Content = tree;
        target.Flush();

        const im = new InputManager();
        // Plain click on a — anchor=a, selection={a}.
        im.InjectPointerDown(rowOf(a), pointer());
        im.InjectPointerUp  (rowOf(a), pointer());
        // Ctrl+click on b — selection={a, b}.
        im.InjectPointerDown(rowOf(b), pointer({ Control: true }));
        im.InjectPointerUp  (rowOf(b), pointer({ Control: true }));

        const sel = tree.SelectedItems;
        assert.equal(sel.length, 2);
        assert.ok(sel.includes(a));
        assert.ok(sel.includes(b));
        assert.equal(a.IsSelected, true);
        assert.equal(b.IsSelected, true);

        // Ctrl+click on a again — deselects a, keeps b.
        im.InjectPointerDown(rowOf(a), pointer({ Control: true }));
        im.InjectPointerUp  (rowOf(a), pointer({ Control: true }));
        assert.equal(a.IsSelected, false);
        assert.equal(b.IsSelected, true);
        assert.deepEqual(tree.SelectedItems, [b]);
    });

    test('Shift+click extends the selection from anchor to the clicked row, visible-order', () => {
        const { tree, root, a, b, b1, b2 } = buildFixture();
        root.IsExpanded = true;
        b.IsExpanded = true;
        const target = new HeadlessTarget(300, 400);
        target.Content = tree;
        target.Flush();

        // Visible order: root, a, b, b1, b2.
        const im = new InputManager();
        // Plain click on a — anchor=a.
        im.InjectPointerDown(rowOf(a), pointer());
        im.InjectPointerUp  (rowOf(a), pointer());
        // Shift+click on b2 — range [a, b, b1, b2].
        im.InjectPointerDown(rowOf(b2), pointer({ Shift: true }));
        im.InjectPointerUp  (rowOf(b2), pointer({ Shift: true }));

        const sel = new Set(tree.SelectedItems);
        assert.equal(sel.size, 4);
        assert.ok(sel.has(a));
        assert.ok(sel.has(b));
        assert.ok(sel.has(b1));
        assert.ok(sel.has(b2));
        assert.ok(!sel.has(root));
    });

    test('Shift+click skips collapsed subtrees (visible-order range, not document order)', () => {
        const { tree, root, a, b, b1, b2 } = buildFixture();
        root.IsExpanded = true;
        // b is collapsed — b1 + b2 are NOT visible.
        const target = new HeadlessTarget(300, 400);
        target.Content = tree;
        target.Flush();

        const im = new InputManager();
        im.InjectPointerDown(rowOf(a), pointer());
        im.InjectPointerUp  (rowOf(a), pointer());
        im.InjectPointerDown(rowOf(b), pointer({ Shift: true }));
        im.InjectPointerUp  (rowOf(b), pointer({ Shift: true }));

        const sel = new Set(tree.SelectedItems);
        assert.equal(sel.size, 2);
        assert.ok(sel.has(a));
        assert.ok(sel.has(b));
        assert.ok(!sel.has(b1), 'b1 is in a collapsed subtree — not visible, not selected');
        assert.ok(!sel.has(b2));
    });

    test('SelectionChanged fires on every selection-modifying click', () => {
        const { tree, root, a, b } = buildFixture();
        root.IsExpanded = true;
        const target = new HeadlessTarget(300, 400);
        target.Content = tree;
        target.Flush();

        let fired = 0;
        tree.AddSelectionChangedListener(() => { fired++; });

        const im = new InputManager();
        im.InjectPointerDown(rowOf(a), pointer());
        im.InjectPointerUp  (rowOf(a), pointer());
        im.InjectPointerDown(rowOf(b), pointer({ Control: true }));
        im.InjectPointerUp  (rowOf(b), pointer({ Control: true }));
        assert.equal(fired, 2);
    });

    test('ClearSelection drops every selected item AND fires SelectionChanged', () => {
        const { tree, root, a, b } = buildFixture();
        root.IsExpanded = true;
        const target = new HeadlessTarget(300, 400);
        target.Content = tree;
        target.Flush();

        const im = new InputManager();
        im.InjectPointerDown(rowOf(a), pointer());
        im.InjectPointerUp  (rowOf(a), pointer());
        im.InjectPointerDown(rowOf(b), pointer({ Control: true }));
        im.InjectPointerUp  (rowOf(b), pointer({ Control: true }));
        assert.equal(tree.SelectedItems.length, 2);

        let fired = 0;
        tree.AddSelectionChangedListener(() => { fired++; });
        tree.ClearSelection();

        assert.equal(tree.SelectedItems.length, 0);
        assert.equal(a.IsSelected, false);
        assert.equal(b.IsSelected, false);
        assert.equal(fired, 1);
    });

    test('removing a subtree purges its items from the selection set', () => {
        const { tree, root, b, b1, b2 } = buildFixture();
        root.IsExpanded = true;
        b.IsExpanded = true;
        const target = new HeadlessTarget(300, 400);
        target.Content = tree;
        target.Flush();

        // Select b1 and b2.
        const im = new InputManager();
        im.InjectPointerDown(rowOf(b1), pointer());
        im.InjectPointerUp  (rowOf(b1), pointer());
        im.InjectPointerDown(rowOf(b2), pointer({ Control: true }));
        im.InjectPointerUp  (rowOf(b2), pointer({ Control: true }));
        assert.equal(tree.SelectedItems.length, 2);

        // Remove b — b1 + b2 should leave the selection set with them.
        root.RemoveChild(b);
        assert.equal(tree.SelectedItems.length, 0);
        assert.equal(b1.IsSelected, false);
        assert.equal(b2.IsSelected, false);
    });
});
