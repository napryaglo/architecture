import {
    Color,
    MetaData,
    Model,
    Panel,
    Rect,
    Size,
    Thickness,
    Visual,
    type DrawingContext,
    type PointerEventArgs,
    type PropertyDescriptor,
} from '../runtime/index.js';
import { SolidColorBrush } from '../visual-engine/index.js';
import { Border } from './border.js';
import { Orientation, StackPanel } from './stack-panel.js';
import { TextBlock } from './text-block.js';

// Material UI palette for the Outlined Select look — the default
// MUI select variant. Distinct from the Contained Button palette
// (Button uses primary blue) because selects sit alongside form
// fields and need a more neutral resting state.
const MUI_FIELD_BG           = new SolidColorBrush(Color.FromHex('#ffffff'));
const MUI_FIELD_BORDER       = new SolidColorBrush(Color.FromHex('#c4c4c4'));
const MUI_FIELD_BORDER_OPEN  = new SolidColorBrush(Color.FromHex('#1976d2'));
const MUI_FIELD_TEXT        = new SolidColorBrush(Color.FromHex('#212121'));
const MUI_PLACEHOLDER_TEXT  = new SolidColorBrush(Color.FromHex('#9e9e9e'));
const MUI_POPUP_BG          = new SolidColorBrush(Color.FromHex('#ffffff'));
const MUI_POPUP_BORDER      = new SolidColorBrush(Color.FromHex('#e0e0e0'));
const MUI_ITEM_HOVER_BG     = new SolidColorBrush(Color.FromHex('#f5f5f5'));
const MUI_ITEM_SELECTED_BG  = new SolidColorBrush(Color.FromHex('#e3f2fd'));

// Render the chevron as text on the selection-box right edge. A path
// glyph would be cleaner, but TextBlock with a unicode character
// avoids reaching into Geometry. The white-down-pointing-triangle
// (U+25BC) is visually consistent with MUI's chevron at default
// sizes.
const CHEVRON_GLYPH = '▾';

// 2-cell horizontal layout: the first child is left-aligned and the
// second child is right-aligned; both are vertically centred within
// the panel's arranged rect. Used by the ComboBox's selection box to
// place the label on the left edge and the chevron on the right edge
// of a single Border slot.
//
// Mural's StackPanel can't do this — its second child would simply
// follow the first along the stack axis. A WPF DockPanel /
// Grid-with-`*` columns would, but mural's v1 control library has
// neither. SplitRow is private to combo-box because it's exactly the
// shape this one layout needs; if a second consumer turns up it can
// be promoted to its own file.
class SplitRow extends Panel
{
    protected override MeasureOverride(availableSize: Size): Size
    {
        const children = this.visualChildren;
        if (children.length === 0) return Size.Zero;
        // Pessimistic upper bound for each child — both get the full
        // available width during measure; arrange compacts the left
        // one to fit alongside the right.
        let width = 0;
        let height = 0;
        for (const c of children)
        {
            c.Measure(availableSize);
            width += c.DesiredSize.Width;
            height = Math.max(height, c.DesiredSize.Height);
        }
        return new Size(width, height);
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        const children = this.visualChildren;
        if (children.length === 0) return finalSize;
        const left = children[0]!;
        // Right child = second one when present; otherwise the only
        // child collapses to the left (which is the natural fallback).
        const right = children.length > 1 ? children[1]! : undefined;

        const rightW = right?.DesiredSize.Width ?? 0;
        const leftW  = Math.max(0, finalSize.Width - rightW);

        const centerY = (h: number): number => Math.max(0, (finalSize.Height - h) / 2);

        left.Arrange(new Rect(0, centerY(left.DesiredSize.Height),
                              leftW, left.DesiredSize.Height));
        if (right !== undefined)
        {
            right.Arrange(new Rect(finalSize.Width - rightW,
                                    centerY(right.DesiredSize.Height),
                                    rightW, right.DesiredSize.Height));
        }
        return finalSize;
    }
}

// Item label resolution: strings pass through as-is; objects with a
// conventional Label / Name / Text property prefer the named property;
// everything else stringifies. Keeps simple `Items=["Apple","Pear"]`
// scenarios working without forcing every consumer to wrap their items
// in a display shape.
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

