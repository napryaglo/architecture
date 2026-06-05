import {
    MetaData,
    Model,
    Rect,
    Size,
    Thickness,
    VerticalAlignment,
    Visual,
    type DrawingContext,
    type KeyEventArgs,
} from '../runtime/index.js';
import type { Border } from './border.js';
import { ClickableBorder } from './combo-box.js';
import { defaultTemplate, ensureControlsTheme } from './default-resources.js';
import { TextBox } from './text-box.js';
import { Theme } from './theme.js';

// Resource-dictionary key — matches the `x:key` literal in
// controls.template.mu's DefaultSpinEdit entry.


// Numeric up/down editor — the WPF / DevExpress NumericUpDown analog.
// Composes an inner TextBox (single-line, holds the formatted display)
// with a right-edge column of ▴ / ▾ buttons that step the value by
// SmallChange. ArrowUp / ArrowDown reach the same path; PageUp /
// PageDown step by LargeChange.
//
// DPs:
//   Value         — the numeric value. Writes are clamped to
//                   [Minimum, Maximum]; NaN writes are rejected (the
//                   previous value is preserved).
//   Minimum       — lower bound (default -Number.MAX_VALUE — effectively
//                   unbounded).
//   Maximum       — upper bound (default +Number.MAX_VALUE).
//   SmallChange   — increment for the ▴/▾ buttons and Arrow keys
//                   (default 1).
//   LargeChange   — increment for PageUp / PageDown (default 10).
//   DecimalPlaces — display precision used by both formatting and
//                   commit-time rounding (default 0). The user can
//                   type extra decimals; the committed value is
//                   rounded to this precision before clamping.
//   IsReadOnly    — when true, every value-mutating path is gated:
//                   buttons, Arrow / Page keys, and Enter-commits of
//                   typed text. The inner TextBox is also flipped
//                   IsReadOnly so the user can't change its display.
//
// Text <-> Value protocol:
//   * Value→Text:  every Value change reformats and writes the inner
//                  TextBox's Text. Happens whether or not the user is
//                  mid-edit — a click on ▴ while the user has typed
//                  garbage commits the (clamped) Value and overwrites
//                  the in-progress garbage. WPF NumericUpDown does the
//                  same.
//   * Text→Value:  on COMMIT events only — the inner TextBox loses
//                  focus (blur), or the user presses Enter while
//                  focused. If the typed text parses to a finite
//                  number, Value is rounded-to-DecimalPlaces, clamped,
//                  and written; else Text reverts to the formatted
//                  current Value.
//
// Layout:
//
//   ┌────────────────┬─┐
//   │   42           │▴│
//   │                ├─┤
//   │                │▾│
//   └────────────────┴─┘
//
// The outer Border (PART_Border) is the field chrome; its BorderBrush
// reacts to the INNER TextBox's IsFocused / IsMouseOver flags so a
// click into the value text turns the outline blue (Material Outlined
// look). The inner TextBox's own Border is flipped to zero thickness
// at construction so the user sees one outline, not two concentric
// outlines.
export class SpinEdit extends Visual
{
    public static readonly ValueKey         = Model.RegisterProperty<number>( SpinEdit, 'Value',         0,                  MetaData.None);
    public static readonly MinimumKey       = Model.RegisterProperty<number>( SpinEdit, 'Minimum',       -Number.MAX_VALUE,  MetaData.None);
    public static readonly MaximumKey       = Model.RegisterProperty<number>( SpinEdit, 'Maximum',       Number.MAX_VALUE,   MetaData.None);
    public static readonly SmallChangeKey   = Model.RegisterProperty<number>( SpinEdit, 'SmallChange',   1,                  MetaData.None);
    public static readonly LargeChangeKey   = Model.RegisterProperty<number>( SpinEdit, 'LargeChange',   10,                 MetaData.None);
    public static readonly DecimalPlacesKey = Model.RegisterProperty<number>( SpinEdit, 'DecimalPlaces', 0,                  MetaData.None);
    public static readonly IsReadOnlyKey    = Model.RegisterProperty<boolean>(SpinEdit, 'IsReadOnly',    false,              MetaData.None);

    static {
        Model.OverrideMetadata(SpinEdit, Visual.DefaultStyleKeyKey, { default_value: SpinEdit });
        ensureControlsTheme();
    }

    // Template parts — all resolved from DefaultSpinEdit in the
    // controls theme.
    private readonly _border:     Border;
    private readonly _textBox:    TextBox;
    private readonly _upButton:   ClickableBorder;
    private readonly _downButton: ClickableBorder;

    // Cross-listener guard. When syncTextFromValue writes the inner
    // TextBox's Text DP, any Text → commit listener would otherwise
    // re-parse and try to set Value, looping. The guard short-circuits
    // commitText for the duration of the sync write.
    private _suppressTextSync = false;

