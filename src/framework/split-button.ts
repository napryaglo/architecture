import {
    MetaData,
    Model,
    Visual,
    type PointerEventArgs,
    type PropertyDescriptor,
} from '../runtime/index.js';
import type { ICommand } from '../runtime/index.js';
import type { PresentationTarget } from '../visual-engine/index.js';
import { Border } from '../basic/border.js';
import { ContentControl } from './content-control.js';

// M3 Split button — a primary action + an adjacent chevron trigger
// that opens a dropdown. Two distinct click targets share one chrome.
//
// Anatomy:
//   * Primary half (left): Button-equivalent that fires `Command`
//     with `CommandParameter`. Carries the consumer-supplied
//     `Content` Visual / string. Rounded-left corners.
//   * Chevron half (right): toggle button that flips `IsOpen`. Mounts
//     `MenuContent` onto the host's OverlayLayer when IsOpen → true,
//     detaches when IsOpen → false (or when a click lands outside,
//     handled by the consumer if they want — the bundled scrim
//     covers the M3 default).
//
// Consumer surface:
//   * Content        — primary label / icon Visual (or string).
//   * Command        — primary action ICommand.
//   * CommandParameter — passed to Command.Execute.
//   * MenuContent    — the popup body (usually a StackPanel of menu
//                      items — keep it lean; consumers wanting full M3
//                      menu chrome can host a MenuButton inside).
//   * IsOpen         — popup state; toggle externally or via the
//                      chevron click.
//
// Stroke / focus / press visuals live in the default chrome (template
// triggers); SplitButton itself owns only the popup mount/unmount.
//
// Outside-click dismiss: a transparent Border-as-scrim mounts on the
// OverlayLayer alongside the popup and routes PointerDown to clear
// IsOpen. Mirrors the ContextMenu / MenuButton convention.
// Extends ContentControl so `Content` is the primary label / icon
// Visual (ContentControl provides the DP + ContentPresenter slotting)
// and GetTemplateChild is inherited.
export class SplitButton extends ContentControl
{
    public static readonly CommandKey          = Model.RegisterProperty<ICommand | undefined>(       SplitButton, 'Command',           undefined, MetaData.None);
    public static readonly CommandParameterKey = Model.RegisterProperty<unknown>(                     SplitButton, 'CommandParameter',  undefined, MetaData.None);
    public static readonly MenuContentKey      = Model.RegisterProperty<Visual | undefined>(          SplitButton, 'MenuContent',       undefined, MetaData.None);
    public static readonly IsOpenKey           = Model.RegisterProperty<boolean>(                     SplitButton, 'IsOpen',            false,     MetaData.None);

    public get Command():          ICommand | undefined { return this.get_property_value(SplitButton.CommandKey); }
    public set Command(v:          ICommand | undefined) { this.set_property_value(SplitButton.CommandKey, v); }

    public get CommandParameter(): unknown { return this.get_property_value(SplitButton.CommandParameterKey); }
    public set CommandParameter(v: unknown) { this.set_property_value(SplitButton.CommandParameterKey, v); }

    public get MenuContent():      Visual | undefined { return this.get_property_value(SplitButton.MenuContentKey); }
    public set MenuContent(v:      Visual | undefined) { this.set_property_value(SplitButton.MenuContentKey, v); }

    public get IsOpen():           boolean { return this.get_property_value(SplitButton.IsOpenKey); }
    public set IsOpen(v:           boolean) { this.set_property_value(SplitButton.IsOpenKey, v); }

    static {
        Model.OverrideMetadata(SplitButton, Visual.DefaultStyleKeyKey,
            { default_value: SplitButton });
    }

    private _primary:   Border | undefined;
    private _trigger:   Border | undefined;
    private _popupHost: Border | undefined;
    private _scrim:     Border | undefined;
    private _mounted = false;
    private _lastTarget: PresentationTarget | undefined;
    private _primaryPressed = false;
    private _triggerPressed = false;

    constructor()
    {
        super();
        this.applyDefaultStyle();
        this.adoptTemplateParts();
    }

