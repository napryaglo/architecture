import {
    Model,
    MetaData,
    ObservableCollection,
    Panel,
    Rect,
    Size,
    Thickness,
    Visual,
    type DrawingContext,
    type PointerEventArgs,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import { PresentationTarget } from '../../visual-engine/index.js';
import { Border } from '../../Basic/border.js';
import { Button } from '../button.js';
import { ContentControl } from '../content-control.js';
import { ContentPresenter } from '../../Basic/content-presenter.js';
import { ControlTemplate } from '../../Basic/control-template.js';
import { Dock, DockPanel } from '../../Basic/dock-panel.js';
import { ItemsControl } from '../items-control.js';
import { ItemsPresenter } from '../../Basic/items-presenter.js';
import { StackPanel } from '../../Basic/stack-panel.js';
import { TextBlock } from '../../Basic/text-block.js';
import { Theme } from '../../Basic/theme.js';

// ToolBar — horizontal command strip. Items overflow into a popup when
// the available width can't fit them all. Hosts ToolBarButton,
// ToolBarToggleButton, ToolBarSeparator, and arbitrary content (any
// Visual the consumer puts in `Items`).
//
// Architecture:
//
//   ToolBar (ItemsControl)
//     ├ ControlTemplate
//     │    Border
//     │      DockPanel
//     │        ChevronButton (Dock=Right) — opens the overflow popup
//     │        ItemsPresenter (LastChildFill — eats the remaining width)
//     │          ToolBarPanel (default ItemsPanel)
//     │            └ items 0..lastFittingIndex arrange normally;
//     │              items past the cutoff arrange at Rect.Zero
//     └ Overlay popup (mounted on PresentationTarget.OverlayLayer
//                      when IsOverflowOpen=true)
//          Scrim (click-away)
//          Border (popup chrome)
//            StackPanel (vertical)
//              … item containers for the overflowed slice …
//
// The overflow popup is its own ItemsControl bound to a separate
// ObservableCollection (`_overflowedItems`) that the ToolBarPanel
// refreshes after every Arrange pass. The popup uses the SAME
// ItemTemplate / container-generation rules as the inline strip — so
// a ToolBarButton declared as a ToolBar item materializes identically
// in either place.
//
// `HasOverflowItems` is a read-only boolean DP that mirrors whether
// `_overflowedItems` is non-empty; styles / triggers can watch it to
// gray out / hide the chevron when nothing has overflowed.
export class ToolBar extends ItemsControl
{
    public static readonly IsOverflowOpenKey = Model.RegisterProperty<boolean>(
        ToolBar, 'IsOverflowOpen', false, MetaData.None,
    );
    private static readonly _HasOverflowItemsPriv = Model.RegisterReadOnlyProperty<boolean>(
        ToolBar, 'HasOverflowItems', false, MetaData.None,
    );
    public static readonly HasOverflowItemsKey = ToolBar._HasOverflowItemsPriv;

    // Internal: data items past the cutoff. Bound to the popup's
    // ItemsControl ItemsSource. Reset (via Clear + Add loop) by
    // SyncOverflow after each measure / arrange pass.
    private readonly _overflowedItems: ObservableCollection<unknown> = new ObservableCollection<unknown>([]);

    private readonly _chevron:         Button;
    private readonly _popupHost:       ToolBarPopupHost;
    private readonly _scrim:           ClickAwayScrim;
    private readonly _popupContainer:  Border;
    private readonly _popupList:       ToolBarOverflowItemsControl;

    private _popupMounted = false;
    private _lastKnownTarget: PresentationTarget | undefined;

    constructor()
    {
        super();

        // Default items panel — the ToolBarPanel does overflow math.
        // Each apply produces a fresh panel; the factory wires its
        // back-ref to this toolbar.
        this.ItemsPanel = (): Panel =>
        {
            const p = new ToolBarPanel();
            p._toolbar = this;
            return p;
        };

        // Build the chevron button — opens the overflow popup. The
        // chevron collapses to Width=0 when `HasOverflowItems` flips
        // false (driven by `applyChevronVisibility` from the OnProperty
        // Changed handler below); when overflow rows reappear the
        // chevron restores to its natural width. Same Width=0 collapse
        // pattern the auto-hiding MenuItem columns use — mural has no
        // Visibility DP, so width is the load-bearing knob.
        this._chevron = new Button();
        const chevronLabel = new TextBlock('⋯');
        chevronLabel.Foreground = Theme.primaryInk;
        this._chevron.Content = chevronLabel;
        this._chevron.AddClickHandler(() =>
        {
            if (this.HasOverflowItems) this.IsOverflowOpen = !this.IsOverflowOpen;
        });
        DockPanel.SetDock(this._chevron, Dock.Right);

        // Apply the control template — Border > DockPanel > (chevron,
        // ItemsPresenter). The presenter is what ItemsControl wires
        // the items panel into.
        this.Template = new ControlTemplate((_tp) =>
        {
            const presenter = new ItemsPresenter();
            const layout = new DockPanel();
            layout.LastChildFill = true;
            layout.AddChild(this._chevron);
            layout.AddChild(presenter);
            const border = new Border();
            border.Background      = Theme.paper;
            border.BorderBrush     = Theme.fieldBorder;
            border.BorderThickness = new Thickness(1);
            border.Padding         = new Thickness(4);
            border.SetChild(layout);
            return border;
        });

        // Build the overflow popup subtree. Same overlay pattern as
        // ComboBox — Scrim + anchored popup body containing an
        // ItemsControl bound to `_overflowedItems`.
        this._scrim = new ClickAwayScrim();
        this._scrim.onClick = (): void => { this.IsOverflowOpen = false; };

        this._popupList = new ToolBarOverflowItemsControl();
        this._popupList._toolbar      = this;
        this._popupList.ItemsSource   = this._overflowedItems;
        this._popupList.ItemsPanel    = (): Panel => new StackPanel();

        this._popupContainer = new Border();
        this._popupContainer.Background      = Theme.popupBg;
        this._popupContainer.BorderBrush     = Theme.popupBorder;
        this._popupContainer.BorderThickness = new Thickness(1);
        this._popupContainer.Padding         = new Thickness(4);
        this._popupContainer.SetChild(this._popupList);

        this._popupHost = new ToolBarPopupHost();
        this._popupHost.toolbar = this;
        this._popupHost.anchor  = this._chevron;
        this._popupHost.popup   = this._popupContainer;
        this._popupHost.AddChild(this._scrim);
        this._popupHost.AddChild(this._popupContainer);

        // Initial chevron visibility — collapsed because Items is empty.
        this.applyChevronVisibility(this.HasOverflowItems);
    }

    // Width=0 collapses the chevron flush so the toolbar reads as if
    // it has no overflow region; restoring sets Width to NaN which the
    // layout pipeline treats as "auto-size to content" (the chevron
    // re-measures to its natural glyph + padding width).
    private applyChevronVisibility(visible: boolean): void
    {
        this._chevron.Width = visible ? Number.NaN : 0;
    }

    public get IsOverflowOpen():  boolean { return this.get_property_value(ToolBar.IsOverflowOpenKey); }
    public set IsOverflowOpen(v: boolean) { this.set_property_value(ToolBar.IsOverflowOpenKey, v); }

    public get HasOverflowItems(): boolean { return this.get_property_value(ToolBar.HasOverflowItemsKey); }

    // Compiler routes `ToolBar { ToolBarButton; ToolBarSeparator; … }`
    // body elements through ItemsControl.AddChild → Items. ToolBar
    // accepts any Visual — the conventional content is ToolBarButton /
    // ToolBarToggleButton / ToolBarSeparator, but plain Buttons and
    // arbitrary Visuals are valid too (matches WPF's ToolBar).
    protected override validateDeclarativeChild(_child: Visual): void { }

    // Visual items declared in markup are already their own container —
    // no point wrapping a ToolBarButton in a ContentPresenter. Plain
    // data items (rare for ToolBar) still take the default
    // ContentPresenter path. WPF parity.
    public override IsItemItsOwnContainerOverride(item: unknown): boolean
    {
        return item instanceof Visual;
    }

    /** Internal — called by ToolBarPanel after each Arrange pass with
     *  the index of the last item that fit. Anything past it is moved
     *  into `_overflowedItems`. */
    public _syncOverflow(lastFittingIndex: number): void
    {
        const items = this.Items;
        const itemCount = items === undefined
            ? 0
            : (items instanceof ObservableCollection ? items.Count : items.length);
        const overflowStart = lastFittingIndex + 1;
        const newOverflow: unknown[] = [];
        for (let i = overflowStart; i < itemCount; i++)
        {
            newOverflow.push(
                items instanceof ObservableCollection ? items.Get(i) : (items as readonly unknown[])[i],
            );
        }

        // Cheap diff: if length + identities match, do nothing. Avoids
        // tearing the popup ItemsControl on every layout pass.
        const current = this._overflowedItems;
        let same = current.Count === newOverflow.length;
        if (same)
        {
            for (let i = 0; i < newOverflow.length; i++)
            {
                if (current.Get(i) !== newOverflow[i]) { same = false; break; }
            }
        }
        if (!same)
        {
            current.Clear();
            for (const x of newOverflow) current.Add(x);
        }

        const has = newOverflow.length > 0;
        if (this.HasOverflowItems !== has)
        {
            this.set_property_value_with_key(ToolBar._HasOverflowItemsPriv, has);
            if (!has && this.IsOverflowOpen) this.IsOverflowOpen = false;
        }
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'IsOverflowOpen' && this._popupHost !== undefined)
        {
            if (newValue === true) this.mountPopup();
            else                   this.unmountPopup();
        }
        if (descriptor.Name === 'HasOverflowItems' && this._chevron !== undefined)
        {
            this.applyChevronVisibility(newValue === true);
        }
    }

    protected override propagate_target_to_visual_children(): void
    {
        const newTarget = (this as unknown as { target: PresentationTarget | undefined }).target;
        const oldTarget = this._lastKnownTarget;
        if (oldTarget !== undefined && oldTarget !== newTarget && this._popupMounted)
        {
            oldTarget.DetachOverlay(this._popupHost);
            this._popupMounted = false;
        }
        this._lastKnownTarget = newTarget;
        super.propagate_target_to_visual_children();
        if (newTarget !== undefined && this.IsOverflowOpen) this.mountPopup();
    }

    private mountPopup(): void
    {
        if (this._popupMounted) return;
        const t = this._lastKnownTarget;
        if (t === undefined) return;
        t.AttachOverlay(this._popupHost);
        this._popupMounted = true;
    }

    private unmountPopup(): void
    {
        if (!this._popupMounted) return;
        const t = this._lastKnownTarget;
        if (t === undefined) { this._popupMounted = false; return; }
        t.DetachOverlay(this._popupHost);
        this._popupMounted = false;
    }
}

