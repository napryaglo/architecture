// VM for the text-format demo. Holds the character-format state as pure
// runtime primitives — a family name (string), a point size (number),
// three garniture toggles (bool), and a colour hex (string). No
// visual-engine types here: the FontWeight / FontStyle / TextDecorations
// enums and the Foreground Brush live in the view layer, so the bootstrap
// behaviour maps these primitives onto the sample paragraph. The editors
// bind two-way to these DPs; the paragraph binds Family / FontSize
// directly and gets weight / style / underline / colour from the bridge.
import { MetaData, Model } from '@pragmatic-lab/mural/runtime';
export class TextFormatVM extends Model {
    static FamilyKey = Model.RegisterProperty(TextFormatVM, 'Family', 'Georgia', MetaData.None);
    static FontSizeKey = Model.RegisterProperty(TextFormatVM, 'FontSize', 20, MetaData.None);
    static BoldKey = Model.RegisterProperty(TextFormatVM, 'Bold', false, MetaData.None);
    static ItalicKey = Model.RegisterProperty(TextFormatVM, 'Italic', false, MetaData.None);
    static UnderlineKey = Model.RegisterProperty(TextFormatVM, 'Underline', false, MetaData.None);
    static ColorHexKey = Model.RegisterProperty(TextFormatVM, 'ColorHex', '#1d4ed8', MetaData.None);
    static SampleKey = Model.RegisterProperty(TextFormatVM, 'Sample', 'The quick brown fox jumps over the lazy dog.', MetaData.None);
    get Family() { return this.get_property_value(TextFormatVM.FamilyKey); }
    set Family(v) { this.set_property_value(TextFormatVM.FamilyKey, v); }
    get FontSize() { return this.get_property_value(TextFormatVM.FontSizeKey); }
    set FontSize(v) { this.set_property_value(TextFormatVM.FontSizeKey, v); }
    get Bold() { return this.get_property_value(TextFormatVM.BoldKey); }
    set Bold(v) { this.set_property_value(TextFormatVM.BoldKey, v); }
    get Italic() { return this.get_property_value(TextFormatVM.ItalicKey); }
    set Italic(v) { this.set_property_value(TextFormatVM.ItalicKey, v); }
    get Underline() { return this.get_property_value(TextFormatVM.UnderlineKey); }
    set Underline(v) { this.set_property_value(TextFormatVM.UnderlineKey, v); }
    get ColorHex() { return this.get_property_value(TextFormatVM.ColorHexKey); }
    set ColorHex(v) { this.set_property_value(TextFormatVM.ColorHexKey, v); }
    get Sample() { return this.get_property_value(TextFormatVM.SampleKey); }
    set Sample(v) { this.set_property_value(TextFormatVM.SampleKey, v); }
    /** Set by the bootstrap; the platform calls it after the view
     *  materializes so the format bridge can attach to the paragraph. */
    OnViewMounted;
}
