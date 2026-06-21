// CommandsVM — exercises all three command surfaces (Menu, ToolBar,
// ContextMenu) over the diagram demo's NodeVM. Extends DiagramVM with:
//
//   * Alignment commands (AlignLeft / AlignTop / AlignRight / AlignBottom)
//     operating on whichever NodeVMs have IsSelected=true.
//   * Cut / Copy / Paste / Delete / Duplicate / SelectAll / Undo /
//     Redo  — RelayCommands that update the Status string. Real
//     clipboard / undo plumbing is out of scope; the demo's job is to
//     show that one ICommand instance drives the toolbar, the menu,
//     AND each node's context menu in lockstep.
//   * HasSelection — bool DP the bootstrap writes from the Diagram's
//     SelectionChanged event. The selection-gated commands' CanExecute
//     reads it; CanExecuteChanged pulses on every flip.
//
// Per-shape NodeVM subclasses (RectNodeVM / EllipseNodeVM / NoteNodeVM)
// live in THIS file rather than diagram-vm.mjs. The diagram demo moved
// to the full 35-shape M3 library; the commands demo keeps the original
// rect / ellipse / note triplet because its DataTemplates carry the
// per-node ContextMenu wiring — re-using the diagram demo's catalogue
// (which has no ContextMenu attached) would mean rewriting every shape
// template, and the commands demo's job is to exercise commands, not
// the shape catalogue. Standalone classes also keep DataTemplate
// dispatch clean: the two demos' templates never compete for the same
// DataType in the merged resource dictionary.

import {
    MetaData,
    Model,
    Color,
    RelayCommand,
} from '@visualisation-sub/mural/runtime';
import { SolidColorBrush } from '@visualisation-sub/mural/visual-engine';
import { DiagramVM, ShapeNodeVM } from '../diagram/diagram-vm.mjs';

// Re-export the base so commands.mjs's `instanceof NodeVM` check keeps
// reading from one place.
export { ShapeNodeVM as NodeVM };

const NODE_W = 130;
const NODE_H = 60;

const brush = (hex) => new SolidColorBrush(Color.FromHex(hex));
const BG_RECT    = brush('#bfdbfe');
const BG_ELLIPSE = brush('#bbf7d0');
const BG_NOTE    = brush('#fde68a');

// Per-kind NodeVM subclasses — pure DataType discriminators with default
// FillBrush / LabelText overrides so each kind drops onto the canvas
// pre-coloured.

export class RectNodeVM extends ShapeNodeVM {
    static Kind = 'rect';
    static {
        Model.OverrideMetadata(RectNodeVM, ShapeNodeVM.FillBrushKey, { default_value: BG_RECT });
        Model.OverrideMetadata(RectNodeVM, ShapeNodeVM.LabelTextKey, { default_value: 'Rectangle' });
    }
}

export class EllipseNodeVM extends ShapeNodeVM {
    static Kind = 'ellipse';
    static {
        Model.OverrideMetadata(EllipseNodeVM, ShapeNodeVM.FillBrushKey, { default_value: BG_ELLIPSE });
        Model.OverrideMetadata(EllipseNodeVM, ShapeNodeVM.LabelTextKey, { default_value: 'Ellipse' });
    }
}

export class NoteNodeVM extends ShapeNodeVM {
    static Kind = 'note';
    static {
        Model.OverrideMetadata(NoteNodeVM, ShapeNodeVM.FillBrushKey, { default_value: BG_NOTE });
        Model.OverrideMetadata(NoteNodeVM, ShapeNodeVM.LabelTextKey, { default_value: 'Note' });
    }
}

const CMD_KIND_TO_CLASS = {
    rect:    RectNodeVM,
    ellipse: EllipseNodeVM,
    note:    NoteNodeVM,
};

