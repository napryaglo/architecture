// VM for the color-picker demo. Three independent hex string DPs the
// view binds to a ColorPicker each — surface, accent, ink. The .mu
// pipes those into preview swatches so the user can see the picked
// colour ride live.
import { MetaData, MuralBase } from '@pragmatic-lab/mural/runtime';
export class ColorPickerVM extends MuralBase {
    static SurfaceHexKey = MuralBase.RegisterProperty(ColorPickerVM, 'SurfaceHex', '#bbdefb', MetaData.None);
    static AccentHexKey = MuralBase.RegisterProperty(ColorPickerVM, 'AccentHex', '#ec407a', MetaData.None);
    static InkHexKey = MuralBase.RegisterProperty(ColorPickerVM, 'InkHex', '#0f172a', MetaData.None);
    static OverlayHexKey = MuralBase.RegisterProperty(ColorPickerVM, 'OverlayHex', '#ff9800a0', MetaData.None);
    get SurfaceHex() { return this.get_property_value(ColorPickerVM.SurfaceHexKey); }
    set SurfaceHex(v) { this.set_property_value(ColorPickerVM.SurfaceHexKey, v); }
    get AccentHex() { return this.get_property_value(ColorPickerVM.AccentHexKey); }
    set AccentHex(v) { this.set_property_value(ColorPickerVM.AccentHexKey, v); }
    get InkHex() { return this.get_property_value(ColorPickerVM.InkHexKey); }
    set InkHex(v) { this.set_property_value(ColorPickerVM.InkHexKey, v); }
    get OverlayHex() { return this.get_property_value(ColorPickerVM.OverlayHexKey); }
    set OverlayHex(v) { this.set_property_value(ColorPickerVM.OverlayHexKey, v); }
}
