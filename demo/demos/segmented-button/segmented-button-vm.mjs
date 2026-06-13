// SegmentedButtonVM — backs the segmented-button demo. Two scenarios:
//
//   * Single-select timeframe picker (Day / Week / Month / Year). The
//     selected segment binds to SelectedTimeframe.
//   * Multi-select formatter toggles (Bold / Italic / Underline). Each
//     toggle's IsSelected mirrors the matching VM DP.
//
// Each readout below the row shows the live VM state so the bind chain
// is visible.
import { Model, MetaData, ObservableCollection } from '@visualisation-sub/mural/runtime';

export class SegmentedButtonVM extends Model
{
    static TimeframesKey        = Model.RegisterProperty(SegmentedButtonVM, 'Timeframes',        undefined, MetaData.None);
    static SelectedTimeframeKey = Model.RegisterProperty(SegmentedButtonVM, 'SelectedTimeframe', undefined, MetaData.None);

    static FormatChoicesKey     = Model.RegisterProperty(SegmentedButtonVM, 'FormatChoices',     undefined, MetaData.None);
    static SelectedFormatsKey   = Model.RegisterProperty(SegmentedButtonVM, 'SelectedFormats',   undefined, MetaData.None);

    static SelectedFormatsLabelKey = Model.RegisterProperty(SegmentedButtonVM, 'SelectedFormatsLabel', '', MetaData.None);

    get Timeframes()              { return this._get_property_value_by_name('Timeframes'); }
    set Timeframes(v)             { this._set_property_value_by_name('Timeframes', v); }
    get SelectedTimeframe()       { return this._get_property_value_by_name('SelectedTimeframe'); }
    set SelectedTimeframe(v)      { this._set_property_value_by_name('SelectedTimeframe', v); }

    get FormatChoices()           { return this._get_property_value_by_name('FormatChoices'); }
    set FormatChoices(v)          { this._set_property_value_by_name('FormatChoices', v); }
    get SelectedFormats()         { return this._get_property_value_by_name('SelectedFormats'); }
    set SelectedFormats(v)        { this._set_property_value_by_name('SelectedFormats', v); }

    get SelectedFormatsLabel()    { return this._get_property_value_by_name('SelectedFormatsLabel'); }
    set SelectedFormatsLabel(v)   { this._set_property_value_by_name('SelectedFormatsLabel', v); }

    constructor() {
        super();
        this.Timeframes = new ObservableCollection(['Day', 'Week', 'Month', 'Year']);
        this.SelectedTimeframe = 'Week';

        this.FormatChoices = new ObservableCollection(['B', 'I', 'U', 'S']);
        this.SelectedFormats = new ObservableCollection(['B']);

        this._refreshFormatsLabel();
        // Re-derive the readout whenever the SelectedFormats collection
        // changes. ObservableCollection.Subscribe fires on every mutation.
        this.SelectedFormats.Subscribe(() => this._refreshFormatsLabel());
    }

    _refreshFormatsLabel() {
        const items = this.SelectedFormats;
        if (items === undefined || items.Count === 0) {
            this.SelectedFormatsLabel = '(none)';
            return;
        }
        const buf = [];
        for (let i = 0; i < items.Count; i++) buf.push(items.Get(i));
        this.SelectedFormatsLabel = buf.join(', ');
    }
}
