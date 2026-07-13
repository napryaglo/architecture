// TextBoxVM — empty marker model for the text-box demo. The .mu file
// declares a DataTemplate parameterized by this type; the demo is
// purely visual (no state, no commands), so the VM exists only so the
// platform's ContentControl auto-resolves the template by matching
// TextBoxVM.constructor.name against the template's DataType.
import { Model } from 'mural/runtime';
export class TextBoxVM extends Model {
}
