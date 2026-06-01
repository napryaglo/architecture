import {
    Color,
    MetaData,
    Model,
    Thickness,
    type ICommand,
    type PointerEventArgs,
    type PropertyDescriptor,
    type Visual,
} from '../runtime/index.js';
import { SolidColorBrush } from '../visual-engine/index.js';
import { Border } from './border.js';
import { ContentControl } from './content-control.js';
import { ContentPresenter } from './content-presenter.js';
import { ControlTemplate } from './control-template.js';
import { TextBlock } from './text-block.js';

// When the Click event fires. WPF parity: Release is the default
// (visible press feedback, fire on PointerUp inside bounds), Press
// fires immediately on PointerDown (no need for matching Up), and
// Hover fires when the pointer enters the button area (toolbar-style
// hover-to-activate).
export enum ClickMode
{
    Release = 'Release',
    Press   = 'Press',
    Hover   = 'Hover',
}

// Click handler signature. The originating PointerEventArgs rides
// along so handlers can branch on modifier keys, button index, or
// position without reaching back into the input device.
export type ClickHandler = (args: PointerEventArgs) => void;

// Material UI palette (Contained Button variant — the most common MUI
// button look). Colours pulled from the Material Design 2 reference:
//
//   * Primary 700 (#1976d2) — rest background.
//   * Primary 800 (#1565c0) — hover background. MUI itself overlays
//     a translucent black on the rest colour; we ship the precomputed
//     shade so the engine doesn't need alpha compositing wired up yet.
//   * Primary 900 (#0d47a1) — active / pressed background.
//   * White (#ffffff)       — text colour on contained buttons.
//
// Module-level instances so every Button reuses the same SolidColorBrush
// objects instead of allocating per construction. Consumers who want a
// different look replace the entire Template via the standard
// ContentControl.Template DP.
const MUI_PRIMARY_REST  = new SolidColorBrush(Color.FromHex('#1976d2'));
const MUI_PRIMARY_HOVER = new SolidColorBrush(Color.FromHex('#1565c0'));
const MUI_PRIMARY_PRESS = new SolidColorBrush(Color.FromHex('#0d47a1'));
const MUI_TEXT_ON_PRIMARY = new SolidColorBrush(Color.FromHex('#ffffff'));

// Material UI Contained Button spec: 16px horizontal padding, 6px
// vertical, 4px corner radius, no visible border, white text. State
// transitions wired below.
function createDefaultTemplate(): ControlTemplate
{
    return new ControlTemplate(templatedParent =>
    {
        const border = new Border();
        border.Background      = MUI_PRIMARY_REST;
        border.BorderThickness = Thickness.Zero;
        border.CornerRadius    = 4;
        border.Padding         = new Thickness(16, 6, 16, 6);
        const presenter = new ContentPresenter();
        border.SetChild(presenter);

        // Text colour for any TextBlock the consumer slots in as Content.
        // Cross-class write on templatedParent — Foreground propagates
        // down the logical tree via inheritance and reaches the Content's
        // TextBlock without the consumer needing to set it. A consumer
        // attribute (`Button[Foreground=…]`) overrides because the
        // compiler emits attribute writes after the template runs.
        templatedParent.set_property_value(TextBlock, 'Foreground', MUI_TEXT_ON_PRIMARY);

        // Hover / press feedback — recompute Background whenever the
        // Button's IsMouseOver / IsPressed DPs change. Both flags are
        // maintained on the Button itself by InputManager + Button's
        // OnPointerDown / OnPointerUp / OnPointerEnter / OnPointerLeave
        // overrides, so the listener sees the current truth without
        // having to walk the visual tree.
        //
        // Press wins over hover (matches MUI). Disabled (CanExecute=false)
        // styling lands here when IsEnabled is wired into Visual; for now
        // the click-gate is silent rather than visibly disabled.
        const refreshBackground = (): void => {
            if (templatedParent.IsPressed)        border.Background = MUI_PRIMARY_PRESS;
            else if (templatedParent.IsMouseOver) border.Background = MUI_PRIMARY_HOVER;
            else                                   border.Background = MUI_PRIMARY_REST;
        };
        templatedParent.AddPropertyChangedListener('IsPressed',   refreshBackground);
        templatedParent.AddPropertyChangedListener('IsMouseOver', refreshBackground);

        return border;
    });
}

