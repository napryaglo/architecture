import {
    MetaData,
    MuralBase,
    Element, Visual,
    type PointerEventArgs,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import { ContentControl } from '../base/content-control.js';
import { ContentPresenter } from '../../basic/templates/content-presenter.js';
import { Selector } from '../list/selector.js';
import { TextBlock } from '../../basic/text-block.js';

// Material 3 NavigationItem — a single destination row shared by
// NavigationRail (vertical side rail) and NavigationBar (horizontal
// bottom tab strip). Mirrors WPF / UWP's NavigationViewItem.
//
// Anatomy (M3):
//   * Icon container — pill-shaped (56dp × 32dp). Fill is
//     transparent at rest, @SecondaryContainer when selected.
//   * Icon — 24dp glyph slotted via the `Icon` DP. Ink: @OnSurfaceVariant
//     at rest, @OnSecondaryContainer when selected.
//   * Label — single-line text below the icon container. Typography
//     @LabelMediumXxx. Ink: @OnSurfaceVariant at rest, @OnSurface
//     (Medium weight) when selected.
//
// IsSelected mirrors the canonical Selector.IsSelected attached DP via
// the standard ListBoxItem-style sync pattern — Selector writes the
// attached DP, the instance DP is observable by template triggers
// (`when ( IsSelected ) { … }`).
//
// Click handling: press-here-release-here gate; on release the event
// walks logical parents to find the owning Selector and routes
// HandleContainerClick with the originating PointerEventArgs.Modifiers.
// Selected state flips through the Selector base; this class doesn't
// own selection state directly.
export class NavigationItem extends ContentControl
{
    public static readonly IconKey = MuralBase.RegisterProperty<Visual | undefined>(
        NavigationItem, 'Icon', undefined, MetaData.Render,
    );

    public static readonly LabelKey = MuralBase.RegisterProperty<string>(
        NavigationItem, 'Label', '', MetaData.Render,
    );

    // Instance-level IsSelected mirror — see ListBoxItem for the
    // rationale (Selector.IsSelected is the source of truth; the
    // instance DP is what template triggers can subscribe to).
    public static readonly IsSelectedKey = MuralBase.RegisterProperty<boolean>(
        NavigationItem, 'IsSelected', false, MetaData.Render,
    );

    static
    {
        MuralBase.OverrideMetadata(
            NavigationItem, Element.DefaultStyleKeyKey,
            { default_value: NavigationItem },
        );
    }

    private _pressOriginatedHere   = false;
    private _syncingIsSelected     = false;
    private _iconSlot:  ContentPresenter | undefined;
    private _labelText: TextBlock        | undefined;

    constructor()
    {
        super();
        this.applyDefaultStyle();
        this.adoptTemplateParts();
        this.syncIcon();
        this.syncLabel();
    }

    private adoptTemplateParts(): void
    {
        this._iconSlot  = this.GetTemplateChild('PART_IconSlot')  as ContentPresenter | undefined;
        this._labelText = this.GetTemplateChild('PART_LabelText') as TextBlock        | undefined;
    }

    private syncIcon(): void
    {
        // PART_IconSlot is a ContentPresenter — SetContent slots the
        // Icon Visual via the standard presenter pathway. A consumer-
        // set Icon survives Variant / Style swaps because the new
        // template's PART_IconSlot is found again via GetTemplateChild
        // and re-seeded by this method on Template change.
        const slot = this._iconSlot;
        if (slot === undefined) return;
        slot.SetContent(this.Icon);
    }

    private syncLabel(): void
    {
        const t = this._labelText;
        if (t === undefined) return;
        t.Text = this.Label ?? '';
    }

    public get Icon():  Visual | undefined { return this.get_property_value(NavigationItem.IconKey); }
    public set Icon(v: Visual | undefined) { this.set_property_value(NavigationItem.IconKey, v); }

    public get Label():  string { return this.get_property_value(NavigationItem.LabelKey); }
    public set Label(v: string) { this.set_property_value(NavigationItem.LabelKey, v); }

    public get IsSelected(): boolean { return Selector.GetIsSelected(this); }
    public set IsSelected(v: boolean) { Selector.SetIsSelected(this, v); }

    // ── Click → tell the Selector ──────────────────────────────────

    protected override OnPointerDown(_args: PointerEventArgs): void
    {
        this._pressOriginatedHere = true;
    }

    protected override OnPointerUp(args: PointerEventArgs): void
    {
        const fire = this._pressOriginatedHere && this.IsMouseOver;
        this._pressOriginatedHere = false;
        if (!fire) return;
        const sel = Selector.FromContainer<Selector>(
            this, (v: Visual): v is Selector => v instanceof Selector);
        if (sel !== undefined) sel.HandleContainerClick(this, args.Modifiers);
    }

    protected override OnPointerLeave(_args: PointerEventArgs): void
    {
        this._pressOriginatedHere = false;
    }

    // OnPropertyChanged routes:
    //   * IsSelected — two-way mirror between the instance DP and the
    //     canonical Selector.IsSelected attached DP (same pattern as
    //     ListBoxItem). The instance DP is what template triggers
    //     observe; the attached is what the Selector base writes.
    //   * Icon / Label — pump into the template parts found at ctor
    //     time. Trigger-driven binding would have been cleaner here
    //     but the trigger DSL doesn't accept non-equality conditions
    //     today, so class-level sync stands in.
    //   * Template — re-find PART_IconSlot / PART_LabelText after a
    //     re-template and re-seed them from the current DPs (mirrors
    //     the TopAppBar Template-swap pattern).
    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        const name = descriptor.Name;
        if (name === 'IsSelected' && !this._syncingIsSelected)
        {
            // Two-way mirror between the instance IsSelected DP and the
            // canonical Selector.IsSelected attached DP — same pattern as
            // ListBoxItem. Source-of-truth direction: parent NavigationRail
            // (Selector) writes the attached DP; the template's
            // `when (IsSelected)` trigger watches the instance DP. Without
            // the attached→instance leg the trigger never fires, and the
            // M3 selection chrome (PART_IconContainer.Fill flipping
            // to @SecondaryContainer) stays invisible.
            const fromAttached = descriptor.Owner === Selector;
            const fromInstance = descriptor.Owner === NavigationItem;
            if (!fromAttached && !fromInstance) return;
            this._syncingIsSelected = true;
            try
            {
                if (fromAttached)
                {
                    this.set_property_value(NavigationItem.IsSelectedKey, newValue as boolean);
                }
                else
                {
                    Selector.SetIsSelected(this, newValue as boolean);
                }
            }
            finally { this._syncingIsSelected = false; }
            return;
        }
        if (name === 'Icon')
        {
            this.syncIcon();
            return;
        }
        if (name === 'Label')
        {
            this.syncLabel();
            return;
        }
        if (name === 'Template' && newValue !== oldValue)
        {
            this.adoptTemplateParts();
            this.syncIcon();
            this.syncLabel();
            return;
        }
    }
}
