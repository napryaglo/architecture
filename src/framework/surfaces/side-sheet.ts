import {
    MetaData,
    Model,
    Panel,
    Rect,
    Size,
    Color,
    Element, Visual,
    type DrawingContext,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import { PresentationTarget, SolidColorBrush, type Brush } from '../../visual-engine/index.js';
import { ContentControl } from '../base/content-control.js';
import { Dock } from '../../basic/panels/dock-panel.js';
import { ScrimSurface } from './drawer.js';

// Material 3 Side Sheet — a container docked to a screen's trailing (or
// leading) edge for supplementary content: filters, details, a tool
// palette (§18.9). The lateral companion to BottomSheet.
//
// Two variants, following the M3 spec:
//   * Standard — docked in-flow. The sheet coexists with the page; sibling
//     content lays out beside it. IsOpen toggles the sheet between
//     SheetSize (open) and 0 (closed), so a host DockPanel reflows around
//     it. No scrim.
//   * Modal — overlay. The sheet floats above the page over a dismissable
//     scrim; the control contributes 0 to host flow and mounts its sheet +
//     scrim onto the PresentationTarget's OverlayLayer when IsOpen. A scrim
//     click closes the sheet and fires Closed.
//
// Like Drawer (since §18.12 both resolve their chrome through a real
// `Template` DP + default Style, not a resolveXxx-from-ctor string key),
// SideSheet is a proper TemplatedControl: the sheet
// chrome is a `Template` ControlTemplate DP set on the default Style. The
// ctor calls applyDefaultStyle(), reads the materialised template root, and
// wires the named close button. Standard keeps that root as its in-flow
// visual child (Control's default); Modal re-parents it under an overlay
// host beside the scrim.
//
// Anchor is Left or Right (M3 side sheets are lateral); Top/Bottom are not
// meaningful here — use BottomSheet for the bottom edge. Default Right, the
// M3 trailing-edge default.
export enum SideSheetVariant
{
    Standard = 'Standard',
    Modal    = 'Modal',
}

// Fallback scrim (50% black) for the bare-test case where no theme
// supplies an `@Scrim` token. Production always resolves the themed scrim.
const FALLBACK_SCRIM = new SolidColorBrush(new Color(0, 0, 0, 128));

// Overlay host for the Modal variant. Arranged at the full surface size by
// OverlayLayer; places the scrim edge-to-edge and anchors the sheet along
// SideSheet.Anchor at SideSheet.SheetSize. Re-reads Anchor / SheetSize on
// every arrange so a runtime swap flows through after the sheet invalidates
// this host's arrange.
//
// Exported for symmetry with Drawer's host, but not public API.
export class SideSheetOverlayHost extends Panel
{
    public sheet: SideSheet | undefined;

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
        const children = this.visualChildren;
        // First child = scrim (painted behind); second child = sheet.
        children[0]?.Arrange(new Rect(0, 0, w, h));
        const sheet = this.sheet;
        if (children.length >= 2 && sheet !== undefined)
        {
            const size = Math.min(sheet.SheetSize, w);
            const x = sheet.Anchor === Dock.Left ? 0 : Math.max(0, w - size);
            children[1]?.Arrange(new Rect(x, 0, size, h));
        }
        return finalSize;
    }
}

export class SideSheet extends ContentControl
{
    public static readonly VariantKey   = Model.RegisterProperty<SideSheetVariant>(   SideSheet, 'Variant',   SideSheetVariant.Standard, MetaData.None);
    public static readonly AnchorKey     = Model.RegisterProperty<Dock>(               SideSheet, 'Anchor',     Dock.Right,               MetaData.Measure | MetaData.Arrange);
    // BindsTwoWayByDefault (like ToggleButton.IsChecked): a scrim / close-
    // button dismissal writes IsOpen=false on the control, and a `$IsOpen`
    // binding carries that back to a bound VM without an explicit mode.
    public static readonly IsOpenKey     = Model.RegisterProperty<boolean>(            SideSheet, 'IsOpen',     false,                    MetaData.Measure | MetaData.Arrange | MetaData.BindsTwoWayByDefault);
    public static readonly SheetSizeKey  = Model.RegisterProperty<number>(             SideSheet, 'SheetSize',  320,                      MetaData.Measure | MetaData.Arrange);
    public static readonly TitleKey      = Model.RegisterProperty<string>(             SideSheet, 'Title',      '',                       MetaData.Render);
    public static readonly ScrimBrushKey = Model.RegisterProperty<Brush | undefined>( SideSheet, 'ScrimBrush', undefined,                MetaData.Render);