    constructor()
    {
        super();

        const inst = defaultTemplate(SpinEdit).Apply(this);
        this._border     = inst.root as Border;
        this._textBox    = inst.root.FindName('PART_TextBox') as TextBox;
        this._upButton   = inst.root.FindName('PART_Up')      as ClickableBorder;
        this._downButton = inst.root.FindName('PART_Down')    as ClickableBorder;

        // Hide the inner TextBox's own border — the outer PART_Border
        // is THE visible field outline. TextBox.refreshChrome still
        // writes BorderBrush on focus / hover, but a thickness of zero
        // means those writes paint nothing.
        this._textBox.InnerBorder.BorderThickness = new Thickness(0);
        // Tighten the inner TextBox's vertical padding. The default
        // (12,8) is sized for a comfortable multi-line editor; in
        // SpinEdit's field-shaped chrome (~32 DIP tall by convention)
        // that padding leaves only ~14 DIP for an ~16.8 DIP line, which
        // makes the caret rect taller than the viewport — caret-into-
        // view would then jitter the editor's vertical offset on every
        // ▴ / ▾ click. Half the vertical padding gives the line real
        // headroom even in a 32-DIP chrome.
        this._textBox.InnerBorder.Padding = new Thickness(12, 4, 12, 4);
        // Centre the inner TextBox vertically in the DockPanel's
        // last-child slot. With default Stretch the TextBox fills the
        // full chrome height and its editor paints at the TOP of that
        // area — single-line value text would then sit glued to the
        // top instead of optically centred. Center mode arranges the
        // TextBox at its DesiredSize (one line + reduced padding),
        // centred vertically — text reads as centred in the field
        // regardless of how much taller the chrome is than the line.
        this._textBox.VerticalAlignment = VerticalAlignment.Center;

        this.AttachVisual(this._border);

        // ── Spin buttons ───────────────────────────────────────────
        // Commit the in-progress typed text first so the increment
        // applies on top of the user's intended value, not the prior
        // committed one. (Typing "3.14" then clicking ▴ with DP=0
        // becomes 3 → 4, not stale-value + 1.)
        this._upButton.onClick   = (): void => {
            this.commitText();
            this.step(+1, 'small');
        };
        this._downButton.onClick = (): void => {
            this.commitText();
            this.step(-1, 'small');
        };

        // ── Chrome reacts to the INNER TextBox's focus / hover ─────
        // SpinEdit itself isn't focusable — focus lives on the composed
        // TextBox. Drive the outer border brush off the TextBox's flags
        // so clicking into the value text turns the outline blue.
        const refreshChrome = (): void => {
            if (this._textBox.IsFocused)        this._border.BorderBrush = Theme.fieldBorderOpen;
            else if (this._textBox.IsMouseOver) this._border.BorderBrush = Theme.fieldText;
            else                                this._border.BorderBrush = Theme.fieldBorder;
        };
        this._textBox.AddPropertyChangedListener(Visual.IsFocusedKey,   refreshChrome);
        this._textBox.AddPropertyChangedListener(Visual.IsMouseOverKey, refreshChrome);
        refreshChrome();

        // ── Text <-> Value plumbing ─────────────────────────────────
        // Initial sync of the display from the default Value.
        this.syncTextFromValue();
        // Reformat the display on every Value change — button click,
        // arrow / Page key, programmatic write.
        this.AddPropertyChangedListener(SpinEdit.ValueKey, () => {
            this.syncTextFromValue();
        });
        // Blur commits whatever the user typed. The listener gets
        // (model, property, oldVal, newVal); we care only about
        // false→true transitions of IsFocused going OUT.
        this._textBox.AddPropertyChangedListener(Visual.IsFocusedKey,
            (_m, _p, _ov, nv) => {
                if (nv === false) this.commitText();
            });

        // ── IsReadOnly forwarding ───────────────────────────────────
        // Match the inner TextBox so the display can't be typed into
        // either. Forwarded on every change (incl. the initial value).
        this._textBox.IsReadOnly = this.IsReadOnly;
        this.AddPropertyChangedListener(SpinEdit.IsReadOnlyKey,
            (_m, _p, _ov, nv) => {
                this._textBox.IsReadOnly = nv as boolean;
            });
    }

    // ── Public DPs ─────────────────────────────────────────────────

    public get Value(): number { return this.get_property_value(SpinEdit.ValueKey); }
    public set Value(v: number)
    {
        const clamped = this.clamp(v);
        this.set_property_value(SpinEdit.ValueKey, clamped);
    }

    public get Minimum(): number { return this.get_property_value(SpinEdit.MinimumKey); }
    public set Minimum(v: number) { this.set_property_value(SpinEdit.MinimumKey, v); }
    public get Maximum(): number { return this.get_property_value(SpinEdit.MaximumKey); }
    public set Maximum(v: number) { this.set_property_value(SpinEdit.MaximumKey, v); }
    public get SmallChange(): number { return this.get_property_value(SpinEdit.SmallChangeKey); }
    public set SmallChange(v: number) { this.set_property_value(SpinEdit.SmallChangeKey, v); }
    public get LargeChange(): number { return this.get_property_value(SpinEdit.LargeChangeKey); }
    public set LargeChange(v: number) { this.set_property_value(SpinEdit.LargeChangeKey, v); }
    public get DecimalPlaces(): number { return this.get_property_value(SpinEdit.DecimalPlacesKey); }
    public set DecimalPlaces(v: number) { this.set_property_value(SpinEdit.DecimalPlacesKey, v); }
    public get IsReadOnly(): boolean { return this.get_property_value(SpinEdit.IsReadOnlyKey); }
    public set IsReadOnly(v: boolean) { this.set_property_value(SpinEdit.IsReadOnlyKey, v); }

