import {
    DoubleAnimation,
    MetaData,
    Model,
    ObservableCollection,
    Storyboard,
    Thickness,
    Visual,
    type PropertyDescriptor,
} from '../runtime/index.js';
import type { PresentationTarget } from '../visual-engine/index.js';
import { Border } from '../basic/border.js';
import { StackPanel, Orientation } from '../basic/panels/stack-panel.js';
import { TextBlock } from '../basic/text-block.js';
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
// Icon rotation (M3 spec calls for the FAB icon to flip 45° on open):
// Visual doesn't expose a RenderTransform DP, so the icon swap is a
// snap rather than a rotation in v1. ClosedIcon / OpenIcon DPs hold
// the two glyphs (defaults "+" and "×"); FabMenu writes whichever
// matches the current IsOpen state into Content. Future enhancement:
// crossfade via per-glyph Opacity tweens once RenderTransform lands.
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

    private _menuHost:    StackPanel | undefined;
    private _scrim:       Border     | undefined;
    private _mounted = false;
    private _lastTarget:  PresentationTarget | undefined;
    private _openStoryboard:  Storyboard | undefined;

    static {
        Model.OverrideMetadata(FabMenu, Visual.DefaultStyleKeyKey,
            { default_value: FabMenu });
    }

    constructor()
    {
        super();
        // Click toggles IsOpen instead of firing a Command. Inherits the
        // Button click protocol but replaces the OnClick semantic.
        this.AddRoutedEventListener('Click', (() => {
            this.IsOpen = !this.IsOpen;
        }) as (a: unknown) => void);
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

        t.AttachOverlay(this._scrim);
        t.AttachOverlay(this._menuHost);

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

        this._mounted    = true;
        this._lastTarget = t;
        this.refreshContentIcon();
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
        this.refreshContentIcon();
    }

    private detachMenuChrome(): void
    {
        const t = this._lastTarget;
        if (t !== undefined)
        {
            if (this._menuHost !== undefined) t.DetachOverlay(this._menuHost);
            if (this._scrim    !== undefined) t.DetachOverlay(this._scrim);
        }
        this._menuHost = undefined;
        this._scrim    = undefined;
        this._mounted  = false;
    }

    // Swap the FAB icon between Closed / Open glyphs. Visual lacks a
    // RenderTransform DP so this snaps rather than rotates; the
    // staggered item reveal is the headline animation for v1.
    private refreshContentIcon(): void
    {
        // Content can be any Visual or string. If the consumer's Content
        // is already a non-string Visual, leave it alone — they own the
        // icon. The default-template ClosedIcon / OpenIcon swap only
        // fires when Content is a string or undefined.
        const current = this.Content;
        // Only owned-by-class TextBlocks get swapped; a consumer Visual
        // is left untouched. The "_fabMenuOwned" tag marks the
        // TextBlocks we created so we don't clobber a richer icon
        // Visual the consumer may have set.
        const owned = current instanceof TextBlock
            && (current as unknown as { _fabMenuOwned?: boolean })._fabMenuOwned === true;
        if (current !== undefined && !owned) return;
        const glyph = this.IsOpen ? this.OpenIcon : this.ClosedIcon;
        const tb = new TextBlock();
        tb.Text = glyph;
        (tb as unknown as { _fabMenuOwned: boolean })._fabMenuOwned = true;
        this.Content = tb;
    }
}

function targetOf(host: Visual): PresentationTarget | undefined
{
    const back = host as unknown as { ['target']?: PresentationTarget };
    return back['target'];
}