export class CommandsVM extends DiagramVM
{
    // All command surfaces in commands.mu bind via $-syntax
    // (DataContextBinding), which resolves through Model.HasProperty —
    // unregistered plain fields are invisible. Register every command
    // CommandsVM owns as a DP. The Align*Command names that DiagramVM
    // already registers are inherited; we override the VALUE in the
    // constructor through DiagramVM's typed keys, not the DP itself.
    static HasSelectionKey       = Model.RegisterProperty(CommandsVM, 'HasSelection',       false,     MetaData.None);
    static CutCommandKey         = Model.RegisterProperty(CommandsVM, 'CutCommand',         undefined, MetaData.None);
    static CopyCommandKey        = Model.RegisterProperty(CommandsVM, 'CopyCommand',        undefined, MetaData.None);
    static PasteCommandKey       = Model.RegisterProperty(CommandsVM, 'PasteCommand',       undefined, MetaData.None);
    static DeleteCommandKey      = Model.RegisterProperty(CommandsVM, 'DeleteCommand',      undefined, MetaData.None);
    static DuplicateCommandKey   = Model.RegisterProperty(CommandsVM, 'DuplicateCommand',   undefined, MetaData.None);
    static SelectAllCommandKey   = Model.RegisterProperty(CommandsVM, 'SelectAllCommand',   undefined, MetaData.None);
    static AlignBottomCommandKey = Model.RegisterProperty(CommandsVM, 'AlignBottomCommand', undefined, MetaData.None);
    static UndoCommandKey        = Model.RegisterProperty(CommandsVM, 'UndoCommand',        undefined, MetaData.None);
    static RedoCommandKey        = Model.RegisterProperty(CommandsVM, 'RedoCommand',        undefined, MetaData.None);

    constructor(storage) {
        super(storage);

        // setStatus is a tiny helper around the DiagramVM-inherited
        // Status DP — keeps the call sites below readable.
        const setStatus = (msg) => this.set_property_value(DiagramVM.StatusKey, msg);
        const selected = () => {
            const out = [];
            const nodes = this.Nodes;
            for (let i = 0; i < nodes.Count; i++) {
                const v = nodes.Get(i);
                if (v.IsSelected) out.push(v);
            }
            return out;
        };
        const hasSel = () => this.HasSelection;

        // ── Edit commands (selection-gated) ───────────────────────────
        this.set_property_value(CommandsVM.CutCommandKey, new RelayCommand(() => {
            const s = selected();
            this._clipboard = s.map((n) => ({ kind: n.Kind, left: n.Left, top: n.Top }));
            this.DeleteNodes(s);
            setStatus(`Cut ${s.length} node${s.length === 1 ? '' : 's'}.`);
        }, hasSel));
        this.set_property_value(CommandsVM.CopyCommandKey, new RelayCommand(() => {
            const s = selected();
            this._clipboard = s.map((n) => ({ kind: n.Kind, left: n.Left, top: n.Top }));
            setStatus(`Copied ${s.length} node${s.length === 1 ? '' : 's'}.`);
        }, hasSel));
        this.set_property_value(CommandsVM.PasteCommandKey, new RelayCommand(() => {
            const c = this._clipboard ?? [];
            for (const e of c) this.CreateNode(e.kind, e.left + 20, e.top + 20);
            setStatus(`Pasted ${c.length} node${c.length === 1 ? '' : 's'}.`);
        }, () => Array.isArray(this._clipboard) && this._clipboard.length > 0));
        this.set_property_value(CommandsVM.DeleteCommandKey, new RelayCommand(() => this.DeleteNodes(selected()), hasSel));
        this.set_property_value(CommandsVM.DuplicateCommandKey, new RelayCommand(() => {
            const s = selected();
            for (const n of s) this.CreateNode(n.Kind, n.Left + 24, n.Top + 24);
            setStatus(`Duplicated ${s.length} node${s.length === 1 ? '' : 's'}.`);
        }, hasSel));
        this.set_property_value(CommandsVM.SelectAllCommandKey, new RelayCommand(() => {
            const nodes = this.Nodes;
            for (let i = 0; i < nodes.Count; i++) nodes.Get(i).IsSelected = true;
            this.set_property_value(CommandsVM.HasSelectionKey, nodes.Count > 0);
            this._raiseGated();
            setStatus(`Selected ${nodes.Count} node${nodes.Count === 1 ? '' : 's'}.`);
        }));

        // ── Alignment commands ────────────────────────────────────────
        // AlignLeft / Right / Top / Middle / Center moved to the framework
        // Diagram control (Phase D of the diagram-control refactor). The
        // commands demo no longer overrides them — the framework's own
        // RelayCommands run, gated by `>= 2 IFigure-shaped items in
        // SelectedItems`. The proxy DPs on DiagramVM get populated from
        // the framework Diagram by the bootstrap at view-mount.
        //
        // AlignBottom stays here — the framework's align surface doesn't
        // include it (Top + Middle + bbox-relative-bottom-via-Middle
        // covers the common cases; demo needed the explicit bottom-edge
        // gesture for its toolbar parity with AlignTop).
        this.set_property_value(CommandsVM.AlignBottomCommandKey, new RelayCommand(() => this._align('bottom'), hasSel));

        // ── Stubs for surfaces that don't need real behaviour ─────────
        this.set_property_value(CommandsVM.UndoCommandKey, new RelayCommand(() => setStatus('Undo — no-op stub.')));
        this.set_property_value(CommandsVM.RedoCommandKey, new RelayCommand(() => setStatus('Redo — no-op stub.')));

        this._clipboard = [];
    }