// Internal Border subclass that fires a click callback on PointerUp
// when the press originated locally and the pointer is still inside —
// the same release-mode semantics as Button. Used for both the
// ComboBox's selection box and each item row. Inlined here because
// the callback shape doesn't belong on the public Border surface and
// the click semantics are private to ComboBox's internals.
class ClickableBorder extends Border
{
    public onClick: (() => void) | undefined;
    private _pressOriginatedHere = false;

    protected override OnPointerDown(_args: PointerEventArgs): void
    {
        this._pressOriginatedHere = true;
    }

    protected override OnPointerUp(_args: PointerEventArgs): void
    {
        const fire = this._pressOriginatedHere && this.IsMouseOver;
        this._pressOriginatedHere = false;
        if (fire) this.onClick?.();
    }

    protected override OnPointerLeave(_args: PointerEventArgs): void
    {
        this._pressOriginatedHere = false;
    }
}

// Material UI Outlined Select. Drops a selection box that, when
// clicked, expands a popup containing the items. Clicking an item
// commits SelectedItem / SelectedIndex and closes the dropdown.
//
// DPs:
//   * Items          — `unknown[]`. Strings render as-is; objects use
//                       Label / Name / Text by convention.
//   * SelectedItem   — the currently-selected item (`undefined` when
//                       nothing is chosen). Bindable; setting it
//                       updates the selection box display and the
//                       SelectedIndex DP.
//   * SelectedIndex  — index into Items of the current selection
//                       (-1 when nothing is chosen).
//   * IsDropDownOpen — visible state of the popup.
//   * Placeholder    — text shown in the selection box when nothing
//                       is selected.
//
// Layout:
//
//   ┌─ StackPanel (vertical) ───────────────────────────────┐
//   │ ┌─ ClickableBorder (selection box, fixed height) ──┐ │
//   │ │  TextBlock(selected)            TextBlock(▾)     │ │
//   │ └──────────────────────────────────────────────────┘ │
//   │ ┌─ Border (popup, visible only when open) ─────────┐ │   ← shown / hidden
//   │ │ ┌─ StackPanel (vertical) ──────────────────────┐ │ │
//   │ │ │  ClickableBorder(item 0)                     │ │ │
//   │ │ │  ClickableBorder(item 1)                     │ │ │
//   │ │ │  …                                            │ │ │
//   │ │ └──────────────────────────────────────────────┘ │ │
//   │ └──────────────────────────────────────────────────┘ │
//   └──────────────────────────────────────────────────────┘
//
// The popup is added / removed from the StackPanel based on
// IsDropDownOpen so it contributes zero layout space when closed.
// (Inline insertion is the simplest realisation pending a proper
// popup layer with z-order overlay.)
export class ComboBox extends Visual
{
    static {
        Model.RegisterProperty(ComboBox, 'Items',          undefined, MetaData.Measure);
        Model.RegisterProperty(ComboBox, 'SelectedItem',   undefined, MetaData.Measure | MetaData.Render);
        Model.RegisterProperty(ComboBox, 'SelectedIndex',  -1,        MetaData.None);
        Model.RegisterProperty(ComboBox, 'IsDropDownOpen', false,     MetaData.Measure);
        Model.RegisterProperty(ComboBox, 'Placeholder',    'Select…', MetaData.Measure | MetaData.Render);
    }

    // ── Template parts ─────────────────────────────────────────────
    private readonly _selectionBox:    ClickableBorder;
    private readonly _selectionText:   TextBlock;
    private readonly _selectionChevron: TextBlock;
    private readonly _popup:           Border;
    private readonly _popupStack:      StackPanel;
    private readonly _rootStack:       StackPanel;
    private _itemContainers:        ClickableBorder[] = [];
    /** Guard for the SelectedIndex / SelectedItem cross-update — when
     *  one DP setter writes the other we must not loop. */
    private _suppressSelectionSync = false;

