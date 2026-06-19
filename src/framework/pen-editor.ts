import {
    MetaData,
    Model,
    Visibility,
    Visual,
    type PropertyDescriptor,
} from '../runtime/index.js';
import { resolveKey } from '../runtime/model-internals.js';
import {
    Brush,
    DashStyle,
    LineCap,
    LineJoin,
    Pen,
} from '../visual-engine/index.js';
import { TemplatedControl } from '../basic/templated-control.js';
import { Slider } from '../basic/slider.js';
import { TextBlock } from '../basic/text-block.js';
import { BrushPicker } from './brush-picker.js';
import { ComboBox } from './list/combo-box.js';

// Label/value record fed into PART_Dash / PART_Cap / PART_Join. The
// ComboBox uses DisplayMemberPath="Label" so the dropdown reads as
// human text; the editor reads .Value back to push the enum / DashStyle
// onto the bound Pen.
interface OptionItem<T>
{
    readonly Label: string;
    readonly Value: T;
}

const DASH_OPTIONS: ReadonlyArray<OptionItem<DashStyle>> = Object.freeze([
    { Label: '── Solid',         Value: DashStyle.Solid      },
    { Label: '─ ─ Dash',         Value: DashStyle.Dash       },
    { Label: '· · Dot',          Value: DashStyle.Dot        },
    { Label: '─·─· Dash-Dot',    Value: DashStyle.DashDot    },
    { Label: '─··─·· Dash-Dot-Dot', Value: DashStyle.DashDotDot },
]);

const CAP_OPTIONS: ReadonlyArray<OptionItem<LineCap>> = Object.freeze([
    { Label: 'Flat',   Value: LineCap.Flat   },
    { Label: 'Round',  Value: LineCap.Round  },
    { Label: 'Square', Value: LineCap.Square },
]);

const JOIN_OPTIONS: ReadonlyArray<OptionItem<LineJoin>> = Object.freeze([
    { Label: 'Miter', Value: LineJoin.Miter },
    { Label: 'Round', Value: LineJoin.Round },
    { Label: 'Bevel', Value: LineJoin.Bevel },
]);

// Inline-expanded Pen editor, PowerPoint-style. One column of labelled
// rows: brush (via BrushPicker), thickness slider, dash dropdown, cap
// dropdown, join dropdown, miter-limit slider (visibility-gated on
// Join = Miter).
//
// Source-of-truth contract: `Pen` is the I/O DP. Every sub-editor DP
// (Brush / Thickness / DashStyle / LineCap / LineJoin / MiterLimit) is
// a flat mirror; OnPropertyChanged on any of them pushes the value
// onto the bound Pen instance. Conversely, when an external write sets
// Pen, OnPropertyChanged decomposes it into the mirror DPs so the
// inline chrome reflects the new pen.
//
// The Pen instance is mutated in place rather than replaced — Shape
// holds a reference to the Pen on its Stroke DP, and a wholesale Pen
// swap would force a render re-resolution via property change. In-place
// mutation lets the property-listener machinery on Pen.* drive
// invalidation directly, matching how Pen is meant to flow through the
// system (a long-lived Brush-with-extras).
export class PenEditor extends TemplatedControl
{
    public static readonly PenKey       = Model.RegisterProperty<Pen | undefined>(PenEditor, 'Pen',         undefined, MetaData.None | MetaData.BindsTwoWayByDefault);
    public static readonly BrushKey     = Model.RegisterProperty<Brush | undefined>(PenEditor, 'Brush',     undefined, MetaData.None);
    public static readonly ThicknessKey = Model.RegisterProperty<number>(           PenEditor, 'Thickness', 1,         MetaData.None);
    public static readonly DashStyleKey = Model.RegisterProperty<DashStyle>(        PenEditor, 'DashStyle', DashStyle.Solid, MetaData.None);
    public static readonly LineCapKey   = Model.RegisterProperty<LineCap>(          PenEditor, 'LineCap',   LineCap.Flat,    MetaData.None);
    public static readonly LineJoinKey  = Model.RegisterProperty<LineJoin>(         PenEditor, 'LineJoin',  LineJoin.Miter,  MetaData.None);
    public static readonly MiterLimitKey= Model.RegisterProperty<number>(           PenEditor, 'MiterLimit',10,              MetaData.None);