    // Commands-local kind map — DiagramVM's KIND_TO_CLASS (the new 35-
    // shape catalogue with 'rectangle' / 'ellipse' / 'squircle' / …
    // kinds) doesn't carry the commands demo's 'rect' / 'ellipse' /
    // 'note' kinds. Override so vm.CreateNode('rect', …) materialises
    // the local RectNodeVM rather than null-returning.
    CreateNode(kind, left, top) {
        const Cls = CMD_KIND_TO_CLASS[kind];
        if (Cls === undefined) return null;
        const id = 'n' + this._nextId++;
        const node = new Cls(id, left, top);
        this.Nodes.Add(node);
        return node;
    }

    get HasSelection()       { return this.get_property_value(CommandsVM.HasSelectionKey); }
    set HasSelection(v)      { this.set_property_value(CommandsVM.HasSelectionKey, v); }
    get CutCommand()         { return this.get_property_value(CommandsVM.CutCommandKey); }
    get CopyCommand()        { return this.get_property_value(CommandsVM.CopyCommandKey); }
    get PasteCommand()       { return this.get_property_value(CommandsVM.PasteCommandKey); }
    get DeleteCommand()      { return this.get_property_value(CommandsVM.DeleteCommandKey); }
    get DuplicateCommand()   { return this.get_property_value(CommandsVM.DuplicateCommandKey); }
    get SelectAllCommand()   { return this.get_property_value(CommandsVM.SelectAllCommandKey); }
    get AlignBottomCommand() { return this.get_property_value(CommandsVM.AlignBottomCommandKey); }
    get UndoCommand()        { return this.get_property_value(CommandsVM.UndoCommandKey); }
    get RedoCommand()        { return this.get_property_value(CommandsVM.RedoCommandKey); }

    /** Bootstrap calls this when the Diagram's SelectionChanged fires.
     *  Flipping HasSelection re-pulses CanExecuteChanged on every
     *  selection-gated command so toolbar / menu / context-menu chrome
     *  refreshes in lockstep. */
    PublishSelectionState(hasSelection) {
        if (this.HasSelection === hasSelection) return;
        this.set_property_value(CommandsVM.HasSelectionKey, hasSelection);
        this._raiseGated();
    }

    _raiseGated() {
        // Only commands owned by CommandsVM — the inherited Align*
        // DPs are populated by the framework Diagram and the framework
        // raises their CanExecuteChanged on its own SelectionChanged
        // listener.
        for (const name of [
            'CutCommand', 'CopyCommand', 'DeleteCommand',
            'DuplicateCommand', 'AlignBottomCommand',
        ]) {
            this[name].RaiseCanExecuteChanged();
        }
        this.PasteCommand.RaiseCanExecuteChanged();
    }

    _align(mode) {
        const sel = [];
        const nodes = this.Nodes;
        for (let i = 0; i < nodes.Count; i++) {
            const v = nodes.Get(i);
            if (v.IsSelected) sel.push(v);
        }
        if (sel.length === 0) return;
        switch (mode) {
            case 'left':   { const min = Math.min(...sel.map((n) => n.Left));               for (const n of sel) n.Left = min;               break; }
            case 'right':  { const max = Math.max(...sel.map((n) => n.Left + NODE_W));      for (const n of sel) n.Left = max - NODE_W;      break; }
            case 'center': { const avg = sel.reduce((s, n) => s + n.Left + NODE_W / 2, 0) / sel.length; for (const n of sel) n.Left = avg - NODE_W / 2; break; }
            case 'top':    { const min = Math.min(...sel.map((n) => n.Top));                for (const n of sel) n.Top  = min;               break; }
            case 'bottom': { const max = Math.max(...sel.map((n) => n.Top + NODE_H));       for (const n of sel) n.Top  = max - NODE_H;      break; }
            case 'middle': { const avg = sel.reduce((s, n) => s + n.Top + NODE_H / 2, 0) / sel.length; for (const n of sel) n.Top  = avg - NODE_H / 2; break; }
        }
        this.set_property_value(DiagramVM.StatusKey, `Align ${mode}: ${sel.length} node${sel.length === 1 ? '' : 's'}.`);
    }
}