    public override get visualChildren(): readonly Visual[] { return [this._border]; }

    protected override propagate_target_to_visual_children(): void
    {
        this._border['SetTarget'](this['target']);
    }

    protected override MeasureOverride(availableSize: Size): Size
    {
        this._border.Measure(availableSize);
        return this._border.DesiredSize;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        this._border.Arrange(new Rect(0, 0, finalSize.Width, finalSize.Height));
        return finalSize;
    }

    protected override RenderOverride(_dc: DrawingContext): void { /* template paints */ }

    // ── Keyboard ────────────────────────────────────────────────────
    //
    // Handled in the TUNNEL phase so we intercept Arrow / Page / Enter
    // BEFORE the focused inner TextBox processes them — TextBox's own
    // ArrowUp / ArrowDown would otherwise step the caret to start / end
    // of the single-line text, and Enter would bubble through.
    protected override OnPreviewKeyDown(args: KeyEventArgs): void
    {
        if (args.Handled) return;
        switch (args.Key)
        {
            case 'ArrowUp':
                if (!this.IsReadOnly) { this.commitText(); this.step(+1, 'small'); }
                args.Handled = true; return;
            case 'ArrowDown':
                if (!this.IsReadOnly) { this.commitText(); this.step(-1, 'small'); }
                args.Handled = true; return;
            case 'PageUp':
                if (!this.IsReadOnly) { this.commitText(); this.step(+1, 'large'); }
                args.Handled = true; return;
            case 'PageDown':
                if (!this.IsReadOnly) { this.commitText(); this.step(-1, 'large'); }
                args.Handled = true; return;
            case 'Enter':
                this.commitText();
                args.Handled = true; return;
        }
    }

    // ── Internals ──────────────────────────────────────────────────

    private step(direction: -1 | 1, mode: 'small' | 'large'): void
    {
        if (this.IsReadOnly) return;
        const delta = mode === 'large' ? this.LargeChange : this.SmallChange;
        this.Value = this.Value + direction * delta;
    }

    private clamp(v: number): number
    {
        // Reject NaN writes — keep the prior value. A consumer who binds
        // a TVM property to Value and lets it transiently become NaN
        // (intermediate parse, etc.) would otherwise corrupt SpinEdit's
        // state permanently.
        if (Number.isNaN(v)) return this.Value;
        return Math.max(this.Minimum, Math.min(this.Maximum, v));
    }

    private formatValue(v: number): string
    {
        // toFixed handles negative / zero / very small values uniformly;
        // floor() guards against a fractional DecimalPlaces write from
        // upstream binding.
        const dp = Math.max(0, Math.floor(this.DecimalPlaces));
        return v.toFixed(dp);
    }

    private parseValue(text: string): number | undefined
    {
        const trimmed = text.trim();
        if (trimmed.length === 0) return undefined;
        // Number() accepts JS number literals (incl. "1e3", "Infinity").
        // The finite check rejects Infinity / NaN — both of which would
        // corrupt the clamped value path downstream.
        const n = Number(trimmed);
        if (!Number.isFinite(n)) return undefined;
        return n;
    }

    private syncTextFromValue(): void
    {
        this._suppressTextSync = true;
        this._textBox.Text = this.formatValue(this.Value);
        this._suppressTextSync = false;
    }

    private commitText(): void
    {
        // Re-entry guard: when syncTextFromValue writes Text, any
        // hypothetical Text-listener chain that called back into
        // commitText would loop on the very same TextBox.Text we just
        // assigned. Real Text changes (user typing) flow through
        // unaffected.
        if (this._suppressTextSync) return;
        const parsed = this.parseValue(this._textBox.Text);
        if (parsed === undefined)
        {
            // Invalid text — restore display from current Value.
            this.syncTextFromValue();
            return;
        }
        // Round to DP precision BEFORE clamping so user "1.999" with
        // DecimalPlaces=0 commits as 2 (the rounded value), then is
        // clamped against Min/Max. Reverse order would clamp 1.999
        // first then round, which produces the same number here but
        // misbehaves at the bounds (1.999 at Maximum=1 would round to
        // 2 after clamping to 1 — silly).
        const dp = Math.max(0, Math.floor(this.DecimalPlaces));
        const factor = Math.pow(10, dp);
        const rounded = Math.round(parsed * factor) / factor;
        this.Value = rounded;
        // Always re-sync — even if Value didn't change. (Example:
        // current Value=2 with DP=0, user types "2.0" and blurs.
        // parseValue → 2, set Value=2 → no PropertyChanged → no
        // syncTextFromValue listener → Text stays "2.0". We want "2".)
        this.syncTextFromValue();
    }
}