    static
    {
        Model.OverrideMetadata(SideSheet, Element.DefaultStyleKeyKey, { default_value: SideSheet });
    }

    // Locked at first ensureStructure() (target-attach) — subsequent Variant
    // reads are ignored for structural decisions, matching Drawer.
    private _effectiveVariant: SideSheetVariant | undefined;
    private _overlayHost:   SideSheetOverlayHost | undefined;
    private _scrim:         ScrimSurface | undefined;
    private _overlayMounted = false;
    private _lastKnownTarget: PresentationTarget | undefined;
    private readonly _closedListeners = new Set<() => void>();

    constructor()
    {
        super();
        this.applyDefaultStyle();
        this.wireCloseButton();
    }

    // ── DP accessors ────────────────────────────────────────────────
    public get Variant():    SideSheetVariant { return this.get_property_value(SideSheet.VariantKey); }
    public set Variant(v:    SideSheetVariant) { this.set_property_value(SideSheet.VariantKey, v); }

    public get Anchor():     Dock { return this.get_property_value(SideSheet.AnchorKey); }
    public set Anchor(v:     Dock) { this.set_property_value(SideSheet.AnchorKey, v); }

    public get IsOpen():     boolean { return this.get_property_value(SideSheet.IsOpenKey); }
    public set IsOpen(v:     boolean) { this.set_property_value(SideSheet.IsOpenKey, v); }

    public get SheetSize():  number { return this.get_property_value(SideSheet.SheetSizeKey); }
    public set SheetSize(v:  number) { this.set_property_value(SideSheet.SheetSizeKey, v); }

    public get Title():      string { return this.get_property_value(SideSheet.TitleKey); }
    public set Title(v:      string) { this.set_property_value(SideSheet.TitleKey, v); }

    public get ScrimBrush(): Brush | undefined { return this.get_property_value(SideSheet.ScrimBrushKey); }
    public set ScrimBrush(v: Brush | undefined) { this.set_property_value(SideSheet.ScrimBrushKey, v); }

    // Fires only on user-initiated scrim / close-button dismissal — not on
    // a programmatic IsOpen=false (the consumer already knows).
    public AddClosedListener(l: () => void): void { this._closedListeners.add(l); }
    public RemoveClosedListener(l: () => void): void { this._closedListeners.delete(l); }
    private fireClosed(): void { for (const l of [...this._closedListeners]) l(); }

    // The default-template close button (PART_CloseButton) dismisses the
    // sheet. Optional — a re-template can omit it.
    private wireCloseButton(): void
    {
        const btn = this.GetTemplateChild('PART_CloseButton') as
            (Visual & { AddClickHandler?: (h: () => void) => void }) | undefined;
        btn?.AddClickHandler?.(() =>
        {
            if (this.IsOpen)
            {
                this.IsOpen = false;
                this.fireClosed();
            }
        });
    }

    private resolveScrim(): Brush
    {
        return this.ScrimBrush ?? (this.TryFindResource('Scrim') as Brush | undefined) ?? FALLBACK_SCRIM;
    }

    // ── Tree exposure ───────────────────────────────────────────────
    // Standard keeps the sheet (template root) in-flow — Control's default
    // visualChildren. Modal pulls it out of flow (it lives in the overlay),
    // so hide it from the in-flow tree.
    public override get visualChildren(): readonly Visual[]
    {
        if (this._effectiveVariant === SideSheetVariant.Modal) return [];
        return super.visualChildren;
    }

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