    public get Pen():        Pen | undefined   { return this.get_property_value(PenEditor.PenKey); }
    public set Pen(v:        Pen | undefined)  { this.set_property_value(PenEditor.PenKey, v); }
    public get Brush():      Brush | undefined { return this.get_property_value(PenEditor.BrushKey); }
    public set Brush(v:      Brush | undefined){ this.set_property_value(PenEditor.BrushKey, v); }
    public get Thickness():  number    { return this.get_property_value(PenEditor.ThicknessKey); }
    public set Thickness(v:  number)   { this.set_property_value(PenEditor.ThicknessKey, v); }
    public get DashStyle():  DashStyle { return this.get_property_value(PenEditor.DashStyleKey); }
    public set DashStyle(v:  DashStyle){ this.set_property_value(PenEditor.DashStyleKey, v); }
    public get LineCap():    LineCap   { return this.get_property_value(PenEditor.LineCapKey); }
    public set LineCap(v:    LineCap)  { this.set_property_value(PenEditor.LineCapKey, v); }
    public get LineJoin():   LineJoin  { return this.get_property_value(PenEditor.LineJoinKey); }
    public set LineJoin(v:   LineJoin) { this.set_property_value(PenEditor.LineJoinKey, v); }
    public get MiterLimit(): number    { return this.get_property_value(PenEditor.MiterLimitKey); }
    public set MiterLimit(v: number)   { this.set_property_value(PenEditor.MiterLimitKey, v); }

    static {
        Model.OverrideMetadata(PenEditor, Visual.DefaultStyleKeyKey, { default_value: PenEditor });
    }

    private _syncing = false;
    // Per-instance listener bound to the current Pen's property
    // changes. Re-installed in seedFromPen so a Pen swap detaches the
    // listener from the prior Pen and attaches a fresh one.
    private _penListeners: Array<() => void> = [];
    private _brushPicker:     BrushPicker | undefined;
    private _thicknessSlider: Slider      | undefined;
    private _thicknessRead:   TextBlock   | undefined;
    private _dashCombo:       ComboBox    | undefined;
    private _capCombo:        ComboBox    | undefined;
    private _joinCombo:       ComboBox    | undefined;
    private _miterSlider:     Slider      | undefined;
    private _miterRead:       TextBlock   | undefined;
    // Miter row's label + editor are toggled together; with both cells
    // in the row Visibility=Collapsed, the Grid's Auto-sized row height
    // contracts to 0 and the row visually disappears.
    private _miterLabel:      TextBlock   | undefined;
    private _partListeners: Array<() => void> = [];

    constructor()
    {
        super();
        this.applyDefaultStyle();
        this.adoptTemplateParts();
        // If a Pen was set via the consumer's pre-construction wiring
        // (rare — usually arrives later via binding) reflect it now;
        // otherwise the binding-driven Pen change will trigger
        // seedFromPen via OnPropertyChanged.
        if (this.Pen !== undefined) this.seedFromPen(this.Pen);
        this.refreshMiterRowVisibility();
    }

