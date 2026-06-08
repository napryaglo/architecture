import {
    Application,
    MetaData,
    Model,
    ObservableCollection,
    Panel,
    Rect,
    Size,
    Thickness,
    Visual,
    type DrawingContext,
} from '../../runtime/index.js';
import { ensureSurfaceTheme } from './default-surface-resources.js';
import { PresentationTarget } from '../../visual-engine/index.js';
import { Control } from '../index.js';
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

// String keys for the surface-bundle templates the MenuButton ctor
// reads from. The template definitions live in
// `src/Controls/surface.template.mu` and are registered with
// `Application.DefaultResourceFactories` by `ensureSurfaceTheme`.
const KEY_TRIGGER = 'DefaultMenuButtonTrigger';
const KEY_POPUP   = 'DefaultMenuButtonPopup';

function resolveSurfaceTemplate(key: string): ControlTemplate
{
    const tpl = Application.ResolveDefaultResource<ControlTemplate>(key);
    if (tpl === undefined)
    {
        throw new Error(
            `MenuButton: default template '${key}' is not registered. ` +
            'Did `ensureSurfaceTheme()` run before construction?');
    }
    return tpl;
}

// Menu — a vertical column of MenuItems and Separators. Used as both
// the popup body of a MenuButton (hamburger fly-out) and the floating
// surface of a ContextMenu. Inside a MenuItem submenu the same control
// reappears one level deeper.
//
// Menu is just a "vertical ItemsControl" — most of the smarts live on
// MenuItem. Default ItemsPanel = StackPanel (vertical); container
// generation accepts any Visual, but the common populating shape is
// MenuItem + MenuSeparator.
export class Menu extends ItemsControl
{
    constructor()
    {
        super();
        this.ItemsPanel = (): Panel =>
        {
            const sp = new StackPanel();
            sp.Orientation = Orientation.Vertical;
            return sp;
        };
        // No chrome of our own — the popup hosting Menu (MenuButton's
        // popup, ContextMenu's overlay) wraps it in a bordered Border.
    }

    // `.mu` body — `Menu { MenuItem; MenuSeparator; … }` — routes through
    // ItemsControl.AddChild. We accept any Visual; conventional content
    // is MenuItem / MenuSeparator, but the menu is generic enough that
    // a custom Visual can replace a row when authors need it.
    protected override validateDeclarativeChild(_child: Visual): void { }

