import { Element } from '../../runtime/index.js';
import type { CommandBinding } from '../commands/command-binding.js';
import type { InputBinding } from '../commands/input-binding.js';

// Control — base class for templated controls. WPF parity: the
// equivalent of `System.Windows.Controls.Control`, sitting between
// `Element` (mural's FrameworkElement-tier — DataContext, Style,
// Resources, Triggers, Template all live on Element — see
// [../visual-engine/element.ts](../visual-engine/element.ts)) and the
// concrete control surface (ContentControl, ItemsControl, and the
// stand-alone templated controls — MenuButton, ContextMenu, Drawer).
//
// Why it exists:
//
//   * It's the typing seam for "a Visual that ships a default
//     ControlTemplate and uses it to project its chrome." Code that
//     needs to talk about *templated* controls polymorphically (a
//     re-templating service, a theming inspector, a static analyzer
//     that wants to know which Visuals own a Template DP) can now
//     branch on `instanceof Control` instead of enumerating concrete
//     types.
//
//   * It mirrors the WPF inheritance chain so consumers coming from
//     XAML find the layering they expect. A future "Control DPs lift"
//     (Padding / BorderBrush / BorderThickness / Background /
//     Foreground / HorizontalContentAlignment / VerticalContentAlignment)
//     has a natural home here when those properties stop being
//     redeclared on each control individually.
//
//   * Per-instance CommandBindings + InputBindings live here. Plain
//     Visuals (Border / Canvas / panels) participate in routed
//     dispatch but don't carry their own binding tables; only
//     templated controls do, matching the user-facing surface that
//     ICommandSource consumers (buttons, menu items, toolbar items)
//     actually inhabit.
//
// Subclasses opt in by extending Control instead of Visual and
// declaring their default Style + ControlTemplate in their respective
// `*.resources.mu` files (basic.resources.mu for the primitive controls,
// framework.resources.mu for the command-surface bundle).
export class Control extends Element
{
    // ── Routed-command + input-binding tables ─────────────────────────
    //
    // Per-instance CommandBindings (RoutedCommand identity → Executed /
    // CanExecute handler pair) and InputBindings (KeyBinding /
    // MouseBinding → Command). Both collections are lazily allocated —
    // Controls that never opt into the command system pay no memory
    // cost beyond the two `undefined` slots below.
    //
    // The collections are read by CommandManager (walks up the visual
    // tree looking for a matching CommandBinding when a RoutedCommand
    // fires) and by the routed-event walker (consults InputBindings
    // during keyboard / pointer dispatch). The internal _tryGet*
    // helpers are how those readers reach in without paying the
    // lazy-alloc on every visit; both call sites first check
    // `instanceof Control` so plain Visuals are passed over cheaply.
    private _commandBindings: CommandBinding[] | undefined;
    private _inputBindings:   InputBinding[]   | undefined;

    /** Lazily-allocated CommandBindings collection. Mutate directly to
     *  register / unregister bindings; the collection is queried at
     *  routed-command dispatch time, so changes take effect immediately
     *  without any explicit refresh. */
    public get CommandBindings(): CommandBinding[]
    {
        if (this._commandBindings === undefined) this._commandBindings = [];
        return this._commandBindings;
    }

    /** Lazily-allocated InputBindings collection. Same mutate-in-place
     *  contract. KeyBindings fire on the bubble pass of KeyDown; the
     *  innermost binding whose gesture matches wins and marks the
     *  routed event Handled. */
    public get InputBindings(): InputBinding[]
    {
        if (this._inputBindings === undefined) this._inputBindings = [];
        return this._inputBindings;
    }

    /** Internal — returns the existing CommandBindings array WITHOUT
     *  allocating one. Used by CommandManager's hot path so the common
     *  "no bindings on this Control" case stays a single null check. */
    public _tryGetCommandBindings(): CommandBinding[] | undefined
    {
        return this._commandBindings;
    }

    /** Internal — non-allocating peek at InputBindings. Same shape as
     *  _tryGetCommandBindings. */
    public _tryGetInputBindings(): InputBinding[] | undefined
    {
        return this._inputBindings;
    }
}
