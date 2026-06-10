import {
    Model,
    MetaData,
    ObservableCollection,
    Panel,
    Rect,
    Size,
    Visual,
    type DrawingContext,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import {
    ToolBarButton,
    ToolBarPosition,
    ToolBarSeparator,
    ToolBarToggleButton,
} from './tool-bar-items.js';
import { PresentationTarget } from '../../visual-engine/index.js';
import { Border } from '../../Basic/border.js';
import { Button } from '../button.js';
import { ClickAwayScrim } from '../list/combo-box.js';
import { ContentControl } from '../content-control.js';
import { ContentPresenter } from '../../Basic/content-presenter.js';
import { ControlTemplate } from '../../Basic/control-template.js';
import { Dock, DockPanel } from '../../Basic/dock-panel.js';
import { ItemsControl } from '../items-control.js';
import { StackPanel } from '../../Basic/stack-panel.js';
import { ensureSurfaceTheme } from '../menu/default-surface-resources.js';

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
    // PopupTemplate — the overflow popup chrome (ToolBarPopupHost +
    // Scrim + container + overflow ItemsControl). Mirrors MenuButton's
    // TriggerTemplate split: ItemsControl's primary `Template` slot is
    // the INLINE chrome (so the ItemsPresenter inside hosts items
    // inline), and the off-tree popup lives in this second template DP.
    // The default Style sets it to @DefaultToolBarPopup; ToolBar's ctor
    // reads it via the DP getter, applies it, FindNames the parts, then
    // mountPopup attaches the host onto the OverlayLayer on demand.
    public static readonly PopupTemplateKey = Model.RegisterProperty<ControlTemplate | undefined>(
        ToolBar, 'PopupTemplate', undefined, MetaData.None,
    );

    static
    {
        // Theme lookup uses ToolBar as the key — the default Style
        // `Style [TargetType=ToolBar]` in surface.template.mu wires
        // both `Template` (inline chrome with chevron + ItemsPresenter)
        // and `PopupTemplate` (overlay popup with overflow ItemsControl).
        Model.OverrideMetadata(ToolBar, Visual.DefaultStyleKeyKey, { default_value: ToolBar });
        ensureSurfaceTheme();
    }
    private static readonly _HasOverflowItemsPriv = Model.RegisterReadOnlyProperty<boolean>(
        ToolBar, 'HasOverflowItems', false, MetaData.None,
    );
    public static readonly HasOverflowItemsKey = ToolBar._HasOverflowItemsPriv;

    // Internal: data items past the cutoff. Bound to the popup's
    // ItemsControl ItemsSource. Reset (via Clear + Add loop) by
    // SyncOverflow after each measure / arrange pass.
    private readonly _overflowedItems: ObservableCollection<unknown> = new ObservableCollection<unknown>([]);

    // Per-item natural-size cache. Updated whenever an item is measured
    // inline; consumed when the item lives in the overflow popup (where
    // the inline ToolBarPanel can't measure it directly because it's
    // not a child anymore). Stale only if an item's intrinsic size
    // changes while it's in the popup — typical Buttons / Separators
    // have stable sizes so the cache holds for the common case. The
    // map keys are item identity so non-Visual items (data items) just
    // don't get a cache entry; they fall through to "best fit zero
    // width" which is wrong but currently irrelevant (ToolBars are
    // authored with Visual children in practice).
    public readonly _widthCache: WeakMap<Visual, { width: number; height: number }> = new WeakMap();

    private _chevron!:         Button;
    private _popupHost!:       ToolBarPopupHost;
    private _scrim!:           ClickAwayScrim;
    private _popupContainer!:  Border;
    private _popupList!:       ToolBarOverflowItemsControl;

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

        // Apply the default Style — sets both `Template` (inline chrome
        // with chevron + ItemsPresenter) and `PopupTemplate` (overflow
        // popup that mounts onto the OverlayLayer when IsOverflowOpen
        // flips true). ItemsControl's rebuildTemplate materialises the
        // primary Template synchronously here so the chevron's parts
        // are FindName-able immediately below.
        this.applyDefaultStyle();
        this.adoptInlineTemplate();
        this.adoptPopupTemplate();

        // Initial chevron visibility — collapsed because Items is empty.
        this.applyChevronVisibility(this.HasOverflowItems);
    }

    // After applyDefaultStyle, ItemsControl's primary Template has been
    // materialised as super.visualChildren[0]. Find the chevron part and
    // wire its click handler. The chevron's width is toggled between
    // Number.NaN (auto) and 0 by applyChevronVisibility based on
    // HasOverflowItems.
    private adoptInlineTemplate(): void
    {
        const root = super.visualChildren[0];
        if (root === undefined)
        {
            throw new Error(
                'ToolBar template did not materialise. Did the default Style ' +
                '(surface.template.mu, `Style [TargetType=ToolBar]`) set `Template = @DefaultToolBar`?');
        }
        const chevron = root.FindName('PART_Chevron') as Button | undefined;
        if (chevron === undefined)
        {
            throw new Error(
                'ToolBar template is missing PART_Chevron. See @DefaultToolBar in surface.template.mu.');
        }
        this._chevron = chevron;
        DockPanel.SetDock(this._chevron, Dock.Right);
        this._chevron.AddClickHandler(() =>
        {
            if (this.HasOverflowItems) this.IsOverflowOpen = !this.IsOverflowOpen;
        });
    }

    // Apply the off-tree PopupTemplate, FindName the popup parts, wire
    // back-refs. The host is held but NOT attached to our visual tree
    // — mountPopup attaches it onto the PresentationTarget's overlay
    // layer when IsOverflowOpen flips true.
    private adoptPopupTemplate(): void
    {
        const popupTpl = this.PopupTemplate;
        if (popupTpl === undefined)
        {
            throw new Error(
                'ToolBar.PopupTemplate is undefined. The default Style in '
                + 'surface.template.mu sets PopupTemplate = @DefaultToolBarPopup. '
                + 'Did `ensureSurfaceTheme()` run before construction?');
        }
        const inst = popupTpl.Apply(this);
        this._popupHost      = inst.root as ToolBarPopupHost;
        this._scrim          = inst.root.FindName('PART_Scrim')          as ClickAwayScrim;
        this._popupContainer = inst.root.FindName('PART_PopupContainer') as Border;
        this._popupList      = inst.root.FindName('PART_PopupList')      as ToolBarOverflowItemsControl;

        this._popupHost.toolbar     = this;
        this._popupHost.anchor      = this._chevron;
        this._popupHost.popup       = this._popupContainer;
        this._popupList._toolbar    = this;
        this._popupList.ItemsSource = this._overflowedItems;
        this._popupList.ItemsPanel  = (): Panel => new StackPanel();
        this._scrim.onClick         = (): void => { this.IsOverflowOpen = false; };

        // ControlTemplate.Apply doesn't attach the root to the templated
        // parent — the popup host is orphan-ready for mountPopup to
        // adopt via PresentationTarget.AttachOverlay.
    }

    public get PopupTemplate():  ControlTemplate | undefined { return this.get_property_value(ToolBar.PopupTemplateKey); }
    public set PopupTemplate(v: ControlTemplate | undefined) { this.set_property_value(ToolBar.PopupTemplateKey, v); }

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
     *  the index of the last item that fit. Items past it move from the
     *  inline panel into the popup; items that fit again move back.
     *
     *  Move-on-overflow contract: Visual items have ONE parent at a
     *  time. The inline ToolBarPanel and the popup ItemsControl's panel
     *  are distinct hosts. When an item overflows we explicitly
     *  detach it from the inline panel (visual-only — its logical
     *  parent stays this ToolBar) BEFORE handing it to
     *  `_overflowedItems`; the popup ItemsControl's pipeline then
     *  attaches it to the popup panel. On restore we reverse the
     *  sequence: pull from `_overflowedItems` (popup detaches), then
     *  re-insert into the inline panel at the correct master-Items
     *  index. Both panel calls use the VisualChild variants so logical
     *  parent stays this ToolBar — same shape ItemsControl's own
     *  pipeline uses.
     *
     *  Inline ItemContainerGenerator's container registry is left
     *  alone: Items collection isn't mutated by overflow, so the
     *  generator's "what container realized which item" map stays
     *  truthful; the divergence between "registered as container" and
     *  "actually a child of the inline panel" is local to overflow
     *  bookkeeping and doesn't cascade. */
    public _syncOverflow(lastFittingIndex: number): void
    {
        const items = this.Items;
        const itemCount = items === undefined
            ? 0
            : (items instanceof ObservableCollection ? items.Count : items.length);

        // Partition into target inline (Visuals only — non-Visual items
        // already flow through the standard ContentPresenter path and
        // aren't affected by the parent-collision bug) and target
        // overflow (everything past the cutoff).
        const targetInlineVisuals: Visual[] = [];
        const targetOverflow:      unknown[] = [];
        for (let i = 0; i < itemCount; i++)
        {
            const item = items instanceof ObservableCollection
                ? items.Get(i)
                : (items as readonly unknown[])[i];
            if (i <= lastFittingIndex)
            {
                if (item instanceof Visual) targetInlineVisuals.push(item);
            }
            else
            {
                targetOverflow.push(item);
            }
        }

        // 1. Detach items leaving inline. These are Visuals currently
        //    parented to the inline panel that now belong in overflow.
        //    After this loop they're orphans; the popup ItemsControl
        //    will adopt them when we update `_overflowedItems` below.
        const inlinePanel = this.ItemsPanelInstance;
        if (inlinePanel !== undefined)
        {
            const overflowVisuals = targetOverflow.filter((x): x is Visual => x instanceof Visual);
            for (const item of overflowVisuals)
            {
                if (inlinePanel.visualChildren.includes(item))
                {
                    (inlinePanel as Panel).RemoveVisualChild(item);
                }
            }
        }

        // 2. Update `_overflowedItems` (drives popup ItemsControl).
        //    Cheap diff first — if nothing changed, skip both the
        //    Clear and the re-add to avoid tearing the popup containers
        //    on every layout pass.
        const current = this._overflowedItems;
        let same = current.Count === targetOverflow.length;
        if (same)
        {
            for (let i = 0; i < targetOverflow.length; i++)
            {
                if (current.Get(i) !== targetOverflow[i]) { same = false; break; }
            }
        }
        if (!same)
        {
            current.Clear();
            for (const x of targetOverflow) current.Add(x);
        }

        // 3. Re-attach items entering inline. These are Visuals that
        //    should be inline at some master index but currently aren't
        //    a child of the inline panel. The popup pipeline has
        //    already detached them (step 2 Clear), so they're orphans
        //    ready to be inserted.
        //
        //    Insertion index is the position in `targetInlineVisuals`
        //    (the inline panel only hosts inline Visuals; non-Visual
        //    items live as ContentPresenter children at separate
        //    indices, but for the common Visual-only ToolBar case the
        //    two indices match). Iterating in increasing index order
        //    guarantees positions 0..idx-1 are already populated by the
        //    time we hit idx.
        if (inlinePanel !== undefined)
        {
            for (let idx = 0; idx < targetInlineVisuals.length; idx++)
            {
                const item = targetInlineVisuals[idx]!;
                if (!inlinePanel.visualChildren.includes(item))
                {
                    (inlinePanel as Panel).InsertVisualChild(idx, item);
                }
            }
        }

        const has = targetOverflow.length > 0;
        if (this.HasOverflowItems !== has)
        {
            this.set_property_value_with_key(ToolBar._HasOverflowItemsPriv, has);
            if (!has && this.IsOverflowOpen) this.IsOverflowOpen = false;
        }

        // Update Position on inline ToolBarButton / ToolBarToggleButton
        // children so each button's default Style picks the right
        // per-corner CornerRadius. Walk inline visuals, breaking into
        // groups at every ToolBarSeparator — each group of size 1 is
        // `Only`, larger groups assign `First` / `Middle` / `Last`.
        // Overflowed items are reset to `None` (their default chrome —
        // they live inside the popup where the connected-bar look
        // doesn't apply).
        assignPositions(targetInlineVisuals);
        for (const v of targetOverflow)
        {
            if (v instanceof ToolBarButton || v instanceof ToolBarToggleButton)
            {
                v.Position = ToolBarPosition.None;
            }
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
        const budget = Number.isFinite(availableSize.Width) ? availableSize.Width : Number.POSITIVE_INFINITY;

        // Measure currently-parented children so they have fresh
        // DesiredSize values and we can refresh the cache.
        for (const c of this.visualChildren)
        {
            c.Measure(new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY));
            this._toolbar?._widthCache.set(c, {
                width:  c.DesiredSize.Width,
                height: c.DesiredSize.Height,
            });
        }

        // Master-index cutoff: walk ToolBar.Items in their authored
        // order, using fresh DesiredSize for items currently inline and
        // the width cache for items in the overflow popup (items not
        // parented to us so we can't measure them through visualChildren).
        // Reporting in master-index space lets _syncOverflow know which
        // items should fit when the budget grows enough to bring popup
        // items back inline.
        const items = this._toolbar?.Items;
        if (items === undefined)
        {
            // Standalone usage — no owning toolbar / master collection
            // to consult for restore-on-grow. Fall back to fit-math
            // against current children only (the pre-move-on-overflow
            // behavior). Tests rely on this for in-isolation panel
            // exercise; the production path always has a toolbar.
            const children = this.visualChildren;
            let usedFb = 0;
            let maxHFb = 0;
            let lastFitFb = children.length - 1;
            for (let i = 0; i < children.length; i++)
            {
                const c = children[i]!;
                const w = c.DesiredSize.Width;
                const h = c.DesiredSize.Height;
                if (usedFb + w > budget && i > 0)
                {
                    lastFitFb = i - 1;
                    break;
                }
                usedFb += w;
                if (h > maxHFb) maxHFb = h;
            }
            for (let i = lastFitFb + 1; i < children.length; i++)
            {
                const h = children[i]!.DesiredSize.Height;
                if (h > maxHFb) maxHFb = h;
            }
            this._lastFittingIndex = lastFitFb;
            return new Size(Math.min(usedFb, budget), maxHFb);
        }

        const itemCount = items instanceof ObservableCollection
            ? items.Count
            : items.length;
        let used    = 0;
        let maxH    = 0;
        let lastFit = -1;
        for (let i = 0; i < itemCount; i++)
        {
            const item = items instanceof ObservableCollection
                ? items.Get(i)
                : (items as readonly unknown[])[i];
            let w = 0;
            let h = 0;
            if (item instanceof Visual)
            {
                const cached = this._toolbar?._widthCache.get(item);
                if (cached !== undefined) { w = cached.width; h = cached.height; }
            }
            if (used + w > budget && i > 0)
            {
                lastFit = i - 1;
                break;
            }
            used += w;
            if (h > maxH) maxH = h;
            lastFit = i;
        }
        // Sweep the rest for height-only (popup items still contribute
        // to maxH so resize doesn't jitter the panel vertically).
        for (let i = lastFit + 1; i < itemCount; i++)
        {
            const item = items instanceof ObservableCollection
                ? items.Get(i)
                : (items as readonly unknown[])[i];
            if (item instanceof Visual)
            {
                const cached = this._toolbar?._widthCache.get(item);
                if (cached !== undefined && cached.height > maxH) maxH = cached.height;
            }
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

// Re-export ClickAwayScrim — historically lived locally, now shared
// with the combo-box / menu popup infrastructure. Sibling controls
// (context-menu, menu-strip) still import it via this path.
export { ClickAwayScrim } from '../list/combo-box.js';

// Inner popup ItemsControl. Same container generation as the inline
// ToolBarPanel — toolbar-style items materialize identically. The
// back-ref to the owning ToolBar lets per-item click handlers close
// the popup on activation.
export class ToolBarOverflowItemsControl extends ItemsControl
{
    public _toolbar: ToolBar | undefined;

    // Items default through the base ContentPresenter wrap. Even though
    // ToolBar's items are Visuals, we deliberately DON'T treat them as
    // their own container in this popup — that would call AttachLogical
    // on the item Visual, which already has its logical parent set to
    // the outer ToolBar (set during the inline AttachContainer). A
    // ContentPresenter wrap keeps the logical tree intact: the
    // ContentPresenter is the popup's logical child, and the item rides
    // in as `cp.Content` via visual-only AttachVisual. ToolBar._syncOverflow
    // detaches the item from the inline panel before this runs so the
    // visual-only attach has no prior parent to collide with.

    public override PrepareContainerForItemOverride(container: Visual, item: unknown, index: number): void
    {
        super.PrepareContainerForItemOverride(container, item, index);
        // Auto-close the popup when an overflowed Button is clicked.
        // Item is the source-of-truth Visual (the ToolBarButton authored
        // in markup); container is the popup-side ContentPresenter wrap
        // that hosts it visually. Click handler goes on the item — the
        // ContentPresenter doesn't surface Button semantics.
        const clickTarget = item instanceof Button ? item : container;
        if (clickTarget instanceof Button)
        {
            clickTarget.AddClickHandler(() =>
            {
                this._toolbar!.IsOverflowOpen = false;
            });
        }
    }

    /** When a container is cleared (e.g. CollectionView's Refresh-based
     *  'cleared' that fires on every source mutation), the base hook
     *  resets style + data but leaves `cp.Content` pointing at the item
     *  — which keeps the item Visual parented under this stale cp. The
     *  next 'inserted' event then tries to slot the item into a fresh
     *  cp, hitting the parent-collision assertion.
     *
     *  Clearing `cp.Content` here detaches the item from cp via
     *  ContentPresenter.SetContent's symmetric DetachVisual, leaving
     *  the item orphan-ready for re-realization. */
    public override ClearContainerForItemOverride(container: Visual, item: unknown): void
    {
        super.ClearContainerForItemOverride(container, item);
        if (container instanceof ContentPresenter)
        {
            container.Content = undefined;
        }
    }
}

// Compute and write the Position DP on every ToolBarButton /
// ToolBarToggleButton in the inline strip. Walks the strip splitting at
// ToolBarSeparator children: each contiguous run of non-separator
// Visuals is one group. Runs of length 1 are `Only`; longer runs assign
// `First` to the first button, `Last` to the last, `Middle` to the
// interior, where "button" here means specifically a ToolBarButton /
// ToolBarToggleButton — other Visuals in the strip (a TextBlock the
// consumer dropped in, a chevron from a future ToolBar variant) are
// treated as gap fillers that DON'T receive a Position write but still
// break a connected segment at their slot, so the visible buttons on
// either side cap the run with rounded outer corners.
function assignPositions(visuals: readonly Visual[]): void
{
    // First pass — partition into groups bounded by ToolBarSeparator.
    // Each group is a list of indices into `visuals`. A non-ToolBarButton
    // Visual that ISN'T a separator (rare — typical ToolBars are all
    // buttons + separators) interrupts the group the same way a
    // separator does, so the surrounding buttons cap correctly even
    // when a non-button visual sits inline.
    const groups: number[][] = [];
    let cur: number[] = [];
    for (let i = 0; i < visuals.length; i++)
    {
        const v = visuals[i]!;
        const isButton = v instanceof ToolBarButton || v instanceof ToolBarToggleButton;
        if (v instanceof ToolBarSeparator || !isButton)
        {
            if (cur.length > 0) { groups.push(cur); cur = []; }
            continue;
        }
        cur.push(i);
    }
    if (cur.length > 0) groups.push(cur);

    // Second pass — write Position on each button in each group.
    for (const g of groups)
    {
        if (g.length === 1)
        {
            const btn = visuals[g[0]!]! as ToolBarButton | ToolBarToggleButton;
            btn.Position = ToolBarPosition.Only;
            continue;
        }
        for (let i = 0; i < g.length; i++)
        {
            const btn = visuals[g[i]!]! as ToolBarButton | ToolBarToggleButton;
            if (i === 0)               btn.Position = ToolBarPosition.First;
            else if (i === g.length - 1) btn.Position = ToolBarPosition.Last;
            else                       btn.Position = ToolBarPosition.Middle;
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
