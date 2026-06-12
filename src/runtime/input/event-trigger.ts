import type { Visual } from '../visual.js';
import { TriggerAction } from '../trigger-actions.js';
import type { ICommand } from './command.js';

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
