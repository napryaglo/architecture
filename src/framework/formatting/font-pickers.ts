import {
    MetaData,
    Model,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import { ComboBox } from '../list/combo-box.js';

// Text-format editor pickers — thin editable-ComboBox subclasses that
// seed a curated item list and expose the edited value as a clean DP.
// They compose the ComboBox editable mode (typed input + dropdown of
// presets) built for exactly this family.
//
// Both are "standalone value editors": a consumer binds the value DP
// two-way and applies it to whatever text element it likes. They hold
// no reference to a target — the demo VM wires FontFamilyPicker.Text /
// FontSizePicker.Value into the sample paragraph's FontFamily / FontSize.

// A pragmatic default font stack — web-safe families plus the mural
// theme fonts. Consumers can replace `Items` with a system-enumerated
// list where the host exposes one.
export const DEFAULT_FONT_FAMILIES: readonly string[] = [
    'System UI', 'Arial', 'Helvetica', 'Times New Roman', 'Georgia',
    'Courier New', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Inter', 'Roboto',
    'Segoe UI',
];

// The classic Office point-size ramp. Authored as strings because the
// editable field is text; FontSizePicker parses the numeric Value off it.
export const DEFAULT_FONT_SIZES: readonly string[] = [
    '8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '32',
    '36', '48', '72',
];

// FontFamilyPicker — an editable ComboBox over a font list. The edited
// value is the family name string, surfaced through the inherited `Text`
// DP (a TextBlock.FontFamily setter coerces a string, so a consumer can
// bind `FontFamily = $Text` directly). No new value DP is needed — Text
// IS the value.
export class FontFamilyPicker extends ComboBox
{
    constructor()
    {
        super();
        this.IsEditable  = true;
        this.Placeholder = 'Font';
        this.Items       = [...DEFAULT_FONT_FAMILIES];
    }
}

// FontSizePicker — an editable ComboBox over the point-size ramp with a
// numeric `Value` DP kept in sync with the text field. Typing "13"
// commits Value = 13; setting Value formats it back into the field and
// highlights the matching preset. Named `Value` (not `FontSize`) to
// avoid colliding with the inherited TextBlock.FontSize the ComboBox
// forwards for its OWN display font.
export class FontSizePicker extends ComboBox
{
    public static readonly ValueKey = Model.RegisterProperty<number>(
        FontSizePicker, 'Value', 14, MetaData.Measure | MetaData.BindsTwoWayByDefault);

    /** Guards the Value ↔ Text mirror against re-entrancy. */
    private _syncingValue = false;

    constructor()
    {
        super();
        this.IsEditable  = true;
        this.Placeholder = 'Size';
        this.Items       = [...DEFAULT_FONT_SIZES];
        // Seed the field from the initial Value so the closed box reads
        // "14" rather than empty before any edit.
        this.Text = String(this.Value);
    }

    public get Value(): number  { return this.get_property_value(FontSizePicker.ValueKey); }
    public set Value(v: number) { this.set_property_value(FontSizePicker.ValueKey, v); }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'Value')
        {
            // Value → Text. Format the number into the field (which the
            // ComboBox mirrors into PART_EditText and item-matches).
            if (this._syncingValue) return;
            const text = String(newValue as number);
            if (this.Text !== text)
            {
                this._syncingValue = true;
                try { this.Text = text; }
                finally { this._syncingValue = false; }
            }
        }
        else if (descriptor.Name === 'Text')
        {
            // Text → Value. Parse a finite number; ignore junk (partial
            // input like "1" mid-type still parses to 1, which is
            // harmless — the paragraph clamps its own min).
            if (this._syncingValue) return;
            const parsed = Number.parseFloat(newValue as string);
            if (Number.isFinite(parsed) && parsed !== this.Value)
            {
                this._syncingValue = true;
                try { this.Value = parsed; }
                finally { this._syncingValue = false; }
            }
        }
    }
}