    private adoptTemplateParts(): void
    {
        this._brushPicker     = this.GetTemplateChild('PART_BrushPicker')      as BrushPicker | undefined;
        this._thicknessSlider = this.GetTemplateChild('PART_Thickness')        as Slider      | undefined;
        this._thicknessRead   = this.GetTemplateChild('PART_ThicknessReadout') as TextBlock   | undefined;
        this._dashCombo       = this.GetTemplateChild('PART_Dash')             as ComboBox    | undefined;
        this._capCombo        = this.GetTemplateChild('PART_Cap')              as ComboBox    | undefined;
        this._joinCombo       = this.GetTemplateChild('PART_Join')             as ComboBox    | undefined;
        this._miterSlider     = this.GetTemplateChild('PART_MiterLimit')       as Slider      | undefined;
        this._miterRead       = this.GetTemplateChild('PART_MiterReadout')     as TextBlock   | undefined;
        this._miterLabel      = this.GetTemplateChild('PART_MiterLabel')       as TextBlock   | undefined;

        // Items population for the comboboxes. ComboBox.Items defaults
        // to undefined; setting an array here lets the picker drive its
        // own template's dropdown content without forcing the consumer
        // to supply DashOptions / CapOptions / JoinOptions.
        if (this._dashCombo !== undefined) this._dashCombo.Items = DASH_OPTIONS as ReadonlyArray<unknown> as unknown[];
        if (this._capCombo  !== undefined) this._capCombo.Items  = CAP_OPTIONS  as ReadonlyArray<unknown> as unknown[];
        if (this._joinCombo !== undefined) this._joinCombo.Items = JOIN_OPTIONS as ReadonlyArray<unknown> as unknown[];

        // BrushPicker: two-way wire to PenEditor.Brush.
        if (this._brushPicker !== undefined)
        {
            const bp = this._brushPicker;
            this._syncing = true;
            try { bp.Brush = this.Brush; } finally { this._syncing = false; }
            const handler = (): void => {
                if (this._syncing) return;
                this._syncing = true;
                try { this.Brush = bp.Brush; } finally { this._syncing = false; }
                this.pushToPen('Brush');
            };
            const key = resolveKey(bp, undefined, 'Brush');
            bp.AddPropertyChangedListener(key, handler);
            this._partListeners.push(() => {
                bp.RemovePropertyChangedListener(key, handler);
            });
        }

        const wireSlider = (
            slider: Slider | undefined,
            readout: TextBlock | undefined,
            initial: number,
            pushMirror: (v: number) => void,
            formatReadout: (v: number) => string,
            pushPen: () => void,
        ): void => {
            if (slider === undefined) return;
            this._syncing = true;
            try { slider.Value = initial; } finally { this._syncing = false; }
            if (readout !== undefined) readout.Text = formatReadout(initial);
            const handler = (): void => {
                if (readout !== undefined) readout.Text = formatReadout(slider.Value);
                if (this._syncing) return;
                this._syncing = true;
                try { pushMirror(slider.Value); } finally { this._syncing = false; }
                pushPen();
            };
            const key = resolveKey(slider, undefined, 'Value');
            slider.AddPropertyChangedListener(key, handler);
            this._partListeners.push(() => {
                slider.RemovePropertyChangedListener(key, handler);
            });
        };

        wireSlider(
            this._thicknessSlider, this._thicknessRead, this.Thickness,
            v => { this.Thickness = v; },
            v => `${formatNum(v)} px`,
            () => this.pushToPen('Thickness'),
        );
        wireSlider(
            this._miterSlider, this._miterRead, this.MiterLimit,
            v => { this.MiterLimit = v; },
            v => `${formatNum(v)}`,
            () => this.pushToPen('MiterLimit'),
        );

        const wireOptionCombo = <T>(
            combo: ComboBox | undefined,
            options: ReadonlyArray<OptionItem<T>>,
            initial: T,
            equals: (a: T, b: T) => boolean,
            pushMirror: (v: T) => void,
            pushPen: () => void,
        ): void => {
            if (combo === undefined) return;
            const found = options.find(o => equals(o.Value, initial));
            this._syncing = true;
            try { combo.SelectedItem = found ?? options[0]; } finally { this._syncing = false; }
            const handler = (): void => {
                if (this._syncing) return;
                const sel = combo.SelectedItem as OptionItem<T> | undefined;
                if (sel === undefined) return;
                this._syncing = true;
                try { pushMirror(sel.Value); } finally { this._syncing = false; }
                pushPen();
            };
            const key = resolveKey(combo, undefined, 'SelectedItem');
            combo.AddPropertyChangedListener(key, handler);
            this._partListeners.push(() => {
                combo.RemovePropertyChangedListener(key, handler);
            });
        };

        wireOptionCombo(
            this._dashCombo, DASH_OPTIONS, this.DashStyle,
            (a, b) => a.Equals(b),
            v => { this.DashStyle = v; },
            () => this.pushToPen('DashStyle'),
        );
        wireOptionCombo(
            this._capCombo, CAP_OPTIONS, this.LineCap,
            (a, b) => a === b,
            v => { this.LineCap = v; },
            () => this.pushToPen('LineCap'),
        );
        wireOptionCombo(
            this._joinCombo, JOIN_OPTIONS, this.LineJoin,
            (a, b) => a === b,
            v => { this.LineJoin = v; },
            () => this.pushToPen('LineJoin'),
        );
    }

