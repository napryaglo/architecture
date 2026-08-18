import {
    MetaData,
    Model,
    Element, Visual,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import { ContentPresenter } from '../../basic/templates/content-presenter.js';
import { findDataTemplateForType } from '../../basic/templates/data-template.js';
import { Selector } from '../list/selector.js';
import { NavigationItem } from './navigation-item.js';

// Display-string convention shared with ListBox / ComboBox — strings
// pass through, objects with a Label / Name / Text field prefer the
// named property, everything else falls through to String().
function displayString(item: unknown): string
{
    if (item === undefined || item === null) return '';
    if (typeof item === 'string') return item;
    if (typeof item === 'object')
    {
        const obj = item as Record<string, unknown>;
        if (typeof obj.Label === 'string') return obj.Label;
        if (typeof obj.Name  === 'string') return obj.Name;
        if (typeof obj.Text  === 'string') return obj.Text;
    }
    return String(item);
}

// Material 3 Navigation Rail — a vertical strip of destination icons
// pinned to one side of a screen. Renders 3-7 NavigationItem rows;
// optional Header (FAB or branding) above and Footer (account / settings
// icon) below.
//
// Selector semantics — exactly one item selected at a time (mural's
// Selector base SelectionMode.Single is the default). Selection changes
// fire SelectionChanged listeners and update SelectedIndex / SelectedItem
// / SelectedValue. All three are BindsTwoWayByDefault on the Selector
// base, so a `SelectedItem=$VmField` binding wires user clicks back to
// the VM without an explicit Mode=TwoWay. (NavigationRail doesn't
// define a separate `SelectedDataItem` — that surface is TreeView-only,
// where the data-vs-container distinction matters under hierarchy.)
//
// Two authoring paths (same as ListBox):
//
//   1. Composed markup — nest NavigationItems by hand:
//
//        NavigationRail {
//            NavigationItem [Label="Home"]
//            NavigationItem [Label="Search"]
//            NavigationItem [Label="Library"]
//        }
//
//   2. Data-driven — assign Items / ItemsSource and let the rail
//      wrap each value into a NavigationItem container via
//      GetContainerForItemOverride.
//
// M3 chrome:
//   * Width: 80dp (default; consumer-overridable via Width)
//   * Fill: @Surface
//   * Item slot: vertical StackPanel inside an items area
//   * Item height: 56dp
//   * Items area gets the top section; Header sits above as a fixed
//     band; Footer sits at the bottom.
//
// Header / Footer slots — single-Visual DPs the class slots into the
// PART_Header and PART_Footer Borders in the template. Both default to
// undefined (no slot rendered). Typically a FAB in the header and an
// IconButton in the footer.
export class NavigationRail extends Selector
{
    public static readonly HeaderKey = Model.RegisterProperty<Visual | undefined>(
        NavigationRail, 'Header', undefined, MetaData.Measure,
    );

    public static readonly FooterKey = Model.RegisterProperty<Visual | undefined>(
        NavigationRail, 'Footer', undefined, MetaData.Measure,
    );

    static
    {
        Model.OverrideMetadata(
            NavigationRail, Element.DefaultStyleKeyKey,
            { default_value: NavigationRail },
        );
    }

    private _headerSlot: ContentPresenter | undefined;
    private _footerSlot: ContentPresenter | undefined;

    constructor()
    {
        super();
        this.applyDefaultStyle();
    }

    public get Header():  Visual | undefined { return this.get_property_value(NavigationRail.HeaderKey); }
    public set Header(v: Visual | undefined) { this.set_property_value(NavigationRail.HeaderKey, v); }

    public get Footer():  Visual | undefined { return this.get_property_value(NavigationRail.FooterKey); }
    public set Footer(v: Visual | undefined) { this.set_property_value(NavigationRail.FooterKey, v); }

    // Header / Footer Visuals get slotted into PART_HeaderSlot /
    // PART_FooterSlot ContentPresenters after applyDefaultStyle. The
    // hooks below catch DP changes and re-template; ItemsControl's
    // ctor already applies the default Style before our hooks run, so
    // we adopt the parts on next access via the lazy template-child
    // lookup pattern.
    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        const name = descriptor.Name;
        if (name === 'Header')
        {
            this.syncHeader();
            return;
        }
        if (name === 'Footer')
        {
            this.syncFooter();
            return;
        }
        if (name === 'Template' && newValue !== oldValue)
        {
            // Re-template — re-find the slot presenters and re-seed
            // them from the current DPs.
            this._headerSlot = undefined;
            this._footerSlot = undefined;
            this.syncHeader();
            this.syncFooter();
            return;
        }
    }

    private resolveHeaderSlot(): ContentPresenter | undefined
    {
        if (this._headerSlot === undefined)
        {
            const root = this.visualChildren[0];
            this._headerSlot = root?.FindName('PART_HeaderSlot') as ContentPresenter | undefined;
        }
        return this._headerSlot;
    }

    private resolveFooterSlot(): ContentPresenter | undefined
    {
        if (this._footerSlot === undefined)
        {
            const root = this.visualChildren[0];
            this._footerSlot = root?.FindName('PART_FooterSlot') as ContentPresenter | undefined;
        }
        return this._footerSlot;
    }

    private syncHeader(): void
    {
        const slot = this.resolveHeaderSlot();
        if (slot === undefined) return;
        slot.SetContent(this.Header);
    }

    private syncFooter(): void
    {
        const slot = this.resolveFooterSlot();
        if (slot === undefined) return;
        slot.SetContent(this.Footer);
    }

    // Container generator hooks — mirror ListBox's pattern. A bare
    // NavigationItem in the markup body passes through; everything else
    // gets wrapped via GetContainerForItemOverride.

    // Markup body — only NavigationItem children are accepted; the
    // rail's selection / chrome contract depends on the item being a
    // NavigationItem container. Data-driven path bypasses this guard.
    protected override validateDeclarativeChild(child: Visual): void
    {
        if (!(child instanceof NavigationItem))
        {
            throw new Error(
                'NavigationRail accepts only NavigationItem children in '
                + 'markup (got ' + child.constructor.name + ').',
            );
        }
    }

    public override IsItemItsOwnContainerOverride(item: unknown): boolean
    {
        return item instanceof NavigationItem;
    }

    public override GetContainerForItemOverride(item: unknown): Visual
    {
        const ni = new NavigationItem();
        this.bindContainerData(ni, item);
        return ni;
    }

    public override RebindContainerForItemOverride(container: Visual, item: unknown): void
    {
        if (container instanceof NavigationItem)
        {
            this.bindContainerData(container, item);
        }
        super.RebindContainerForItemOverride(container, item);
    }

    private bindContainerData(ni: NavigationItem, item: unknown): void
    {
        ni.Tag         = item;
        ni.DataContext = item;
        // Resolve the row's visual representation: explicit DataTemplate
        // (data-driven path), inherent Visual (composed path), or fall
        // back to the display-string convention for the Label.
        if (item instanceof Visual)
        {
            ni.Content = item;
        }
        else if (item instanceof Model
              && findDataTemplateForType(item.constructor, this) !== undefined)
        {
            ni.Content = item;
        }
        else
        {
            // Plain string / number — populate Label so the bare
            // NavigationItem template (icon + label) still renders.
            ni.Label = displayString(item);
        }
    }
}
