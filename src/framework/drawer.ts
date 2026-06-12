import {
    Application,
    Color,
    MetaData,
    Model,
    Panel,
    Rect,
    Size,
    Visual,
    type DrawingContext,
    type PointerEventArgs,
    type PropertyDescriptor,
} from '../runtime/index.js';
import { PresentationTarget, SolidColorBrush, type Brush } from '../visual-engine/index.js';
import { Control } from './control.js';
import { Border } from '../basic/border.js';
import { ContentPresenter } from '../basic/templates/content-presenter.js';
import { Dock } from '../basic/panels/dock-panel.js';
import type { ControlTemplate } from '../basic/templates/control-template.js';

const KEY_PANE    = 'DefaultDrawerPane';
const KEY_OVERLAY = 'DefaultDrawerOverlay';

function resolveTemplate(key: string): ControlTemplate
{
    const tpl = Application.ResolveDefaultResource<ControlTemplate>(key);
    if (tpl === undefined)
    {
        throw new Error(`Drawer: default template '${key}' is not registered.`);
    }
    return tpl;
}

// Three flavours that closely follow Material Design's drawer variants:
//
//   * Permanent  — fixed strip on an edge that is always visible.
//                  Ignores IsOpen, always reports DrawerSize.
//   * Persistent — toggles between DrawerSize (open) and RailSize
//                  (closed). Lives in host flow; sibling content
//                  resizes to fill the gap. RailSize=0 collapses
//                  fully, RailSize=56 produces Material's mini rail.
//   * Temporary  — overlay drawer with a dismissable scrim. Reports
//                  0 in host flow and mounts itself + scrim onto
//                  PresentationTarget.OverlayRoot when IsOpen=true.
export enum DrawerVariant
{
    Permanent  = 'Permanent',
    Persistent = 'Persistent',
    Temporary  = 'Temporary',
}

// Fallback scrim — 50% black overlay. Used only when neither the
// consumer-set Drawer.ScrimBrush nor the active theme's `@Scrim` token
// resolve. Real production code always has the active theme provide a
// scrim brush via the resource chain (see material/light.mu, dark.mu);
// this constant covers the bare-test case where no theme has been
// activated.
const FALLBACK_SCRIM = new SolidColorBrush(new Color(0, 0, 0, 128));

// Scrim — covers the whole overlay slot under the pane and dismisses
// the drawer when the user clicks anywhere off-pane. Press-here-release-
// here gate matches Button / ClickableBorder semantics so a stray drag
// doesn't trigger an unintended close.
//
// Marks both Down and Up as Handled — the scrim explicitly absorbs all
// pointer input that lands on it so nothing behind the drawer reacts.
// (Visuals on the pane sit on a different bubble route through the
// overlay host and aren't affected.)
//
// Exported for the compiled-`.mu` Drawer overlay template (not public API).
export class ScrimSurface extends Border
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

// Overlay host for the Temporary variant. Arranged at the full surface
// size by OverlayLayer, this panel places the scrim edge-to-edge and
// anchors the pane along Drawer.Anchor at Drawer.DrawerSize.
//
// The host re-reads Anchor / DrawerSize on every ArrangeOverride so a
// runtime swap (Anchor = Right etc.) flows through after the Drawer
// invalidates this host's arrange.
//
// `drawer` is a writable property so the host can be instantiated by
// the compiled `.mu` template (which can't pass constructor args) and
// wired by Drawer after the template has been applied. Arrange is
// defensive — a missing back-reference degrades to a scrim-only pass.
//
// Exported for the compiled-`.mu` Drawer overlay template (not public API).
export class TemporaryOverlayHost extends Panel
{
    public drawer: Drawer | undefined;