    // Visual items declared in markup ARE their own container — Menu
    // doesn't ship an ItemTemplate of its own, so a MenuItem / Visual
    // is slotted directly. Non-Visual data items would need an
    // ItemTemplate (and take the default ContentPresenter wrap).
    public override IsItemItsOwnContainerOverride(item: unknown): boolean
    {
        return item instanceof Visual;
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

    /** Set by the hosting popup (MenuButton or ContextMenu) so an
     *  activated item can request the popup chain to close. Click
     *  fires this BEFORE Command — gives the popup teardown a chance
     *  to release focus before any dialog the command opens steals it. */
    public _onActivated: (() => void) | undefined;

    private _rowBorder: Border;
    private _rowLabel:  TextBlock;
    private _gestureLabel: TextBlock;
    private _iconHost:    Border;
    private _chevronLabel: TextBlock;
    private _pressOriginatedHere = false;

    constructor()
    {
        super();
        // No items panel materialization for now — submenu popup is the
        // expansion path (5.11.2 follow-up). For v1, items collection is
        // populated; submenu popup activation defers to a forthcoming
        // sub-pass. The MenuItem still renders its row.
        // (Setting an empty ItemsPanel keeps ItemsControl happy.)
        this.ItemsPanel = (): Panel =>
        {
            const sp = new StackPanel();
            sp.Orientation = Orientation.Vertical;
            return sp;
        };

        // Build the row template imperatively. Four "columns":
        // icon | header | gesture | chevron. Each is a fixed-width or
        // auto-width host that auto-hides when its content is empty.
        const stack = new StackPanel();
        stack.Orientation = Orientation.Horizontal;

        this._iconHost = new Border();
        this._iconHost.Width = 24;
        this._iconHost.MinWidth = 24;
        stack.AddChild(this._iconHost);

        this._rowLabel = new TextBlock('');
        this._rowLabel.Foreground = Theme.ink;
        this._rowLabel.Margin = new Thickness(8, 0, 16, 0);
        this._rowLabel.MinWidth = 80;
        stack.AddChild(this._rowLabel);

        this._gestureLabel = new TextBlock('');
        this._gestureLabel.Foreground = Theme.hint;
        this._gestureLabel.Margin = new Thickness(0, 0, 16, 0);
        stack.AddChild(this._gestureLabel);

        this._chevronLabel = new TextBlock('');
        this._chevronLabel.Foreground = Theme.hint;
        this._chevronLabel.Width = 12;
        stack.AddChild(this._chevronLabel);

        this._rowBorder = new Border();
        this._rowBorder.Background = Theme.popupBg;
        this._rowBorder.Padding    = new Thickness(8, 6, 8, 6);
        this._rowBorder.SetChild(stack);

        // Set Template so ItemsControl's apply pipeline knows where to
        // stamp the ItemsPresenter — but the presenter isn't used in v1
        // (sub-menu deferred). We keep a no-op template root that's
        // just the row Border.
        this.Template = new ControlTemplate((_tp) => this._rowBorder);

        // Watch DPs that affect the row visuals and refresh on change.
        // OnPropertyChanged could route these, but a one-shot per-DP
        // listener keeps the refresh logic readable.
        this.refreshRow();
    }

    // Submenu items declared in `.mu` (`MenuItem { MenuItem ▶ … }`)
    // route through ItemsControl.AddChild. Same lenient gate as Menu —
    // any Visual is accepted; conventional content is MenuItem /
    // MenuSeparator.
    protected override validateDeclarativeChild(_child: Visual): void { }

    // Submenu items declared in markup ARE their own container — same
    // story as Menu.
    public override IsItemItsOwnContainerOverride(item: unknown): boolean
    {
        return item instanceof Visual;
    }

    /** Public refresh for tests + DP-change forwarding. */
    public refreshRow(): void
    {
        // Skip until the row template parts exist — refresh fires from
        // OnPropertyChanged the moment super() sets Items, before this
        // constructor has built the row visuals.
        if (this._rowLabel === undefined) return;
        // Header text — empty string when undefined to keep TextBlock happy.
        this._rowLabel.Text = this.Header ?? '';
        // Gesture column — auto-hide when empty.
        const g = this.InputGestureText ?? '';
        this._gestureLabel.Text = g;
        this._gestureLabel.Width = g.length === 0 ? 0 : Number.NaN;
        // Chevron column — populated when this item has a submenu.
        const hasSubmenu = this.itemCount() > 0;
        this._chevronLabel.Text = hasSubmenu ? '▶' : '';
        this._chevronLabel.Width = hasSubmenu ? 12 : 0;
        // Icon — replace the icon host's content.
        if (this.Icon !== undefined)
        {
            this._iconHost.SetChild(this.Icon);
        }
        else if (this.IsCheckable && this.IsChecked)
        {
            // Inline check glyph when Icon is unset.
            this._iconHost.SetChild(makeGlyph('✓'));
        }
        else
        {
            this._iconHost.SetChild(undefined);
        }
    }

    private itemCount(): number
    {
        const items = this.Items;
        if (items === undefined) return 0;
        return Array.isArray(items) ? items.length : (items as { Count: number }).Count;
    }

    protected override OnPropertyChanged(
        descriptor: import('../../runtime/index.js').PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        const name = descriptor.Name;
        if (
            name === 'Header' || name === 'Icon' || name === 'InputGestureText' ||
            name === 'IsCheckable' || name === 'IsChecked' || name === 'Items'
        )
        {
            this.refreshRow();
        }
    }

    protected override OnPointerDown(_args: import('../../runtime/index.js').PointerEventArgs): void
    {
        this._pressOriginatedHere = true;
        this._rowBorder.Background = Theme.itemHoverBg;
    }

    protected override OnPointerUp(_args: import('../../runtime/index.js').PointerEventArgs): void
    {
        const fire = this._pressOriginatedHere && this.IsMouseOver;
        this._pressOriginatedHere = false;
        this._rowBorder.Background = Theme.popupBg;
        if (!fire) return;
        // Click protocol:
        //   * Has submenu → toggle IsSubmenuOpen (submenu popup deferred,
        //     so this just flips the DP for now)
        //   * No submenu  → flip checkable + fire Command + onActivated
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

    protected override OnPointerEnter(_args: import('../../runtime/index.js').PointerEventArgs): void
    {
        this._rowBorder.Background = Theme.itemHoverBg;
    }

    protected override OnPointerLeave(_args: import('../../runtime/index.js').PointerEventArgs): void
    {
        if (!this._pressOriginatedHere) this._rowBorder.Background = Theme.popupBg;
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

    constructor()
    {
        super();
        this.Height = 9;       // 4px padding | 1px line | 4px padding
        this.MinWidth = 16;
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
// MenuButton — hamburger button that opens a popup containing a Menu.
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
// MenuButton is NOT an ItemsControl itself — its visible chrome is a
// single Button, and the items list belongs to an inner `_menu: Menu`
// that's the actual ItemsControl. MenuButton.Items is a thin DP that
// proxies writes to `_menu.Items`. This keeps the items rendered ONCE
// (inside the popup) without the dual-parent issue an outer
// ItemsControl wrapper would cause when the data items are Visuals
// (`new MenuItem(...)` populated directly into Items).
export class MenuButton extends Control
{
    public static readonly ItemsKey = Model.RegisterProperty<
        readonly unknown[] | import('../../runtime/index.js').ObservableCollection<unknown> | undefined
    >(MenuButton, 'Items', undefined, MetaData.Measure);

    public get Items(): readonly unknown[] | import('../../runtime/index.js').ObservableCollection<unknown> | undefined
    {
        return this.get_property_value(MenuButton.ItemsKey);
    }
    public set Items(v: readonly unknown[] | import('../../runtime/index.js').ObservableCollection<unknown> | undefined)
    {
        this.set_property_value(MenuButton.ItemsKey, v);
    }

    public static readonly IsOpenKey   = Model.RegisterProperty<boolean>(           MenuButton, 'IsOpen', false,     MetaData.None);
    public static readonly IconKey     = Model.RegisterProperty<Visual | undefined>(MenuButton, 'Icon',   undefined, MetaData.Measure);
    public static readonly HeaderKey   = Model.RegisterProperty<string | undefined>(MenuButton, 'Header', undefined, MetaData.Measure | MetaData.Render);

    public get IsOpen():  boolean { return this.get_property_value(MenuButton.IsOpenKey); }
    public set IsOpen(v: boolean) { this.set_property_value(MenuButton.IsOpenKey, v); }

    public get Icon():    Visual | undefined { return this.get_property_value(MenuButton.IconKey); }
    public set Icon(v:    Visual | undefined) { this.set_property_value(MenuButton.IconKey, v); }

    public get Header():  string | undefined { return this.get_property_value(MenuButton.HeaderKey); }
    public set Header(v:  string | undefined) { this.set_property_value(MenuButton.HeaderKey, v); }

    private readonly _button:        Button;
    private readonly _buttonStack:   StackPanel;
    private readonly _buttonText:    TextBlock;
    private readonly _popupHost:     MenuPopupHost;
    private readonly _scrim:         ClickAwayScrim;
    private readonly _popupContainer: Border;
    private readonly _menu:          Menu;

    private _popupMounted = false;
    private _lastKnownTarget: PresentationTarget | undefined;

    static
    {
        // Theme-style lookup key — MenuButton instances resolve their
        // default Style (HorizontalAlignment.Left / VerticalAlignment.Top
        // so the trigger sizes to its content instead of stretching to
        // the parent container) via TryFindResource(MenuButton) on
        // attach. The setter values live in surface.template.mu under
        // the `Style [TargetType=MenuButton]` block. Surface theme is
        // kept apart from the main controls theme to avoid the
        // `extends Button` TDZ cycle (see default-resources.ts).
        Model.OverrideMetadata(MenuButton, Visual.DefaultStyleKeyKey, { default_value: MenuButton });
        ensureSurfaceTheme();
    }

    constructor()
    {
        super();

        // ── Trigger subtree ───────────────────────────────────────────
        // surface.template.mu declares DefaultMenuButtonTrigger as a
        // Button(PART_Trigger) > StackPanel(PART_TriggerStack) >
        // TextBlock(PART_HeaderText). Cosmetic defaults (Foreground,
        // Orientation) live in markup; this ctor only wires behaviour
        // (click → IsOpen, Header sync via OnPropertyChanged).
        const triggerTpl  = resolveSurfaceTemplate(KEY_TRIGGER);
        const triggerInst = triggerTpl.Apply(this);
        this._button      = triggerInst.root as Button;
        this._buttonStack = triggerInst.root.FindName('PART_TriggerStack') as StackPanel;
        this._buttonText  = triggerInst.root.FindName('PART_HeaderText')   as TextBlock;
        this._button.AddClickHandler(() => { this.IsOpen = !this.IsOpen; });

        // ── Popup subtree ─────────────────────────────────────────────
        // DefaultMenuButtonPopup declares MenuPopupHost(PART_PopupHost)
        // > [ClickAwayScrim(PART_Scrim), Border(PART_PopupContainer) >
        // Menu(PART_Menu)]. The host's anchor / popup references and
        // the scrim's onClick callback can't appear in markup (they
        // form a cycle through the trigger subtree), so we patch them
        // in here after both templates have been applied.
        const popupTpl  = resolveSurfaceTemplate(KEY_POPUP);
        const popupInst = popupTpl.Apply(this);
        this._popupHost      = popupInst.root as MenuPopupHost;
        this._scrim          = popupInst.root.FindName('PART_Scrim')          as ClickAwayScrim;
        this._popupContainer = popupInst.root.FindName('PART_PopupContainer') as Border;
        this._menu           = popupInst.root.FindName('PART_Menu')           as Menu;
        this._popupHost.anchor = this._button;
        this._popupHost.popup  = this._popupContainer;
        this._scrim.onClick = (): void => { this.IsOpen = false; };

        // Wire the inner Menu's containers to fire onActivated → close
        // popup on click. Same wiring ContextMenu uses.
        const closePopup = (): void => { this.IsOpen = false; };
        (this._menu as unknown as { _closePopup: () => void })._closePopup = closePopup;
        wireMenuActivationClose(this._menu);

        // Attach the trigger Button as our only inline visual child.
        // The popup host stays detached until IsOpen flips true and
        // mountPopup() attaches it to PresentationTarget.OverlayLayer.
        this.AttachVisual(this._button);

        // Pull in the default Style (HorizontalAlignment / VerticalAlignment
        // setters from surface.template.mu) eagerly so a MenuButton dropped
        // into a Stretch-defaulting parent doesn't flash full-width before
        // the AttachLogical-time resolution kicks in.
        this.applyDefaultStyle();
    }

    public override get visualChildren(): readonly Visual[]
    {
        return this._button !== undefined ? [this._button] : [];
    }

    public override get logicalChildren(): readonly Visual[]
    {
        return [];
    }

    // `.mu` body — `MenuButton { MenuItem; MenuSeparator; … }` — routes
    // through AddChild. MenuButton is a Visual (not an ItemsControl), so
    // we initialise an ObservableCollection on first declarative-child
    // push and append to it. OnPropertyChanged('Items') mirrors the
    // collection into the inner Menu, which materializes the row visuals.
    public AddChild(child: Visual): void
    {
        let items = this.Items;
        if (!(items instanceof ObservableCollection))
        {
            const seeded = new ObservableCollection<unknown>();
            if (Array.isArray(items)) for (const e of items) seeded.Add(e);
            this.Items = seeded;
            items = seeded;
        }
        (items as ObservableCollection<unknown>).Add(child);
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
        descriptor: import('../../runtime/index.js').PropertyDescriptor,
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
        if (name === 'Icon' && this._buttonStack !== undefined)
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
        if (name === 'Items')
        {
            // Mirror our Items into the inner Menu so the popup
            // renders them. The Menu is its own ItemsControl with its
            // own container generation, so the same data items get
            // realized as distinct visuals there.
            //
            // Guard against the constructor-time fire: super() runs
            // ItemsControl's constructor which sets Items, firing this
            // OnPropertyChanged before `this._menu` (initialized after
            // super) exists. The mirror is unnecessary at that point —
            // the Menu doesn't exist yet — and the eventual `this.Items
            // = ...` call in the demo / test re-fires this branch with
            // _menu in place.
            if (this._menu !== undefined) this._menu.Items = this.Items;
        }
    }

    protected override propagate_target_to_visual_children(): void
    {
        const newTarget = (this as unknown as { target: PresentationTarget | undefined }).target;
        const oldTarget = this._lastKnownTarget;
        if (oldTarget !== undefined && oldTarget !== newTarget && this._popupMounted)
        {
            oldTarget.DetachOverlay(this._popupHost);
            this._popupMounted = false;
        }
        this._lastKnownTarget = newTarget;
        super.propagate_target_to_visual_children();
        if (newTarget !== undefined && this.IsOpen) this.mountPopup();
    }

    private mountPopup(): void
    {
        if (this._popupMounted) return;
        const t = this._lastKnownTarget;
        if (t === undefined) return;
        t.AttachOverlay(this._popupHost);
        this._popupMounted = true;
    }

    private unmountPopup(): void
    {
        if (!this._popupMounted) return;
        const t = this._lastKnownTarget;
        if (t === undefined) { this._popupMounted = false; return; }
        t.DetachOverlay(this._popupHost);
        this._popupMounted = false;
    }
}

// Walk a Menu's PrepareContainerForItemOverride extension point —
// each materialized MenuItem container gets its _onActivated set to
// the menu's close callback. The callback is published via a hidden
// _closePopup field on the menu instance (set by MenuButton /
// ContextMenu before items materialize). Exported so ContextMenu
// (in a sibling module) can reuse the same wiring path without
// duplicating the patch.
export function wireMenuActivationClose(menu: Menu): void
{
    const original = menu.PrepareContainerForItemOverride.bind(menu);
    (menu as unknown as { PrepareContainerForItemOverride: (c: Visual, i: unknown, idx: number) => void })
        .PrepareContainerForItemOverride = (container: Visual, item: unknown, index: number) =>
    {
        original(container, item, index);
        const close = (menu as unknown as { _closePopup?: () => void })._closePopup;
        if (container instanceof MenuItem && close !== undefined)
        {
            container._onActivated = close;
        }
    };
}

// ─────────────────────────────────────────────────────────────────────
// Popup overlay host shared by MenuButton + ContextMenu. Anchors a
// popup body at either the trigger button (MenuButton) or a fixed
// host-coords point (ContextMenu).
export class MenuPopupHost extends Panel
{
    /** Anchor for popup positioning. When set, the popup is laid out
     *  immediately below the anchor's bottom edge, left-aligned. */
    public anchor: Visual | undefined;
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
            const ar = this.anchor.ArrangedRect;
            px = origin.x;
            py = origin.y + ar.Height;
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
