import { Observable, type ICommand } from '../../runtime/index.js';
import { ButtonVariant } from '../buttons/button.js';

// One action in a Dialog's trailing action row — a small view-model the Dialog
// template renders as a Button through its DataTemplate. Dialog.Actions is an
// array of these; the template's ItemsControl binds to that array (control
// binding) and stamps one button per action.
//
// Derives from Observable (the lightweight INPC root): actions are simple,
// bindable state (a label, the command to run, the button variant), with no
// need for the dependency-property system.
export class DialogAction extends Observable
{
    private readonly _label:   string;
    private readonly _command: ICommand;
    private readonly _variant: ButtonVariant;

    // `variant` defaults to Text — the M3 dialog-action baseline. Pass Filled /
    // Tonal for the confirming (primary) action.
    public constructor(label: string, command: ICommand, variant: ButtonVariant = ButtonVariant.Text)
    {
        super();
        this._label   = label;
        this._command = command;
        this._variant = variant;
    }

    public get Label():   string        { return this._label; }
    public get Command(): ICommand      { return this._command; }
    public get Variant(): ButtonVariant { return this._variant; }
}
