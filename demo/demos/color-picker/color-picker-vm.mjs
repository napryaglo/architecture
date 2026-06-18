// VM for the color-picker demo. Three independent hex string DPs the
// view binds to a ColorPicker each — surface, accent, ink. The .mu
// pipes those into preview swatches so the user can see the picked
// colour ride live.
import { MetaData, Model } from '@visualisation-sub/mural/runtime';

export class ColorPickerVM extends Model {
    static {
        Model.RegisterProperty(ColorPickerVM, 'SurfaceHex', '#bbdefb',   MetaData.None);
        Model.RegisterProperty(ColorPickerVM, 'AccentHex',  '#ec407a',   MetaData.None);
        Model.RegisterProperty(ColorPickerVM, 'InkHex',     '#0f172a',   MetaData.None);
        Model.RegisterProperty(ColorPickerVM, 'OverlayHex', '#ff9800a0', MetaData.None);
    }

    get SurfaceHex()  { return this._get_property_value_by_name('SurfaceHex'); }
    set SurfaceHex(v) { this._set_property_value_by_name('SurfaceHex', v); }
    get AccentHex()   { return this._get_property_value_by_name('AccentHex'); }
    set AccentHex(v)  { this._set_property_value_by_name('AccentHex', v); }
    get InkHex()      { return this._get_property_value_by_name('InkHex'); }
    set InkHex(v)     { this._set_property_value_by_name('InkHex', v); }
    get OverlayHex()  { return this._get_property_value_by_name('OverlayHex'); }
    set OverlayHex(v) { this._set_property_value_by_name('OverlayHex', v); }
}
