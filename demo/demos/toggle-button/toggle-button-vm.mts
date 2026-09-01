// ToggleButtonVM — backs the toggle-button demo. Three bound boolean
// DPs (IsBold / IsItalic / IsUnderline) plus a sample preview string.
// The view binds each toggle's IsChecked TwoWay onto the corresponding
// DP; per-DP style triggers on the preview Border style its TextBlock
// (font weight, italics, underline) based on the bound DP values.
import { MuralBase, MetaData } from '@pragmatic-tech-ai/mural/runtime';

export class ToggleButtonVM extends MuralBase
{
    static IsBoldKey      = MuralBase.RegisterProperty<boolean>(ToggleButtonVM, 'IsBold',      false, MetaData.None);
    static IsItalicKey    = MuralBase.RegisterProperty<boolean>(ToggleButtonVM, 'IsItalic',    false, MetaData.None);
    static IsUnderlineKey = MuralBase.RegisterProperty<boolean>(ToggleButtonVM, 'IsUnderline', false, MetaData.None);
    static PreviewTextKey = MuralBase.RegisterProperty<string>(ToggleButtonVM, 'PreviewText', 'Hello, mural!', MetaData.None);

    get IsBold():       boolean { return this.get_property_value(ToggleButtonVM.IsBoldKey); }
    set IsBold(v:      boolean) { this.set_property_value(ToggleButtonVM.IsBoldKey, v); }
    get IsItalic():     boolean { return this.get_property_value(ToggleButtonVM.IsItalicKey); }
    set IsItalic(v:    boolean) { this.set_property_value(ToggleButtonVM.IsItalicKey, v); }
    get IsUnderline():  boolean { return this.get_property_value(ToggleButtonVM.IsUnderlineKey); }
    set IsUnderline(v: boolean) { this.set_property_value(ToggleButtonVM.IsUnderlineKey, v); }
    get PreviewText():  string { return this.get_property_value(ToggleButtonVM.PreviewTextKey); }
    set PreviewText(v: string) { this.set_property_value(ToggleButtonVM.PreviewTextKey, v); }
}
