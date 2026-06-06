import {
    MetaData,
    Model,
    Visual,
    type ICommand,
    type PointerEventArgs,
    type PropertyDescriptor,
} from '../runtime/index.js';
import { ContentControl } from './content-control.js';
import { TextBlock } from './text-block.js';
import { ensureControlsTheme } from './default-resources.js';
import { Theme } from './theme.js';

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
    public static readonly CommandKey          = Model.RegisterProperty<ICommand | undefined>(Button, 'Command',          undefined,         MetaData.None);
    public static readonly CommandParameterKey = Model.RegisterProperty<unknown>(             Button, 'CommandParameter', undefined,         MetaData.None);
    public static readonly ClickModeKey        = Model.RegisterProperty<ClickMode>(           Button, 'ClickMode',        ClickMode.Release, MetaData.None);

    static
    {
        // Theme-style lookup key — Button instances resolve their
        // default Style via TryFindResource(Button) on attach.
        Model.OverrideMetadata(Button, Visual.DefaultStyleKeyKey, { default_value: Button });
        // Ensures the consolidated controls theme — which holds the
        // Button ControlTemplate keyed by the Button class function —
        // is registered with Application exactly once.
        ensureControlsTheme();
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
        // Cross-class inherited default — propagates down to any
        // TextBlock descendant of the Content via the standard
        // inheritance walk. Sits on the templated parent (this Button)
        // because it describes how descendant TextBlocks paint, not a
        // template-internal visual; it's conceptually a property
        // metadata default rather than markup. Triggers can't express
        // cross-class inherited defaults, so this stays in TS.
        this.set_property_value(TextBlock.ForegroundKey, Theme.primaryInk);
        if (content !== undefined) this.Content = content;
        // Template + the IsPressed / IsMouseOver background swap live
        // on the default Style (see controls.template.mu, Button block).
        this.applyDefaultStyle();
    }

    public get Command(): ICommand | undefined { return this.get_property_value(Button.CommandKey); }
    public set Command(v: ICommand | undefined) { this.set_property_value(Button.CommandKey, v); }

    public get CommandParameter(): unknown { return this.get_property_value(Button.CommandParameterKey); }
    public set CommandParameter(v: unknown) { this.set_property_value(Button.CommandParameterKey, v); }

    public get ClickMode(): ClickMode { return this.get_property_value(Button.ClickModeKey); }
    public set ClickMode(v: ClickMode) { this.set_property_value(Button.ClickModeKey, v); }

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
        this.set_property_value(Visual.IsPressedKey, true);
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
        this.set_property_value(Visual.IsPressedKey, false);
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
            this.set_property_value(Visual.IsPressedKey, true);
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
            this.set_property_value(Visual.IsPressedKey, false);
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