    constructor()
    {
        super();

        // Selection box: clickable Border holding a SplitRow that
        // arranges the label on the left and the chevron on the right,
        // both vertically centred. Height pinned to the Material
        // Outlined Select default (40 DIPs).
        this._selectionBox = new ClickableBorder();
        this._selectionBox.Background      = MUI_FIELD_BG;
        this._selectionBox.BorderBrush     = MUI_FIELD_BORDER;
        this._selectionBox.BorderThickness = new Thickness(1);
        this._selectionBox.CornerRadius    = 4;
        this._selectionBox.Padding         = new Thickness(14, 8, 14, 8);
        this._selectionBox.Height          = 40;
        this._selectionBox.onClick = (): void => {
            this.IsDropDownOpen = !this.IsDropDownOpen;
        };

        // SplitRow → [labelTextBlock, chevronTextBlock]. The label
        // (first child) gets the left edge; the chevron (second child)
        // gets the right edge.
        const split = new SplitRow();
        this._selectionText    = new TextBlock('');
        this._selectionText.Foreground   = MUI_PLACEHOLDER_TEXT;
        this._selectionChevron = new TextBlock(CHEVRON_GLYPH);
        this._selectionChevron.Foreground = MUI_FIELD_TEXT;
        split.AddChild(this._selectionText);
        split.AddChild(this._selectionChevron);
        this._selectionBox.SetChild(split);

        this._popupStack = new StackPanel();
        this._popupStack.Orientation = Orientation.Vertical;

        this._popup = new Border();
        this._popup.Background      = MUI_POPUP_BG;
        this._popup.BorderBrush     = MUI_POPUP_BORDER;
        this._popup.BorderThickness = new Thickness(1);
        this._popup.CornerRadius    = 4;
        this._popup.Padding         = new Thickness(0, 4, 0, 4);
        this._popup.SetChild(this._popupStack);

        this._rootStack = new StackPanel();
        this._rootStack.Orientation = Orientation.Vertical;
        this._rootStack.AddChild(this._selectionBox);
        // Popup is only attached when IsDropDownOpen toggles to true —
        // a closed combo contributes only the selection box to layout.

        this.AttachVisual(this._rootStack);

        this.refreshSelectionText();
    }

    public get Items(): readonly unknown[] | undefined { return this.get_property_value('Items'); }
    public set Items(v: readonly unknown[] | undefined) { this.set_property_value('Items', v); }

    public get SelectedItem(): unknown { return this.get_property_value('SelectedItem'); }
    public set SelectedItem(v: unknown) { this.set_property_value('SelectedItem', v); }

    public get SelectedIndex(): number { return this.get_property_value('SelectedIndex'); }
    public set SelectedIndex(v: number) { this.set_property_value('SelectedIndex', v); }

    public get IsDropDownOpen(): boolean { return this.get_property_value('IsDropDownOpen'); }
    public set IsDropDownOpen(v: boolean) { this.set_property_value('IsDropDownOpen', v); }

    public get Placeholder(): string { return this.get_property_value('Placeholder'); }
    public set Placeholder(v: string) { this.set_property_value('Placeholder', v); }

    public override get visualChildren(): readonly Visual[]
    {
        return [this._rootStack];
    }

    // Cascade the host target through to the template subtree. Visual's
    // default no-op leaves `_rootStack` (and everything below it) with
    // `_target = undefined`, which means `InvalidateMeasure` /
    // `InvalidateVisual` calls inside the popup never reach the host's
    // dirty queue. Same pattern ContentControl uses for its template
    // root.
    protected override propagate_target_to_visual_children(): void
    {
        this._rootStack['SetTarget'](this['target']);
    }

    // No own paint; the template tree (selection box + popup) covers
    // every painted pixel.
    protected override RenderOverride(_dc: DrawingContext): void { }

