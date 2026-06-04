import {
    Application,
    MetaData,
    Model,
    Visual,
    type ModifierKeys,
    type PointerEventArgs,
    type PropertyDescriptor,
} from '../runtime/index.js';
import type { Brush } from '../visual-engine/index.js';
import type { Border } from './border.js';
import { ContentControl } from './content-control.js';
import type { ControlTemplate } from './control-template.js';
import { findDataTemplateForType } from './data-template.js';
import { ItemsControl } from './items-control.js';
import { Orientation, StackPanel } from './stack-panel.js';
import { ScrollViewer } from './scroll-viewer.js';
import { TextBlock } from './text-block.js';
import { Theme } from './theme.js';
import { ensureControlsTheme } from './default-resources.js';

const KEY_LISTBOX      = 'DefaultListBox';
const KEY_LISTBOX_ITEM = 'DefaultListBoxItem';

function resolveTemplate(key: string): ControlTemplate
{
    const tpl = Application.ResolveDefaultResource<ControlTemplate>(key);
    if (tpl === undefined)
    {
        throw new Error(`ListBox: default template '${key}' is not registered.`);
    }
    return tpl;
}

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
export class ListBox extends ItemsControl
{
    public static readonly SelectionModeKey = Model.RegisterProperty<SelectionMode>(ListBox, 'SelectionMode', SelectionMode.Single, MetaData.None);
    public static readonly SelectedIndexKey = Model.RegisterProperty<number>(       ListBox, 'SelectedIndex', -1,                   MetaData.None);
    public static readonly SelectedItemKey  = Model.RegisterProperty<unknown>(      ListBox, 'SelectedItem',  undefined,            MetaData.None);

    static {
        ensureControlsTheme();
    }

    // Selection bookkeeping — same shape as TreeView, minus the
    // visible/expanded distinction (every ListBoxItem is always visible).
    private readonly _selectedItems: Set<ListBoxItem> = new Set();
    private _anchor: ListBoxItem | undefined;
    private readonly _selectionListeners: Set<() => void> = new Set();

    // Guard for the SelectedIndex / SelectedItem cross-update — when one
    // DP setter writes the other we must not loop.
    private _suppressSelectionSync = false;

    // Cached after first template apply — the lookup walks the
    // template instance once; subsequent reads return the cached ref.
    private _scrollViewer: ScrollViewer | undefined;

    constructor()
    {
        super();
        // Template + items panel are the two halves of an
        // ItemsControl: Template owns the surrounding chrome
        // (ScrollViewer + ItemsPresenter slot); ItemsPanel produces
        // the panel that hosts containers (vertical StackPanel).
        this.Template = resolveTemplate(KEY_LISTBOX);
        this.ItemsPanel = () => new StackPanel();
        // Base ItemsControl constructor already seeded Items =
        // _declarativeItems, so declarative AddChild lands in the right
        // collection without further setup here.
    }

    public get SelectionMode(): SelectionMode { return this.get_property_value(ListBox.SelectionModeKey); }
    public set SelectionMode(v: SelectionMode) { this.set_property_value(ListBox.SelectionModeKey, v); }

    public get SelectedIndex(): number { return this.get_property_value(ListBox.SelectedIndexKey); }
    public set SelectedIndex(v: number) { this.set_property_value(ListBox.SelectedIndexKey, v); }

