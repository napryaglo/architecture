import {
    Application,
    MetaData,
    Model,
    ObservableCollection,
    Size,
    Visual,
    type PointerEventArgs,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import { PresentationTarget } from '../../visual-engine/index.js';
import { Control } from '../index.js';
import { Border } from '../../Basic/border.js';
import { ControlTemplate } from '../../Basic/control-template.js';
import { ensureSurfaceTheme } from './default-surface-resources.js';
import { Menu, MenuPopupHost, wireMenuActivationClose } from './menu.js';
import { ClickAwayScrim } from '../tool-bar/tool-bar.js';

// String key for the popup ControlTemplate declared in
// surface.template.mu. Registered with Application by
// `ensureSurfaceTheme` (called from the static block below).
const KEY_POPUP = 'DefaultContextMenuPopup';

function resolveContextMenuTemplate(): ControlTemplate
{
    const tpl = Application.ResolveDefaultResource<ControlTemplate>(KEY_POPUP);
    if (tpl === undefined)
    {
        throw new Error(
            `ContextMenu: default template '${KEY_POPUP}' is not registered. ` +
            'Did `ensureSurfaceTheme()` run before construction?');
    }
    return tpl;
}

// ContextMenu — pops up at a host-coordinate point in response to a
// secondary-button click on the Visual it's attached to. Same Menu
// architecture as MenuButton's popup: a Menu inside a chrome Border,
// hosted on the PresentationTarget.OverlayLayer behind a click-away
// scrim.
//
// Usage shape:
//
//   const cm = new ContextMenu();
//   cm.Items = [
//       MenuItem.create(...),
//       new MenuSeparator(),
//       MenuItem.create(...),
//   ];
//   ContextMenuService.SetContextMenu(someVisual, cm);
//
// On secondary-button PointerDown the framework walks up from the hit
// visual looking for the first ancestor with a ContextMenu attached
// (WPF's ContextMenuService.ContextMenu behaviour). That ancestor's
// ContextMenu opens at the cursor position.
//
// The ContextMenu instance can be reused across multiple opens — the
// popup mounts on first Open and unmounts on close.
//
// ContextMenu does NOT extend ItemsControl — its visible chrome is
// nothing (the body lives entirely on the OverlayLayer), and the
// items list belongs to an inner `_menu: Menu`. ContextMenu.Items is
// a thin DP that proxies writes to `_menu.Items`. Same rationale as
// MenuButton: avoid double-materialization when item data are Visuals.
export class ContextMenu extends Control
{
    public static readonly IsOpenKey = Model.RegisterProperty<boolean>(
        ContextMenu, 'IsOpen', false, MetaData.None,
    );

    public static readonly ItemsKey = Model.RegisterProperty<
        readonly unknown[] | ObservableCollection<unknown> | undefined
    >(ContextMenu, 'Items', undefined, MetaData.Measure);

    public get IsOpen():  boolean { return this.get_property_value(ContextMenu.IsOpenKey); }
    public set IsOpen(v: boolean) { this.set_property_value(ContextMenu.IsOpenKey, v); }

    public get Items(): readonly unknown[] | ObservableCollection<unknown> | undefined
    {
        return this.get_property_value(ContextMenu.ItemsKey);
    }
    public set Items(v: readonly unknown[] | ObservableCollection<unknown> | undefined)
    {
        this.set_property_value(ContextMenu.ItemsKey, v);
    }

    private readonly _menu:           Menu;
    private readonly _popupContainer: Border;
    private readonly _scrim:          ClickAwayScrim;
    private readonly _popupHost:      MenuPopupHost;

    private _popupMounted = false;
    private _mountedTarget: PresentationTarget | undefined;

    static
    {
        // Register the surface theme bundle so DefaultContextMenuPopup
        // resolves below. MenuButton's static block calls this too — the
        // helper is idempotent. Kept here for the case where consumers
        // import ContextMenu directly without first touching MenuButton.
        ensureSurfaceTheme();
    }

    constructor()
    {
        super();

        // surface.template.mu declares DefaultContextMenuPopup as a
        // MenuPopupHost(PART_PopupHost) > [ClickAwayScrim(PART_Scrim),
        // Border(PART_PopupContainer) > Menu(PART_Menu)]. The host's
        // popup reference and the scrim's onClick callback can't appear
        // in markup (they target sibling parts), so we patch them in
        // here after Apply.
        const popupInst = resolveContextMenuTemplate().Apply(this);
        this._popupHost      = popupInst.root as MenuPopupHost;
        this._scrim          = popupInst.root.FindName('PART_Scrim')          as ClickAwayScrim;
        this._popupContainer = popupInst.root.FindName('PART_PopupContainer') as Border;
        this._menu           = popupInst.root.FindName('PART_Menu')           as Menu;
        this._popupHost.popup = this._popupContainer;

        const close = (): void => { this.IsOpen = false; };
        this._scrim.onClick = close;
        // Publish the close callback on the inner menu via the
        // `_closePopup` channel `wireMenuActivationClose` reads — every
        // materialized MenuItem container's _onActivated fires this on
        // click. Same wiring MenuButton uses.
        (this._menu as unknown as { _closePopup: () => void })._closePopup = close;
        wireMenuActivationClose(this._menu);

        // ContextMenu has no visible chrome of its own — the overlay
        // popup hosts all the visuals. As a plain Visual subclass it
        // contributes Size.Zero to layout when included as a tree
        // child (consumers typically don't put a ContextMenu in the
        // tree at all — it's assigned to Visual.ContextMenu).
    }

    public override get visualChildren(): readonly Visual[] { return []; }
    public override get logicalChildren(): readonly Visual[] { return []; }
    protected override MeasureOverride(_availableSize: Size): Size { return Size.Zero; }
    protected override ArrangeOverride(finalSize: Size): Size { return finalSize; }

    // `.mu` body — `ContextMenu { MenuItem; MenuSeparator; … }` — routes
    // through AddChild. ContextMenu is a Visual (not an ItemsControl), so
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

    /** Open the context menu on the given PresentationTarget at the
     *  supplied (host-coordinate) point. Mounts the popup on the
     *  target's OverlayLayer; closing unmounts. */
    public OpenAt(target: PresentationTarget, x: number, y: number): void
    {
        this._menu.Items = this.Items;
        this._popupHost.fixedPoint = { x, y };
        this._popupHost.anchor     = undefined;
        this._mountedTarget = target;
        if (!this._popupMounted)
        {
            target.AttachOverlay(this._popupHost);
            this._popupMounted = true;
        }
        this.IsOpen = true;
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'IsOpen' && newValue === false && this._popupHost !== undefined)
        {
            this.unmountPopup();
        }
        if (descriptor.Name === 'Items')
        {
            // Guard against the constructor-time fire — super() sets
            // Items before this._menu is initialised.
            if (this._menu !== undefined) this._menu.Items = this.Items;
        }
    }

    private unmountPopup(): void
    {
        if (!this._popupMounted) return;
        const t = this._mountedTarget;
        if (t !== undefined) t.DetachOverlay(this._popupHost);
        this._popupMounted = false;
        this._mountedTarget = undefined;
    }
}