// Button: a clickable ContentControl. Equivalent to WPF's Button +
// ButtonBase rolled into one class — the abstract split exists in
// WPF to share behaviour with ToggleButton / RepeatButton, neither
// of which ships in mural v1. When those land, factor this into a
// shared ButtonBase.
//
// Click protocol — fired in this order each time the button activates:
//   1. The `Command` DP (typed as `() => void` when set via binding)
//      is invoked with no arguments. This is the binding-friendly hook
//      a `.mu` source uses: `Button[Command = $onClick]`.
//   2. Every registered ClickHandler runs in registration order. The
//      handler receives the originating PointerEventArgs.
//   3. Subclasses can override the protected OnClick virtual for
//      behaviour layered on top of (1) and (2).
//
// IsPressed semantics — maintained at the Button level for WPF parity:
//   * PointerDown on the Button (or any descendant) sets IsPressed.
//   * Dragging off the Button (PointerLeave) clears IsPressed while
//     a drag is in progress, so the press visual goes off without
//     committing the click.
//   * Dragging back onto the Button (PointerEnter) restores IsPressed
//     while the same press is still active.
//   * PointerUp clears IsPressed unconditionally. If the up happens
//     inside the Button and the original PointerDown originated here
//     (ClickMode.Release path), the Click protocol fires before the
//     state clear.
//
// The internal `_pressOriginatedHere` flag tracks whether the current
// pointer interaction's PointerDown landed on this Button, which is
// what distinguishes "press + release inside" from "press elsewhere +
// drag onto + release".
export class Button extends ContentControl
{
    static
    {
        Model.RegisterProperty(Button, 'Command',          undefined,         MetaData.None);
        Model.RegisterProperty(Button, 'CommandParameter', undefined,         MetaData.None);
        Model.RegisterProperty(Button, 'ClickMode',        ClickMode.Release, MetaData.None);
    }

    private readonly _clickHandlers: ClickHandler[] = [];
    private _pressOriginatedHere = false;

    // Cached executability — kept in sync with the active Command's
    // CanExecute result by subscribing to CanExecuteChanged. Click
    // dispatch consults this gate (the WPF Button.IsEnabled binding
    // would also drive off it once IsEnabled lands as a runtime DP).
    // Defaults to true so a Button with no Command behaves like any
    // other clickable control.
    private _canExecute: boolean = true;

    // Bound version of the CanExecuteChanged listener so AddListener
    // and RemoveListener see the same reference. Recreating the
    // closure each subscription would leak references on Command
    // swap.
    private readonly _onCanExecuteChanged = (): void => { this.refreshCanExecute(); };

    constructor(content?: Visual)
    {
        super();
        this.Template = createDefaultTemplate();
        if (content !== undefined) this.Content = content;
    }

    public get Command(): ICommand | undefined { return this.get_property_value('Command'); }
    public set Command(v: ICommand | undefined) { this.set_property_value('Command', v); }

    public get CommandParameter(): unknown { return this.get_property_value('CommandParameter'); }
    public set CommandParameter(v: unknown) { this.set_property_value('CommandParameter', v); }

    public get ClickMode(): ClickMode { return this.get_property_value('ClickMode'); }
    public set ClickMode(v: ClickMode) { this.set_property_value('ClickMode', v); }

    // Register a handler invoked alongside Command on every click.
    // Returns the same handler so chaining patterns like
    // `const off = btn.AddClickHandler(...); off();` aren't tempting
    // — explicit Remove keeps lifetime ownership clear.
    public AddClickHandler(h: ClickHandler): void
    {
        this._clickHandlers.push(h);
    }

    public RemoveClickHandler(h: ClickHandler): void
    {
        const i = this._clickHandlers.indexOf(h);
        if (i >= 0) this._clickHandlers.splice(i, 1);
    }

