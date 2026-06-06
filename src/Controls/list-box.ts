import {
    MetaData,
    Model,
    Visual,
    type ModifierKeys,
    type PointerEventArgs,
} from '../runtime/index.js';
import { ContentControl } from './content-control.js';
import { findDataTemplateForType } from './data-template.js';
import { Selector } from './selector.js';
import { Orientation, StackPanel } from './stack-panel.js';
import { ScrollViewer } from './scroll-viewer.js';
import { TextBlock } from './text-block.js';
import { ensureControlsTheme } from './default-resources.js';



// WPF's three-mode selector. Mirrors the WPF enum.
//   Single   — every click sets one item; Ctrl / Shift are ignored.
//   Multiple — every plain click toggles a single item's membership; no
//              modifiers required (touch-friendly).
//   Extended — plain click = single set; Ctrl+click = toggle; Shift+click
//              = range from anchor (visible-items order).
export enum SelectionMode
{
    Single   = 'Single',
    Multiple = 'Multiple',
    Extended = 'Extended',
}

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
// Extended). Single is the default; Extended adds Ctrl / Shift modifier
// handling identical to TreeView's. SelectedItem returns the Tag of
// the first selected container when Tag is set (Items-driven path) or
// the container itself when Tag is undefined (declarative path) —
// mirroring WPF's dual-mode SelectedItem.
export class ListBox extends Selector
{
    public static readonly SelectionModeKey = Model.RegisterProperty<SelectionMode>(ListBox, 'SelectionMode', SelectionMode.Single, MetaData.None);

    static {
        Model.OverrideMetadata(ListBox, Visual.DefaultStyleKeyKey, { default_value: ListBox });
        ensureControlsTheme();
    }

    // Multi-select bookkeeping — single-selection is just a Set of size 1.
    // _anchor seeds Shift-click ranges in Extended mode.
    //
    // Two mirrors of the selection live here:
    //   * _selectedItems: live containers currently representing a
    //     selected row. Used for IsSelected-flag bookkeeping and for
    //     SelectedItems insertion order (which carries the
    //     Tag-exposed values out via SelectedItems / refreshExposedSelection).
    //   * _selectedData: the underlying data identities. The source of
    //     truth across container recycle — when a virtualizing panel
    //     reuses a ListBoxItem for a different row, bindContainer
    //     consults this set to re-sync IsSelected to the new data.
    //     Without it, a recycled container would keep its prior row's
    //     selection chrome (and would incorrectly contribute its NEW
    //     row to SelectedItems via container-Tag exposure).
    private readonly _selectedItems: Set<ListBoxItem> = new Set();
    private readonly _selectedData:  Set<unknown>     = new Set();
    private _anchor: ListBoxItem | undefined;

    // Cached after first template apply — the lookup walks the
    // template instance once; subsequent reads return the cached ref.
    private _scrollViewer: ScrollViewer | undefined;

    constructor()
    {
        super();
        // Template + items panel are the two halves of an
        // ItemsControl. Template (the surrounding ScrollViewer +
        // ItemsPresenter chrome) flows from the default Style:
        // DefaultStyleKey on this class names ListBox itself, so the
        // bundled controls theme entry under that key applies via the
        // applyDefaultStyle() call below. The items panel stays local
        // because it's part of the demo-author's surface (overridable
        // via the ItemsPanel DP); the default factory here is the
        // vertical StackPanel WPF parity expects.
        this.ItemsPanel = () => new StackPanel();
        // Base ItemsControl constructor already seeded Items =
        // _declarativeItems, so declarative AddChild lands in the right
        // collection without further setup here.
        this.applyDefaultStyle();
    }