    protected override MeasureOverride(availableSize: Size): Size
    {
        this._rootStack.Measure(availableSize);
        return this._rootStack.DesiredSize;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        this._rootStack.Arrange(new Rect(0, 0, finalSize.Width, finalSize.Height));
        return finalSize;
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
            case 'Items':
                this.rebuildItemContainers();
                this.syncSelectionFromIndex();
                this.refreshSelectionText();
                break;
            case 'SelectedItem':
                this.syncIndexFromItem();
                this.refreshSelectionText();
                this.refreshItemHighlights();
                break;
            case 'SelectedIndex':
                this.syncSelectionFromIndex();
                this.refreshSelectionText();
                this.refreshItemHighlights();
                break;
            case 'IsDropDownOpen':
                this.applyDropDownVisibility(newValue as boolean);
                break;
            case 'Placeholder':
                this.refreshSelectionText();
                break;
        }
    }

    // ── Internal plumbing ───────────────────────────────────────────

    private rebuildItemContainers(): void
    {
        // Snapshot before iteration — the loop mutates the stack's
        // children via RemoveVisualChild.
        for (const c of [...this._itemContainers])
        {
            this._popupStack.RemoveVisualChild(c);
        }
        this._itemContainers = [];

        const items = this.Items ?? [];
        for (let i = 0; i < items.length; i++)
        {
            const item  = items[i];
            const index = i;
            const row   = new ClickableBorder();
            row.Background       = MUI_POPUP_BG;
            row.BorderThickness  = Thickness.Zero;
            row.Padding          = new Thickness(16, 8, 16, 8);
            // Hover background swap — same listener pattern as Button.
            row.AddPropertyChangedListener('IsMouseOver', () => {
                row.Background = this.itemBackgroundFor(index, row.IsMouseOver);
            });
            const label = new TextBlock(displayString(item));
            label.Foreground = MUI_FIELD_TEXT;
            row.SetChild(label);
            row.onClick = (): void => {
                this.SelectedIndex   = index;
                this.IsDropDownOpen = false;
            };
            this._popupStack.AddChild(row);
            this._itemContainers.push(row);
        }

        // Panel.AddChild / RemoveVisualChild don't auto-invalidate the
        // panel's measure (the framework relies on the caller to do
        // it; see ItemsControl.handleItemsChange). Without these the
        // popup keeps its stale `_isMeasureValid = true` and items
        // never get measured even after they're attached.
        this._popupStack.InvalidateMeasure();
        this.InvalidateMeasure();
    }

    private itemBackgroundFor(index: number, hover: boolean)
    {
        if (index === this.SelectedIndex) return MUI_ITEM_SELECTED_BG;
        if (hover)                        return MUI_ITEM_HOVER_BG;
        return MUI_POPUP_BG;
    }

    private refreshItemHighlights(): void
    {
        for (let i = 0; i < this._itemContainers.length; i++)
        {
            const c = this._itemContainers[i]!;
            c.Background = this.itemBackgroundFor(i, c.IsMouseOver);
        }
    }

    // SelectedItem → SelectedIndex. The look-up uses identity to
    // avoid false matches when two distinct objects stringify to the
    // same value (a common pitfall with custom toString impls).
    private syncIndexFromItem(): void
    {
        if (this._suppressSelectionSync) return;
        const items = this.Items;
        const selected = this.SelectedItem;
        if (items === undefined || selected === undefined)
        {
            this._suppressSelectionSync = true;
            this.SelectedIndex = -1;
            this._suppressSelectionSync = false;
            return;
        }
        const idx = items.indexOf(selected);
        this._suppressSelectionSync = true;
        this.SelectedIndex = idx;
        this._suppressSelectionSync = false;
    }

    // SelectedIndex → SelectedItem.
    private syncSelectionFromIndex(): void
    {
        if (this._suppressSelectionSync) return;
        const items = this.Items;
        const idx   = this.SelectedIndex;
        const next  = items === undefined || idx < 0 || idx >= items.length
            ? undefined
            : items[idx];
        this._suppressSelectionSync = true;
        this.SelectedItem = next;
        this._suppressSelectionSync = false;
    }

    private refreshSelectionText(): void
    {
        const item = this.SelectedItem;
        if (item === undefined || item === null)
        {
            this._selectionText.Text       = this.Placeholder;
            this._selectionText.Foreground = MUI_PLACEHOLDER_TEXT;
        }
        else
        {
            this._selectionText.Text       = displayString(item);
            this._selectionText.Foreground = MUI_FIELD_TEXT;
        }
    }

    private applyDropDownVisibility(open: boolean): void
    {
        const popupAttached = this._popup.GetVisualParent() === this._rootStack;
        if (open && !popupAttached)
        {
            this._rootStack.AddChild(this._popup);
            // Refocus the selection-box border to the "open" colour so
            // the user sees that the combo is active.
            this._selectionBox.BorderBrush = MUI_FIELD_BORDER_OPEN;
        }
        else if (!open && popupAttached)
        {
            this._rootStack.RemoveChild(this._popup);
            this._selectionBox.BorderBrush = MUI_FIELD_BORDER;
        }
        // Adding / removing a child to a Panel doesn't trigger
        // measure invalidation on its own — see the comment in
        // rebuildItemContainers. Without this the StackPanel keeps
        // the old cached size and the popup never gets measured.
        this._rootStack.InvalidateMeasure();
        this.InvalidateMeasure();
    }
}

