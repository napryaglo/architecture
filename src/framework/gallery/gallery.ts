import {
    MuralBase,
    Visual,
} from '../../runtime/index.js';
import { StackPanel } from '../../basic/panels/stack-panel.js';
import { Orientation } from '../../basic/panels/orientation.js';
import type { ItemsPanelFactory } from '../../basic/panels/items-panel-template.js';
import { ItemsControl } from '../base/items-control.js';
import { Button } from '../buttons/button.js';
import { MenuItem } from '../menu/menu-strip.js';

// ─────────────────────────────────────────────────────────────────────
// Gallery — the base concept for a popup-hosted collection of choices.
//
// A gallery is an ItemsControl whose layout is the whole point: its
// ItemsPanel IS the "popup template". Swap the panel and you swap the
// variant —
//
//   * the default vertical stack of MenuItems is the *menu* variant;
//   * a UniformGrid[Columns=3] of icon-only ToolBarButtons is an
//     *icon-grid* variant;
//
// …with no change to the one behavior every variant shares: activating an
// item dismisses the popup. That contract lives here, in WireActivationClose
// / RequestClose, so each host (or subclass) implements dismissal once.
//
// Hosts consume a gallery two ways. A *subclass* (e.g. ToolBarSplitButton)
// owns its own popup and overrides RequestClose to clear IsOpen. A
// *composing* host that merely contains a gallery sets onRequestClose to its
// own dismissal thunk. Both routes funnel through RequestClose.

// The default "menu" variant panel — a vertical stack of item containers.
// Installed as a metadata DEFAULT (not a local ctor write) so a subclass
// Style or a markup `ItemsPanel = …` attribute still wins by normal DP
// precedence; only galleries that never set a panel fall back to this.
const verticalMenuPanel: ItemsPanelFactory = (): StackPanel =>
{
    const panel = new StackPanel();
    panel.Orientation = Orientation.Vertical;
    return panel;
};

export class Gallery extends ItemsControl
{
    static
    {
        MuralBase.OverrideMetadata(Gallery, ItemsControl.ItemsPanelKey, { default_value: verticalMenuPanel });
    }

    // Composition hook: a host that CONTAINS a gallery (rather than
    // subclassing it) sets this to dismiss its popup on activation.
    // Subclasses instead override RequestClose.
    public onRequestClose: (() => void) | undefined;

    public override IsItemItsOwnContainerOverride(item: unknown): boolean
    {
        return item instanceof Visual;
    }

    protected override validateDeclarativeChild(_child: Visual): void { }

    // Every generated container closes the gallery on activation — the one
    // behavior all variants share. The activation signal differs by container
    // kind: a MenuItem reports through its _onActivated hook (it is not a
    // Button), a Button (e.g. an icon-grid ToolBarButton) through PointerUp, and
    // anything else — e.g. a data-bound ContentPresenter wrapping a templated
    // MenuItem / Button — also through PointerUp, which bubbles up from the inner
    // control AFTER its own click has run, so the item's command executes before
    // the popup dismisses.
    public override PrepareContainerForItemOverride(container: Visual, item: unknown, index: number): void
    {
        super.PrepareContainerForItemOverride(container, item, index);
        this.WireActivationClose(container);
    }

    protected WireActivationClose(container: Visual): void
    {
        if (container instanceof MenuItem)
        {
            const prev = container._onActivated;
            container._onActivated = (): void => { prev?.(); this.RequestClose(); };
        }
        else if (container instanceof Button)
        {
            // NOT AddClickHandler: a Button's Click is gated by its Command's
            // CanExecute (Button.fireClick bails when the command can't run),
            // so a selection-gated / disabled item would leave the popup stuck
            // open. Close on PointerUp instead — it fires regardless of the
            // command gate, and the dispatcher runs a visual's OnPointerUp
            // virtual BEFORE its instance listeners, so an ENABLED command
            // still executes (and reads its context while the item is still
            // parented) before the popup dismisses. Matches the MenuItem
            // branch, which closes unconditionally too.
            container.AddRoutedEventListener(
                'PointerUp', ((): void => { this.RequestClose(); }) as (a: unknown) => void);
        }
        else
        {
            container.AddRoutedEventListener(
                'PointerUp', ((): void => { this.RequestClose(); }) as (a: unknown) => void);
        }
    }

    // Base: notify a composing host. Subclasses that own the popup override
    // this to dismiss it directly.
    protected RequestClose(): void
    {
        this.onRequestClose?.();
    }
}
