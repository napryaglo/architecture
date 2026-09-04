// DialogDemoVM — backs the Dialog demo. The demo renders a Dialog surface
// INLINE in the example area (not on the OverlayLayer), so this VM only owns
// the interaction state the view binds to: whether the dialog is showing, and
// the last action the user chose. Derives from Observable (the lightweight INPC
// root) — no dependency properties are needed here, just bindable state.
import { Observable, RelayCommand } from '@pragmatic-tech-ai/mural/runtime';

export class DialogDemoVM extends Observable
{
    // Backing fields — plain state, surfaced through notifying accessors below.
    private _isOpen = true;
    private _result = 'No choice yet — the dialog is open.';

    // Commands are created once in the ctor; the view binds the action buttons
    // (Cancel / Delete) and the "Show dialog" trigger to them.
    private readonly _cancelCommand: RelayCommand;
    private readonly _deleteCommand: RelayCommand;
    private readonly _showCommand:   RelayCommand;

    public constructor()
    {
        super();
        this._cancelCommand = new RelayCommand(() => { this.Result = 'Cancelled — nothing was deleted.'; this.IsOpen = false; });
        this._deleteCommand = new RelayCommand(() => { this.Result = 'Deleted report.pdf.';               this.IsOpen = false; });
        this._showCommand   = new RelayCommand(() => { this.Result = 'No choice yet — the dialog is open.'; this.IsOpen = true; });
    }

    // Drives the inline Dialog's (and its backdrop's) Visibility through
    // `$IsOpen << ToVisibility`. Dismissing an action collapses both; "Show
    // dialog" brings them back — all without any popup / overlay mount.
    public get IsOpen(): boolean { return this._isOpen; }
    public set IsOpen(v: boolean)
    {
        if (this._isOpen === v) return;
        const old = this._isOpen;
        this._isOpen = v;
        this.RaisePropertyChanged('IsOpen', old, v);
    }

    // The last action the user took, shown in a read-out beneath the stage.
    public get Result(): string { return this._result; }
    public set Result(v: string)
    {
        if (this._result === v) return;
        const old = this._result;
        this._result = v;
        this.RaisePropertyChanged('Result', old, v);
    }

    public get CancelCommand(): RelayCommand { return this._cancelCommand; }
    public get DeleteCommand(): RelayCommand { return this._deleteCommand; }
    public get ShowCommand():   RelayCommand { return this._showCommand; }
}
