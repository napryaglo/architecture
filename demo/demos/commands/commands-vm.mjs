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
    // constructor via _set_property_value_by_name, not the DP itself.
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

        const set = (name, value) => this._set_property_value_by_name(name, value);
        const setStatus = (msg) => set('Status', msg);
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
        set('CutCommand', new RelayCommand(() => {
            const s = selected();
            this._clipboard = s.map((n) => ({ kind: n.Kind, x: n.X, y: n.Y }));
            this.DeleteNodes(s);
            setStatus(`Cut ${s.length} node${s.length === 1 ? '' : 's'}.`);
        }, hasSel));
        set('CopyCommand', new RelayCommand(() => {
            const s = selected();
            this._clipboard = s.map((n) => ({ kind: n.Kind, x: n.X, y: n.Y }));
            setStatus(`Copied ${s.length} node${s.length === 1 ? '' : 's'}.`);
        }, hasSel));
        set('PasteCommand', new RelayCommand(() => {
            const c = this._clipboard ?? [];
            for (const e of c) this.CreateNode(e.kind, e.x + 20, e.y + 20);
            setStatus(`Pasted ${c.length} node${c.length === 1 ? '' : 's'}.`);
        }, () => Array.isArray(this._clipboard) && this._clipboard.length > 0));
        set('DeleteCommand', new RelayCommand(() => this.DeleteNodes(selected()), hasSel));
        set('DuplicateCommand', new RelayCommand(() => {
            const s = selected();
            for (const n of s) this.CreateNode(n.Kind, n.X + 24, n.Y + 24);
            setStatus(`Duplicated ${s.length} node${s.length === 1 ? '' : 's'}.`);
        }, hasSel));
        set('SelectAllCommand', new RelayCommand(() => {
            const nodes = this.Nodes;
            for (let i = 0; i < nodes.Count; i++) nodes.Get(i).IsSelected = true;
            set('HasSelection', nodes.Count > 0);
            this._raiseGated();
            setStatus(`Selected ${nodes.Count} node${nodes.Count === 1 ? '' : 's'}.`);
        }));

        // ── Alignment commands ────────────────────────────────────────
        // X-axis: LEFT edge for AlignLeft, CENTRE for AlignCenter, RIGHT
        // edge for AlignRight. Y-axis follows the same shape. The
        // DiagramVM-inherited Align* DPs already exist with their own
        // values; assigning via `this.X = …` would hit the prototype
        // getter (no setter) and throw. _set_property_value_by_name
        // pushes our flavour into the same DP slot.
        set('AlignLeftCommand',   new RelayCommand(() => this._align('left'),   hasSel));
        set('AlignCenterCommand', new RelayCommand(() => this._align('center'), hasSel));
        set('AlignRightCommand',  new RelayCommand(() => this._align('right'),  hasSel));
        set('AlignTopCommand',    new RelayCommand(() => this._align('top'),    hasSel));
        set('AlignMiddleCommand', new RelayCommand(() => this._align('middle'), hasSel));
        set('AlignBottomCommand', new RelayCommand(() => this._align('bottom'), hasSel));

        // ── Stubs for surfaces that don't need real behaviour ─────────
        set('UndoCommand', new RelayCommand(() => setStatus('Undo — no-op stub.')));
        set('RedoCommand', new RelayCommand(() => setStatus('Redo — no-op stub.')));

        this._clipboard = [];
    }

    // Commands-local kind map — DiagramVM's KIND_TO_CLASS (the new 35-
    // shape catalogue with 'rectangle' / 'ellipse' / 'squircle' / …
    // kinds) doesn't carry the commands demo's 'rect' / 'ellipse' /
    // 'note' kinds. Override so vm.CreateNode('rect', …) materialises
    // the local RectNodeVM rather than null-returning.
    CreateNode(kind, x, y) {
        const Cls = CMD_KIND_TO_CLASS[kind];
        if (Cls === undefined) return null;
        const id = 'n' + this._nextId++;
        const node = new Cls(id, x, y);
        this.Nodes.Add(node);
        return node;
    }

    get HasSelection()       { return this._get_property_value_by_name('HasSelection'); }
    get CutCommand()         { return this._get_property_value_by_name('CutCommand'); }
    get CopyCommand()        { return this._get_property_value_by_name('CopyCommand'); }
    get PasteCommand()       { return this._get_property_value_by_name('PasteCommand'); }
    get DeleteCommand()      { return this._get_property_value_by_name('DeleteCommand'); }
    get DuplicateCommand()   { return this._get_property_value_by_name('DuplicateCommand'); }
    get SelectAllCommand()   { return this._get_property_value_by_name('SelectAllCommand'); }
    get AlignBottomCommand() { return this._get_property_value_by_name('AlignBottomCommand'); }
    get UndoCommand()        { return this._get_property_value_by_name('UndoCommand'); }
    get RedoCommand()        { return this._get_property_value_by_name('RedoCommand'); }

    /** Bootstrap calls this when the Diagram's SelectionChanged fires.
     *  Flipping HasSelection re-pulses CanExecuteChanged on every
     *  selection-gated command so toolbar / menu / context-menu chrome
     *  refreshes in lockstep. */
    PublishSelectionState(hasSelection) {
        if (this.HasSelection === hasSelection) return;
        this._set_property_value_by_name('HasSelection', hasSelection);
        this._raiseGated();
    }

    _raiseGated() {
        for (const name of [
            'CutCommand', 'CopyCommand', 'DeleteCommand',
            'DuplicateCommand', 'AlignLeftCommand', 'AlignCenterCommand',
            'AlignRightCommand', 'AlignTopCommand', 'AlignMiddleCommand',
            'AlignBottomCommand',
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
            case 'left':   { const min = Math.min(...sel.map((n) => n.X)); for (const n of sel) n.X = min; break; }
            case 'right':  { const max = Math.max(...sel.map((n) => n.X + NODE_W)); for (const n of sel) n.X = max - NODE_W; break; }
            case 'center': { const avg = sel.reduce((s, n) => s + n.X + NODE_W / 2, 0) / sel.length; for (const n of sel) n.X = avg - NODE_W / 2; break; }
            case 'top':    { const min = Math.min(...sel.map((n) => n.Y)); for (const n of sel) n.Y = min; break; }
            case 'bottom': { const max = Math.max(...sel.map((n) => n.Y + NODE_H)); for (const n of sel) n.Y = max - NODE_H; break; }
            case 'middle': { const avg = sel.reduce((s, n) => s + n.Y + NODE_H / 2, 0) / sel.length; for (const n of sel) n.Y = avg - NODE_H / 2; break; }
        }
        this._set_property_value_by_name('Status', `Align ${mode}: ${sel.length} node${sel.length === 1 ? '' : 's'}.`);
    }
}
