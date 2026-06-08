// ToggleButtonVM — backs the toggle-button demo. Three bound boolean
// DPs (IsBold / IsItalic / IsUnderline) plus a sample preview string.
// The view binds each toggle's IsChecked TwoWay onto the corresponding
// DP; per-DP style triggers on the preview Border style its TextBlock
// (font weight, italics, underline) based on the bound DP values.
import { Model, MetaData } from '@visualisation-sub/mural/runtime';

export class ToggleButtonVM extends Model
{
    static IsBoldKey      = Model.RegisterProperty(ToggleButtonVM, 'IsBold',      false, MetaData.None);
    static IsItalicKey    = Model.RegisterProperty(ToggleButtonVM, 'IsItalic',    false, MetaData.None);
    static IsUnderlineKey = Model.RegisterProperty(ToggleButtonVM, 'IsUnderline', false, MetaData.None);
    static PreviewTextKey = Model.RegisterProperty(ToggleButtonVM, 'PreviewText', 'Hello, mural!', MetaData.None);

    get IsBold()       { return this._get_property_value_by_name('IsBold'); }
    set IsBold(v)      { this._set_property_value_by_name('IsBold', v); }
    get IsItalic()     { return this._get_property_value_by_name('IsItalic'); }
    set IsItalic(v)    { this._set_property_value_by_name('IsItalic', v); }
    get IsUnderline()  { return this._get_property_value_by_name('IsUnderline'); }
    set IsUnderline(v) { this._set_property_value_by_name('IsUnderline', v); }
    get PreviewText()  { return this._get_property_value_by_name('PreviewText'); }
    set PreviewText(v) { this._set_property_value_by_name('PreviewText', v); }
}