    private adoptTemplateParts(): void
    {
        this._primary = this.GetTemplateChild('PART_PrimaryButton') as Border | undefined;
        this._trigger = this.GetTemplateChild('PART_TriggerButton') as Border | undefined;
        // Press-here-release-here gate per half — fires only on a
        // matching down/up pair without an intervening leave. Same
        // contract Button uses; we wire it manually because the halves
        // are plain Borders (so the template's state-layer triggers
        // can ride on IsMouseOver / IsPressed without bringing in
        // Button's full chrome story).
        this.wireClickable(
            this._primary,
            pressed => { this._primaryPressed = pressed; },
            () => {
                const cmd = this.Command;
                if (cmd === undefined) return;
                const param = this.CommandParameter;
                if (cmd.CanExecute(param)) cmd.Execute(param);
            });
        this.wireClickable(
            this._trigger,
            pressed => { this._triggerPressed = pressed; },
            () => { this.IsOpen = !this.IsOpen; });
    }

    private wireClickable(
        part:    Border | undefined,
        setFlag: (pressed: boolean) => void,
        onFire:  () => void,
    ): void
    {
        if (part === undefined) return;
        part.AddRoutedEventListener('PointerDown', (() => {
            setFlag(true);
            part.set_property_value(Visual.IsPressedKey, true);
        }) as (a: unknown) => void);
        part.AddRoutedEventListener('PointerUp', (() => {
            const wasPressed = this._primary === part ? this._primaryPressed : this._triggerPressed;
            setFlag(false);
            part.set_property_value(Visual.IsPressedKey, false);
            if (wasPressed) onFire();
        }) as (a: unknown) => void);
        part.AddRoutedEventListener('PointerLeave', (() => {
            setFlag(false);
            part.set_property_value(Visual.IsPressedKey, false);
        }) as (a: unknown) => void);
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue:   unknown,
        newValue:   unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Owner === SplitButton && descriptor.Name === 'IsOpen')
        {
            if (newValue === true) this.mountPopup();
            else                    this.unmountPopup();
        }
    }

    private mountPopup(): void
    {
        if (this._mounted) return;
        const t = targetOf(this);
        if (t === undefined) return;
        const content = this.MenuContent;
        if (content === undefined) return;

        // Scrim catches outside clicks → clears IsOpen.
        this._scrim = new Border();
        this._scrim.AddRoutedEventListener('PointerDown', (() => {
            this.IsOpen = false;
        }) as (a: unknown) => void);
        // The popup host wraps MenuContent so the consumer's Visual
        // stays unchanged.
        this._popupHost = new Border();
        this._popupHost.SetChild(content);

        t.AttachOverlay(this._scrim);
        t.AttachOverlay(this._popupHost);
        this._mounted    = true;
        this._lastTarget = t;
    }

    private unmountPopup(): void
    {
        if (!this._mounted) return;
        const t = this._lastTarget;
        if (t !== undefined)
        {
            if (this._popupHost !== undefined) t.DetachOverlay(this._popupHost);
            if (this._scrim     !== undefined) t.DetachOverlay(this._scrim);
        }
        // Drop refs so a re-open builds a fresh host (matches the
        // ContextMenu / MenuButton lifecycle — the OverlayLayer never
        // sees a stale visual).
        if (this._popupHost !== undefined) this._popupHost.SetChild(undefined);
        this._popupHost = undefined;
        this._scrim     = undefined;
        this._mounted   = false;
    }
}

// Walks the visual's host back-pointer to find the PresentationTarget.
// Same shape Tooltip / Snackbar / Dialog overlay-helpers use.
function targetOf(host: Visual): PresentationTarget | undefined
{
    const back = host as unknown as { ['target']?: PresentationTarget };
    return back['target'];
}

// Suppress unused-import lint — `PointerEventArgs` is part of the
// AddRoutedEventListener callback contract even though the handlers
// happen to ignore the args.
void (undefined as PointerEventArgs | undefined);
