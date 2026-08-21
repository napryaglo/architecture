import {
    Element,
    MetaData,
    MuralBase,
    Visual,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import { PresentationTarget } from '../../visual-engine/index.js';
import { Border } from '../../basic/border.js';
import { Button } from '../buttons/button.js';
import { ControlTemplate } from '../../basic/templates/control-template.js';
import { ItemsControl } from '../base/items-control.js';
import { WrapPanel } from '../../basic/panels/wrap-panel.js';
import { Orientation } from '../../basic/panels/orientation.js';
import { MenuPopupHost, MenuAnchorSide } from '../menu/menu-strip.js';
import { ClickAwayScrim } from '../tool-bar/tool-bar.js';

// ─────────────────────────────────────────────────────────────────────
// RibbonGallery — an in-group preview strip: shows the first row of
// entries inline (a horizontal WrapPanel) with a `▾` button that opens the
// full set in an overlay dropdown. Clicking any entry (inline or in the
// dropdown) sets SelectedItem. This is the ribbon idiom for a font / style
// / theme picker where a plain dropdown menu would hide the previews.
//
// Inline chrome lives in the primary Template (ItemsPresenter over the
// gallery's own Items). The dropdown is a second overlay template
// (PopupTemplate) hosting a mirror ItemsControl bound to the same
// ItemsSource — same inline-vs-popup split ToolBar uses for overflow.
export class RibbonGallery extends ItemsControl
{
    // TwoWay by default so `SelectedItem=$VmField` round-trips a click.
    public static readonly SelectedItemKey = MuralBase.RegisterProperty<unknown>(
        RibbonGallery, 'SelectedItem', undefined, MetaData.BindsTwoWayByDefault);
    public static readonly IsOpenKey = MuralBase.RegisterProperty<boolean>(
        RibbonGallery, 'IsOpen', false, MetaData.None);
    // Overlay dropdown chrome (MenuPopupHost + scrim + a mirror
    // ItemsControl). Set by the default Style; adopted like ToolBar's
    // PopupTemplate.
    public static readonly PopupTemplateKey = MuralBase.RegisterProperty<ControlTemplate | undefined>(
        RibbonGallery, 'PopupTemplate', undefined, MetaData.None);

    static
    {
        MuralBase.OverrideMetadata(RibbonGallery, Element.DefaultStyleKeyKey, { default_value: RibbonGallery });
    }

    private _moreButton:  Button           | undefined;
    private _popupHost:   MenuPopupHost    | undefined;
    private _scrim:       ClickAwayScrim   | undefined;
    private _popupList:   RibbonGalleryPopupList | undefined;

    private _popupMounted = false;
    private _lastKnownTarget: PresentationTarget | undefined;

    constructor()
    {
        super();
        this.ItemsPanel = (): WrapPanel =>
        {
            const p = new WrapPanel();
            p.Orientation = Orientation.Horizontal;
            return p;
        };
        this.applyDefaultStyle();
        this.adoptParts();
        this.adoptPopupTemplate();
    }

    public get SelectedItem(): unknown  { return this.get_property_value(RibbonGallery.SelectedItemKey); }
    public set SelectedItem(v: unknown) { this.set_property_value(RibbonGallery.SelectedItemKey, v); }

    public get IsOpen(): boolean  { return this.get_property_value(RibbonGallery.IsOpenKey); }
    public set IsOpen(v: boolean) { this.set_property_value(RibbonGallery.IsOpenKey, v); }

    public get PopupTemplate(): ControlTemplate | undefined  { return this.get_property_value(RibbonGallery.PopupTemplateKey); }
    public set PopupTemplate(v: ControlTemplate | undefined) { this.set_property_value(RibbonGallery.PopupTemplateKey, v); }

    private adoptParts(): void
    {
        const more = this.GetTemplateChild('PART_More');
        if (more instanceof Button)
        {
            this._moreButton = more;
            more.AddClickHandler(() => { this.IsOpen = !this.IsOpen; });
        }
    }

    private adoptPopupTemplate(): void
    {
        const tpl = this.PopupTemplate;
        if (tpl === undefined) return;
        const inst = tpl.Apply(this);
        this._popupHost = inst.root as MenuPopupHost;
        this._scrim     = inst.root.FindName('PART_Scrim')    as ClickAwayScrim;
        const container = inst.root.FindName('PART_PopupContainer') as Border;
        this._popupList = inst.root.FindName('PART_PopupList')  as RibbonGalleryPopupList;
        this._popupHost.popup = container;
        this._scrim.onClick   = (): void => { this.IsOpen = false; };
        this._popupList._gallery   = this;
        this._popupList.ItemsSource = this.Items;
        this._popupList.ItemsPanel  = (): WrapPanel =>
        {
            const p = new WrapPanel();
            p.Orientation = Orientation.Horizontal;
            return p;
        };
    }

    protected override validateDeclarativeChild(_child: Visual): void { }

    public override IsItemItsOwnContainerOverride(item: unknown): boolean
    {
        return item instanceof Visual;
    }

    // Wire a pointer-down on each inline container to select its item.
    public override PrepareContainerForItemOverride(container: Visual, item: unknown, index: number): void
    {
        super.PrepareContainerForItemOverride(container, item, index);
        container.AddRoutedEventListener('PointerDown', () => { this.SelectItem(item); });
    }

    /** Select an item and close the dropdown. Called by inline containers
     *  and by the popup mirror list. */
    public SelectItem(item: unknown): void
    {
        this.SelectedItem = item;
        this.IsOpen = false;
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'IsOpen' && this._popupHost !== undefined)
        {
            if (newValue === true) this.mountPopup();
            else                   this.unmountPopup();
        }
    }

    protected override propagate_target_to_visual_children(): void
    {
        const newTarget = (this as unknown as { target: PresentationTarget | undefined }).target;
        const oldTarget = this._lastKnownTarget;
        if (oldTarget !== undefined && oldTarget !== newTarget && this._popupMounted && this._popupHost !== undefined)
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
        if (this._popupMounted || this._popupHost === undefined) return;
        if (this._lastKnownTarget === undefined) return;
        if (this._moreButton !== undefined) this._popupHost.anchor = this._moreButton;
        this._popupHost.anchorSide = MenuAnchorSide.Below;
        this.AttachOverlayChild(this._popupHost);
        this._popupMounted = true;
    }

    private unmountPopup(): void
    {
        if (!this._popupMounted || this._popupHost === undefined) return;
        this.DetachOverlayChild(this._popupHost);
        this._popupMounted = false;
    }
}

// The mirror ItemsControl inside the gallery dropdown. Bound to the same
// ItemsSource as the inline strip; a pointer-down on any container selects
// that item on the owning gallery (and closes the dropdown).
export class RibbonGalleryPopupList extends ItemsControl
{
    public _gallery: RibbonGallery | undefined;

    public override IsItemItsOwnContainerOverride(item: unknown): boolean
    {
        return item instanceof Visual;
    }

    public override PrepareContainerForItemOverride(container: Visual, item: unknown, index: number): void
    {
        super.PrepareContainerForItemOverride(container, item, index);
        container.AddRoutedEventListener('PointerDown', () => { this._gallery?.SelectItem(item); });
    }
}
