// DialogDemoVM — backs the Dialog demo. The demo renders a Dialog surface
// INLINE in the example area (not on the OverlayLayer), so this VM only owns
// the interaction state the view binds to: whether the dialog is showing, and
// the last action the user chose. Derives from Observable (the lightweight INPC
// root) — no dependency properties are needed here, just bindable state.
import { Observable, RelayCommand } from '@pragmatic-tech-ai/mural/runtime';
export class DialogDemoVM extends Observable {
    // Backing fields — plain state, surfaced through notifying accessors below.
    _isOpen = true;
    _result = 'No choice yet — the dialog is open.';
    // Commands are created once in the ctor; the view binds the action buttons
    // (Cancel / Delete) and the "Show dialog" trigger to them.
    _cancelCommand;
    _deleteCommand;
    _showCommand;
    constructor() {
        super();
        this._cancelCommand = new RelayCommand(() => { this.Result = 'Cancelled — nothing was deleted.'; this.IsOpen = false; });
        this._deleteCommand = new RelayCommand(() => { this.Result = 'Deleted report.pdf.'; this.IsOpen = false; });
        this._showCommand = new RelayCommand(() => { this.Result = 'No choice yet — the dialog is open.'; this.IsOpen = true; });
    }
    // Drives the inline Dialog's (and its backdrop's) Visibility through
    // `$IsOpen << ToVisibility`. Dismissing an action collapses both; "Show
    // dialog" brings them back — all without any popup / overlay mount.
    get IsOpen() { return this._isOpen; }
    set IsOpen(v) {
        if (this._isOpen === v)
            return;
        const old = this._isOpen;
        this._isOpen = v;
        this.RaisePropertyChanged('IsOpen', old, v);
    }
    // The last action the user took, shown in a read-out beneath the stage.
    get Result() { return this._result; }
    set Result(v) {
        if (this._result === v)
            return;
        const old = this._result;
        this._result = v;
        this.RaisePropertyChanged('Result', old, v);
    }
    get CancelCommand() { return this._cancelCommand; }
    get DeleteCommand() { return this._deleteCommand; }
    get ShowCommand() { return this._showCommand; }
}
