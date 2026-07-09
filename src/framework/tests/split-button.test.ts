import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../basic/tests/test-app.js';
import { RelayCommand } from '../../runtime/index.js';
import { Border } from '../../basic/border.js';
import { TextBlock } from '../../basic/text-block.js';
import { ControlTemplate } from '../../basic/templates/control-template.js';
import { HeadlessTarget } from '../../visual-engine/index.js';
import { MenuPopupHost } from '../menu/menu-strip.js';
import { SplitButton } from '../button-groups/split-button.js';

// A minimal alternate PopupTemplate: a MenuPopupHost whose PART_PopupBody
// carries a marker so a swap is observable. Mirrors what @DefaultSplitButtonPopup
// provides (a named PART_PopupBody the SplitButton slots MenuContent into).
// The name is set via .Name — ControlTemplate.Apply builds the instance's
// NameScope from each visual's Name, so FindName('PART_PopupBody') resolves.
function makePopupTemplate(tag: string): ControlTemplate
{
    return new ControlTemplate(() => {
        const host = new MenuPopupHost();
        const body = new Border();
        body.Name = 'PART_PopupBody';
        (body as unknown as { __tag: string }).__tag = tag;
        host.AddChild(body);
        return host;
    });
}

describe('SplitButton defaults', () => {

    test('Content / Command / MenuContent default to undefined; IsOpen=false', () => {
        initTestApp();
        const sb = new SplitButton();
        assert.equal(sb.Content,     undefined);
        assert.equal(sb.Command,     undefined);
        assert.equal(sb.MenuContent, undefined);
        assert.equal(sb.IsOpen,      false);
    });
});

describe('SplitButton popup mount/unmount', () => {

    test('IsOpen → true mounts MenuContent on the OverlayLayer', () => {
        initTestApp();
        const sb = new SplitButton();
        sb.Content     = new TextBlock('Send');
        sb.MenuContent = new Border();
        const target = new HeadlessTarget(400, 200);
        target.Content = sb;
        target.Flush();

        assert.equal(target.OverlayRoot, undefined,
            'overlay starts unmounted while IsOpen=false');

        sb.IsOpen = true;
        const overlay = target.OverlayRoot as Border | undefined;
        assert.ok(overlay !== undefined, 'overlay mounts on IsOpen=true');
        const children = (overlay as unknown as { Children: { Count: number } }).Children;
        // One root: the MenuPopupHost (which internally hosts PART_Scrim +
        // PART_PopupBody). The framework popup pattern mounts a single
        // anchor-aware host rather than two siblings.
        assert.equal(children.Count, 1);
    });

    test('IsOpen → false detaches the popup host from the overlay', () => {
        initTestApp();
        const sb = new SplitButton();
        sb.Content     = new TextBlock('Send');
        sb.MenuContent = new Border();
        const target = new HeadlessTarget(400, 200);
        target.Content = sb;
        target.Flush();

        sb.IsOpen = true;
        sb.IsOpen = false;
        const overlay = target.OverlayRoot as Border | undefined;
        const childrenCount = (overlay as unknown as { Children?: { Count: number } } | undefined)
            ?.Children?.Count ?? 0;
        assert.equal(childrenCount, 0, 'popup host detached');
    });

    test('IsOpen=true with no MenuContent skips the mount (no-op safe)', () => {
        initTestApp();
        const sb = new SplitButton();
        sb.Content = new TextBlock('Send');
        const target = new HeadlessTarget(400, 200);
        target.Content = sb;
        target.Flush();

        sb.IsOpen = true;
        // No MenuContent → mountPopup returns early. OverlayRoot
        // remains undefined.
        assert.equal(target.OverlayRoot, undefined);
    });
});

describe('SplitButton PopupTemplate swap-while-open (§18.12)', () => {

    test('swapping PopupTemplate while open rebuilds the chrome and keeps MenuContent', () => {
        initTestApp();
        const sb = new SplitButton();
        sb.Content     = new TextBlock('Send');
        const menu     = new Border();
        sb.MenuContent = menu;
        sb.PopupTemplate = makePopupTemplate('v1');
        const target = new HeadlessTarget(400, 200);
        target.Content = sb;
        target.Flush();

        sb.IsOpen = true;
        const host1 = (target.OverlayRoot as unknown as { visualChildren: readonly MenuPopupHost[] })
            .visualChildren[0];
        const body1 = host1.FindName('PART_PopupBody') as Border;
        assert.equal((body1 as unknown as { __tag: string }).__tag, 'v1');
        assert.equal(body1.child, menu, 'MenuContent is slotted into the v1 body');

        // Swap the template while the popup is open.
        sb.PopupTemplate = makePopupTemplate('v2');

        const overlayKids = (target.OverlayRoot as unknown as { visualChildren: readonly MenuPopupHost[] })
            .visualChildren;
        assert.equal(overlayKids.length, 1, 'still exactly one popup host after the swap');
        const host2 = overlayKids[0];
        const body2 = host2.FindName('PART_PopupBody') as Border;
        assert.equal((body2 as unknown as { __tag: string }).__tag, 'v2',
            'the overlay now hosts the v2 chrome');
        assert.equal(body2.child, menu,
            'MenuContent survived the chrome rebuild (re-parented into v2)');
        assert.equal(body1.child, undefined, 'old v1 body released MenuContent');
    });

    test('swapping PopupTemplate while closed does not mount anything', () => {
        initTestApp();
        const sb = new SplitButton();
        sb.MenuContent = new Border();
        sb.PopupTemplate = makePopupTemplate('v1');
        const target = new HeadlessTarget(400, 200);
        target.Content = sb;
        target.Flush();

        sb.PopupTemplate = makePopupTemplate('v2');
        assert.equal(target.OverlayRoot, undefined, 'closed swap stays unmounted');
    });
});

describe('SplitButton Command wiring', () => {

    test('Command + CommandParameter round-trip through the DPs', () => {
        initTestApp();
        const sb = new SplitButton();
        let invokedWith: unknown = undefined;
        sb.Command = new RelayCommand((p) => { invokedWith = p; });
        sb.CommandParameter = 'foo';

        // Fire the command directly through the public API since the
        // primary Button click depends on the template being applied
        // (which a Headless test against a constructor-only instance
        // doesn't materialise without a target). The DP wiring is the
        // novel surface; the listener that calls cmd.Execute is one
        // line and covered by the demo.
        const cmd = sb.Command!;
        if (cmd.CanExecute(sb.CommandParameter))
        {
            cmd.Execute(sb.CommandParameter);
        }
        assert.equal(invokedWith, 'foo');
    });
});
