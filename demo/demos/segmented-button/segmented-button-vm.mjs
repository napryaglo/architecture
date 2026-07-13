// SegmentedButtonVM — backs the segmented-button demo. Two scenarios:
//
//   * Single-select timeframe picker (Day / Week / Month / Year). The
//     selected segment binds to SelectedTimeframe.
//   * Multi-select formatter toggles (Bold / Italic / Underline). Each
//     toggle's IsSelected mirrors the matching VM DP.
//
// Each readout below the row shows the live VM state so the bind chain
// is visible.
import { Model, MetaData, ObservableCollection } from 'mural/runtime';
export class SegmentedButtonVM extends Model {
    static TimeframesKey = Model.RegisterProperty(SegmentedButtonVM, 'Timeframes', undefined, MetaData.None);
    static SelectedTimeframeKey = Model.RegisterProperty(SegmentedButtonVM, 'SelectedTimeframe', undefined, MetaData.None);
    static FormatChoicesKey = Model.RegisterProperty(SegmentedButtonVM, 'FormatChoices', undefined, MetaData.None);
    static SelectedFormatsKey = Model.RegisterProperty(SegmentedButtonVM, 'SelectedFormats', undefined, MetaData.None);
    static SelectedFormatsLabelKey = Model.RegisterProperty(SegmentedButtonVM, 'SelectedFormatsLabel', '', MetaData.None);
    get Timeframes() { return this.get_property_value(SegmentedButtonVM.TimeframesKey); }
    set Timeframes(v) { this.set_property_value(SegmentedButtonVM.TimeframesKey, v); }
    get SelectedTimeframe() { return this.get_property_value(SegmentedButtonVM.SelectedTimeframeKey); }
    set SelectedTimeframe(v) { this.set_property_value(SegmentedButtonVM.SelectedTimeframeKey, v); }
    get FormatChoices() { return this.get_property_value(SegmentedButtonVM.FormatChoicesKey); }
    set FormatChoices(v) { this.set_property_value(SegmentedButtonVM.FormatChoicesKey, v); }
    get SelectedFormats() { return this.get_property_value(SegmentedButtonVM.SelectedFormatsKey); }
    set SelectedFormats(v) { this.set_property_value(SegmentedButtonVM.SelectedFormatsKey, v); }
    get SelectedFormatsLabel() { return this.get_property_value(SegmentedButtonVM.SelectedFormatsLabelKey); }
    set SelectedFormatsLabel(v) { this.set_property_value(SegmentedButtonVM.SelectedFormatsLabelKey, v); }
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
        for (let i = 0; i < items.Count; i++)
            buf.push(items.Get(i));
        this.SelectedFormatsLabel = buf.join(', ');
    }
}