    protected override MeasureOverride(availableSize: Size): Size
    {
        for (const c of this.visualChildren) c.Measure(availableSize);
        const w = Number.isFinite(availableSize.Width)  ? availableSize.Width  : 0;
        const h = Number.isFinite(availableSize.Height) ? availableSize.Height : 0;
        return new Size(w, h);
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        const w = finalSize.Width;
        const h = finalSize.Height;
        const drawer = this.drawer;
        const children = this.visualChildren;
        // First child = scrim; second child = pane. AddVisualChild
        // appends in order; the renderer paints in that order so the
        // pane lands on top of the scrim.
        children[0]?.Arrange(new Rect(0, 0, w, h));
        if (children.length >= 2 && drawer !== undefined)
        {
            const anchor = drawer.Anchor;
            const size   = drawer.DrawerSize;
            let x = 0, y = 0, pw = w, ph = h;
            switch (anchor)
            {
                case Dock.Left:   pw = Math.min(size, w); break;
                case Dock.Right:  pw = Math.min(size, w); x = Math.max(0, w - pw); break;
                case Dock.Top:    ph = Math.min(size, h); break;
                case Dock.Bottom: ph = Math.min(size, h); y = Math.max(0, h - ph); break;
            }
            children[1]?.Arrange(new Rect(x, y, pw, ph));
        }
        return finalSize;
    }
}

// Material drawer. Hosts a single Content slot inside a white pane that
// docks to one edge of its host. Variant picks the layout strategy:
//
//   Permanent  — pane always shown at DrawerSize, IsOpen ignored.
//   Persistent — pane width/height switches between DrawerSize (open)
//                and RailSize (closed). Stays in host flow throughout.
//   Temporary  — pane + scrim live in the host's OverlayLayer. Drawer
//                contributes 0 to host flow; open/close mounts/detaches
//                the overlay subtree. Scrim click closes & fires Closed.
//
// Variant is read on first layout pass and then frozen — runtime
// changes after the first measure are ignored. The µ-mural compiler
// emits DP writes before AddChild / Mount, so consumers always get the
// intended Variant honored before measure runs.
//
// Closed event fires whenever a Temporary drawer transitions to closed
// because the scrim was clicked. Programmatic IsOpen=false does NOT
// fire Closed — only user-initiated dismissal does, matching MUI's
// onClose semantics (consumer initiated the close so it doesn't need
// to hear it back).
export class Drawer extends Control
{
    public static readonly AnchorKey     = Model.RegisterProperty<Dock>(             Drawer, 'Anchor',     Dock.Left,                MetaData.Measure | MetaData.Arrange);
    // Variant is registered MetaData.None: it's effectively structural,
    // locked at first layout, so changing it later shouldn't trigger an
    // invalidation cascade that doesn't go anywhere useful.
    public static readonly VariantKey    = Model.RegisterProperty<DrawerVariant>(    Drawer, 'Variant',    DrawerVariant.Persistent, MetaData.None);
    public static readonly IsOpenKey     = Model.RegisterProperty<boolean>(          Drawer, 'IsOpen',     false,                    MetaData.Measure | MetaData.Arrange);
    public static readonly DrawerSizeKey = Model.RegisterProperty<number>(           Drawer, 'DrawerSize', 280,                      MetaData.Measure | MetaData.Arrange);
    public static readonly RailSizeKey   = Model.RegisterProperty<number>(           Drawer, 'RailSize',   0,                        MetaData.Measure | MetaData.Arrange);
    // ScrimBrush — undefined by default; the scrim render path falls
    // back to the active theme's `@Scrim` token, then to FALLBACK_SCRIM
    // (50% black) when no theme is active. Consumers can still pin the
    // brush explicitly via the DP.
    public static readonly ScrimBrushKey = Model.RegisterProperty<Brush | undefined>(Drawer, 'ScrimBrush', undefined,                MetaData.Render);
    public static readonly ContentKey    = Model.RegisterProperty<Visual | undefined>(Drawer, 'Content',   undefined,                MetaData.Measure);

    static {
        Model.OverrideMetadata(Drawer, Visual.DefaultStyleKeyKey, { default_value: Drawer });
        // Registers the consolidated controls theme exactly once so
        // DefaultDrawerPane / DefaultDrawerOverlay resolve via
        // Application.ResolveDefaultResource during construction.
    }

    // ── Template parts (always built; structurally wired lazily) ────
    private readonly _pane:             Border;
    private readonly _contentPresenter: ContentPresenter;
    private _scrim:        ScrimSurface | undefined;
    private _overlayHost:  TemporaryOverlayHost | undefined;

