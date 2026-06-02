import {
    Application,
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
import { PresentationTarget } from '../visual-engine/index.js';
import { Border } from './border.js';
import type { StackPanel } from './stack-panel.js';
import { TextBlock } from './text-block.js';
import { ensureControlsTheme } from './default-resources.js';
import { Theme } from './theme.js';
import type { ControlTemplate } from './control-template.js';

// Resource-dictionary keys for the two ControlTemplates the ComboBox
// loads from the consolidated controls theme — match the `x:key="…"`
// literals in controls.template.mu.
const KEY_SELECTION = 'DefaultComboBoxSelection';
const KEY_POPUP     = 'DefaultComboBoxPopup';

function resolveTemplate(key: string): ControlTemplate
{
    const tpl = Application.ResolveDefaultResource<ControlTemplate>(key);
    if (tpl === undefined)
    {
        throw new Error(
            `ComboBox: default template '${key}' is not registered.`);
    }
    return tpl;
}

// 2-cell horizontal layout: the first child is left-aligned and the
// second child is right-aligned; both are vertically centred within
// the panel's arranged rect. Used by the ComboBox's selection box to
// place the label on the left edge and the chevron on the right edge
// of a single Border slot.
//
// Mural's StackPanel can't do this — its second child would simply
// follow the first along the stack axis. A WPF DockPanel /
// Grid-with-`*` columns would, but mural's v1 control library has
// neither. SplitRow is exported so the ComboBox's compiled-`.mu`
// template can name it; consumers outside ComboBox shouldn't depend
// on it (rename / removal without notice).
export class SplitRow extends Panel
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

// Border subclass that fires a click callback on PointerUp when the
// press originated locally and the pointer is still inside — the
// same release-mode semantics as Button. Used for both the ComboBox's
// selection box and each item row. Exported so the compiled-`.mu`
// template can name it; not part of the public package surface (see
// SplitRow comment).
export class ClickableBorder extends Border
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

// Invisible outside-click absorber. Same press-here-release-here gate
// as the Drawer scrim; fully transparent so the painted popup remains
// visually unobscured. Both Down and Up are marked Handled so click-
// outside-popup never reaches an underlying visual in the main tree.
// Exported for the compiled-`.mu` template (not public API).
export class ClickAwayScrim extends Border
{
    public onClick: (() => void) | undefined;
    private _pressOriginatedHere = false;

    protected override OnPointerDown(args: PointerEventArgs): void
    {
        this._pressOriginatedHere = true;
        args.Handled = true;
    }

    protected override OnPointerUp(args: PointerEventArgs): void
    {
        const fire = this._pressOriginatedHere && this.IsMouseOver;
        this._pressOriginatedHere = false;
        args.Handled = true;
        if (fire) this.onClick?.();
    }

    protected override OnPointerLeave(_args: PointerEventArgs): void
    {
        this._pressOriginatedHere = false;
    }
}

// Sum a Visual's ArrangedRect chain up to the surface root. Returns the
// visual's absolute position in target-surface coordinates. Walks
// GetVisualParent until a parent without one (the root) is reached.
function absoluteOrigin(v: Visual): { x: number; y: number }
{
    let x = 0;
    let y = 0;
    let cur: Visual | undefined = v;
    while (cur !== undefined)
    {
        x += cur.ArrangedRect.X;
        y += cur.ArrangedRect.Y;
        cur = cur.GetVisualParent();
    }
    return { x, y };
}

// Overlay host for the ComboBox dropdown. Lives in the target's
// OverlayLayer when the dropdown is open; arranged at the full surface
// size by the layer. Internal layout positions the click-away scrim
// edge-to-edge and the popup just below the originating selection box.
//
// Anchored at the selection-box absolute origin re-read on every arrange
// so a layout shift (window resize, scroll) in the underlying tree
// repositions the open dropdown automatically.
//
// Three external references — `selectionBox`, `popup`, `combo` — are
// writable public fields rather than constructor args so the host can
// be instantiated from `.mu` markup (which can't pass constructor args)
// and wired by ComboBox after the popup template has been applied.
// Arrange is defensive: if either visual reference is unset, it
// degrades to a no-op rather than throwing — keeps a half-configured
// instance from breaking the layout pass during construction.
//
// Exported for the compiled-`.mu` template (not public API).
export class ComboBoxPopupHost extends Panel
{
    public combo:        ComboBox | undefined;
    public selectionBox: Visual   | undefined;
    public popup:        Visual   | undefined;

    protected override MeasureOverride(availableSize: Size): Size
    {
        for (const c of this.visualChildren) c.Measure(availableSize);
        const w = Number.isFinite(availableSize.Width)  ? availableSize.Width  : 0;
        const h = Number.isFinite(availableSize.Height) ? availableSize.Height : 0;
        return new Size(w, h);
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        const children = this.visualChildren;
        // Scrim covers the full overlay slot (assumed first child by
        // template authoring convention — `PART_Scrim` before
        // `PART_Popup` in the visual tree).
        children[0]?.Arrange(new Rect(0, 0, finalSize.Width, finalSize.Height));

        if (children.length < 2) return finalSize;
        const popupV = this.popup ?? children[1];
        const anchor = this.selectionBox;
        if (popupV === undefined || anchor === undefined) return finalSize;

        const origin = absoluteOrigin(anchor);
        const sbRect = anchor.ArrangedRect;
        const popupW = sbRect.Width;
        const popupH = popupV.DesiredSize.Height;
        // Below the selection box by default; clamp to the surface so
        // the bottom of the popup doesn't sit outside the visible area.
        let popupY = origin.y + sbRect.Height;
        if (popupY + popupH > finalSize.Height)
        {
            popupY = Math.max(0, finalSize.Height - popupH);
        }
        let popupX = origin.x;
        if (popupX + popupW > finalSize.Width)
        {
            popupX = Math.max(0, finalSize.Width - popupW);
        }
        popupV.Arrange(new Rect(popupX, popupY, popupW, popupH));
        // Keep a reference around in case the combo wants to know
        // where the popup lives now (e.g. for animation later).
        void this.combo;
        return finalSize;
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
//   In-flow (always):
//   ┌─ ClickableBorder (selection box, fixed height) ──┐
//   │  TextBlock(selected)            TextBlock(▾)     │
//   └──────────────────────────────────────────────────┘
//
//   When IsDropDownOpen=true, additionally mounted on the host
//   PresentationTarget.OverlayRoot:
//
//   ┌─ ComboBoxPopupHost (full overlay slot) ──────────────────┐
//   │ ┌─ ClickAwayScrim (invisible, full slot) ────────────────┐
//   │ ↘── click here dismisses the dropdown                    │
//   │ ┌─ Border (popup, anchored below selection box) ───────┐ │
//   │ │ ┌─ StackPanel (vertical) ──────────────────────────┐ │ │
//   │ │ │  ClickableBorder(item 0)                         │ │ │
//   │ │ │  ClickableBorder(item 1)                         │ │ │
//   │ │ │  …                                                │ │ │
//   │ │ └──────────────────────────────────────────────────┘ │ │
//   │ └──────────────────────────────────────────────────────┘ │
//   └─────────────────────────────────────────────────────────┘
//
// The popup lives on the OverlayLayer so it paints above ALL other
// content, regardless of the originating selection box's depth in
// the visual tree.
export class ComboBox extends Visual
{
    static {
        Model.RegisterProperty(ComboBox, 'Items',          undefined, MetaData.Measure);
        Model.RegisterProperty(ComboBox, 'SelectedItem',   undefined, MetaData.Measure | MetaData.Render);
        Model.RegisterProperty(ComboBox, 'SelectedIndex',  -1,        MetaData.None);
        Model.RegisterProperty(ComboBox, 'IsDropDownOpen', false,     MetaData.Measure);
        Model.RegisterProperty(ComboBox, 'Placeholder',    'Select…', MetaData.Measure | MetaData.Render);
        // Registers the consolidated controls theme exactly once so
        // DefaultComboBoxSelection / DefaultComboBoxPopup resolve via
        // Application.ResolveDefaultResource during construction.
        ensureControlsTheme();
    }

    // ── Template parts ─────────────────────────────────────────────
    private readonly _selectionBox:    ClickableBorder;
    private readonly _selectionText:   TextBlock;
    private readonly _popup:           Border;
    private readonly _popupStack:      StackPanel;
    private readonly _popupHost:       ComboBoxPopupHost;
    private readonly _scrim:           ClickAwayScrim;
    private _itemContainers:        ClickableBorder[] = [];
    /** Guard for the SelectedIndex / SelectedItem cross-update — when
     *  one DP setter writes the other we must not loop. */
    private _suppressSelectionSync = false;

    /** True iff `_popupHost` is currently a child of
     *  PresentationTarget.OverlayRoot. Tracked so redundant IsOpen
     *  writes don't double-attach. */
    private _popupMounted = false;

    /** The host this combo was last seen attached to, so we can detach
     *  the popup from the OLD target if the combo is moved or removed
     *  while open. */
    private _lastKnownTarget: PresentationTarget | undefined;

    constructor()
    {
        super();

        // ── In-flow selection-box subtree ──────────────────────────
        // The compiled `combo-box.template.mu` registers the selection
        // ControlTemplate (ClickableBorder PART_SelectionBox + label /
        // chevron) under DefaultComboBoxSelection in the controls theme.
        // All cosmetic defaults live in markup; this constructor only
        // wires behaviour to the named parts.
        const selectionTpl  = resolveTemplate(KEY_SELECTION);
        const selectionInst = selectionTpl.Apply(this);
        this._selectionBox    = selectionInst.root as ClickableBorder;
        this._selectionText   = selectionInst.root.FindName('PART_SelectionText') as TextBlock;
        this._selectionBox.onClick = (): void => {
            this.IsDropDownOpen = !this.IsDropDownOpen;
        };

        // ── Overlay popup subtree ──────────────────────────────────
        // `combo-box-popup.template.mu` registers the overlay
        // ControlTemplate (ComboBoxPopupHost + Scrim + Popup +
        // PopupStack) under DefaultComboBoxPopup. The host's anchor
        // refs (combo, selectionBox, popup) can't appear in markup —
        // they form a cycle through the selection subtree — so we
        // patch them in here after both templates have been applied.
        const popupTpl  = resolveTemplate(KEY_POPUP);
        const popupInst = popupTpl.Apply(this);
        this._popupHost  = popupInst.root as ComboBoxPopupHost;
        this._scrim      = popupInst.root.FindName('PART_Scrim')      as ClickAwayScrim;
        this._popup      = popupInst.root.FindName('PART_Popup')      as Border;
        this._popupStack = popupInst.root.FindName('PART_PopupStack') as StackPanel;
        this._popupHost.combo        = this;
        this._popupHost.selectionBox = this._selectionBox;
        this._popupHost.popup        = this._popup;
        this._scrim.onClick = (): void =>
        {
            this.IsDropDownOpen = false;
        };

        // Selection box is the combo's only in-flow visual child; the
        // popup host attaches to the target's OverlayLayer on open.
        this.AttachVisual(this._selectionBox);

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
        return [this._selectionBox];
    }

    // Cascade host target through to the in-flow selection box AND
    // detach any orphan popup from the previous target before its
    // identity is overwritten. Combo is rarely re-parented in practice
    // but the cleanup keeps stale overlay nodes from lingering on the
    // old target when it does happen.
    protected override propagate_target_to_visual_children(): void
    {
        const newTarget = this['target'] as PresentationTarget | undefined;
        const oldTarget = this._lastKnownTarget;

        if (oldTarget !== undefined && oldTarget !== newTarget && this._popupMounted)
        {
            oldTarget.DetachOverlay(this._popupHost);
            this._popupMounted = false;
        }
        this._lastKnownTarget = newTarget;

        this._selectionBox['SetTarget'](newTarget);

        // Re-mount the popup on the new target if we want it open.
        if (newTarget !== undefined && this.IsDropDownOpen)
        {
            this.mountPopup();
        }
    }

    // No own paint; the template tree (selection box + popup) covers
    // every painted pixel.
    protected override RenderOverride(_dc: DrawingContext): void { }

    protected override MeasureOverride(availableSize: Size): Size
    {
        this._selectionBox.Measure(availableSize);
        return this._selectionBox.DesiredSize;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        this._selectionBox.Arrange(new Rect(0, 0, finalSize.Width, finalSize.Height));
        // Selection box moved — repose the open popup if any.
        if (this._popupMounted)
        {
            this._popupHost.InvalidateArrange();
        }
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
            row.Background       = Theme.popupBg;
            row.BorderThickness  = Thickness.Zero;
            row.Padding          = new Thickness(16, 8, 16, 8);
            // Hover background swap — same listener pattern as Button.
            row.AddPropertyChangedListener('IsMouseOver', () => {
                row.Background = this.itemBackgroundFor(index, row.IsMouseOver);
            });
            const label = new TextBlock(displayString(item));
            label.Foreground = Theme.fieldText;
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
        this._popup.InvalidateMeasure();
        this._popupHost.InvalidateMeasure();
        this._popupHost.InvalidateArrange();
    }

    private itemBackgroundFor(index: number, hover: boolean)
    {
        if (index === this.SelectedIndex) return Theme.itemSelectedBg;
        if (hover)                        return Theme.itemHoverBg;
        return Theme.popupBg;
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
            this._selectionText.Foreground = Theme.placeholder;
        }
        else
        {
            this._selectionText.Text       = displayString(item);
            this._selectionText.Foreground = Theme.fieldText;
        }
    }

    private applyDropDownVisibility(open: boolean): void
    {
        if (open)
        {
            this.mountPopup();
            this._selectionBox.BorderBrush = Theme.fieldBorderOpen;
        }
        else
        {
            this.unmountPopup();
            this._selectionBox.BorderBrush = Theme.fieldBorder;
        }
    }

    private mountPopup(): void
    {
        const pt = this['target'] as PresentationTarget | undefined;
        if (pt === undefined) return;
        if (this._popupMounted) return;
        pt.AttachOverlay(this._popupHost);
        this._popupMounted = true;
        // Defensive — anchor needs a fresh arrange now that the host
        // is mounted, and the popup may have stale measure cached.
        this._popupHost.InvalidateMeasure();
        this._popupHost.InvalidateArrange();
    }

    private unmountPopup(): void
    {
        const pt = this['target'] as PresentationTarget | undefined;
        if (pt === undefined) return;
        if (!this._popupMounted) return;
        pt.DetachOverlay(this._popupHost);
        this._popupMounted = false;
    }
}