// ─────────────────────────────────────────────────────────────────────
// ToolBarPanel — the items panel inside ToolBar. Measures children
// left-to-right, stops at the budget, and arranges fitting items
// inline + overflowed items at Rect.Zero. Reports the cutoff index
// back to its owning ToolBar via the `_toolbar` back-ref so the
// toolbar can sync the popup contents.
export class ToolBarPanel extends Panel
{
    /** Set by ToolBar's ItemsPanel factory. Receives the post-arrange
     *  sync callback. Optional so a panel constructed without a
     *  toolbar (testing in isolation) is still a sensible layout
     *  container. */
    public _toolbar: ToolBar | undefined;

    private _lastFittingIndex: number = -1;

    public get LastFittingIndex(): number { return this._lastFittingIndex; }

    protected override MeasureOverride(availableSize: Size): Size
    {
        const children = this.visualChildren;
        const budget = Number.isFinite(availableSize.Width) ? availableSize.Width : Number.POSITIVE_INFINITY;
        let used = 0;
        let maxH = 0;
        let lastFit = children.length - 1;
        for (let i = 0; i < children.length; i++)
        {
            const c = children[i]!;
            // Pass infinite height so items measure to their NATURAL
            // height — a horizontal toolbar's height should be the max
            // of its items, not whatever vertical space the parent
            // happened to offer. Without this, a top-docked toolbar in
            // a DockPanel pulls every child to the panel's full height
            // (Buttons inherit VerticalAlignment.Stretch by default).
            c.Measure(new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY));
            const w = c.DesiredSize.Width;
            const h = c.DesiredSize.Height;
            if (used + w > budget && i > 0)
            {
                // The first non-fitting child marks the cutoff. The
                // condition `i > 0` keeps the very first item visible
                // even when wider than the budget (it'll be clipped
                // visually, but the panel doesn't pretend nothing fit).
                lastFit = i - 1;
                break;
            }
            used += w;
            if (h > maxH) maxH = h;
        }
        // Account for items past the cutoff for height purposes — they
        // arrange at Rect.Zero but the panel's height should still reflect
        // the tallest measured item to keep layout stable through resize.
        for (let i = lastFit + 1; i < children.length; i++)
        {
            const h = children[i]!.DesiredSize.Height;
            if (h > maxH) maxH = h;
        }
        this._lastFittingIndex = lastFit;
        return new Size(Math.min(used, budget), maxH);
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        const children = this.visualChildren;
        let x = 0;
        for (let i = 0; i < children.length; i++)
        {
            const c = children[i]!;
            if (i <= this._lastFittingIndex)
            {
                const w = c.DesiredSize.Width;
                c.Arrange(new Rect(x, 0, w, finalSize.Height));
                x += w;
            }
            else
            {
                c.Arrange(Rect.Zero);
            }
        }
        // Notify the toolbar AFTER arrange completes. The popup
        // ItemsControl bound to _overflowedItems lives on the
        // OverlayLayer — a separate measure root — so its measure cycle
        // doesn't loop back into ours.
        if (this._toolbar !== undefined) this._toolbar._syncOverflow(this._lastFittingIndex);
        return finalSize;
    }

    // RenderOverride: nothing of our own — children paint themselves.
    protected override RenderOverride(_dc: DrawingContext): void { /* none */ }
}