    // Locked at first ensureStructure(); subsequent reads of Variant
    // on the DP are ignored for structural decisions.
    private _effectiveVariant: DrawerVariant | undefined;

    // True when this._overlayHost is currently a child of
    // PresentationTarget.OverlayRoot. Tracked here so we don't double-
    // attach across redundant IsOpen=true writes.
    private _overlayMounted: boolean = false;

    // Tracks the host across SetTarget transitions so we can detach the
    // overlay when the Drawer is removed from the tree while open.
    private _lastKnownTarget: PresentationTarget | undefined;

    // Closed-event listeners, fired only on user-initiated scrim
    // dismissal of a Temporary drawer.
    private readonly _closedListeners: Set<() => void> = new Set();

    constructor()
    {
        super();

        // Pane subtree is resolved through the controls theme; the
        // `drawer.template.mu` source registers it under
        // DefaultDrawerPane. Same pane instance is reused across every
        // Variant — Permanent / Persistent attach it to the Drawer
        // directly, Temporary re-parents it under the overlay host.
        const paneTpl  = resolveTemplate(KEY_PANE);
        const paneInst = paneTpl.Apply(this);
        this._pane = paneInst.root as Border;
        // ControlTemplate.Apply's first-presenter walk finds the
        // ContentPresenter inside the pane subtree without a name.
        this._contentPresenter = paneInst.contentPresenter!;
    }

    // ── DP accessors ────────────────────────────────────────────────
    public get Anchor():     Dock { return this.get_property_value(Drawer.AnchorKey); }
    public set Anchor(v:     Dock) { this.set_property_value(Drawer.AnchorKey, v); }

    public get Variant():    DrawerVariant { return this.get_property_value(Drawer.VariantKey); }
    public set Variant(v:    DrawerVariant) { this.set_property_value(Drawer.VariantKey, v); }

    public get IsOpen():     boolean { return this.get_property_value(Drawer.IsOpenKey); }
    public set IsOpen(v:     boolean) { this.set_property_value(Drawer.IsOpenKey, v); }

    public get DrawerSize(): number { return this.get_property_value(Drawer.DrawerSizeKey); }
    public set DrawerSize(v: number) { this.set_property_value(Drawer.DrawerSizeKey, v); }

    public get RailSize():   number { return this.get_property_value(Drawer.RailSizeKey); }
    public set RailSize(v:   number) { this.set_property_value(Drawer.RailSizeKey, v); }

    public get ScrimBrush(): Brush | undefined { return this.get_property_value(Drawer.ScrimBrushKey); }
    public set ScrimBrush(v: Brush | undefined) { this.set_property_value(Drawer.ScrimBrushKey, v); }

    public get Content(): Visual | undefined { return this.get_property_value(Drawer.ContentKey); }
    public set Content(value: Visual | undefined)
    {
        const old = this.Content;
        if (old === value) return;

        if (old !== undefined)
        {
            // Visually unslot the outgoing content from the presenter
            // BEFORE detaching its logical parent so DetachVisual
            // doesn't trip the "child has a foreign visual parent"
            // safety check on cleanup. Mirrors ContentControl's order.
            this._contentPresenter.SetContent(undefined);
            this.DetachLogical(old);
        }

        this.set_property_value(Drawer.ContentKey, value);

        if (value !== undefined)
        {
            this.AttachLogical(value);
            this._contentPresenter.SetContent(value);
        }
    }

    // ── Closed-event subscription surface ───────────────────────────
    public AddClosedListener(listener: () => void): void
    {
        this._closedListeners.add(listener);
    }

    public RemoveClosedListener(listener: () => void): void
    {
        this._closedListeners.delete(listener);
    }

    private fireClosed(): void
    {
        for (const l of this._closedListeners) l();
    }

    // Resolve the effective scrim brush. Lookup order:
    //   1. Drawer.ScrimBrush DP (consumer-pinned) — caller already
    //      preferred this before calling resolveScrim, so callers pass
    //      `undefined` here only when they want the theme fallback.
    //   2. Active theme's `@Scrim` token via the resource chain.
    //   3. FALLBACK_SCRIM (50% black) for bare-test cases without a
    //      theme.
    private resolveScrim(): Brush
    {
        const themed = this.TryFindResource('Scrim') as Brush | undefined;
        return themed ?? FALLBACK_SCRIM;
    }

