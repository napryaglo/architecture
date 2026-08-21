import {
    Element,
    MetaData,
    MuralBase,
    Visual,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import { Brush } from '../../visual-engine/index.js';
import { HeaderedItemsControl } from '../base/headered-items-control.js';
import { ObservableCollection } from '../../runtime/index.js';

// RibbonTab — one tab page inside a Ribbon. Header is the label rendered
// in the tab strip (by the Ribbon); Items are the RibbonGroups that make
// up this tab's BODY. The Ribbon shows the selected tab's body in its
// PART_Body ContentPresenter — the tab's own default template lays its
// groups out in a horizontal strip.
//
// A tab is a logical child of its host (the Ribbon for a stable tab, or a
// RibbonContextualGroup for a contextual tab) so its groups' bindings
// (`$SaveCommand`, …) resolve against the inherited DataContext even
// before the tab is first shown. The Ribbon slots it into PART_Body
// VISUALLY on selection — the logical parent never moves.
export class RibbonTab extends HeaderedItemsControl
{
    // Optional accent — a contextual tab paints its strip header with this
    // colour. `undefined` = the stable look. When unset on a contextual
    // tab, the Ribbon falls back to the owning group's Color.
    public static readonly ColorKey = MuralBase.RegisterProperty<Brush | undefined>(
        RibbonTab, 'Color', undefined, MetaData.Render);
    // Collapses the tab from the strip when false. Default true (stable
    // tabs are always shown); contextual tabs are additionally gated by
    // their group's IsActive.
    public static readonly IsActiveKey = MuralBase.RegisterProperty<boolean>(
        RibbonTab, 'IsActive', true, MetaData.None);

    static
    {
        MuralBase.OverrideMetadata(RibbonTab, Element.DefaultStyleKeyKey, { default_value: RibbonTab });
    }

    constructor()
    {
        super();
        this.applyDefaultStyle();
    }

    public get Color(): Brush | undefined  { return this.get_property_value(RibbonTab.ColorKey); }
    public set Color(v: Brush | undefined) { this.set_property_value(RibbonTab.ColorKey, v); }

    public get IsActive(): boolean  { return this.get_property_value(RibbonTab.IsActiveKey); }
    public set IsActive(v: boolean) { this.set_property_value(RibbonTab.IsActiveKey, v); }

    protected override validateDeclarativeChild(_child: Visual): void { }

    public override IsItemItsOwnContainerOverride(item: unknown): boolean
    {
        return item instanceof Visual;
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'IsActive' || descriptor.Name === 'Color') this._onTabChanged?.();
    }

    /** Set by the owning Ribbon so an IsActive / Color flip triggers a
     *  visible-tab / header rebuild. */
    public _onTabChanged: (() => void) | undefined;
}

// RibbonContextualGroup — wraps related contextual tabs that share a
// Color and appear together when IsActive flips true (typically bound to
// a VM predicate: `[IsActive=$HasSelection]`). It renders NOTHING itself
// — it's a logical container the Ribbon reads. It's a logical child of
// the Ribbon so its `IsActive` binding resolves against the inherited
// DataContext; its Tabs are its own logical children so their bodies
// inherit transitively when the Ribbon shows them.
export class RibbonContextualGroup extends Element
{
    public static readonly HeaderKey   = MuralBase.RegisterProperty<string | undefined>(
        RibbonContextualGroup, 'Header', undefined, MetaData.None);
    public static readonly ColorKey    = MuralBase.RegisterProperty<Brush | undefined>(
        RibbonContextualGroup, 'Color', undefined, MetaData.None);
    public static readonly IsActiveKey = MuralBase.RegisterProperty<boolean>(
        RibbonContextualGroup, 'IsActive', false, MetaData.None);

    private readonly _tabs = new ObservableCollection<RibbonTab>([]);

    public get Header(): string | undefined  { return this.get_property_value(RibbonContextualGroup.HeaderKey); }
    public set Header(v: string | undefined) { this.set_property_value(RibbonContextualGroup.HeaderKey, v); }

    public get Color(): Brush | undefined  { return this.get_property_value(RibbonContextualGroup.ColorKey); }
    public set Color(v: Brush | undefined) { this.set_property_value(RibbonContextualGroup.ColorKey, v); }

    public get IsActive(): boolean  { return this.get_property_value(RibbonContextualGroup.IsActiveKey); }
    public set IsActive(v: boolean) { this.set_property_value(RibbonContextualGroup.IsActiveKey, v); }

    public get Tabs(): ObservableCollection<RibbonTab> { return this._tabs; }

    // Compiler routes `RibbonContextualGroup { RibbonTab … }` body elements
    // through the default-slot list path → AddChild. Store each tab and
    // attach it logically (only) so its groups inherit DataContext; the
    // Ribbon slots it into the body visually on selection.
    public AddChild(child: Visual): void
    {
        if (!(child instanceof RibbonTab))
        {
            throw new Error('RibbonContextualGroup only accepts RibbonTab children');
        }
        this._tabs.Add(child);
        this.AttachLogical(child);
    }

    public override get logicalChildren(): readonly Visual[]
    {
        return this._tabs.ToArray();
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'IsActive') this._onIsActiveChanged?.();
    }

    /** Set by the owning Ribbon so a bound `IsActive` flip triggers a
     *  visible-tab rebuild. */
    public _onIsActiveChanged: (() => void) | undefined;
}
