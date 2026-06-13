import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { Application, Color, ResourceDictionary } from '../index.js';
import { Border } from '../../basic/border.js';
import { HeadlessTarget, SolidColorBrush } from '../../visual-engine/index.js';
import { DynamicResource } from '../binding/dynamic-resource.js';

// AttachOverlayChild — verifies the logical/visual split that closes
// § 18.10. The popup's VISUAL parent goes to the host's OverlayLayer
// (renderer paints it on top); its LOGICAL parent goes to the owner
// Visual (resource cascades / DataContext inheritance flow from where
// the user "opened" it, not from the OverlayLayer).
describe('Visual.AttachOverlayChild — logical hop on owner, visual hop on overlay', () => {

    beforeEach(() => { Application.current = null; });

    test('after attach: visualParent = OverlayLayer, logicalParent = owner', () => {
        const target = new HeadlessTarget(200, 200);
        const owner  = new Border();
        target.Content = owner;
        const popup = new Border();

        owner.AttachOverlayChild(popup);

        // Visual hop: paints under the OverlayLayer.
        assert.equal(popup.GetVisualParent(), target.OverlayRoot);
        // Logical hop: inheritance / resource walks land on the owner.
        assert.equal(popup.GetLogicalParent(), owner);
    });

    test('after detach: both hops cleared', () => {
        const target = new HeadlessTarget(200, 200);
        const owner  = new Border();
        target.Content = owner;
        const popup = new Border();

        owner.AttachOverlayChild(popup);
        owner.DetachOverlayChild(popup);

        assert.equal(popup.GetVisualParent(),  undefined);
        assert.equal(popup.GetLogicalParent(), undefined);
    });

    test('OverlayLayer.logicalChildren is empty even when visualChildren includes the popup', () => {
        const target = new HeadlessTarget(200, 200);
        const owner  = new Border();
        target.Content = owner;
        const popup = new Border();

        owner.AttachOverlayChild(popup);
        const layer = target.OverlayRoot!;
        // Visual children include the popup; logical children do not —
        // logical ownership lives on `owner`, not the overlay layer.
        assert.deepEqual(layer.visualChildren,  [popup]);
        assert.deepEqual(layer.logicalChildren, []);
    });

    test('throws if owner has no host target', () => {
        const orphan = new Border();
        const popup  = new Border();
        assert.throws(() => orphan.AttachOverlayChild(popup));
    });

    test('re-attach after full detach restores both hops', () => {
        const target = new HeadlessTarget(200, 200);
        const owner  = new Border();
        target.Content = owner;
        const popup = new Border();

        owner.AttachOverlayChild(popup);
        owner.DetachOverlayChild(popup);
        owner.AttachOverlayChild(popup);

        assert.equal(popup.GetVisualParent(),  target.OverlayRoot);
        assert.equal(popup.GetLogicalParent(), owner);
    });

    test('idempotent logical hop — re-attaching the same child (target swap) keeps logical parent stable', () => {
        // Simulates the MenuButton / MenuItem cross-target swap path:
        // the visual hop is torn down by the old target and the popup is
        // re-attached on the new target. The logical hop must persist so
        // calling AttachOverlayChild again on the same owner doesn't
        // throw "already has logical parent".
        const target = new HeadlessTarget(200, 200);
        const owner  = new Border();
        target.Content = owner;
        const popup = new Border();

        owner.AttachOverlayChild(popup);
        // Tear down only the visual hop (mimics oldTarget.DetachOverlay).
        target.DetachOverlay(popup);
        // Logical hop intact.
        assert.equal(popup.GetLogicalParent(), owner);
        // Re-attach: visual hop re-establishes, logical hop is a no-op.
        owner.AttachOverlayChild(popup);
        assert.equal(popup.GetVisualParent(),  target.OverlayRoot);
        assert.equal(popup.GetLogicalParent(), owner);
    });
});

// Resource cascade through the logical hop — the load-bearing behavior
// for § 18.10. A DynamicResource inside the popup must resolve through
// the OWNER's resource chain, not through the OverlayLayer's chain.
describe('Visual.AttachOverlayChild — DynamicResource resolves through owner', () => {

    beforeEach(() => { Application.current = null; });

    test('@MyAccent resource set on owner.Resources is visible to overlay-mounted popup', () => {
        new Application();
        const target = new HeadlessTarget(200, 200);
        const owner  = new Border();
        target.Content = owner;

        // Stash a resource on the OWNER's local dictionary — NOT on
        // Application, NOT on the OverlayLayer. Pre-fix, the popup
        // mounted via AttachOverlay couldn't see this (its logical
        // walk went through OverlayLayer → target, missing the owner
        // entirely). Post-fix, the logical walk lands on the owner
        // and picks the resource up.
        const accent = new SolidColorBrush(Color.FromHex('#bada55'));
        owner.Resources.Set('MyAccent', accent);

        const popup = new Border();
        owner.AttachOverlayChild(popup);

        const resolved = popup.TryFindResource('MyAccent');
        assert.equal(resolved, accent);
    });

    test('DynamicResource binding on popup picks up owner-scoped token at attach time', () => {
        new Application();
        const target = new HeadlessTarget(200, 200);
        const owner  = new Border();
        target.Content = owner;

        const initial = new SolidColorBrush(Color.FromHex('#11223344'));
        owner.Resources.Set('PopupTint', initial);

        const popup = new Border();
        // Install a DynamicResource binding BEFORE attach so the binding
        // captures whatever the resolution chain looks like once we
        // join the owner's logical tree.
        popup.set_property_value(Border.BackgroundKey, DynamicResource(popup, 'PopupTint'));

        owner.AttachOverlayChild(popup);

        // Resolution at this point: popup is logically a child of owner,
        // owner.Resources has PopupTint → matches the initial Brush.
        assert.equal(popup.Background, initial);

        // Live re-resolve: swapping the resource on the owner cascades
        // into the popup's binding via the DynamicResource subscriber.
        const swapped = new SolidColorBrush(Color.FromHex('#55667788'));
        owner.Resources.Set('PopupTint', swapped);
        assert.equal(popup.Background, swapped);
    });

    test('owner-side resource walk reaches an ANCESTOR of the owner (no resources on owner itself)', () => {
        new Application();
        const target = new HeadlessTarget(200, 200);
        const grandparent = new Border();
        const owner       = new Border();
        grandparent.SetChild(owner);
        target.Content = grandparent;

        const ancestorResource = new SolidColorBrush(Color.FromHex('#abcdef'));
        grandparent.Resources.Set('FarToken', ancestorResource);

        const popup = new Border();
        owner.AttachOverlayChild(popup);

        // The walk goes: popup → owner (logical) → grandparent (logical)
        // → target → app. Without the AttachOverlayChild fix, popup
        // would jump straight to OverlayLayer and miss the grandparent
        // entirely.
        const resolved = popup.TryFindResource('FarToken');
        assert.equal(resolved, ancestorResource);
    });
});
