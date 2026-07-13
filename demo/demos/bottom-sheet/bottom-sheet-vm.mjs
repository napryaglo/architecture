// BottomSheetVM — backs the bottom-sheet demo. BottomSheet ships no
// posture DP (its class doc leaves internal layout to the consumer), so
// the peek-vs-expanded posture is modelled here: Expanded is a reactive
// boolean and SheetHeight is the height the sheet's Height DP binds to.
// TogglePosture flips between the peek height and the expanded height so
// the sheet rises / settles live.
import { Model, MetaData, RelayCommand } from '@pragmatic-lab/mural/runtime';
const PEEK_HEIGHT = 96;
const EXPANDED_HEIGHT = 320;
export class BottomSheetVM extends Model {
    static ExpandedKey = Model.RegisterProperty(BottomSheetVM, 'Expanded', false, MetaData.None);
    static SheetHeightKey = Model.RegisterProperty(BottomSheetVM, 'SheetHeight', PEEK_HEIGHT, MetaData.None);
    static PostureLabelKey = Model.RegisterProperty(BottomSheetVM, 'PostureLabel', 'Peek', MetaData.None);
    static TogglePostureKey = Model.RegisterProperty(BottomSheetVM, 'TogglePosture', null, MetaData.None);
    get Expanded() { return this.get_property_value(BottomSheetVM.ExpandedKey); }
    set Expanded(v) { this.set_property_value(BottomSheetVM.ExpandedKey, v); }
    get SheetHeight() { return this.get_property_value(BottomSheetVM.SheetHeightKey); }
    set SheetHeight(v) { this.set_property_value(BottomSheetVM.SheetHeightKey, v); }
    get PostureLabel() { return this.get_property_value(BottomSheetVM.PostureLabelKey); }
    set PostureLabel(v) { this.set_property_value(BottomSheetVM.PostureLabelKey, v); }
    get TogglePosture() { return this.get_property_value(BottomSheetVM.TogglePostureKey); }
    constructor() {
        super();
        this.set_property_value(BottomSheetVM.TogglePostureKey, new RelayCommand(() => {
            this.Expanded = !this.Expanded;
            this.SheetHeight = this.Expanded ? EXPANDED_HEIGHT : PEEK_HEIGHT;
            this.PostureLabel = this.Expanded ? 'Expanded' : 'Peek';
        }));
    }
}
