import {
    MetaData,
    Model,
    Visual,
    type PointerEventArgs,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import { ContentControl } from '../content-control.js';
import { findDataTemplateForType } from '../../Basic/data-template.js';
import { Selector } from './selector.js';
import { Orientation, StackPanel } from '../../Basic/stack-panel.js';
import { ScrollViewer } from '../scroll-viewer.js';
import { TextBlock } from '../../Basic/text-block.js';

// SelectionMode is now owned by Selector and re-exported here so
// existing `import { SelectionMode } from './list-box.js'` consumers
// (and matching markup imports) keep working.
export { SelectionMode } from './selector.js';

// Display-string convention shared with ComboBox: strings pass through,
// objects with a conventional Label / Name / Text field prefer the named
// property, everything else falls through to String(). Lets a consumer
// pass a plain `Items=["Apples","Pears"]` array without authoring a
// matching ItemTemplate.
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

// WPF-style flat-list selector built on ItemsControl. Two authoring
// paths converge on the same Items collection:
//
//   1. Composed markup — consumers nest ListBoxItems by hand. Each
//      item's Content can be any Visual. Compiler emits AddChild for
//      each body element; ListBox routes those into Items so the row
//      becomes a tracked container indistinguishable from a data-
//      generated one:
//
//        ListBox {
//            ListBoxItem { TextBlock[Text="Apples"]  }
//            ListBoxItem { TextBlock[Text="Bananas"] }
//        }
//
//   2. Data-driven — assign `Items = unknown[]` (or set ItemsSource
//      to bind to a CollectionView). ListBox auto-wraps each value in
//      a ListBoxItem via GetContainerForItemOverride; the wrapper's
//      Tag carries the source value so SelectedItem returns the data,
//      not the container:
//
//        ListBox [ Items = $fruits ]
//
// Behaviour change vs the pre-ItemsControl era: setting Items now
// REPLACES the entire collection — including any declarative children.
// WPF parity. Authors that want a mix should add the data items via
// `lb.Items.Add(value)` instead of clearing-and-replacing.
//
// Selection semantics depend on SelectionMode (Single / Multiple /
// Extended) — promoted to Selector, so the modifier interpretation,
// _selectedContainers / _selectedData bookkeeping, _anchor, and
// HandleContainerClick all live on the base. ListBox is left with the
// container-prep / Tag-based identity / declarative-child routing glue.
export class ListBox extends Selector
{
    static {
        Model.OverrideMetadata(ListBox, Visual.DefaultStyleKeyKey, { default_value: ListBox });
    }

    // Cached after first template apply — the lookup walks the
    // template instance once; subsequent reads return the cached ref.
    private _scrollViewer: ScrollViewer | undefined;

    constructor()
    {
        super();
        // Template + items panel are the two halves of an ItemsControl.
        // Template (the surrounding ScrollViewer + ItemsPresenter chrome)
        // flows from the default Style: DefaultStyleKey on this class
        // names ListBox itself, so the bundled controls theme entry under
        // that key applies via the applyDefaultStyle() call below. The
        // items panel stays local because it's part of the demo-author's
        // surface (overridable via the ItemsPanel DP); the default
        // factory here is the vertical StackPanel WPF parity expects.
        this.ItemsPanel = () => new StackPanel();
        this.applyDefaultStyle();
    }

    // Compiler routes `ListBox { ListBoxItem … }` body elements through
    // ItemsControl.AddChild → Items. We only need to gate on the
    // container type — base does the rest of the routing,
    // promote-to-observable, and the IsItemItsOwnContainerOverride
    // pass-through (so a pre-built ListBoxItem isn't re-wrapped).
    protected override validateDeclarativeChild(child: Visual): void
    {
        if (!(child instanceof ListBoxItem))
        {
            throw new Error('ListBox only accepts ListBoxItem children');
        }
    }

    // ── ItemsControl override seams ────────────────────────────────

    public override IsItemItsOwnContainerOverride(item: unknown): boolean
    {
        return item instanceof ListBoxItem;
    }

    public override GetContainerForItemOverride(item: unknown): Visual
    {
        // Pass-through for composed markup is handled by the generator
        // via IsItemItsOwnContainerOverride; here we're always on the
        // data-driven path. WPF parity:
        //   * Tag = item — SelectedItem reads return the data, not
        //     the ListBoxItem.
        //   * DataContext = item — bindings on the container (from
        //     ItemContainerStyle setters) resolve against the item, so
        //     `IsDraggable=true; OnDragStart=$BeginDragData` finds the
        //     per-row VM's DPs rather than the parent VM's. Matches
        //     ContentPresenter behavior in ItemsControl.
        //   * Content routing:
        //       Model with a registered DataTemplate → li.Content = item
        //         (ContentControl.resolveContentVisual finds the template
        //         and applies it). This is the ItemTemplate-driven path.
        //       everything else → wrap in TextBlock(displayString(item))
        //         so plain `Items=["Apple","Pear"]` and untemplated Models
        //         still render something.
        const li = new ListBoxItem();
        this.bindContainerData(li, item);
        return li;
    }

    public override RebindContainerForItemOverride(container: Visual, item: unknown): void
    {
        // Reused ListBoxItem (from the generator's recycle pool) — flip
        // Tag / DataContext / Content so the row reflects the new data.
        // The Selector base's RebindContainerForItemOverride re-syncs
        // IsSelected against _selectedData AFTER this binds the new Tag.
        if (container instanceof ListBoxItem)
        {
            this.bindContainerData(container, item);
        }
        super.RebindContainerForItemOverride(container, item);
    }

    // Wire a freshly-created OR recycled ListBoxItem to its data row.
    // Selection sync is handled by the Selector base's recycle hooks via
    // syncContainerSelectionFromData — this method just updates the
    // data-binding fields.
    private bindContainerData(li: ListBoxItem, item: unknown): void
    {
        li.Tag         = item;
        li.DataContext = item;
        li.Content     = this.contentForItem(item);
    }

    private contentForItem(item: unknown): Visual | Model {
        if (item instanceof Visual) return item;
        if (item instanceof Model
            && findDataTemplateForType(item.constructor) !== undefined)
        {
            return item;
        }
        return new TextBlock(displayString(item));
    }

    // Snapshot of all materialized ListBoxItem containers, in items
    // order. Index space for SelectedIndex and Shift+click range
    // selection.
    public get ItemContainers(): readonly ListBoxItem[]
    {
        // logicalChildren on ItemsControl is the realized containers
        // list. All entries are ListBoxItems by our override; the
        // cast is safe.
        return this.logicalChildren as readonly ListBoxItem[];
    }

    // Read-only handle to the default-template ScrollViewer. Resolved
    // lazily on first access — the template subtree is available
    // after the constructor's Template assignment.
    public get ScrollViewer(): ScrollViewer
    {
        if (this._scrollViewer !== undefined) return this._scrollViewer;
        const root = this.visualChildren[0];
        if (root === undefined)
        {
            throw new Error('ListBox: template root not attached yet.');
        }
        const sv = root.FindName('PART_Scroll');
        if (!(sv instanceof ScrollViewer))
        {
            throw new Error('ListBox: PART_Scroll missing from DefaultListBox template.');
        }
        this._scrollViewer = sv;
        return sv;
    }

    // ── Selector override seams ────────────────────────────────────

    // ListBox's selection model is per-container — each ListBoxItem
    // carries a Tag with the source data, or stands in for itself in
    // the declarative path. Override the base seams so the cross-sync
    // and apply* paths resolve through containers instead of the raw
    // Items collection (which would miss declarative-child rows).

    protected override resolveItemAt(index: number): unknown
    {
        const containers = this.ItemContainers;
        if (index < 0 || index >= containers.length) return undefined;
        return this.exposedValueOf(containers[index]!);
    }

    protected override resolveIndexOf(item: unknown): number
    {
        if (item === undefined) return -1;
        const containers = this.ItemContainers;
        for (let i = 0; i < containers.length; i++)
        {
            const li = containers[i]!;
            if (li.Tag === item || li === item) return i;
        }
        return -1;
    }

    protected override containerForItem(item: unknown): Visual | undefined
    {
        if (item === undefined) return undefined;
        // Walk realized containers and match Tag identity. Falls back
        // to the container itself for composed-markup rows where the
        // consumer treats the ListBoxItem as the "data".
        for (const c of this.ItemContainers)
        {
            if (c.Tag === item || c === item) return c;
        }
        return undefined;
    }

    protected override getPrimaryIndex(container: Visual): number
    {
        // ListBox's index space is the realized containers in items
        // order — covers both declarative and data-driven paths
        // uniformly (Generator.IndexFromContainer would miss
        // composed-markup rows).
        return this.ItemContainers.indexOf(container as ListBoxItem);
    }
}

// One row in the list. Authored in markup, instantiated either by the
// consumer (declarative `ListBox { ListBoxItem { … } }`) or by the
// owning ListBox (data-driven path — see ListBox.GetContainerForItemOverride).
//
// Public DPs:
//   Content    — inherited from ContentControl. The slottable body
//                rendered inside the row's template.
//   IsSelected — true when this row participates in the ListBox's
//                current selection. Read-mostly. The canonical
//                seam is `Selector.IsSelected` (attached) — this
//                instance DP forwards reads/writes to it AND mirrors
//                attached-DP changes so the template's
//                `when (IsSelected)` trigger fires on either path.
//                Settable from consumer code to initialise a default
//                selection.
//   Tag        — opaque payload. The data-driven path stores the
//                source value here; ListBox.SelectedItem reads it
//                back so external bindings see the source data
//                instead of the container.
//
// Click handling: press-here-release-here gate; on release the event
// walks logical parents to find the owning Selector and routes
// HandleContainerClick with the originating PointerEventArgs.Modifiers.
export class ListBoxItem extends ContentControl
{
    // Instance-level IsSelected mirror — provides the trigger-observable
    // DP that templates watch via `when (IsSelected)`. Source of truth
    // is `Selector.IsSelected` (attached); this DP is kept in lock-step
    // by an attached-DP change listener wired in the constructor.
    public static readonly IsSelectedKey = Model.RegisterProperty<boolean>(
        ListBoxItem, 'IsSelected', false, MetaData.Render);

    static {
        Model.OverrideMetadata(ListBoxItem, Visual.DefaultStyleKeyKey, { default_value: ListBoxItem });
    }

    private _pressOriginatedHere = false;
    private _syncingIsSelected = false;

    constructor(content?: Visual)
    {
        super();
        // Template flows from the default Style (DefaultStyleKey on
        // this class names ListBoxItem itself). IsSelected /
        // IsMouseOver → PART_Border.Background ride along declaratively
        // on `when()` triggers in the bundled template (see
        // controls.template.mu, ListBoxItem block).
        if (content !== undefined) this.Content = content;
        this.applyDefaultStyle();
    }

    public get IsSelected(): boolean { return Selector.GetIsSelected(this); }
    public set IsSelected(v: boolean) { Selector.SetIsSelected(this, v); }

    // Setter exposed for backwards compatibility — earlier code paths
    // wrote IsSelected via this method to bypass HandleItemClick.
    // The attached DP is the canonical seam; this just forwards.
    public SetIsSelectedInternal(v: boolean): void
    {
        Selector.SetIsSelected(this, v);
    }

    protected override OnPointerDown(_args: PointerEventArgs): void
    {
        this._pressOriginatedHere = true;
    }

    protected override OnPointerUp(args: PointerEventArgs): void
    {
        const fire = this._pressOriginatedHere && this.IsMouseOver;
        this._pressOriginatedHere = false;
        if (!fire) return;
        const lb = Selector.FromContainer<Selector>(
            this, (v: Visual): v is Selector => v instanceof Selector);
        if (lb !== undefined) lb.HandleContainerClick(this, args.Modifiers);
    }

    protected override OnPointerLeave(_args: PointerEventArgs): void
    {
        this._pressOriginatedHere = false;
    }

    // Two-way mirror between the instance IsSelected DP and the
    // canonical attached Selector.IsSelected. The Selector base writes
    // the attached when selection changes; the trigger system watches
    // the instance DP. Without the mirror, `when (IsSelected)` would
    // never fire under Selector-driven selection updates.
    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (this._syncingIsSelected) return;
        // Compare descriptor identity via Owner + Name pair — IsSelected
        // is registered on both Selector (attached) and ListBoxItem
        // (instance), so a string match alone would conflate them.
        if (descriptor.Name !== 'IsSelected') return;
        const fromAttached = descriptor.Owner === Selector;
        const fromInstance = descriptor.Owner === ListBoxItem;
        if (!fromAttached && !fromInstance) return;
        this._syncingIsSelected = true;
        try
        {
            if (fromAttached)
            {
                this.set_property_value(ListBoxItem.IsSelectedKey, newValue as boolean);
            }
            else
            {
                Selector.SetIsSelected(this, newValue as boolean);
            }
        }
        finally
        {
            this._syncingIsSelected = false;
        }
    }
}

// Silence "unused import" — Orientation is used implicitly: the
// StackPanel ItemsPanel factory defaults to Vertical (registered
// default), so we don't pass it explicitly. Keeping the import
// makes the dependency relationship explicit in the import list
// for grep / IDE jump-to-source.
void Orientation;