// ─────────────────────────────────────────────────────────────────────
// Overflow popup overlay host. Same pattern as ComboBoxPopupHost: lives
// on PresentationTarget.OverlayLayer when active, arranges its scrim
// edge-to-edge, anchors the popup body below + right-aligned to the
// chevron button.
export class ToolBarPopupHost extends Panel
{
    public toolbar: ToolBar | undefined;
    public anchor:  Visual  | undefined;
    public popup:   Visual  | undefined;

    protected override MeasureOverride(availableSize: Size): Size
    {
        for (const c of this.visualChildren) c.Measure(availableSize);
        const w = Number.isFinite(availableSize.Width)  ? availableSize.Width  : 0;
        const h = Number.isFinite(availableSize.Height) ? availableSize.Height : 0;
        return new Size(w, h);
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        const children = this.visualChildren;
        children[0]?.Arrange(new Rect(0, 0, finalSize.Width, finalSize.Height));
        if (children.length < 2) return finalSize;
        const popupV = this.popup ?? children[1];
        const anchor = this.anchor;
        if (popupV === undefined || anchor === undefined) return finalSize;
        const origin = absoluteOrigin(anchor);
        const ar = anchor.ArrangedRect;
        const pw = popupV.DesiredSize.Width;
        const ph = popupV.DesiredSize.Height;
        // Position popup BELOW the chevron, RIGHT-aligned with it (so
        // the popup hangs back into the toolbar's space rather than
        // running off the right edge of the surface).
        let px = origin.x + ar.Width - pw;
        let py = origin.y + ar.Height;
        if (px < 0) px = 0;
        if (py + ph > finalSize.Height) py = Math.max(0, finalSize.Height - ph);
        if (px + pw > finalSize.Width)  px = Math.max(0, finalSize.Width  - pw);
        popupV.Arrange(new Rect(px, py, pw, ph));
        return finalSize;
    }
}

