// VM for the fill-editor demo. Holds a Fill DP the editor edits; the
// view binds the preview Shape's Fill to the same brush so user
// gestures repaint live. Mirror Pen DP + the previous demo's pattern
// for a static stroke around the preview shape.

import { MetaData, Model } from '@visualisation-sub/mural/runtime';
import {
    Color,
    Pen,
    SolidColorBrush,
} from '@visualisation-sub/mural/visual-engine';

export class FillEditorDemoVM extends Model
{
    static {
        Model.RegisterProperty(FillEditorDemoVM, 'Fill',        undefined, MetaData.None);
        Model.RegisterProperty(FillEditorDemoVM, 'OutlinePen',  undefined, MetaData.None);
        Model.RegisterProperty(FillEditorDemoVM, 'FillSummary', '',        MetaData.None);
    }

    constructor() {
        super();
        this._set_property_value_by_name('Fill',       new SolidColorBrush(Color.FromHex('#1976d2')));
        this._set_property_value_by_name('OutlinePen', new Pen(new SolidColorBrush(Color.FromHex('#0f172a')), 1.5));
        this._installFillWatcher();
        this._refreshSummary();
    }

    get Fill()        { return this._get_property_value_by_name('Fill'); }
    get OutlinePen()  { return this._get_property_value_by_name('OutlinePen'); }
    get FillSummary() { return this._get_property_value_by_name('FillSummary'); }

    _installFillWatcher() {
        // Listen for Fill DP changes — when the editor swaps the brush
        // we re-summarise. We don't subscribe to brush-internal
        // properties; the editor builds a NEW Brush on every gesture
        // (variant swap, color edit) so a Fill listener is enough.
        this._add_property_changed_listener_by_name('Fill', () => this._refreshSummary());
    }

    _refreshSummary() {
        const b = this.Fill;
        this._set_property_value_by_name('FillSummary', describe(b));
    }
}

function describe(brush) {
    if (brush === undefined) return 'Fill: (none)';
    const op = `${Math.round((brush.Opacity ?? 1) * 100)}% opacity`;
    const name = brush.constructor?.name ?? 'Brush';
    if (name === 'SolidColorBrush' && brush.Color?.ToHex) return `Fill: Solid ${brush.Color.ToHex()} • ${op}`;
    if (name === 'LinearGradientBrush')                  return `Fill: Linear (${brush.GradientStops?.length ?? 0} stops) • ${op}`;
    if (name === 'RadialGradientBrush')                  return `Fill: Radial (${brush.GradientStops?.length ?? 0} stops) • ${op}`;
    if (name === 'PatternBrush')                         return `Fill: Pattern ${brush.Kind} • ${op}`;
    if (name === 'ImageBrush')                           return `Fill: Picture (${brush.ImageSource?.Uri ?? 'no uri'}) • ${op}`;
    return `Fill: ${name} • ${op}`;
}
