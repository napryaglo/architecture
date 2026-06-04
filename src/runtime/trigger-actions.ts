import type { Storyboard } from './animation/storyboard.js';
import type { Visual } from './visual.js';
import type { ICommand } from './command.js';

// Imperative side of declarative trigger actions. A TriggerAction is the
// thing an EventTrigger fires when its routed event lands; the most
// common (and only ship-supported v1) action is BeginStoryboardAction
// which materialises a fresh Storyboard and starts it.
//
// Why factory-based: a Style typically declares ONE EventTrigger and
// many Visuals share it. Sharing a Storyboard instance across all
// Buttons that pick up the style would mean every click on any button
// stops every other button's running animation (Storyboard.Begin is
// idempotent on a Running storyboard, and target lists are fixed at
// Begin). Each invocation calling the factory produces a fresh
// Storyboard whose Children are bound to the firing Visual.
//
// The factory receives the firing Visual ("target") so emitted code can
// write `sb.Add(target, 'Width', ...)` without baking a specific Visual
// instance into the closure at template-load time.
export abstract class TriggerAction
{
    /** Run the action against the Visual the firing EventTrigger is
     *  registered on. `args` is the routed-event args of the firing
     *  event (PointerEventArgs, KeyEventArgs, DragEventArgs, …) — the
     *  install_event_trigger wiring in Visual passes it through.
     *  Actions that don't need the args (BeginStoryboard et al.) can
     *  ignore the parameter; InvokeCommandAction forwards it as the
     *  ICommand's Execute parameter so commands can read the args. */
    public abstract Invoke(target: Visual, args?: unknown): void;
}

// Build + Begin a fresh Storyboard each time the parent EventTrigger
// fires. Mirrors WPF's BeginStoryboard Action (sans the SoundPlayer /
// PauseStoryboard / StopStoryboard siblings).
//
// Authoring shape in `.mu`:
//
//   on Click {
//       BeginStoryboard {
//           DoubleAnimation[TargetProperty=Width, From=80, To=240, Duration=400]
//       }
//   }
//
// The compiler emits a factory closure whose body does:
//   const sb = new Storyboard();
//   sb.Add(target, 'Width', new DoubleAnimation({...}));
//   return sb;
// — i.e., the target binding is deferred to invocation, and ALL
// animations declared inside the BeginStoryboard block get bundled
// into the same Storyboard so their FillBehavior / completion semantics
// run as one unit.
export class BeginStoryboardAction extends TriggerAction
{
    public readonly Factory: (target: Visual) => Storyboard;
    /** Optional handle that lets StopStoryboardAction / PauseStoryboardAction /
     *  ResumeStoryboardAction reference this Storyboard later. When set,
     *  each Invoke registers the freshly-built Storyboard on the target
     *  Visual under this name, overwriting any prior registration. The
     *  name lives on the FIRING Visual, not globally — so two Buttons
     *  with the same trigger have independent "fade" storyboards. */
    public readonly Name:    string | undefined;

    public constructor(
        factory: (target: Visual) => Storyboard,
        name?:   string,
    )
    {
        super();
        this.Factory = factory;
        this.Name    = name;
    }

    public override Invoke(target: Visual): void
    {
        const sb = this.Factory(target);
        if (this.Name !== undefined)
        {
            target.RegisterNamedStoryboard(this.Name, sb);
        }
        sb.Begin();
    }
}

// Stop the named Storyboard previously begun on this Visual. WPF
// `StopStoryboard BeginStoryboardName="..."` analogue.
//
// Looks up the latest Storyboard registered under `Name` on the
// invoking Visual; calls .Stop() to release its animation slots.
// Silently no-ops when the name doesn't resolve — matches WPF
// behaviour, prevents a typo in markup from crashing the page.
export class StopStoryboardAction extends TriggerAction
{
    public constructor(public readonly Name: string)
    {
        super();
    }

    public override Invoke(target: Visual): void
    {
        target.GetNamedStoryboard(this.Name)?.Stop();
    }
}

// Suspend the named Storyboard without releasing its animation slots.
// The pinned animated values stay visible; subsequent ResumeStoryboard
// picks up where Pause left off.
export class PauseStoryboardAction extends TriggerAction
{
    public constructor(public readonly Name: string)
    {
        super();
    }

    public override Invoke(target: Visual): void
    {
        target.GetNamedStoryboard(this.Name)?.Pause();
    }
}

// Counterpart to PauseStoryboardAction. A no-op when the target named
// Storyboard isn't paused (or doesn't resolve).
export class ResumeStoryboardAction extends TriggerAction
{
    public constructor(public readonly Name: string)
    {
        super();
    }

    public override Invoke(target: Visual): void
    {
        target.GetNamedStoryboard(this.Name)?.Resume();
    }
}

// Routed-event-driven trigger. WPF EventTrigger analogue.
//
// `RoutedEvent` is a string identifying the event by NAME (e.g. 'Click').
// Visual.AddEventTrigger maps the name to the concrete subscription
// pathway:
//   * 'Click' — wires via Button.AddClickHandler. No-op on non-Button
//               Visuals (matches WPF — Click is a routed event but the
//               Style.TargetType usually narrows to ButtonBase descendants).
//   Other events (PointerDown / Loaded / etc.) are not yet supported;
//   adding them requires the corresponding AddXxxHandler entry point on
//   Visual or a target subclass — see Visual.AddEventTrigger.
//
// Actions are invoked in declaration order on every event fire — a
// per-Visual basis when a Style is applied to multiple Visuals, so two
// Buttons sharing the same EventTrigger each get their own action
// invocation when clicked.
export class EventTrigger
{
    public constructor(
        public readonly RoutedEvent: string,
        public readonly Actions:     readonly TriggerAction[],
    ) {}
}

// InvokeCommandAction — fires an ICommand when the parent EventTrigger
// fires. Authoring shape in `.mu`:
//
//   on Click   { InvokeCommand[Command=$SaveCommand] }
//   on Drop    { InvokeCommand[Command=$DropCommand] }
//   on KeyDown { InvokeCommand[Command=$KeyCommand] }
//
// Each invocation calls the supplied factory to resolve the current
// ICommand (so VM-side replacement of the command DP propagates), then
// calls Execute(args) with the routed-event args as the parameter.
// Receivers (a `RelayCommand` backed by a VM method) inspect `args` if
// they need event details (DragEventArgs.Effect, KeyEventArgs.Key, …).
//
// Factory-based rather than a captured ICommand reference for the
// same reason BeginStoryboardAction is factory-based — the command
// can be replaced on the VM after binding, and the action must see
// the live value.
export class InvokeCommandAction extends TriggerAction
{
    public readonly Factory: (target: Visual) => ICommand | undefined;

    public constructor(factory: (target: Visual) => ICommand | undefined)
    {
        super();
        this.Factory = factory;
    }

    public override Invoke(target: Visual, args?: unknown): void
    {
        const cmd = this.Factory(target);
        if (cmd === undefined) return;
        if (!cmd.CanExecute(args)) return;
        cmd.Execute(args);
    }
}