    // ── Tree exposure ───────────────────────────────────────────────

    // Visual children depend on the locked Variant:
    //   * Permanent / Persistent → [pane] (pane is in host flow)
    //   * Temporary or pre-lock  → [] (pane lives in overlay or nowhere)
    public override get visualChildren(): readonly Visual[]
    {
        const v = this._effectiveVariant;
        if (v === DrawerVariant.Permanent || v === DrawerVariant.Persistent)
        {
            return [this._pane];
        }
        return [];
    }

    // Logical children always include Content when set — DataContext
    // inheritance flows from Drawer to its body regardless of where the
    // body is parented visually (overlay vs in-flow).
    public override get logicalChildren(): readonly Visual[]
    {
        const c = this.Content;
        return c !== undefined ? [c] : [];
    }

    protected override propagate_inheritance_to_logical_children(): void
    {
        this.Content?.['refresh_inheritance_subtree']();
    }

    protected override propagate_inheritance_for_logical_children(descriptor: PropertyDescriptor): void
    {
        this.Content?.['refresh_inherited'](descriptor);
    }

    // Target propagation hooks the lifecycle moments where the Drawer
    // enters / leaves a tree:
    //
    //   * Entering a tree → cascade to the in-flow pane (when applicable)
    //                       and re-evaluate the overlay-mount state
    //                       (the temporary drawer might already be IsOpen).
    //   * Leaving a tree  → tear down any overlay we previously mounted
    //                       on the OLD target so nothing stays orphaned
    //                       in the host's OverlayRoot.
    protected override propagate_target_to_visual_children(): void
    {
        const newTarget = this['target'] as PresentationTarget | undefined;
        const oldTarget = this._lastKnownTarget;

        if (oldTarget !== undefined && oldTarget !== newTarget && this._overlayMounted)
        {
            oldTarget.DetachOverlay(this._overlayHost!);
            this._overlayMounted = false;
        }

        this._lastKnownTarget = newTarget;

        // Lock in the structural decision (Variant) as soon as a host
        // is attached. This is reliably earlier than the first measure
        // — host-attach happens immediately on AddChild + Content
        // assignment, whereas MeasureOverride only runs once a parent
        // chooses to recursively measure us. Variant must be locked
        // before any IsOpen toggle so applyOpenState has the structure
        // it needs.
        if (newTarget !== undefined)
        {
            this.ensureStructure();
        }

        const v = this._effectiveVariant;
        if (v === DrawerVariant.Permanent || v === DrawerVariant.Persistent)
        {
            // AttachVisual already cascaded target into _pane the first
            // time ensureStructure ran. This re-cascade matters on a
            // later target swap (reparenting); the SetTarget early-out
            // makes a same-value call free.
            this._pane['SetTarget'](newTarget);
        }
        else if (v === DrawerVariant.Temporary && newTarget !== undefined)
        {
            // Re-apply IsOpen now that we know where to mount.
            this.applyOpenState();
        }
    }

    // ── Layout ──────────────────────────────────────────────────────