    public get SelectedItem(): unknown { return this.get_property_value(ListBox.SelectedItemKey); }
    public set SelectedItem(v: unknown) { this.set_property_value(ListBox.SelectedItemKey, v); }

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
        li.Tag         = item;
        li.DataContext = item;
        li.Content     = this.contentForItem(item);
        return li;
    }

    public override RebindContainerForItemOverride(container: Visual, item: unknown): void
    {
        // Reused ListBoxItem (from the generator's recycle pool) — flip
        // Tag / DataContext / Content so the row reflects the new data.
        if (!(container instanceof ListBoxItem)) return;
        container.Tag         = item;
        container.DataContext = item;
        container.Content     = this.contentForItem(item);
    }

    private contentForItem(item: unknown): Visual | Model {
        if (item instanceof Visual) return item;
        if (item instanceof Model
            && findDataTemplateForType(item.constructor.name) !== undefined)
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
    // path).
    public get SelectedItems(): readonly unknown[]
    {
        const out: unknown[] = [];
        for (const c of this._selectedItems)
        {
            out.push(c.Tag !== undefined ? c.Tag : c);
        }
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

    public AddSelectionChangedListener(listener: () => void): void
    {
        this._selectionListeners.add(listener);
    }
    public RemoveSelectionChangedListener(listener: () => void): void
    {
        this._selectionListeners.delete(listener);
    }

    public ClearSelection(): void
    {
        if (this._selectedItems.size === 0) return;
        for (const i of this._selectedItems) i.SetIsSelectedInternal(false);
        this._selectedItems.clear();
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
        for (const i of items) this._selectedItems.add(i);
    }

    private toggleSelected(item: ListBoxItem): void
    {
        if (this._selectedItems.has(item))
        {
            this._selectedItems.delete(item);
            item.SetIsSelectedInternal(false);
        }
        else
        {
            this._selectedItems.add(item);
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

    private fireSelectionChanged(): void
    {
        for (const l of this._selectionListeners) l();
    }

    // Push the internal selection set's first member out to the
    // public DPs. Read-only mirror — the DPs reflect the multi-
    // selection model's "primary" item but never drive the model on
    // their own (HandleItemClick / ClearSelection / direct DP writes
    // do).
    private refreshExposedSelection(): void
    {
        const first: ListBoxItem | undefined =
            this._selectedItems.values().next().value;
        this._suppressSelectionSync = true;
        if (first === undefined)
        {
            this.SelectedIndex = -1;
            this.SelectedItem  = undefined;
        }
        else
        {
            const containers = this.ItemContainers;
            this.SelectedIndex = containers.indexOf(first);
            this.SelectedItem  = first.Tag !== undefined ? first.Tag : first;
        }
        this._suppressSelectionSync = false;
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        switch (descriptor.Name)
        {
            case 'SelectedIndex':
                if (this._suppressSelectionSync) break;
                this.applySelectedIndex(newValue as number);
                break;
            case 'SelectedItem':
                if (this._suppressSelectionSync) break;
                this.applySelectedItem(newValue);
                break;
        }
    }

    private applySelectedIndex(idx: number): void
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
        // Mirror back out — keep BOTH DPs consistent with the
        // selection set. Includes normalising an out-of-range write
        // back to -1.
        this._suppressSelectionSync = true;
        const first: ListBoxItem | undefined =
            this._selectedItems.values().next().value;
        if (first === undefined)
        {
            this.SelectedIndex = -1;
            this.SelectedItem  = undefined;
        }
        else
        {
            const containers2 = this.ItemContainers;
            this.SelectedIndex = containers2.indexOf(first);
            this.SelectedItem  = first.Tag !== undefined ? first.Tag : first;
        }
        this._suppressSelectionSync = false;
        this.fireSelectionChanged();
    }

    private applySelectedItem(value: unknown): void
    {
        const containers = this.ItemContainers;
        if (value === undefined)
        {
            this.setSelected([]);
            this._anchor = undefined;
        }
        else
        {
            // Match Tag identity first (Items mode), then the
            // container itself (declarative mode without a Tag).
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
        // Mirror back out: keep SelectedIndex consistent with the new
        // SelectedItem write.
        this._suppressSelectionSync = true;
        const first: ListBoxItem | undefined =
            this._selectedItems.values().next().value;
        this.SelectedIndex = first === undefined
            ? -1
            : this.ItemContainers.indexOf(first);
        this._suppressSelectionSync = false;
        this.fireSelectionChanged();
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
        ensureControlsTheme();
    }

    private readonly _border: Border | undefined;
    private _pressOriginatedHere = false;

    constructor(content?: Visual)
    {
        super();
        this.Template = resolveTemplate(KEY_LISTBOX_ITEM);
        this._border = this.GetTemplateChild('PART_Border') as Border | undefined;
        if (content !== undefined) this.Content = content;
        this.AddPropertyChangedListener(Visual.IsMouseOverKey, () => this.refreshBackground());
        this.refreshBackground();
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
        const lb = this.findListBox();
        if (lb !== undefined) lb.HandleItemClick(this, args.Modifiers);
    }

    protected override OnPointerLeave(_args: PointerEventArgs): void
    {
        this._pressOriginatedHere = false;
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'IsSelected') this.refreshBackground();
    }

    // Walk the logical-parent chain for the owning ListBox.
    private findListBox(): ListBox | undefined
    {
        let cur: Visual | undefined = this.GetLogicalParent();
        while (cur !== undefined)
        {
            if (cur instanceof ListBox) return cur;
            cur = cur.GetLogicalParent();
        }
        return undefined;
    }

    // Background priority: selected wins over hover. Transparent
    // (undefined Background) is the default — the ListBox's host
    // surface shows through.
    private refreshBackground(): void
    {
        if (this._border === undefined) return;
        let bg: Brush | undefined;
        if (this.IsSelected)            bg = Theme.itemSelectedBg;
        else if (this.IsMouseOver)      bg = Theme.itemHoverBg;
        else                             bg = undefined;
        this._border.Background = bg;
    }
}

// Silence "unused import" — Orientation is used implicitly: the
// StackPanel ItemsPanel factory defaults to Vertical (registered
// default), so we don't pass it explicitly. Keeping the import
// makes the dependency relationship explicit in the import list
// for grep / IDE jump-to-source.
void Orientation;