// Click-away scrim — invisible, full overlay slot. PointerDown +
// PointerUp inside the scrim closes the popup.
export class ClickAwayScrim extends Border
{
    public onClick: (() => void) | undefined;
    private _pressOriginatedHere = false;

    protected override OnPointerDown(args: PointerEventArgs): void
    {
        this._pressOriginatedHere = true;
        args.Handled = true;
    }

    protected override OnPointerUp(args: PointerEventArgs): void
    {
        const fire = this._pressOriginatedHere && this.IsMouseOver;
        this._pressOriginatedHere = false;
        args.Handled = true;
        if (fire) this.onClick?.();
    }

    protected override OnPointerLeave(_args: PointerEventArgs): void
    {
        this._pressOriginatedHere = false;
    }
}

// Inner popup ItemsControl. Same container generation as the inline
// ToolBarPanel — toolbar-style items materialize identically. The
// back-ref to the owning ToolBar lets per-item click handlers close
// the popup on activation.
export class ToolBarOverflowItemsControl extends ItemsControl
{
    public _toolbar: ToolBar | undefined;

    public override PrepareContainerForItemOverride(container: Visual, item: unknown, index: number): void
    {
        super.PrepareContainerForItemOverride(container, item, index);
        // Auto-close the popup when an overflowed Button is clicked.
        if (container instanceof Button)
        {
            container.AddClickHandler(() =>
            {
                this._toolbar!.IsOverflowOpen = false;
            });
        }
    }
}

// Walk parent chain summing ArrangedRect — same helper ComboBox uses.
function absoluteOrigin(v: Visual): { x: number; y: number }
{
    let x = 0;
    let y = 0;
    let cur: Visual | undefined = v;
    while (cur !== undefined)
    {
        x += cur.ArrangedRect.X;
        y += cur.ArrangedRect.Y;
        cur = cur.GetVisualParent();
    }
    return { x, y };
}

// Re-export ContentControl / ContentPresenter so the toolbar items
// module can import them through ./tool-bar.js (keeps the
// dependency footprint of the items module small).
export { ContentControl, ContentPresenter };
