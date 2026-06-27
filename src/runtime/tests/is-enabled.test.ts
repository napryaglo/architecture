import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    KeyEventArgs,
    Key,
    NoModifiers,    Panel,
    PointerButton,
    PointerEventArgs,
    Element,
    Visual,
    dispatchKey,
    dispatchPointer,
    dispatchPointerDirect,
    type DrawingContext,
    type PointerEventInit,
} from '../index.js';

// Concrete Visual for the route-walker fixtures. Counts each handler
// firing so a test can assert "the dispatch fired N times" against the
// before / after states of the IsEnabled gate.
class Counter extends Element
{
    public down = 0; public up = 0; public move = 0;
    public enter = 0; public leave = 0;
    public keyDown = 0;

    protected override OnPointerDown(): void  { this.down++; }
    protected override OnPointerUp():   void  { this.up++; }
    protected override OnPointerMove(): void  { this.move++; }
    protected override OnPointerEnter():void  { this.enter++; }
    protected override OnPointerLeave():void  { this.leave++; }
    protected override OnKeyDown():     void  { this.keyDown++; }

    // Visual is abstract on RenderOverride; satisfy it with a no-op so
    // the test can instantiate.
    protected override RenderOverride(_dc: DrawingContext): void { /* no paint */ }
}

// Concrete Panel that exposes Children + uses the same default layout
// — sufficient for routing tests where we only care about parent/child.
class TestPanel extends Panel { }

// Default PointerEventInit for synthetic dispatches. Modifiers / coords
// don't matter for the gating tests; only Source + Kind drive routing.
function pointerInit(): PointerEventInit
{
    return {
        HostX: 0, HostY: 0,
        Button: PointerButton.Left,
        Buttons: 1,
        Modifiers: NoModifiers,
        PointerId: 0,
        Pressure: 0,
        PointerType: 'mouse',
    };
}

describe('Element.IsEnabled', () => {

    test('defaults to true', () => {
        const v = new Counter();
        assert.equal(v.IsEnabled, true);
    });

    test('inherits down the visual tree', () => {
        const root  = new TestPanel();
        const mid   = new TestPanel();
        const leaf  = new Counter();
        root.AddChild(mid);
        mid.AddChild(leaf);

        assert.equal(leaf.IsEnabled, true,
            'baseline: untouched leaf inherits the default `true`');

        root.IsEnabled = false;
        assert.equal(mid.IsEnabled,  false,
            'inherited DP: disabling root cascades through mid');
        assert.equal(leaf.IsEnabled, false,
            'inherited DP: disabling root cascades through to the leaf');

        root.IsEnabled = true;
        assert.equal(leaf.IsEnabled, true,
            're-enabling the root restores the leaf');
    });

    test('a local IsEnabled override survives ancestor flips', () => {
        const root  = new TestPanel();
        const leaf  = new Counter();
        root.AddChild(leaf);

        // Pin the leaf to false locally. The ancestor flipping after
        // shouldn't lift the leaf back to true — local values outrank
        // inherited values in the EVD priority tier.
        leaf.IsEnabled = false;
        assert.equal(leaf.IsEnabled, false);

        root.IsEnabled = true;
        assert.equal(leaf.IsEnabled, false,
            'local false on the leaf outranks the inherited true from root');
    });
});

describe('Routed-event dispatch gating on IsEnabled', () => {

    function buildTree(): { root: TestPanel; leaf: Counter }
    {
        const root = new TestPanel();
        const leaf = new Counter();
        root.AddChild(leaf);
        return { root, leaf };
    }

    test('dispatchPointer fires when the route is fully enabled', () => {
        const { leaf } = buildTree();
        dispatchPointer(new PointerEventArgs('PointerDown', leaf, pointerInit()));
        assert.equal(leaf.down, 1, 'enabled route — PointerDown delivers');
    });

    test('dispatchPointer is suppressed when the source is disabled', () => {
        const { leaf } = buildTree();
        leaf.IsEnabled = false;
        dispatchPointer(new PointerEventArgs('PointerDown', leaf, pointerInit()));
        assert.equal(leaf.down, 0, 'disabled source — PointerDown swallowed');
    });

    test('dispatchPointer is suppressed when an ancestor is disabled', () => {
        const { root, leaf } = buildTree();
        root.IsEnabled = false;   // inherited to leaf
        dispatchPointer(new PointerEventArgs('PointerDown', leaf, pointerInit()));
        assert.equal(leaf.down, 0,
            'disabled ancestor — PointerDown swallowed even though source IsEnabled was never touched');
    });

    test('dispatchPointerDirect (Enter / Leave) gates on IsEnabled too', () => {
        const { leaf } = buildTree();
        leaf.IsEnabled = false;
        dispatchPointerDirect(new PointerEventArgs('PointerEnter', leaf, pointerInit()));
        dispatchPointerDirect(new PointerEventArgs('PointerLeave', leaf, pointerInit()));
        assert.equal(leaf.enter, 0,
            'disabled — PointerEnter swallowed (no IsMouseOver state churn)');
        assert.equal(leaf.leave, 0,
            'disabled — PointerLeave swallowed too');
    });

    test('dispatchKey is suppressed on disabled subtrees', () => {
        const { leaf } = buildTree();
        leaf.IsEnabled = false;
        const args = new KeyEventArgs('KeyDown', leaf, {
            Key: Key.Return, KeyText: 'Enter', Code: 'Enter', Modifiers: NoModifiers, IsRepeat: false,
        });
        dispatchKey(args);
        assert.equal(leaf.keyDown, 0, 'disabled source — KeyDown swallowed');
    });

    test('re-enabling restores dispatch', () => {
        const { leaf } = buildTree();
        leaf.IsEnabled = false;
        dispatchPointer(new PointerEventArgs('PointerDown', leaf, pointerInit()));
        leaf.IsEnabled = true;
        dispatchPointer(new PointerEventArgs('PointerDown', leaf, pointerInit()));
        assert.equal(leaf.down, 1,
            'first dispatch (disabled) swallowed; second (re-enabled) delivers');
    });
});