// ─────────────────────────────────────────────────────────────────────
// Attached ContextMenu DP. Authors call ContextMenuService.SetContextMenu
// (or write Visual.ContextMenu via the ergonomic getter/setter installed
// on Visual.prototype below). The DP lives on a marker class so it's a
// proper cross-class attached property.
//
// The runtime side: installation of SetContextMenu wires a static
// PointerDown listener on Visual.prototype that intercepts Secondary-
// button presses, walks the hit-test route bottom-up looking for the
// first ancestor with a ContextMenu attached, and opens that menu at
// the host-coords cursor position.
export class ContextMenuService
{
    public static readonly ContextMenuKey = Model.RegisterAttachedProperty<ContextMenu | undefined>(
        ContextMenuService, 'ContextMenu', undefined, MetaData.None,
    );

    public static GetContextMenu(v: Visual): ContextMenu | undefined
    {
        return v.get_property_value(ContextMenuService.ContextMenuKey);
    }

    public static SetContextMenu(v: Visual, cm: ContextMenu | undefined): void
    {
        v.set_property_value(ContextMenuService.ContextMenuKey, cm);
    }
}

// Ergonomic per-instance getter/setter for Visual.ContextMenu. Stamped
// onto Visual.prototype below; the type-system view of Visual exposes
// the same shape via the declare-module augmentation.
declare module '../../runtime/visual.js'
{
    interface Visual
    {
        get ContextMenu(): ContextMenu | undefined;
        set ContextMenu(v: ContextMenu | undefined);
    }
}

