import {
    MetaData,
    Model,
    Visibility,
    Element, type PropertyDescriptor,
} from '../runtime/index.js';
import { resolveKey } from '../runtime/model-internals.js';
import { Brush, Pen } from '../visual-engine/index.js';
import { TemplatedControl } from '../basic/templated-control.js';
import { StackPanel } from '../basic/panels/stack-panel.js';
import { TextBlock } from '../basic/text-block.js';
import { FillEditor } from './fill-editor.js';
import { PenEditor } from './pen-editor.js';

// PowerPoint-style "Format Shape" pane — one column that combines the
// existing FillEditor (PowerPoint's "Fill" pane) and PenEditor
// (PowerPoint's "Line" pane). Two I/O DPs:
//
//   * Fill   — the shape's interior brush. Forwarded to PART_FillEditor.
//   * Stroke — the shape's outline Pen. Forwarded to PART_PenEditor.
//
// Both DPs are BindsTwoWayByDefault so a TwoWay binding on a consumer-
// side mirror DP (e.g., `DiagramVM.FormatFill`) round-trips edits made
// inside the inner editors back to the consumer without per-consumer
// listener plumbing.
//
// The two sub-editors are wired the same way PenEditor wires its own
// parts: a `_syncing` guard prevents the seed-and-echo loop where an
// external write into Fill / Stroke pushes onto the editor, the editor
// fires its own property change, and the listener re-writes the same
// value back upstream.
//
// Why two editors instead of one combined surface — FillEditor and
// PenEditor each carry a non-trivial state machine (variant tabs,
// body-template swapping, in-place Pen mutation). Composing the two
// keeps each editor's invariants intact and concentrates this control's
// responsibility on routing values between the consumer and the editors.
export class ShapeFormatControl extends TemplatedControl
{
    public static readonly FillKey   = Model.RegisterProperty<Brush | undefined>(
        ShapeFormatControl, 'Fill',   undefined,
        MetaData.None | MetaData.BindsTwoWayByDefault);
    public static readonly StrokeKey = Model.RegisterProperty<Pen | undefined>(
        ShapeFormatControl, 'Stroke', undefined,
        MetaData.None | MetaData.BindsTwoWayByDefault);

    public get Fill():   Brush | undefined  { return this.get_property_value(ShapeFormatControl.FillKey); }
    public set Fill(v:   Brush | undefined) { this.set_property_value(ShapeFormatControl.FillKey, v); }
    public get Stroke(): Pen | undefined    { return this.get_property_value(ShapeFormatControl.StrokeKey); }
    public set Stroke(v: Pen | undefined)   { this.set_property_value(ShapeFormatControl.StrokeKey, v); }

    static {
        Model.OverrideMetadata(ShapeFormatControl, Element.DefaultStyleKeyKey, { default_value: ShapeFormatControl });
    }

    private _syncing = false;
    private _fillEditor: FillEditor | undefined;
    private _penEditor:  PenEditor  | undefined;
    // Empty-state parts. When both Fill and Stroke are undefined (the
    // consumer's "no shape selected" signal) PART_Editors flips to
    // Visibility=Collapsed (zero slot, no paint, no hit) and
    // PART_EmptyMessage flips Visible. Symmetric flip when a brush
    // flows in.
    private _editors:        StackPanel | undefined;
    private _emptyMessage:   TextBlock  | undefined;
    private _partListeners: Array<() => void> = [];

    constructor()
    {
        super();
        this.applyDefaultStyle();
        this.adoptTemplateParts();
    }

    private adoptTemplateParts(): void
    {
        this._fillEditor = this.GetTemplateChild('PART_FillEditor') as FillEditor | undefined;
        this._penEditor  = this.GetTemplateChild('PART_PenEditor')  as PenEditor  | undefined;
        this._editors      = this.GetTemplateChild('PART_Editors')      as StackPanel | undefined;
        this._emptyMessage = this.GetTemplateChild('PART_EmptyMessage') as TextBlock  | undefined;
        this.refreshEmptyState();

        if (this._fillEditor !== undefined)
        {
            const fe = this._fillEditor;
            // Seed the editor with whatever the consumer pre-set on
            // Fill. Done under _syncing so the editor's own
            // OnPropertyChanged('Fill') round-trip is suppressed.
            this._syncing = true;
            try { fe.Fill = this.Fill; } finally { this._syncing = false; }
            const handler = (): void => {
                if (this._syncing) return;
                this._syncing = true;
                try { this.Fill = fe.Fill; } finally { this._syncing = false; }
            };
            const key = resolveKey(fe, undefined, 'Fill');
            fe.AddPropertyChangedListener(key, handler);
            this._partListeners.push(() => {
                fe.RemovePropertyChangedListener(key, handler);
            });
        }

        if (this._penEditor !== undefined)
        {
            const pe = this._penEditor;
            this._syncing = true;
            try { pe.Pen = this.Stroke; } finally { this._syncing = false; }
            const handler = (): void => {
                if (this._syncing) return;
                this._syncing = true;
                try { this.Stroke = pe.Pen; } finally { this._syncing = false; }
            };
            const key = resolveKey(pe, undefined, 'Pen');
            pe.AddPropertyChangedListener(key, handler);
            this._partListeners.push(() => {
                pe.RemovePropertyChangedListener(key, handler);
            });
        }
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue:   unknown,
        newValue:   unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Owner !== ShapeFormatControl) return;
        // Refresh empty-state on every Fill / Stroke write regardless of
        // _syncing — the consumer-side clear (Fill = undefined when no
        // shape is selected) is what flips the state.
        if (descriptor.Name === 'Fill' || descriptor.Name === 'Stroke')
        {
            this.refreshEmptyState();
        }
        if (this._syncing) return;
        // External writes (consumer set Fill / Stroke) → push the new
        // value into the matching editor under _syncing so the
        // editor's own property-change listener bails without echoing.
        this._syncing = true;
        try {
            switch (descriptor.Name)
            {
                case 'Fill':
                    if (this._fillEditor !== undefined) this._fillEditor.Fill = newValue as Brush | undefined;
                    break;
                case 'Stroke':
                    if (this._penEditor !== undefined)  this._penEditor.Pen   = newValue as Pen   | undefined;
                    break;
            }
        } finally { this._syncing = false; }
    }

    // Toggle PART_Editors / PART_EmptyMessage via the Visibility DP.
    // Both Fill and Stroke undefined → no shape is selected → collapse
    // the editor stack, reveal the placeholder. Either present → reveal
    // the editors, collapse the placeholder. Visibility=Collapsed zeroes
    // the DesiredSize and suppresses paint + hit-test in one shot — no
    // RemoveChild dance and no Height=0 leak.
    private refreshEmptyState(): void
    {
        const empty = this.Fill === undefined && this.Stroke === undefined;
        const editors = this._editors;
        if (editors !== undefined)
        {
            editors.Visibility = empty ? Visibility.Collapsed : Visibility.Visible;
        }
        const msg = this._emptyMessage;
        if (msg !== undefined)
        {
            msg.Visibility = empty ? Visibility.Visible : Visibility.Collapsed;
        }
    }
}
