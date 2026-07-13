// VM for the color-picker demo. Three independent hex string DPs the
// view binds to a ColorPicker each — surface, accent, ink. The .mu
// pipes those into preview swatches so the user can see the picked
// colour ride live.
import { MetaData, Model } from 'mural/runtime';
export class ColorPickerVM extends Model {
    static SurfaceHexKey = Model.RegisterProperty(ColorPickerVM, 'SurfaceHex', '#bbdefb', MetaData.None);
    static AccentHexKey = Model.RegisterProperty(ColorPickerVM, 'AccentHex', '#ec407a', MetaData.None);
    static InkHexKey = Model.RegisterProperty(ColorPickerVM, 'InkHex', '#0f172a', MetaData.None);
    static OverlayHexKey = Model.RegisterProperty(ColorPickerVM, 'OverlayHex', '#ff9800a0', MetaData.None);
    get SurfaceHex() { return this.get_property_value(ColorPickerVM.SurfaceHexKey); }
    set SurfaceHex(v) { this.set_property_value(ColorPickerVM.SurfaceHexKey, v); }
    get AccentHex() { return this.get_property_value(ColorPickerVM.AccentHexKey); }
    set AccentHex(v) { this.set_property_value(ColorPickerVM.AccentHexKey, v); }
    get InkHex() { return this.get_property_value(ColorPickerVM.InkHexKey); }
    set InkHex(v) { this.set_property_value(ColorPickerVM.InkHexKey, v); }
    get OverlayHex() { return this.get_property_value(ColorPickerVM.OverlayHexKey); }
    set OverlayHex(v) { this.set_property_value(ColorPickerVM.OverlayHexKey, v); }
}
