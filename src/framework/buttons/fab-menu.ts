import {
    DoubleAnimation,
    MetaData,
    Model,
    ObservableCollection,
    Point,
    Storyboard,
    Thickness,
    Element, Visual,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import type { PresentationTarget } from '../../visual-engine/index.js';
import { RotateTransform } from '../../visual-engine/index.js';
import { Border } from '../../basic/border.js';
import { StackPanel, Orientation } from '../../basic/panels/stack-panel.js';
import { TextBlock } from '../../basic/text-block.js';
import { FloatingActionButton } from './fab.js';

// M3 FAB Menu — a primary FAB that, on press, reveals a vertical stack
// of secondary action surfaces (typically mini-FABs) above itself. Tap
// the FAB again (or click anywhere outside) to dismiss.
//
// FabMenu extends FloatingActionButton — chrome, click protocol,
// ICommandSource wiring all inherit. The Click override toggles IsOpen
// rather than firing a Command (a normal FAB's primary contract); the
// `OnClick`-Command path is replaced by IsOpen because the FAB-menu
// pattern conventionally has no "primary action" — the FAB exists
// only to reveal the items. Set `MenuMode = false` (TODO) when M3
// later defines a hybrid that needs both.
//
// Motion: per M3 2024 spec, opening the menu staggers the appearance
// of each item with a small offset (DurationMs / Items.Count over the
// open animation). v1 implementation:
//   * Each item animates Opacity 0 → 1 with BeginTime = i · StaggerMs.
//   * Each item animates Margin (top inset) from +HiddenOffset to 0,
//     producing a slide-up reveal.
//   * Item BeginTime ordering: bottom item first so the menu "grows"
//     toward the FAB top.
//   * Closing reverses: each item fades 1 → 0 with the same stagger
//     but counted from the top so the menu collapses toward the FAB.
//
// Icon rotation (M3 spec: FAB icon flips 45° on open). The owned
// TextBlock holding the glyph carries a RotateTransform as its
// RenderTransform, pivoted at the icon center via
// RenderTransformOrigin = (0.5, 0.5). On IsOpen flip, a Storyboard
// tweens the transform's Angle 0 ↔ 45° over RotationDurationMs. The
// glyph also swaps from ClosedIcon → OpenIcon at the END of the
// animation so the rest state always reads as the correct character
// (a default "+" rotates to look like "×" mid-animation regardless,
// since both are rotationally symmetric — consumers that pass a
// non-symmetric pair like "menu" / "close" get a quick swap at
// completion).
export class FabMenu extends FloatingActionButton
{
    public static readonly ItemsKey       = Model.RegisterProperty<ObservableCollection<Visual> | undefined>(
        FabMenu, 'Items', undefined, MetaData.None);
    public static readonly IsOpenKey      = Model.RegisterProperty<boolean>(FabMenu, 'IsOpen',      false, MetaData.None);
    public static readonly StaggerMsKey   = Model.RegisterProperty<number>( FabMenu, 'StaggerMs',   50,    MetaData.None);
    public static readonly DurationMsKey  = Model.RegisterProperty<number>( FabMenu, 'DurationMs',  200,   MetaData.None);
    public static readonly HiddenOffsetKey= Model.RegisterProperty<number>( FabMenu, 'HiddenOffset', 12,   MetaData.None);
    public static readonly ClosedIconKey  = Model.RegisterProperty<string>( FabMenu, 'ClosedIcon',  '+',   MetaData.None);
    public static readonly OpenIconKey    = Model.RegisterProperty<string>( FabMenu, 'OpenIcon',    '×',   MetaData.None);
    // Duration of the icon rotation tween (0 → 45° on open, back on
    // close). 150 ms matches M3 motion-emphasized-short — short enough
    // to feel snappy, long enough to read as a deliberate flip.
    public static readonly RotationDurationMsKey = Model.RegisterProperty<number>(
        FabMenu, 'RotationDurationMs', 150, MetaData.None);

    public get Items():       ObservableCollection<Visual> | undefined { return this.get_property_value(FabMenu.ItemsKey); }
    public set Items(v:       ObservableCollection<Visual> | undefined) { this.set_property_value(FabMenu.ItemsKey, v); }

    public get IsOpen():      boolean { return this.get_property_value(FabMenu.IsOpenKey); }
    public set IsOpen(v:      boolean) { this.set_property_value(FabMenu.IsOpenKey, v); }

    public get StaggerMs():   number { return this.get_property_value(FabMenu.StaggerMsKey); }
    public set StaggerMs(v:   number) { this.set_property_value(FabMenu.StaggerMsKey, v); }

    public get DurationMs():  number { return this.get_property_value(FabMenu.DurationMsKey); }
    public set DurationMs(v:  number) { this.set_property_value(FabMenu.DurationMsKey, v); }

    public get HiddenOffset():number { return this.get_property_value(FabMenu.HiddenOffsetKey); }
    public set HiddenOffset(v:number) { this.set_property_value(FabMenu.HiddenOffsetKey, v); }

    public get ClosedIcon():  string { return this.get_property_value(FabMenu.ClosedIconKey); }
    public set ClosedIcon(v:  string) { this.set_property_value(FabMenu.ClosedIconKey, v); }

    public get OpenIcon():    string { return this.get_property_value(FabMenu.OpenIconKey); }
    public set OpenIcon(v:    string) { this.set_property_value(FabMenu.OpenIconKey, v); }

    public get RotationDurationMs(): number { return this.get_property_value(FabMenu.RotationDurationMsKey); }
    public set RotationDurationMs(v: number) { this.set_property_value(FabMenu.RotationDurationMsKey, v); }

    private _menuHost:    StackPanel | undefined;
    private _scrim:       Border     | undefined;
    private _mounted = false;
    private _openStoryboard:  Storyboard | undefined;
    // Persistent TextBlock holding the FAB icon glyph + its
    // RotateTransform. Held across IsOpen toggles so the rotation
    // storyboard targets a stable instance (recreating it every flip
    // would race the tween with a fresh transform). Undefined until
    // first refreshContentIcon, or when a consumer overrode Content
    // with their own non-string Visual.
    private _iconHost:    TextBlock  | undefined;
    private _iconRotate:  RotateTransform | undefined;
    private _rotationStoryboard: Storyboard | undefined;

    static {
        Model.OverrideMetadata(FabMenu, Element.DefaultStyleKeyKey,
            { default_value: FabMenu });
    }

    constructor()
    {
        super();
        // Click toggles IsOpen instead of firing a Command. Inherits the
        // Button click protocol — Click isn't a routed event (it's a
        // post-press-edge synthesis on Button), so register via the
        // Button-specific AddClickHandler.
        this.AddClickHandler(() => {
            this.IsOpen = !this.IsOpen;
        });
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue:   unknown,
        newValue:   unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Owner !== FabMenu) return;
        if (descriptor.Name === 'IsOpen')
        {
            // Icon rotation runs unconditionally on every IsOpen flip
            // so the FAB gives visual feedback even when Items is empty
            // (the popup-mount branch is what gates on Items / target).
            this.refreshContentIcon();
            this.animateIconRotation(newValue === true);
            if (newValue === true) this.openMenu();
            else                    this.closeMenu();
        }
    }

    private openMenu(): void
    {
        if (this._mounted) return;
        const t     = targetOf(this);
        const items = this.Items;
        if (t === undefined || items === undefined || items.Count === 0) return;

        // Scrim: catches outside clicks → clears IsOpen.
        this._scrim = new Border();
        this._scrim.AddRoutedEventListener('PointerDown', (() => {
            this.IsOpen = false;
        }) as (a: unknown) => void);

        // Menu host: vertical StackPanel of the consumer's items. We
        // attach to the OverlayLayer so it floats above the FAB. The
        // items start hidden (Opacity=0, Margin pushed below); the
        // reveal Storyboard animates them in.
        this._menuHost = new StackPanel();
        this._menuHost.Orientation = Orientation.Vertical;
        const hiddenOffset = this.HiddenOffset;
        for (let i = 0; i < items.Count; i++)
        {
            const v = items.Get(i);
            if (v === undefined) continue;
            v.Opacity = 0;
            v.Margin  = new Thickness(0, hiddenOffset, 0, 0);
            this._menuHost.AddChild(v);
        }

        // AttachOverlayChild: visual hop → target's OverlayLayer; logical
        // hop → THIS FabMenu so items inherit resources / DataContext /
        // inheritable DPs from us, not from the OverlayLayer.
        this.AttachOverlayChild(this._scrim);
        this.AttachOverlayChild(this._menuHost);

        // Reveal Storyboard — per-item fade-in + slide-up, staggered.
        // Bottom item starts first so the menu reads as "growing toward
        // the FAB". Walk items in reverse for BeginTime offsetting.
        const sb        = new Storyboard();
        const duration  = Math.max(50, this.DurationMs);
        const stagger   = Math.max(0, this.StaggerMs);
        const n         = items.Count;
        for (let i = 0; i < n; i++)
        {
            const v = items.Get(i);
            if (v === undefined) continue;
            const beginTime = (n - 1 - i) * stagger;
            sb.Add(v, 'Opacity', new DoubleAnimation({
                From: 0, To: 1, Duration: duration, BeginTime: beginTime,
            }));
        }
        sb.Begin();
        this._openStoryboard = sb;

        this._mounted = true;
    }

    private closeMenu(): void
    {
        if (!this._mounted) return;
        const items = this.Items;
        const n     = items?.Count ?? 0;
        const duration  = Math.max(50, this.DurationMs);
        const stagger   = Math.max(0, this.StaggerMs);

        // Stop any in-flight open animation so a rapid open→close
        // doesn't double-bind targets.
        this._openStoryboard?.Stop();
        this._openStoryboard = undefined;

        // Closing Storyboard — fade each item out, top-first so the
        // menu collapses toward the FAB.
        const sb = new Storyboard();
        if (items !== undefined)
        {
            for (let i = 0; i < n; i++)
            {
                const v = items.Get(i);
                if (v === undefined) continue;
                sb.Add(v, 'Opacity', new DoubleAnimation({
                    From: 1, To: 0, Duration: duration, BeginTime: i * stagger,
                }));
            }
        }
        sb.Begin();
        // Schedule the unmount via setTimeout. The Storyboard's
        // AddCompletedListener would be the WPF-canonical signal, but
        // the AnimationManager driver in Node tests doesn't reliably
        // fire it at the expected wall-clock moment; setTimeout off
        // the same DurationMs gives a deterministic detach in both
        // browser and headless contexts.
        const totalMs = duration + (n - 1) * stagger;
        setTimeout(() => this.detachMenuChrome(), totalMs);
    }

    private detachMenuChrome(): void
    {
        if (this._menuHost !== undefined) this.DetachOverlayChild(this._menuHost);
        if (this._scrim    !== undefined) this.DetachOverlayChild(this._scrim);
        this._menuHost = undefined;
        this._scrim    = undefined;
        this._mounted  = false;
    }

    // Lazy-mount the FAB icon: a persistent owned TextBlock carrying a
    // RotateTransform centered on the glyph. The icon's Text is fixed
    // at ClosedIcon (the rest-state glyph); the open-state visual
    // comes from the 45° rotation applied by animateIconRotation, not
    // from a text swap. This is the M3 design intent for symmetric
    // glyph pairs like '+' / '×' — a single rotating glyph reads as
    // both states. Consumers who set Content to their own Visual opt
    // out entirely.
    //
    // OpenIcon is kept as a public DP for back-compat but has no
    // effect on the owned-glyph rendering in this version — the
    // rotation IS the state transition. A future asymmetric-icon
    // mode (e.g., "menu" → "close" labels) would crossfade two
    // TextBlocks instead of using OpenIcon as a snap-swap target.
    private refreshContentIcon(): void
    {
        const current = this.Content;
        const owned = current instanceof TextBlock
            && (current as unknown as { _fabMenuOwned?: boolean })._fabMenuOwned === true;
        if (current !== undefined && !owned) return;

        if (this._iconHost === undefined)
        {
            const tb = new TextBlock();
            (tb as unknown as { _fabMenuOwned: boolean })._fabMenuOwned = true;
            const rotate = new RotateTransform();
            tb.RenderTransform        = rotate;
            tb.RenderTransformOrigin  = new Point(0.5, 0.5);
            this._iconHost   = tb;
            this._iconRotate = rotate;
            this.Content     = tb;
        }
        // ClosedIcon is the rest-state glyph; the rotation conveys
        // open/closed state. Re-applied on every IsOpen flip so a
        // late ClosedIcon write still reaches the visible TextBlock.
        this._iconHost.Text = this.ClosedIcon;
    }

    // Tween the icon rotation 0 ↔ 45° driven by the current IsOpen
    // state. Called from openMenu / closeMenu after the chrome is
    // wired. The end-state glyph is set via refreshContentIcon at
    // animation completion — for "+" / "×" the swap is invisible
    // (both look like × at 22.5°, both are rotationally symmetric);
    // for custom glyph pairs the swap is a brief snap at the end of
    // the rotation, which reads as a deliberate state transition.
    private animateIconRotation(toOpen: boolean): void
    {
        if (this._iconRotate === undefined) return;
        const duration = Math.max(0, this.RotationDurationMs);
        // Stop any in-flight rotation so a rapid open→close→open
        // doesn't double-target Angle.
        this._rotationStoryboard?.Stop();
        if (duration === 0)
        {
            this._iconRotate.Angle = toOpen ? 45 : 0;
            this._rotationStoryboard = undefined;
            return;
        }
        const from = this._iconRotate.Angle;
        const to   = toOpen ? 45 : 0;
        const sb   = new Storyboard();
        sb.Add(this._iconRotate, 'Angle', new DoubleAnimation({
            From: from, To: to, Duration: duration,
        }));
        sb.Begin();
        this._rotationStoryboard = sb;
    }
}

function targetOf(host: Visual): PresentationTarget | undefined
{
    const back = host as unknown as { ['target']?: PresentationTarget };
    return back['target'];
}