    // Push a single mirror DP's value onto the bound Pen. Centralised so
    // the part-listener wiring stays terse — each handler just states
    // which DP it updates and we look up the pen-side property here.
    private pushToPen(name: string): void
    {
        const pen = this.Pen;
        if (pen === undefined) return;
        this._syncing = true;
        try {
            switch (name)
            {
                case 'Brush':      pen.Brush      = this.Brush;      break;
                case 'Thickness':  pen.Thickness  = this.Thickness;  break;
                case 'DashStyle':  pen.DashStyle  = this.DashStyle;  break;
                case 'LineCap':    pen.LineCap    = this.LineCap;    break;
                case 'LineJoin':   pen.LineJoin   = this.LineJoin;   break;
                case 'MiterLimit': pen.MiterLimit = this.MiterLimit; break;
            }
        } finally { this._syncing = false; }
    }

    // MiterLimit is only meaningful when Join = Miter; flip BOTH the
    // miter row's label and editor to Collapsed otherwise. With both
    // children of an Auto-sized Grid row hidden, the row's max-child
    // height is 0 and the row contracts away — no manual margin
    // caching, no leftover gap.
    private refreshMiterRowVisibility(): void
    {
        const vis = this.LineJoin === LineJoin.Miter
            ? Visibility.Visible
            : Visibility.Collapsed;
        if (this._miterLabel  !== undefined) this._miterLabel.Visibility  = vis;
        if (this._miterSlider !== undefined) this._miterSlider.Visibility = vis;
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue:   unknown,
        newValue:   unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Owner !== PenEditor) return;
        const name = descriptor.Name;

        if (name === 'Pen')
        {
            this.detachPenListeners();
            if (newValue !== undefined) this.seedFromPen(newValue as Pen);
            return;
        }

        // Mirror DP change → push to template parts AND to the bound
        // Pen. The pushXxxToPart writes are guarded by _syncing so
        // listener callbacks on the part bail without re-firing.
        if (name === 'LineJoin') this.refreshMiterRowVisibility();

        this.pushMirrorToParts(name);