    // Materialise the structural wiring driven by Variant. Called once,
    // from the first MeasureOverride. After this returns the Drawer's
    // structural shape is frozen even if Variant is reassigned.
    private ensureStructure(): void
    {
        if (this._effectiveVariant !== undefined) return;
        this._effectiveVariant = this.Variant;

        switch (this._effectiveVariant)
        {
            case DrawerVariant.Permanent:
            case DrawerVariant.Persistent:
                this.AttachVisual(this._pane);
                break;

            case DrawerVariant.Temporary:
            {
                // Overlay host + scrim subtree is resolved from
                // DefaultDrawerOverlay in the controls theme. The pane
                // (already built from the pane template in the
                // constructor) is AddVisualChild'd here so the same
                // instance flips from "unattached" → "child of overlay
                // host" without rebuilding the ContentPresenter's
                // logical wiring.
                const overlayTpl  = resolveTemplate(KEY_OVERLAY);
                const overlayInst = overlayTpl.Apply(this);
                this._overlayHost  = overlayInst.root as TemporaryOverlayHost;
                this._scrim        = overlayInst.root.FindName('PART_Scrim') as ScrimSurface;
                this._overlayHost.drawer = this;
                this._scrim.Background = this.resolveScrim();
                this._scrim.onClick = (): void =>
                {
                    // User-initiated dismissal: flip IsOpen and tell
                    // listeners. Programmatic IsOpen=false intentionally
                    // does NOT fire Closed — see class comment.
                    if (this.IsOpen)
                    {
                        this.IsOpen = false;
                        this.fireClosed();
                    }
                };
                // Order matters — the scrim was added by the template
                // as the first visual child so it paints behind; the
                // pane appended here lands on top.
                this._overlayHost.AddVisualChild(this._pane);
                break;
            }
        }
    }

    // Effective size along the anchor axis based on locked Variant +
    // current IsOpen + DrawerSize / RailSize. Permanent ignores IsOpen.
    private paneAxisSize(): number
    {
        switch (this._effectiveVariant)
        {
            case DrawerVariant.Permanent:  return this.DrawerSize;
            case DrawerVariant.Persistent: return this.IsOpen ? this.DrawerSize : this.RailSize;
            case DrawerVariant.Temporary:  return 0;
            default:                       return 0;
        }
    }

    private isVerticalAnchor(): boolean
    {
        const a = this.Anchor;
        return a === Dock.Top || a === Dock.Bottom;
    }

    protected override MeasureOverride(availableSize: Size): Size
    {
        this.ensureStructure();
        const v = this._effectiveVariant!;
        if (v === DrawerVariant.Temporary)
        {
            // Out-of-flow — host gives the drawer's pre-flow slot to
            // siblings. Layout still measures the in-overlay pane via
            // OverlayLayer's pass.
            return Size.Zero;
        }

        const paneSize = this.paneAxisSize();
        const vertical = this.isVerticalAnchor();
        const childAvail = vertical
            ? new Size(availableSize.Width, paneSize)
            : new Size(paneSize, availableSize.Height);
        this._pane.Measure(childAvail);

        // Drawer reports paneSize along the anchor axis; the cross axis
        // adopts the pane's desired size so a horizontal Drawer in a
        // DockPanel cross-axis stretches naturally.
        return vertical
            ? new Size(this._pane.DesiredSize.Width, paneSize)
            : new Size(paneSize, this._pane.DesiredSize.Height);
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        const v = this._effectiveVariant;
        if (v === undefined || v === DrawerVariant.Temporary) return finalSize;
        this._pane.Arrange(new Rect(0, 0, finalSize.Width, finalSize.Height));
        return finalSize;
    }

    protected override RenderOverride(_dc: DrawingContext): void { }

    // ── DP reactions ────────────────────────────────────────────────
    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        switch (descriptor.Name)
        {
            case 'IsOpen':
                this.applyOpenState();
                break;
            case 'Anchor':
            case 'DrawerSize':
                this._overlayHost?.InvalidateArrange();
                break;
            case 'ScrimBrush':
                if (this._scrim !== undefined)
                {
                    this._scrim.Background = (newValue as Brush | undefined) ?? this.resolveScrim();
                }
                break;
        }
    }

    // Mount / unmount the overlay host based on (IsOpen, target). A
    // no-op for non-Temporary variants and during the pre-attach window
    // (target undefined). Tolerates being called repeatedly — multiple
    // IsOpen=true in a row mount once.
    private applyOpenState(): void
    {
        if (this._effectiveVariant !== DrawerVariant.Temporary) return;
        const pt = this['target'] as PresentationTarget | undefined;
        if (pt === undefined) return;
        if (this._overlayHost === undefined) return;

        const open = this.IsOpen;
        if (open && !this._overlayMounted)
        {
            pt.AttachOverlay(this._overlayHost);
            this._overlayMounted = true;
        }
        else if (!open && this._overlayMounted)
        {
            pt.DetachOverlay(this._overlayHost);
            this._overlayMounted = false;
        }
    }
}