    public get SelectionMode(): SelectionMode { return this.get_property_value(ListBox.SelectionModeKey); }
    public set SelectionMode(v: SelectionMode) { this.set_property_value(ListBox.SelectionModeKey, v); }

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
        this.bindContainer(li, item);
        return li;
    }

    public override RebindContainerForItemOverride(container: Visual, item: unknown): void
    {
        // Reused ListBoxItem (from the generator's recycle pool) — flip
        // Tag / DataContext / Content so the row reflects the new data.
        if (!(container instanceof ListBoxItem)) return;
        this.bindContainer(container, item);
    }

    // Wire a freshly-created OR recycled ListBoxItem to its data row.
    // Shared by GetContainerForItemOverride (fresh) and
    // RebindContainerForItemOverride (recycled) so both paths stay in
    // lock-step with no chance of one drifting.
    //
    // Selection-sync rider: ListBox stores selection by data identity in
    // _selectedData, with _selectedItems mirroring which live containers
    // currently represent those rows. When a virtualizing panel recycles
    // a container for a new row, this method re-syncs the container's
    // IsSelected (and its membership in _selectedItems) against the new
    // data. Without this, a recycled container would carry over its
    // previous row's selection chrome and bleed into SelectedItems.
    private bindContainer(li: ListBoxItem, item: unknown): void
    {
        li.Tag         = item;
        li.DataContext = item;
        li.Content     = this.contentForItem(item);
        const shouldBeSelected = this._selectedData.has(item);
        if (shouldBeSelected)
        {
            this._selectedItems.add(li);
            li.SetIsSelectedInternal(true);
        }
        else if (this._selectedItems.has(li))
        {
            this._selectedItems.delete(li);
            li.SetIsSelectedInternal(false);
        }
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

    public override ClearContainerForItemOverride(container: Visual, item: unknown): void
    {
        super.ClearContainerForItemOverride(container, item);
        if (!(container instanceof ListBoxItem)) return;
        // Drop the row's contribution to selection BEFORE the base
        // ItemsControl detaches it. Listeners observe the post-clean
        // state.
        const wasSelected = this._selectedItems.delete(container);
        // Drop the data-side mirror too — for the data-driven path the
        // Tag carries the item, so once the container leaves the live
        // tree its row's selection identity goes with it. (Composed-
        // markup rows have li === exposedValueOf so the same delete
        // covers them.)
        this._selectedData.delete(ListBox.exposedValueOf(container));
        if (wasSelected) container.SetIsSelectedInternal(false);
        if (this._anchor === container) this._anchor = undefined;
        if (wasSelected)
        {
            this.refreshExposedSelection();
            this.fireSelectionChanged();
        }
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

    // Snapshot of the current multi-selection, in insertion order.
    // Each entry is the container's Tag when present (Items-driven
    // path) or the container itself when Tag is unset (declarative
    // path) — see exposedValueOf.
    public get SelectedItems(): readonly unknown[]
    {
        const out: unknown[] = [];
        for (const c of this._selectedItems) out.push(ListBox.exposedValueOf(c));
        return out;
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

    public ClearSelection(): void
    {
        if (this._selectedItems.size === 0 && this._selectedData.size === 0) return;
        for (const i of this._selectedItems) i.SetIsSelectedInternal(false);
        this._selectedItems.clear();
        this._selectedData.clear();
        this._anchor = undefined;
        this.refreshExposedSelection();
        this.fireSelectionChanged();
    }

    // Entry point for row clicks — invoked by ListBoxItem.OnPointerUp
    // when the press originated locally and the pointer is still
    // inside. Modifier interpretation depends on SelectionMode.
    public HandleItemClick(item: ListBoxItem, modifiers: ModifierKeys): void
    {
        const mode = this.SelectionMode;
        if (mode === SelectionMode.Single)
        {
            this.setSelected([item]);
            this._anchor = item;
        }
        else if (mode === SelectionMode.Multiple)
        {
            this.toggleSelected(item);
            this._anchor = item;
        }
        else // Extended
        {
            const shiftActive = modifiers.Shift && this._anchor !== undefined;
            if (shiftActive)
            {
                this.selectRange(this._anchor!, item);
            }
            else if (modifiers.Control)
            {
                this.toggleSelected(item);
                this._anchor = item;
            }
            else
            {
                this.setSelected([item]);
                this._anchor = item;
            }
        }
        this.refreshExposedSelection();
        this.fireSelectionChanged();
    }

    // ── Selector resolution overrides — Tag-based identity ─────────
    //
    // ListBox's selection model is per-container (each ListBoxItem
    // carries a Tag with the source data, or stands in for itself in
    // the declarative path). Override the base Selector seams so its
    // cross-sync and external-write paths resolve through containers
    // instead of the raw Items collection.

    protected override resolveItemAt(index: number): unknown
    {
        const containers = this.ItemContainers;
        if (index < 0 || index >= containers.length) return undefined;
        return ListBox.exposedValueOf(containers[index]!);
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

    private setSelected(items: readonly ListBoxItem[]): void
    {
        const next = new Set(items);
        // Diff against the current set so IsSelected only flips on
        // rows whose membership actually changed — saves a render-
        // dirty on rows that stay selected (the common case for an
        // overlapping Shift+click range).
        for (const i of this._selectedItems)
        {
            if (!next.has(i)) i.SetIsSelectedInternal(false);
        }
        for (const i of next)
        {
            if (!this._selectedItems.has(i)) i.SetIsSelectedInternal(true);
        }
        this._selectedItems.clear();
        this._selectedData.clear();
        for (const i of items)
        {
            this._selectedItems.add(i);
            this._selectedData.add(ListBox.exposedValueOf(i));
        }
    }

    private toggleSelected(item: ListBoxItem): void
    {
        if (this._selectedItems.has(item))
        {
            this._selectedItems.delete(item);
            this._selectedData.delete(ListBox.exposedValueOf(item));
            item.SetIsSelectedInternal(false);
        }
        else
        {
            this._selectedItems.add(item);
            this._selectedData.add(ListBox.exposedValueOf(item));
            item.SetIsSelectedInternal(true);
        }
    }

    private selectRange(from: ListBoxItem, to: ListBoxItem): void
    {
        const containers = this.ItemContainers;
        const fromIdx = containers.indexOf(from);
        const toIdx   = containers.indexOf(to);
        if (fromIdx < 0 || toIdx < 0) return;
        const lo = Math.min(fromIdx, toIdx);
        const hi = Math.max(fromIdx, toIdx);
        this.setSelected(containers.slice(lo, hi + 1));
    }

    // Public-DP value seen by external consumers for a given row:
    // Tag is what the data-driven path carries (the source data);
    // composed-markup rows without an explicit Tag fall back to the
    // container itself.
    private static exposedValueOf(li: ListBoxItem): unknown
    {
        return li.Tag !== undefined ? li.Tag : li;
    }

    // Push the internal selection set's first member out to the
    // public Selector DPs (SelectedIndex / SelectedItem / SelectedValue).
    // Read-only mirror — the DPs reflect the multi-selection model's
    // "primary" item but never drive the model on their own (the
    // HandleItemClick / ClearSelection paths AND the applySelected*
    // overrides below do). Wrapped in the base's
    // withSuppressedSelectionSync so the writes don't re-enter
    // applySelected*.
    private refreshExposedSelection(): void
    {
        const first: ListBoxItem | undefined =
            this._selectedItems.values().next().value;
        this.withSuppressedSelectionSync(() => {
            if (first === undefined)
            {
                this.SelectedIndex = -1;
                this.SelectedItem  = undefined;
                this.SelectedValue = this.projectValue(undefined);
            }
            else
            {
                const item = ListBox.exposedValueOf(first);
                this.SelectedIndex = this.logicalChildren.indexOf(first);
                this.SelectedItem  = item;
                this.SelectedValue = this.projectValue(item);
            }
        });
    }

    // ── Selector apply* overrides — sync internal multi-select state
    //    with external DP writes. The base's apply* cross-syncs and
    //    fires SelectionChanged; we run our own update first so the
    //    listener sees a coherent multi-select snapshot.

    protected override applySelectedIndex(idx: number): void
    {
        const containers = this.ItemContainers;
        if (idx < 0 || idx >= containers.length)
        {
            this.setSelected([]);
            this._anchor = undefined;
        }
        else
        {
            const item = containers[idx]!;
            this.setSelected([item]);
            this._anchor = item;
        }
        super.applySelectedIndex(idx);
    }

    protected override applySelectedItem(value: unknown): void
    {
        const containers = this.ItemContainers;
        if (value === undefined)
        {
            this.setSelected([]);
            this._anchor = undefined;
        }
        else
        {
            const match = containers.find(li => li.Tag === value || li === value);
            if (match !== undefined)
            {
                this.setSelected([match]);
                this._anchor = match;
            }
            else
            {
                this.setSelected([]);
                this._anchor = undefined;
            }
        }
        super.applySelectedItem(value);
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
//                current selection. Read-mostly: written by the
//                ListBox's HandleItemClick / setSelected; settable
//                from consumer code to initialise a default selection.
//   Tag        — opaque payload. The data-driven path stores the
//                source value here; ListBox.SelectedItem reads it
//                back so external bindings see the source data
//                instead of the container.
//
// Click handling: press-here-release-here gate; on release the event
// walks logical parents to find the owning ListBox and routes
// HandleItemClick with the originating PointerEventArgs.Modifiers.
export class ListBoxItem extends ContentControl
{
    public static readonly IsSelectedKey = Model.RegisterProperty<boolean>(
        ListBoxItem, 'IsSelected', false, MetaData.Render);

    static {
        Model.OverrideMetadata(ListBoxItem, Visual.DefaultStyleKeyKey, { default_value: ListBoxItem });
        ensureControlsTheme();
    }

    private _pressOriginatedHere = false;

    constructor(content?: Visual)
    {
        super();
        // Template flows from the default Style (DefaultStyleKey on
        // this class names ListBoxItem itself). IsSelected /
        // IsMouseOver → PART_Border.Background ride along declaratively
        // on `when()` triggers in the bundled template (see
        // controls.template.mu, ListBoxItem block) — the previous
        // imperative refreshBackground() + cached _border field are
        // gone.
        if (content !== undefined) this.Content = content;
        this.applyDefaultStyle();
    }

    public get IsSelected(): boolean { return this.get_property_value(ListBoxItem.IsSelectedKey); }
    public set IsSelected(v: boolean) { this.set_property_value(ListBoxItem.IsSelectedKey, v); }

    // Setter exposed for ListBox's internal selection bookkeeping —
    // bypasses HandleItemClick so writing the DP doesn't loop back
    // through the click pipeline.
    public SetIsSelectedInternal(v: boolean): void
    {
        this.set_property_value(ListBoxItem.IsSelectedKey, v);
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
        const lb = Selector.FromContainer<ListBox>(
            this, (v: Visual): v is ListBox => v instanceof ListBox);
        if (lb !== undefined) lb.HandleItemClick(this, args.Modifiers);
    }

    protected override OnPointerLeave(_args: PointerEventArgs): void
    {
        this._pressOriginatedHere = false;
    }
}

// Silence "unused import" — Orientation is used implicitly: the
// StackPanel ItemsPanel factory defaults to Vertical (registered
// default), so we don't pass it explicitly. Keeping the import
// makes the dependency relationship explicit in the import list
// for grep / IDE jump-to-source.
void Orientation;