        if (this._syncing) return;
        // Mirror DP write → push onto the bound Pen. If no Pen is bound
        // the write is a no-op (the consumer hasn't given us a pen to
        // edit). We deliberately don't auto-construct a Pen here —
        // doing so would leak ownership: the editor would hand back a
        // pen the consumer never asked for. Bind a Pen first.
        const pen = this.Pen;
        if (pen === undefined) return;
        this._syncing = true;
        try {
            switch (name)
            {
                case 'Brush':      pen.Brush      = newValue as Brush | undefined; break;
                case 'Thickness':  pen.Thickness  = newValue as number;            break;
                case 'DashStyle':  pen.DashStyle  = newValue as DashStyle;         break;
                case 'LineCap':    pen.LineCap    = newValue as LineCap;           break;
                case 'LineJoin':   pen.LineJoin   = newValue as LineJoin;          break;
                case 'MiterLimit': pen.MiterLimit = newValue as number;            break;
            }
        } finally { this._syncing = false; }
    }

    // Push the mirror DP's current value into the matching template
    // part. Called whenever the mirror DP changes regardless of source
    // (consumer write, Pen-listener-driven seed, or part-listener
    // round-trip). Guarded by _syncing so the resulting Value change
    // listener bails without flipping the mirror DP again.
    private pushMirrorToParts(name: string): void
    {
        this._syncing = true;
        try {
            switch (name)
            {
                case 'Brush':
                    if (this._brushPicker !== undefined) this._brushPicker.Brush = this.Brush;
                    break;
                case 'Thickness':
                    if (this._thicknessSlider !== undefined) this._thicknessSlider.Value = this.Thickness;
                    if (this._thicknessRead   !== undefined) this._thicknessRead.Text    = `${formatNum(this.Thickness)} px`;
                    break;
                case 'DashStyle':
                    if (this._dashCombo !== undefined)
                    {
                        const cur = this.DashStyle;
                        const found = DASH_OPTIONS.find(o => o.Value.Equals(cur));
                        if (found !== undefined) this._dashCombo.SelectedItem = found;
                    }
                    break;
                case 'LineCap':
                    if (this._capCombo !== undefined)
                    {
                        const found = CAP_OPTIONS.find(o => o.Value === this.LineCap);
                        if (found !== undefined) this._capCombo.SelectedItem = found;
                    }
                    break;
                case 'LineJoin':
                    if (this._joinCombo !== undefined)
                    {
                        const found = JOIN_OPTIONS.find(o => o.Value === this.LineJoin);
                        if (found !== undefined) this._joinCombo.SelectedItem = found;
                    }
                    break;
                case 'MiterLimit':
                    if (this._miterSlider !== undefined) this._miterSlider.Value = this.MiterLimit;
                    if (this._miterRead   !== undefined) this._miterRead.Text    = `${formatNum(this.MiterLimit)}`;
                    break;
            }
        } finally { this._syncing = false; }
    }

    // Seed mirror DPs from a Pen and subscribe to its property changes
    // so external mutations of the bound Pen (e.g., another control
    // editing the same instance) flow into our chrome.
    private seedFromPen(pen: Pen): void
    {
        this._syncing = true;
        try {
            this.Brush      = pen.Brush;
            this.Thickness  = pen.Thickness;
            this.DashStyle  = pen.DashStyle;
            this.LineCap    = pen.LineCap;
            this.LineJoin   = pen.LineJoin;
            this.MiterLimit = pen.MiterLimit;
        } finally { this._syncing = false; }

        const wire = (prop: string, apply: () => void): void => {
            const handler = (): void => {
                if (this._syncing) return;
                this._syncing = true;
                try { apply(); }
                finally { this._syncing = false; }
            };
            const key = resolveKey(pen, undefined, prop);
            pen.AddPropertyChangedListener(key, handler);
            this._penListeners.push(() => {
                pen.RemovePropertyChangedListener(key, handler);
            });
        };
        wire('Brush',      () => { this.Brush      = pen.Brush; });
        wire('Thickness',  () => { this.Thickness  = pen.Thickness; });
        wire('DashStyle',  () => { this.DashStyle  = pen.DashStyle; });
        wire('LineCap',    () => { this.LineCap    = pen.LineCap; });
        wire('LineJoin',   () => { this.LineJoin   = pen.LineJoin; });
        wire('MiterLimit', () => { this.MiterLimit = pen.MiterLimit; });
    }

    private detachPenListeners(): void
    {
        for (const dispose of this._penListeners) dispose();
        this._penListeners = [];
    }
}

// Trim trailing zeros for the readout — `1.0 px` reads as if precision
// matters; `1 px` reads cleanly. Single decimal place when the value
// has a fractional component, otherwise an integer.
function formatNum(value: number): string
{
    if (Math.abs(value - Math.round(value)) < 1e-6) return String(Math.round(value));
    return value.toFixed(1);
}