    // ── Input virtuals ─────────────────────────────────────────────

    protected override OnPointerDown(args: PointerEventArgs): void
    {
        this._pressOriginatedHere = true;
        this.set_property_value('IsPressed', true);
        if (this.ClickMode === ClickMode.Press)
        {
            this.fireClick(args);
        }
    }

    protected override OnPointerUp(args: PointerEventArgs): void
    {
        // Release-mode click fires only when the press started here
        // AND the pointer is still over the button. Drag-off + release
        // intentionally swallows the click — same as native buttons.
        const fire = this.ClickMode === ClickMode.Release
            && this._pressOriginatedHere
            && this.IsMouseOver;
        // Clear IsPressed BEFORE the click so handlers reading
        // IsPressed inside their callback see the post-release state.
        this.set_property_value('IsPressed', false);
        this._pressOriginatedHere = false;
        if (fire) this.fireClick(args);
    }

    protected override OnPointerEnter(args: PointerEventArgs): void
    {
        if (this.ClickMode === ClickMode.Hover)
        {
            this.fireClick(args);
            return;
        }
        // Dragging the pointer back onto the button while the same
        // press is still active restores the IsPressed visual cue.
        if (this._pressOriginatedHere)
        {
            this.set_property_value('IsPressed', true);
        }
    }

    protected override OnPointerLeave(_args: PointerEventArgs): void
    {
        // Dragging off the button while still pressed clears IsPressed
        // so the press visual reverts. `_pressOriginatedHere` stays
        // true so a drag-back-on can restore both the flag and the
        // visual without re-routing through PointerDown.
        if (this._pressOriginatedHere)
        {
            this.set_property_value('IsPressed', false);
        }
    }

    // Subclass hook. Default is empty. Called AFTER Command + handler
    // list have run, so a subclass override receives the same arg flow
    // as the public surface and can layer additional behaviour without
    // stepping on Command consumers.
    protected OnClick(_args: PointerEventArgs): void { /* override */ }

    private fireClick(args: PointerEventArgs): void
    {
        // Cached CanExecute result gates dispatch — when false, NEITHER
        // Command nor click handlers run. View models that mutate
        // executability must call RaiseCanExecuteChanged so the cache
        // is refreshed before user input lands.
        if (!this._canExecute) return;
        const cmd = this.Command;
        cmd?.Execute(this.CommandParameter);
        // Snapshot the handler list so a handler that removes itself
        // mid-fire doesn't perturb the iteration. Same defensive copy
        // pattern as DOM event dispatch.
        const handlers = this._clickHandlers.slice();
        for (const h of handlers) h(args);
        this.OnClick(args);
    }

    // ── Command bookkeeping ────────────────────────────────────────

    // Re-evaluate _canExecute from the active Command + parameter.
    // Called on Command swap, CommandParameter change, and whenever
    // the active Command raises CanExecuteChanged. The cached
    // boolean is consulted by fireClick — and would drive IsEnabled
    // bindings once IsEnabled lands as a Visual DP.
    private refreshCanExecute(): void
    {
        const cmd = this.Command;
        this._canExecute = cmd === undefined ? true : cmd.CanExecute(this.CommandParameter);
    }

    // Track Command + CommandParameter changes to attach / detach the
    // CanExecuteChanged listener and refresh the cached result. The
    // OnPropertyChanged hook is the only place set_property_value
    // notifies us regardless of how the write happens (binding push,
    // compiler emission, direct setter), so subscription management
    // lives here rather than the public setter.
    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'Command')
        {
            const oldCmd = oldValue as ICommand | undefined;
            const newCmd = newValue as ICommand | undefined;
            oldCmd?.RemoveCanExecuteChangedListener(this._onCanExecuteChanged);
            newCmd?.AddCanExecuteChangedListener   (this._onCanExecuteChanged);
            this.refreshCanExecute();
        }
        else if (descriptor.Name === 'CommandParameter')
        {
            this.refreshCanExecute();
        }
    }
}
