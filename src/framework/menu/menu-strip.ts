import {
    MetaData,
    Model,
    Panel,
    Rect,
    Size,
    Visual,
    type DrawingContext,
    type KeyEventArgs,
    type PointerEventArgs,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import { ensureSurfaceTheme } from './default-surface-resources.js';
import { PresentationTarget } from '../../visual-engine/index.js';
import { Border } from '../../Basic/border.js';
import { ContentPresenter } from '../../Basic/content-presenter.js';
import { ControlTemplate } from '../../Basic/control-template.js';
import { ItemsControl } from '../items-control.js';
import { Orientation, StackPanel } from '../../Basic/stack-panel.js';
import { TextBlock } from '../../Basic/text-block.js';
import { Theme } from '../../Basic/theme.js';
import { Brush } from '../../visual-engine/index.js';
import { ClickAwayScrim } from '../tool-bar/tool-bar.js';
import { Button } from '../button.js';
import type { ICommand } from '../../runtime/command.js';

// ─────────────────────────────────────────────────────────────────────
// MenuStrip — horizontal main-menu bar. Holds top-level MenuItems whose
// click opens a submenu popup below the row.
//
// Authoring shape:
//
//   MenuStrip {
//       MenuItem [Header="File"] {
//           MenuItem [Header="New",  InputGestureText="Ctrl+N"]
//           MenuItem [Header="Open", InputGestureText="Ctrl+O"]
//           MenuSeparator
//           MenuItem [Header="Save", InputGestureText="Ctrl+S"]
//       }
//       MenuItem [Header="Edit"] { … }
//   }
//
// MenuStrip is just an ItemsControl whose default Style supplies:
//   * Background      — surface-container token
//   * ItemsPanel      — horizontal StackPanel (Orientation DP drives it
//                       on swap; default Horizontal)
//   * ItemContainerStyle — MenuStripItemStyle, which sets each
//                          container MenuItem's RowTemplate to the
//                          stripped chrome (no icon/gesture/chevron
//                          columns).
//
// The submenu mechanic comes for free from MenuItem — clicking a
// top-level MenuItem flips IsSubmenuOpen which mounts its submenu
// popup on the OverlayLayer below the row.
export class MenuStrip extends ItemsControl
{
    public static readonly OrientationKey = Model.RegisterProperty<Orientation>(
        MenuStrip, 'Orientation', Orientation.Horizontal, MetaData.Measure,
    );

    public get Orientation():  Orientation { return this.get_property_value(MenuStrip.OrientationKey); }
    public set Orientation(v: Orientation) { this.set_property_value(MenuStrip.OrientationKey, v); }

    static
    {
        Model.OverrideMetadata(MenuStrip, Visual.DefaultStyleKeyKey, { default_value: MenuStrip });
        ensureSurfaceTheme();
    }

    constructor()
    {
        super();
        this.applyDefaultStyle();
    }

    protected override validateDeclarativeChild(_child: Visual): void { }

    public override IsItemItsOwnContainerOverride(item: unknown): boolean
    {
        return item instanceof Visual;
    }

    // Wire onActivated on each materialised top-level MenuItem so a
    // descendant activation collapses the popup chain back to the
    // strip.
    public override PrepareContainerForItemOverride(container: Visual, item: unknown, index: number): void
    {
        super.PrepareContainerForItemOverride(container, item, index);
        if (container instanceof MenuItem)
        {
            container._onActivated = (): void => { container.IsSubmenuOpen = false; };
        }
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'Orientation')
        {
            // Items panel orientation tracks the DP. The Style hands us
            // a horizontal StackPanel by default; on swap we update the
            // live panel's Orientation so re-measure picks it up.
            const panel = (this as unknown as { _itemsPanel: StackPanel | undefined })._itemsPanel;
            if (panel instanceof StackPanel)
            {
                panel.Orientation = newValue as Orientation;
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────
// MenuItem — single row inside a Menu. Subclasses both ICommandSource
// (Header / Icon / InputGestureText + Command-driven activation) AND
// ItemsControl (nested Items = submenu; opens a Menu popup to the
// right when present).
//
// Visual columns (auto-hidden when their data is absent):
//
//   ┌─icon─┬──header───┬─gesture─┬─chevron─┐
//   │  📄  │  Open     │  Ctrl+O │         │
//   │      │  Save     │         │         │
//   │  ✓   │  Bold     │         │         │  (IsCheckable + IsChecked)
//   │      │  Recent   │         │    ▶    │  (has submenu)
//   └──────┴───────────┴─────────┴─────────┘
//
// Activation:
//   * Item with no Items: click fires Command (and closes the whole
//     popup chain via the parent MenuButton / ContextMenu).
//   * Item with Items: click opens / closes the submenu inline. Command
//     is ignored.
//
// Activation event protocol — a separate `onActivated` callback lets
// the parent popup machinery close the whole chain after click. It's
// fired from PreClick (before Command runs) so the parent has a chance
// to teardown before any Command-launched dialog steals focus.
export class MenuItem extends ItemsControl
{
    public static readonly HeaderKey            = Model.RegisterProperty<string | undefined>(MenuItem, 'Header',            undefined, MetaData.Measure | MetaData.Render);
    public static readonly IconKey              = Model.RegisterProperty<Visual | undefined>(MenuItem, 'Icon',              undefined, MetaData.Measure);
    public static readonly InputGestureTextKey  = Model.RegisterProperty<string | undefined>(MenuItem, 'InputGestureText',  undefined, MetaData.Measure | MetaData.Render);
    public static readonly IsCheckableKey       = Model.RegisterProperty<boolean>(           MenuItem, 'IsCheckable',       false,     MetaData.Render);
    public static readonly IsCheckedKey         = Model.RegisterProperty<boolean>(           MenuItem, 'IsChecked',         false,     MetaData.Render);
    public static readonly CommandKey           = Model.RegisterProperty<ICommand | undefined>(MenuItem, 'Command',           undefined, MetaData.None);
    public static readonly CommandParameterKey  = Model.RegisterProperty<unknown>(            MenuItem, 'CommandParameter',  undefined, MetaData.None);
    public static readonly IsSubmenuOpenKey     = Model.RegisterProperty<boolean>(           MenuItem, 'IsSubmenuOpen',     false,     MetaData.None);
    // RowTemplate — the ControlTemplate for the inline visible row
    // chrome. MenuItem's primary Template (ItemsControl-inherited) is
    // the SUBMENU popup chrome with an ItemsPresenter; the row
    // ("trigger" in MenuButton parlance) is a separate keyed template
    // applied imperatively. RowTemplate is settable so a parent
    // MenuStrip can swap to a stripped chrome via ItemContainerStyle.
    public static readonly RowTemplateKey       = Model.RegisterProperty<ControlTemplate | undefined>(
        MenuItem, 'RowTemplate', undefined, MetaData.Measure,
    );

    public get Header():           string | undefined { return this.get_property_value(MenuItem.HeaderKey); }
    public set Header(v:           string | undefined) { this.set_property_value(MenuItem.HeaderKey, v); }

    public get Icon():             Visual | undefined { return this.get_property_value(MenuItem.IconKey); }
    public set Icon(v:             Visual | undefined) { this.set_property_value(MenuItem.IconKey, v); }

    public get InputGestureText(): string | undefined { return this.get_property_value(MenuItem.InputGestureTextKey); }
    public set InputGestureText(v: string | undefined) { this.set_property_value(MenuItem.InputGestureTextKey, v); }

    public get IsCheckable():      boolean { return this.get_property_value(MenuItem.IsCheckableKey); }
    public set IsCheckable(v:      boolean) { this.set_property_value(MenuItem.IsCheckableKey, v); }

    public get IsChecked():        boolean { return this.get_property_value(MenuItem.IsCheckedKey); }
    public set IsChecked(v:        boolean) { this.set_property_value(MenuItem.IsCheckedKey, v); }

    public get Command():          ICommand | undefined { return this.get_property_value(MenuItem.CommandKey); }
    public set Command(v:          ICommand | undefined) { this.set_property_value(MenuItem.CommandKey, v); }

    public get CommandParameter(): unknown { return this.get_property_value(MenuItem.CommandParameterKey); }
    public set CommandParameter(v: unknown) { this.set_property_value(MenuItem.CommandParameterKey, v); }

    public get IsSubmenuOpen():    boolean { return this.get_property_value(MenuItem.IsSubmenuOpenKey); }
    public set IsSubmenuOpen(v:    boolean) { this.set_property_value(MenuItem.IsSubmenuOpenKey, v); }

    public get RowTemplate():      ControlTemplate | undefined { return this.get_property_value(MenuItem.RowTemplateKey); }
    public set RowTemplate(v:      ControlTemplate | undefined) { this.set_property_value(MenuItem.RowTemplateKey, v); }

    /** Set by the hosting popup (MenuButton or ContextMenu) so an
     *  activated item can request the popup chain to close. Click
     *  fires this BEFORE Command — gives the popup teardown a chance
     *  to release focus before any dialog the command opens steals it. */
    public _onActivated: (() => void) | undefined;

    // Row template parts — cached after the row template Apply.
    private _rowRoot:      Visual    | undefined;
    private _iconHost:     Border    | undefined;
    private _rowLabel:     TextBlock | undefined;
    private _gestureLabel: TextBlock | undefined;
    private _chevronLabel: TextBlock | undefined;

    // Submenu popup parts — cached after applyDefaultStyle materialises
    // the primary Template. The popup root is DETACHED from MenuItem so
    // the OverlayLayer can adopt it without dual-parent errors.
    private _popupHost:      MenuPopupHost  | undefined;
    private _scrim:          ClickAwayScrim | undefined;
    private _popupContainer: Border         | undefined;

    private _popupMounted = false;
    private _lastKnownTarget: PresentationTarget | undefined;

    private _pressOriginatedHere = false;

    static
    {
        // Type-keyed lookup for the default Style — registered as
        // `Style [TargetType=MenuItem]` in surface.template.mu. The
        // Style supplies:
        //   * Template     = DefaultMenuItemSubmenu  (popup chrome with
        //                    ItemsPresenter for submenu rows)
        //   * ItemsPanel   = DefaultMenuItemsPanel   (vertical stack
        //                    materialised into the ItemsPresenter)
        //   * RowTemplate  = DefaultMenuItemRow      (inline row chrome
        //                    with state triggers; applied imperatively)
        Model.OverrideMetadata(MenuItem, Visual.DefaultStyleKeyKey, { default_value: MenuItem });
        ensureSurfaceTheme();
    }

    constructor()
    {
        super();
        // Focusable so OnKeyDown receives arrow / Enter / Escape /
        // letter-accelerator events. Set BEFORE applyDefaultStyle in
        // case the Style ever wants to read Focusable.
        this.Focusable = true;
        // applyDefaultStyle resolves Style[TargetType=MenuItem] which
        // sets Template (popup chrome), ItemsPanel (vertical stack),
        // and RowTemplate. ItemsControl.rebuildTemplate Apply()s the
        // popup chrome and slots in the ItemsPanel — both end up in the
        // detached popup subtree we adopt below.
        this.applyDefaultStyle();
        this.adoptPopupTemplate();
        this.rebuildRow();
        // Initial content sync — empty Header / Icon / no submenu so
        // the columns auto-hide.
        this.refreshRow();
    }

    // Find the popup template parts (PART_PopupHost, PART_Scrim,
    // PART_PopupContainer), wire scrim onClick + host.popup, then
    // detach the templateRoot so the OverlayLayer can adopt it later.
    private adoptPopupTemplate(): void
    {
        const root = super.visualChildren[0];
        if (!(root instanceof MenuPopupHost)) return;
        this._popupHost      = root;
        this._scrim          = root.FindName('PART_Scrim')          as ClickAwayScrim;
        this._popupContainer = root.FindName('PART_PopupContainer') as Border;
        this._popupHost.popup = this._popupContainer;
        this._scrim.onClick   = (): void => { this.IsSubmenuOpen = false; };
        this.DetachVisual(this._popupHost);
    }

    // Materialise (or re-materialise) the row chrome from RowTemplate.
    // Called from the ctor and from OnPropertyChanged('RowTemplate')
    // when a parent MenuStrip swaps in a stripped chrome via
    // ItemContainerStyle.
    private rebuildRow(): void
    {
        if (this._rowRoot !== undefined)
        {
            this.DetachVisual(this._rowRoot);
            this._rowRoot      = undefined;
            this._iconHost     = undefined;
            this._rowLabel     = undefined;
            this._gestureLabel = undefined;
            this._chevronLabel = undefined;
        }
        const tpl = this.RowTemplate;
        if (tpl === undefined)
        {
            // Transient: a Style swap (e.g. when MenuStrip's
            // ItemContainerStyle takes effect on container attach) can
            // briefly clear RowTemplate between unapplying the old
            // Style's setter and applying the new one. The follow-up
            // setter re-fires OnPropertyChanged with the new template
            // and rebuildRow runs again. Leave _rowRoot empty for now;
            // it'll be re-populated on the next pass.
            return;
        }
        const inst = tpl.Apply(this);
        this._rowRoot = inst.root;
        this.AttachVisual(this._rowRoot);
        const icon    = this._rowRoot.FindName('PART_Icon');
        const label   = this._rowRoot.FindName('PART_Label');
        const gesture = this._rowRoot.FindName('PART_Gesture');
        const chevron = this._rowRoot.FindName('PART_Chevron');
        if (icon instanceof Border)       this._iconHost     = icon;
        if (label instanceof TextBlock)   this._rowLabel     = label;
        if (gesture instanceof TextBlock) this._gestureLabel = gesture;
        if (chevron instanceof TextBlock) this._chevronLabel = chevron;
    }

    public override get visualChildren(): readonly Visual[]
    {
        return this._rowRoot !== undefined ? [this._rowRoot] : [];
    }

    // Submenu items declared in `.mu` (`MenuItem { MenuItem ▶ … }`)
    // route through ItemsControl.AddChild. Lenient gate — any Visual
    // is accepted; conventional content is MenuItem / MenuSeparator.
    protected override validateDeclarativeChild(_child: Visual): void { }

    // Submenu items declared in markup ARE their own container.
    public override IsItemItsOwnContainerOverride(item: unknown): boolean
    {
        return item instanceof Visual;
    }

    // Wire onActivated on each materialised submenu MenuItem so an
    // activation closes the popup chain. Walks up to the root popup
    // host via _onActivated chaining.
    public override PrepareContainerForItemOverride(container: Visual, item: unknown, index: number): void
    {
        super.PrepareContainerForItemOverride(container, item, index);
        if (container instanceof MenuItem)
        {
            container._onActivated = (): void =>
            {
                this.IsSubmenuOpen = false;
                this._onActivated?.();
            };
        }
    }

    /** Public refresh for tests + DP-change forwarding. */
    public refreshRow(): void
    {
        // Header text — empty string when undefined to keep TextBlock happy.
        if (this._rowLabel !== undefined)
        {
            this._rowLabel.Text = this.Header ?? '';
        }
        // Gesture column — auto-hide when empty by zeroing Width.
        if (this._gestureLabel !== undefined)
        {
            const g = this.InputGestureText ?? '';
            this._gestureLabel.Text = g;
            this._gestureLabel.Width = g.length === 0 ? 0 : Number.NaN;
        }
        // Chevron column — populated when this item has a submenu.
        if (this._chevronLabel !== undefined)
        {
            const hasSubmenu = this.itemCount() > 0;
            this._chevronLabel.Text = hasSubmenu ? '▶' : '';
            // Don't force a width when the stripped MenuStrip row
            // template already pinned Width=0 via local setters — only
            // restore to 12 when there's actually a submenu AND the
            // template's preferred (non-zero) width allowed for the
            // chevron column.
        }
        // Icon column — host the consumer's Icon, OR an inline check
        // glyph when IsCheckable + IsChecked, OR clear it.
        if (this._iconHost !== undefined)
        {
            if (this.Icon !== undefined)
            {
                this._iconHost.SetChild(this.Icon);
            }
            else if (this.IsCheckable && this.IsChecked)
            {
                this._iconHost.SetChild(makeGlyph('✓'));
            }
            else
            {
                this._iconHost.SetChild(undefined);
            }
        }
    }

    private itemCount(): number
    {
        const items = this.Items;
        if (items === undefined) return 0;
        return Array.isArray(items) ? items.length : (items as { Count: number }).Count;
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        const name = descriptor.Name;
        if (name === 'RowTemplate')
        {
            this.rebuildRow();
            this.refreshRow();
            return;
        }
        if (name === 'IsSubmenuOpen' && this._popupHost !== undefined)
        {
            if (newValue === true) this.mountSubmenu();
            else                   this.unmountSubmenu();
        }
        if (
            name === 'Header' || name === 'Icon' || name === 'InputGestureText' ||
            name === 'IsCheckable' || name === 'IsChecked' || name === 'Items'
        )
        {
            this.refreshRow();
        }
    }

    protected override propagate_target_to_visual_children(): void
    {
        const newTarget = (this as unknown as { target: PresentationTarget | undefined }).target;
        const oldTarget = this._lastKnownTarget;
        if (oldTarget !== undefined && oldTarget !== newTarget && this._popupMounted)
        {
            if (this._popupHost !== undefined) oldTarget.DetachOverlay(this._popupHost);
            this._popupMounted = false;
        }
        this._lastKnownTarget = newTarget;
        super.propagate_target_to_visual_children();
        if (newTarget !== undefined && this.IsSubmenuOpen) this.mountSubmenu();
    }

    private mountSubmenu(): void
    {
        if (this._popupMounted) return;
        if (this._popupHost === undefined) return;
        const t = this._lastKnownTarget;
        if (t === undefined) return;
        // Anchor at our own row. Side selection mirrors WPF menu
        // convention:
        //   * Top-level item in a horizontal MenuStrip → submenu below.
        //   * Nested (inside a ContextMenu / MenuButton popup / parent
        //     MenuItem's submenu) → submenu to the right.
        // Detection: the immediate logical parent's class identifies
        // the host. MenuStrip → horizontal context; anything else
        // (ContextMenu, MenuButton, MenuItem, anonymous wrappers) →
        // vertical context.
        if (this._rowRoot !== undefined) this._popupHost.anchor = this._rowRoot;
        this._popupHost.anchorSide = this.isTopLevelInMenuStrip() ? 'below' : 'right';
        t.AttachOverlay(this._popupHost);
        this._popupMounted = true;
    }

    private isTopLevelInMenuStrip(): boolean
    {
        const parent = this.GetLogicalParent();
        return parent instanceof MenuStrip;
    }

    private unmountSubmenu(): void
    {
        if (!this._popupMounted) return;
        if (this._popupHost === undefined) return;
        const t = this._lastKnownTarget;
        if (t === undefined) { this._popupMounted = false; return; }
        t.DetachOverlay(this._popupHost);
        this._popupMounted = false;
    }

    // Pointer handlers — IsMouseOver / IsPressed visuals come from the
    // template's `when()` triggers, so these only need to track the
    // press-originated-here flag for click routing.
    protected override OnPointerDown(_args: PointerEventArgs): void
    {
        this._pressOriginatedHere = true;
    }

    protected override OnPointerUp(_args: PointerEventArgs): void
    {
        const fire = this._pressOriginatedHere && this.IsMouseOver;
        this._pressOriginatedHere = false;
        if (!fire) return;
        this.activate();
    }

    // Shared activation path called by pointer click AND keyboard
    // Enter / Space. Mirrors WPF: clicking or pressing Enter on a
    // checkable item flips IsChecked then fires Command + onActivated;
    // clicking or pressing Enter on a parent item toggles IsSubmenuOpen.
    private activate(): void
    {
        if (this.itemCount() > 0)
        {
            this.IsSubmenuOpen = !this.IsSubmenuOpen;
            return;
        }
        if (this.IsCheckable) this.IsChecked = !this.IsChecked;
        // Activated callback first — gives the popup chain a chance to
        // close before Command might steal focus to a dialog.
        this._onActivated?.();
        const cmd = this.Command;
        if (cmd !== undefined)
        {
            if (cmd.CanExecute(this.CommandParameter)) cmd.Execute(this.CommandParameter);
        }
    }

    protected override OnPointerEnter(_args: PointerEventArgs): void
    {
        // Template trigger handles the IsMouseOver visual swap.
    }

    protected override OnPointerLeave(_args: PointerEventArgs): void
    {
        // Template trigger handles the IsMouseOver visual swap — the
        // template tier knows about the press-originated-here / drag-
        // off behaviour through the IsPressed trigger fading first.
    }

    // Keyboard navigation. Handles arrow keys, Enter / Space, Escape,
    // and letter accelerators. WPF parity:
    //
    //   * Inside a vertical menu (ContextMenu / MenuButton popup /
    //     parent submenu): Down/Up move focus between siblings; Right
    //     opens own submenu; Left closes parent submenu (focus jumps
    //     back to the parent MenuItem).
    //   * Top-level item in a horizontal MenuStrip: Right/Left move
    //     between top-level items; Down opens own submenu and focuses
    //     the first child.
    //   * Enter / Space → activate (same path as pointer-click).
    //   * Escape → close one level (own submenu, or parent's submenu).
    //   * Single letter → focus the next sibling whose Header starts
    //     with that letter (case-insensitive, wraps around).
    protected override OnKeyDown(args: KeyEventArgs): void
    {
        if (args.Handled) return;
        const k = args.Key;
        const inStrip = this.isTopLevelInMenuStrip();

        if (k === 'ArrowDown')
        {
            if (inStrip)
            {
                if (this.itemCount() > 0)
                {
                    this.IsSubmenuOpen = true;
                    this.focusFirstSubmenuChild(args);
                }
            }
            else
            {
                this.focusSibling(args, +1);
            }
            args.Handled = true;
            return;
        }
        if (k === 'ArrowUp')
        {
            if (!inStrip) this.focusSibling(args, -1);
            args.Handled = true;
            return;
        }
        if (k === 'ArrowRight')
        {
            if (inStrip)
            {
                this.focusSibling(args, +1);
            }
            else if (this.itemCount() > 0)
            {
                this.IsSubmenuOpen = true;
                this.focusFirstSubmenuChild(args);
            }
            args.Handled = true;
            return;
        }
        if (k === 'ArrowLeft')
        {
            if (inStrip)
            {
                this.focusSibling(args, -1);
            }
            else
            {
                // Step out one nesting level: close the parent
                // MenuItem's submenu and focus the parent. If we're
                // already at the outermost popup (no parent MenuItem),
                // do nothing — the user can press Escape to close the
                // whole chain instead.
                const parentMI = this.findParentMenuItem();
                if (parentMI !== undefined)
                {
                    parentMI.IsSubmenuOpen = false;
                    args.SetFocus(parentMI);
                }
            }
            args.Handled = true;
            return;
        }
        if (k === 'Enter' || k === ' ')
        {
            this.activate();
            args.Handled = true;
            return;
        }
        if (k === 'Escape')
        {
            if (this.IsSubmenuOpen) this.IsSubmenuOpen = false;
            const parentMI = this.findParentMenuItem();
            if (parentMI !== undefined)
            {
                parentMI.IsSubmenuOpen = false;
                args.SetFocus(parentMI);
            }
            else
            {
                // Top of the menu chain — fire onActivated so the
                // hosting popup (ContextMenu / MenuButton / MenuStrip)
                // tears down.
                this._onActivated?.();
            }
            args.Handled = true;
            return;
        }
        // Letter accelerator — single printable character, no modifiers.
        if (k.length === 1 && /[A-Za-z0-9]/.test(k))
        {
            const noMods = !args.Modifiers.Control && !args.Modifiers.Alt && !args.Modifiers.Meta;
            if (noMods)
            {
                this.focusSiblingByLetter(args, k.toUpperCase());
                args.Handled = true;
            }
        }
    }

    // Find every MenuItem container in the same items panel as `this`
    // and return them in panel order. Used by all the sibling-walk
    // helpers below. For top-level MenuStrip items the parent panel is
    // the MenuStrip's items panel; for nested rows it's the parent
    // MenuItem / ContextMenu / MenuButton's items panel.
    private collectSiblings(): MenuItem[]
    {
        const panel = this.GetVisualParent();
        if (panel === undefined) return [this];
        const out: MenuItem[] = [];
        for (const c of panel.visualChildren)
        {
            if (c instanceof MenuItem) out.push(c);
        }
        return out;
    }

    private focusSibling(args: KeyEventArgs, direction: 1 | -1): void
    {
        const siblings = this.collectSiblings();
        if (siblings.length === 0) return;
        const idx = siblings.indexOf(this);
        if (idx < 0) return;
        const len = siblings.length;
        const next = siblings[((idx + direction) % len + len) % len]!;
        args.SetFocus(next);
    }

    private focusSiblingByLetter(args: KeyEventArgs, upperLetter: string): void
    {
        const siblings = this.collectSiblings();
        if (siblings.length === 0) return;
        const start = siblings.indexOf(this);
        // Walk siblings starting AFTER self so successive presses of
        // the same letter cycle through matching items.
        for (let off = 1; off <= siblings.length; off++)
        {
            const cand = siblings[(start + off) % siblings.length]!;
            const head = (cand.Header ?? '').trim();
            if (head.length > 0 && head[0]!.toUpperCase() === upperLetter)
            {
                args.SetFocus(cand);
                return;
            }
        }
    }

    private focusFirstSubmenuChild(args: KeyEventArgs): void
    {
        // First MenuItem inside this MenuItem's own items panel. The
        // panel sits inside the detached popup subtree (`_popupContainer`).
        const presenter = this._popupContainer?.visualChildren[0];
        const panel = presenter?.visualChildren[0];
        if (panel === undefined) return;
        for (const c of panel.visualChildren)
        {
            if (c instanceof MenuItem) { args.SetFocus(c); return; }
        }
    }

    // Walk the logical parent chain looking for the enclosing MenuItem
    // (one level up). Returns undefined when this MenuItem is the
    // outermost popup row (its logical parent is a MenuStrip /
    // ContextMenu / MenuButton).
    private findParentMenuItem(): MenuItem | undefined
    {
        let cur: Visual | undefined = this.GetLogicalParent();
        while (cur !== undefined)
        {
            if (cur instanceof MenuItem) return cur;
            cur = cur.GetLogicalParent();
        }
        return undefined;
    }
}

function makeGlyph(text: string): TextBlock
{
    const t = new TextBlock(text);
    t.Foreground = Theme.ink;
    return t;
}

// ─────────────────────────────────────────────────────────────────────
// MenuSeparator — thin horizontal line between MenuItem groups.
// Same idea as ToolBarSeparator but cross-axis-flipped.
export class MenuSeparator extends Visual
{
    public static readonly LineBrushKey = Model.RegisterProperty<Brush | undefined>(
        MenuSeparator, 'LineBrush', undefined, MetaData.Render,
    );

    static
    {
        // Type-keyed lookup for the default Style — registered as
        // `Style [TargetType=MenuSeparator]` in surface.template.mu.
        // The Style supplies Height / MinWidth / LineBrush via
        // DynamicResource so the line tints flip with the theme
        // palette without consumers having to set LineBrush.
        Model.OverrideMetadata(MenuSeparator, Visual.DefaultStyleKeyKey, { default_value: MenuSeparator });
        ensureSurfaceTheme();
    }

    constructor()
    {
        super();
        // Eager Style resolution — Height / MinWidth / LineBrush come
        // from the bundled `Style [TargetType=MenuSeparator]`.
        this.applyDefaultStyle();
    }

    public get LineBrush():  Brush | undefined { return this.get_property_value(MenuSeparator.LineBrushKey); }
    public set LineBrush(v: Brush | undefined) { this.set_property_value(MenuSeparator.LineBrushKey, v); }

    protected override MeasureOverride(availableSize: Size): Size
    {
        return new Size(
            Number.isFinite(availableSize.Width) ? availableSize.Width : this.MinWidth,
            this.Height,
        );
    }

    protected override ArrangeOverride(finalSize: Size): Size { return finalSize; }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const rect = this.ArrangedRect;
        const brush = this.LineBrush ?? Theme.fieldBorder;
        const y = Math.floor(rect.Height / 2);
        dc.DrawRectangle(brush, undefined, new Rect(2, y, Math.max(2, rect.Width - 4), 1));
    }
}

// ─────────────────────────────────────────────────────────────────────
// MenuButton — hamburger button that opens a popup of menu items.
//
// Authoring shape:
//
//   MenuButton {
//       Icon = "☰"
//       Items {
//           MenuItem[Header=New,    Command=$NewCommand]
//           MenuItem[Header=Open,   Command=$OpenCommand, InputGestureText="Ctrl+O"]
//           MenuSeparator {}
//           MenuItem[Header=Save,   Command=$SaveCommand, InputGestureText="Ctrl+S"]
//       }
//   }
//
// MenuButton IS an ItemsControl. Two templates feed its visual layout
// (both registered in surface.template.mu):
//
//   * DefaultMenuButtonTrigger  — the inline trigger Button. Resolved
//                                 in the ctor and attached as
//                                 visualChildren[0].
//   * DefaultMenuButtonPopup    — the popup chrome (MenuPopupHost >
//                                 [Scrim, Border > ItemsPresenter]).
//                                 Plugged into MenuButton's
//                                 ItemsControl.Template via the Style;
//                                 rebuildTemplate() materialises it
//                                 and slots the ItemsPanel into the
//                                 ItemsPresenter. The ctor then
//                                 DETACHES the popup templateRoot
//                                 from MenuButton so it can be mounted
//                                 on the OverlayLayer instead — same
//                                 dual-parent avoidance the ContextMenu
//                                 path uses.
//
// visualChildren returns [trigger] always; the popup root is kept as
// a private field, mounted/unmounted by mountPopup / unmountPopup.
export class MenuButton extends ItemsControl
{
    public static readonly IsOpenKey          = Model.RegisterProperty<boolean>(           MenuButton, 'IsOpen', false,     MetaData.None);
    public static readonly IconKey            = Model.RegisterProperty<Visual | undefined>(MenuButton, 'Icon',   undefined, MetaData.Measure);
    public static readonly HeaderKey          = Model.RegisterProperty<string | undefined>(MenuButton, 'Header', undefined, MetaData.Measure | MetaData.Render);
    // TriggerTemplate — the inline visible Button chrome. MenuButton's
    // primary Template (ItemsControl-inherited) is the popup chrome,
    // so the trigger has to live in a second template DP that the
    // default Style sets to `@DefaultMenuButtonTrigger`.
    public static readonly TriggerTemplateKey = Model.RegisterProperty<ControlTemplate | undefined>(
        MenuButton, 'TriggerTemplate', undefined, MetaData.Measure,
    );

    public get IsOpen():  boolean { return this.get_property_value(MenuButton.IsOpenKey); }
    public set IsOpen(v: boolean) { this.set_property_value(MenuButton.IsOpenKey, v); }

    public get Icon():    Visual | undefined { return this.get_property_value(MenuButton.IconKey); }
    public set Icon(v:    Visual | undefined) { this.set_property_value(MenuButton.IconKey, v); }

    public get Header():  string | undefined { return this.get_property_value(MenuButton.HeaderKey); }
    public set Header(v:  string | undefined) { this.set_property_value(MenuButton.HeaderKey, v); }

    public get TriggerTemplate():  ControlTemplate | undefined { return this.get_property_value(MenuButton.TriggerTemplateKey); }
    public set TriggerTemplate(v: ControlTemplate | undefined) { this.set_property_value(MenuButton.TriggerTemplateKey, v); }

    private _button:         Button         | undefined;
    private _buttonStack:    StackPanel     | undefined;
    private _buttonText:     TextBlock      | undefined;

    // The popup templateRoot is owned by ItemsControl's Template
    // machinery; cached here for mount/unmount. Initially attached as
    // our visualChild by rebuildTemplate; we detach immediately so the
    // OverlayLayer can adopt it later without dual-parent errors.
    private _popupHost:      MenuPopupHost  | undefined;
    private _scrim:          ClickAwayScrim | undefined;
    private _popupContainer: Border         | undefined;

    private _popupMounted = false;
    private _lastKnownTarget: PresentationTarget | undefined;

    static
    {
        // Theme-style lookup key — MenuButton instances resolve their
        // default Style (Template = popup chrome, ItemsPanel = vertical
        // StackPanel, HorizontalAlignment/Vertical sizing pins) via
        // TryFindResource(MenuButton) on attach. The setter values live
        // in surface.template.mu under the `Style [TargetType=MenuButton]`
        // block. Surface theme is kept apart from the main controls
        // theme to avoid the `extends Button` TDZ cycle (see
        // default-resources.ts).
        Model.OverrideMetadata(MenuButton, Visual.DefaultStyleKeyKey, { default_value: MenuButton });
        ensureSurfaceTheme();
    }

    constructor()
    {
        super();

        // ── Popup subtree via ItemsControl.Template ──────────────────
        // applyDefaultStyle resolves Style[TargetType=MenuButton] which
        // sets Template = @DefaultMenuButtonPopup. ItemsControl's
        // rebuildTemplate then Apply()s it, finds the ItemsPresenter
        // inside, slots in the vertical-stack ItemsPanel (also set by
        // the Style), and attaches the root as our visualChild.
        this.applyDefaultStyle();
        this.adoptPopupTemplate();

        // ── Trigger subtree (separate template DP) ──────────────────
        // The default Style sets TriggerTemplate = @DefaultMenuButtonTrigger
        // (Button(PART_Trigger) > StackPanel(PART_TriggerStack) >
        // TextBlock(PART_HeaderText)). It can't share ItemsControl's
        // Template slot because Template is the popup chrome with the
        // ItemsPresenter that hosts Items. Click flips IsOpen.
        const triggerTpl = this.TriggerTemplate;
        if (triggerTpl === undefined)
        {
            throw new Error(
                'MenuButton.TriggerTemplate is undefined. The default ' +
                'Style in surface.template.mu sets TriggerTemplate = ' +
                '@DefaultMenuButtonTrigger. Did `ensureSurfaceTheme()` ' +
                'run before construction?');
        }
        const triggerInst = triggerTpl.Apply(this);
        this._button      = triggerInst.root as Button;
        this._buttonStack = triggerInst.root.FindName('PART_TriggerStack') as StackPanel;
        this._buttonText  = triggerInst.root.FindName('PART_HeaderText')   as TextBlock;
        this._button.AddClickHandler(() => { this.IsOpen = !this.IsOpen; });
        this.AttachVisual(this._button);
    }

    // Find the popup template parts after rebuildTemplate has run, wire
    // their cross-references (host.anchor → trigger, host.popup →
    // container, scrim.onClick → close), then detach the templateRoot
    // from our visual subtree so the OverlayLayer can adopt it.
    private adoptPopupTemplate(): void
    {
        const root = super.visualChildren[0];
        if (!(root instanceof MenuPopupHost)) return;
        this._popupHost      = root;
        this._scrim          = root.FindName('PART_Scrim')          as ClickAwayScrim;
        this._popupContainer = root.FindName('PART_PopupContainer') as Border;
        this._popupHost.popup  = this._popupContainer;
        this._scrim.onClick    = (): void => { this.IsOpen = false; };
        // Detach so AttachOverlay won't trip the single-parent check.
        // We claim it back in unmountPopup via reattachPopupTemplate if
        // the IsOpen DP ever flips false while we still own the root.
        this.DetachVisual(this._popupHost);
    }

    public override get visualChildren(): readonly Visual[]
    {
        return this._button !== undefined ? [this._button] : [];
    }

    public override get logicalChildren(): readonly Visual[]
    {
        return [];
    }

    /** Items declared as a Visual in `.mu` (`MenuButton { MenuItem; … }`)
     *  ARE their own container — slot the Visual directly. */
    public override IsItemItsOwnContainerOverride(item: unknown): boolean
    {
        return item instanceof Visual;
    }

    /** Wire onActivated on each materialised MenuItem so an activation
     *  closes the popup. */
    public override PrepareContainerForItemOverride(container: Visual, item: unknown, index: number): void
    {
        super.PrepareContainerForItemOverride(container, item, index);
        if (container instanceof MenuItem)
        {
            container._onActivated = (): void => { this.IsOpen = false; };
        }
    }

    protected override MeasureOverride(availableSize: Size): Size
    {
        if (this._button === undefined) return Size.Zero;
        this._button.Measure(availableSize);
        return this._button.DesiredSize;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        if (this._button === undefined) return finalSize;
        this._button.Arrange(new Rect(0, 0, finalSize.Width, finalSize.Height));
        return finalSize;
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        const name = descriptor.Name;
        if (name === 'IsOpen' && this._popupHost !== undefined)
        {
            if (newValue === true) this.mountPopup();
            else                   this.unmountPopup();
        }
        if (name === 'Icon' && this._buttonStack !== undefined && this._buttonText !== undefined)
        {
            // Rebuild the button stack with the new icon at the front.
            // Children of a StackPanel can't be easily re-ordered, so we
            // clear + re-add.
            for (const c of [...this._buttonStack.visualChildren])
            {
                this._buttonStack.RemoveChild(c);
            }
            const ic = newValue as Visual | undefined;
            if (ic !== undefined) this._buttonStack.AddChild(ic);
            this._buttonStack.AddChild(this._buttonText);
        }
        if (name === 'Header' && this._buttonText !== undefined)
        {
            this._buttonText.Text = (newValue as string | undefined) ?? '';
        }
    }

    protected override propagate_target_to_visual_children(): void
    {
        const newTarget = (this as unknown as { target: PresentationTarget | undefined }).target;
        const oldTarget = this._lastKnownTarget;
        if (oldTarget !== undefined && oldTarget !== newTarget && this._popupMounted)
        {
            if (this._popupHost !== undefined) oldTarget.DetachOverlay(this._popupHost);
            this._popupMounted = false;
        }
        this._lastKnownTarget = newTarget;
        super.propagate_target_to_visual_children();
        if (newTarget !== undefined && this.IsOpen) this.mountPopup();
    }

    private mountPopup(): void
    {
        if (this._popupMounted) return;
        if (this._popupHost === undefined) return;
        const t = this._lastKnownTarget;
        if (t === undefined) return;
        // The anchor reference is set every mount so a target change
        // (or a late-bound trigger) doesn't leave stale coords.
        if (this._button !== undefined) this._popupHost.anchor = this._button;
        t.AttachOverlay(this._popupHost);
        this._popupMounted = true;
    }

    private unmountPopup(): void
    {
        if (!this._popupMounted) return;
        if (this._popupHost === undefined) return;
        const t = this._lastKnownTarget;
        if (t === undefined) { this._popupMounted = false; return; }
        t.DetachOverlay(this._popupHost);
        this._popupMounted = false;
    }
}

// ─────────────────────────────────────────────────────────────────────
// Popup overlay host shared by MenuButton + ContextMenu. Anchors a
// popup body at either the trigger button (MenuButton) or a fixed
// host-coords point (ContextMenu).
export class MenuPopupHost extends Panel
{
    /** Anchor for popup positioning. When set, the popup is laid out
     *  relative to the anchor according to `anchorSide`. */
    public anchor: Visual | undefined;
    /** Which side of the anchor the popup sits against:
     *   * 'below' (default) — popup's top-left aligns with anchor's
     *     bottom-left. Matches MenuButton triggers and horizontal
     *     MenuStrip top-level items.
     *   * 'right'           — popup's top-left aligns with anchor's
     *     top-right. The conventional submenu-fly-out position for
     *     MenuItems nested inside a vertical popup (ContextMenu /
     *     MenuButton popup body / another MenuItem's submenu). */
    public anchorSide: 'below' | 'right' = 'below';
    /** Fixed-point anchor for ContextMenu (host-coordinates). When set
     *  AND `anchor` is unset, the popup top-left lands at this point. */
    public fixedPoint: { x: number; y: number } | undefined;
    public popup: Visual | undefined;

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
        children[0]?.Arrange(new Rect(0, 0, finalSize.Width, finalSize.Height));
        if (children.length < 2) return finalSize;
        const popupV = this.popup ?? children[1];
        if (popupV === undefined) return finalSize;
        const pw = popupV.DesiredSize.Width;
        const ph = popupV.DesiredSize.Height;

        let px: number;
        let py: number;
        if (this.anchor !== undefined)
        {
            const origin = absoluteOriginOf(this.anchor);
            const ar     = this.anchor.ArrangedRect;
            if (this.anchorSide === 'right')
            {
                // Submenu fly-out: top-left of popup at top-right of
                // the anchor row.
                px = origin.x + ar.Width;
                py = origin.y;
            }
            else
            {
                // Default: popup directly below the anchor.
                px = origin.x;
                py = origin.y + ar.Height;
            }
        }
        else if (this.fixedPoint !== undefined)
        {
            px = this.fixedPoint.x;
            py = this.fixedPoint.y;
        }
        else
        {
            px = 0; py = 0;
        }

        // Clamp into surface bounds.
        if (py + ph > finalSize.Height) py = Math.max(0, finalSize.Height - ph);
        if (px + pw > finalSize.Width)  px = Math.max(0, finalSize.Width  - pw);
        if (px < 0) px = 0;
        if (py < 0) py = 0;
        popupV.Arrange(new Rect(px, py, pw, ph));
        return finalSize;
    }
}

function absoluteOriginOf(v: Visual): { x: number; y: number }
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

// Re-export ContentPresenter for users — some tests want to inspect
// the rendered structure of a MenuButton's button shell.
export { ContentPresenter };