Object.defineProperty(Visual.prototype, 'ContextMenu', {
    get(this: Visual): ContextMenu | undefined { return ContextMenuService.GetContextMenu(this); },
    set(this: Visual, v: ContextMenu | undefined): void { ContextMenuService.SetContextMenu(this, v); },
    configurable: true,
});

// ─────────────────────────────────────────────────────────────────────
// Right-click → open ContextMenu hook. Patches Visual.prototype's
// OnPreviewPointerDown ONCE at module init. The patch is a thin layer
// over the original: it runs the original first (so existing
// per-Visual virtuals still fire), then on Secondary-button presses
// walks up from args.Source looking for an attached ContextMenu.
//
// This is the minimum-footprint way to add an attached-property-driven
// gesture without changing Visual itself. The patch is idempotent
// (we check a sentinel field before installing).

interface PatchedProto
{
    _ContextMenuPatchInstalled?: boolean;
    OnPreviewPointerDown(args: PointerEventArgs): void;
}

const proto = Visual.prototype as unknown as PatchedProto;
if (proto._ContextMenuPatchInstalled !== true)
{
    proto._ContextMenuPatchInstalled = true;
    const original = proto.OnPreviewPointerDown;
    proto.OnPreviewPointerDown = function (args: PointerEventArgs): void
    {
        original.call(this, args);
        if (args.Handled) return;
        // Secondary button only. PointerButton.Secondary === 2 per
        // routed-event.ts. No need to import the enum just for the
        // numeric comparison.
        if (args.Button !== 2) return;
        // Walk source → root.
        let cur: Visual | undefined = args.Source;
        while (cur !== undefined)
        {
            const cm = ContextMenuService.GetContextMenu(cur);
            if (cm !== undefined)
            {
                // Resolve the PresentationTarget for the host. Visual's
                // `target` getter is protected; we read the underlying
                // field through a duck-typed cast — same shape used by
                // ComboBox / ToolBar.
                const t = (cur as unknown as { _target: PresentationTarget | undefined })._target;
                if (t !== undefined)
                {
                    cm.OpenAt(t, args.HostX, args.HostY);
                    args.Handled = true;
                    suppressNextBrowserContextMenu();
                }
                return;
            }
            cur = cur.GetVisualParent();
        }
    };
}

// Browser fires a native `contextmenu` event around a secondary-button
// click — timing depends on the OS:
//   * macOS / many Linux WMs: fires on pointerdown (same task as the
//     press).
//   * Windows: fires on pointerup (a LATER task than the press).
//
// To cover both, we install a single capture-phase listener at module
// init and arm a "next contextmenu should be suppressed" flag whenever
// we open a µ-mural ContextMenu. The listener consumes the flag on the
// next contextmenu event — works whether that's the same task or a
// later one. A microtask-based cleanup would prematurely disarm the
// flag on Windows; this approach doesn't have that hazard.
//
// `_armed` survives only until the very next contextmenu fires, so it
// can't leak into unrelated future right-clicks on Visuals without an
// attached menu.

let _armed = false;

function suppressNextBrowserContextMenu(): void
{
    if (typeof document === 'undefined') return;
    if (!_contextMenuSwallowInstalled)
    {
        _contextMenuSwallowInstalled = true;
        document.addEventListener('contextmenu', (e: Event): void =>
        {
            if (!_armed) return;
            _armed = false;
            e.preventDefault();
        }, true);
    }
    _armed = true;
}

let _contextMenuSwallowInstalled = false;
