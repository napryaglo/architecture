// ToggleButtonVM — backs the toggle-button demo. Three bound boolean
// DPs (IsBold / IsItalic / IsUnderline) plus a sample preview string.
// The view binds each toggle's IsChecked TwoWay onto the corresponding
// DP; per-DP style triggers on the preview Border style its TextBlock
// (font weight, italics, underline) based on the bound DP values.
import { Model, MetaData } from '@visualisation-sub/mural/runtime';
export class ToggleButtonVM extends Model {
    static IsBoldKey = Model.RegisterProperty(ToggleButtonVM, 'IsBold', false, MetaData.None);
    static IsItalicKey = Model.RegisterProperty(ToggleButtonVM, 'IsItalic', false, MetaData.None);
    static IsUnderlineKey = Model.RegisterProperty(ToggleButtonVM, 'IsUnderline', false, MetaData.None);
    static PreviewTextKey = Model.RegisterProperty(ToggleButtonVM, 'PreviewText', 'Hello, mural!', MetaData.None);
    get IsBold() { return this.get_property_value(ToggleButtonVM.IsBoldKey); }
    set IsBold(v) { this.set_property_value(ToggleButtonVM.IsBoldKey, v); }
    get IsItalic() { return this.get_property_value(ToggleButtonVM.IsItalicKey); }
    set IsItalic(v) { this.set_property_value(ToggleButtonVM.IsItalicKey, v); }
    get IsUnderline() { return this.get_property_value(ToggleButtonVM.IsUnderlineKey); }
    set IsUnderline(v) { this.set_property_value(ToggleButtonVM.IsUnderlineKey, v); }
    get PreviewText() { return this.get_property_value(ToggleButtonVM.PreviewTextKey); }
    set PreviewText(v) { this.set_property_value(ToggleButtonVM.PreviewTextKey, v); }
}