        if (newTarget !== undefined) this.ensureStructure();

        if (this._effectiveVariant === SideSheetVariant.Modal)
        {
            if (newTarget !== undefined) this.applyOpenState();
        }
        else
        {
            super.propagate_target_to_visual_children();
        }
    }

    // Freeze the structural shape from Variant on first host-attach. For
    // Modal, detach the in-flow sheet root and re-host it under an overlay
    // host beside a scrim (mount happens lazily on IsOpen).
    private ensureStructure(): void
    {
        if (this._effectiveVariant !== undefined) return;
        this._effectiveVariant = this.Variant;
        if (this._effectiveVariant !== SideSheetVariant.Modal) return;

        const sheet = this.templateRoot;
        if (sheet === undefined) return;
        // Pull the sheet out of the control's in-flow visual position.
        if ((sheet as unknown as { _visualParent?: Visual })._visualParent === this)
        {
            this.DetachVisual(sheet);
        }
        const host = new SideSheetOverlayHost();
        host.sheet = this;
        const scrim = new ScrimSurface();
        scrim.Fill = this.resolveScrim();
        scrim.onClick = (): void =>
        {
            if (this.IsOpen) { this.IsOpen = false; this.fireClosed(); }
        };
        // Scrim first (paints behind), sheet on top.
        host.AddVisualChild(scrim);
        host.AddVisualChild(sheet);
        this._overlayHost = host;
        this._scrim = scrim;
    }

    // ── Layout (Standard variant only; Modal is out-of-flow) ─────────
    protected override MeasureOverride(availableSize: Size): Size
    {
        // Lock the structural shape on first measure (mirrors attach-time
        // locking) so a Modal sheet measured before it's mounted still
        // reports 0 in host flow.
        this.ensureStructure();
        if (this._effectiveVariant === SideSheetVariant.Modal) return Size.Zero;
        const root = this.templateRoot;
        if (root === undefined) return Size.Zero;
        // Closed → 0 along the lateral axis so a docked host collapses the
        // slot. Open → SheetSize wide, full available height.
        const width = this.IsOpen ? this.SheetSize : 0;
        root.Measure(new Size(width, availableSize.Height));
        return new Size(width, root.DesiredSize.Height);
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        if (this._effectiveVariant === SideSheetVariant.Modal) return finalSize;
        this.templateRoot?.Arrange(new Rect(0, 0, finalSize.Width, finalSize.Height));
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
        // Control.OnPropertyChanged rebuilds the template on a Template
        // change — re-wire the (possibly new) close button after it.
        if (descriptor.Name === 'Template' && newValue !== oldValue)
        {
            this.wireCloseButton();
            return;
        }
        switch (descriptor.Name)
        {
            case 'IsOpen':
                this.applyOpenState();
                break;
            case 'Anchor':
            case 'SheetSize':
                this._overlayHost?.InvalidateArrange();
                break;
            case 'ScrimBrush':
                if (this._scrim !== undefined) this._scrim.Fill = this.resolveScrim();
                break;
        }
    }

    // Mount / unmount the Modal overlay from (IsOpen, target). No-op for
    // Standard and during the pre-attach window. Idempotent.
    private applyOpenState(): void
    {
        if (this._effectiveVariant !== SideSheetVariant.Modal) return;
        const pt = this['target'] as PresentationTarget | undefined;
        if (pt === undefined || this._overlayHost === undefined) return;

        if (this.IsOpen && !this._overlayMounted)
        {
            this.AttachOverlayChild(this._overlayHost);
            this._overlayMounted = true;
        }
        else if (!this.IsOpen && this._overlayMounted)
        {
            this.DetachOverlayChild(this._overlayHost);
            this._overlayMounted = false;
        }
    }
}
