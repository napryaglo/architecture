// RichTextBlockVM — backs the rich-text-block demo. The demo is a
// read-only typography showcase: a single RichTextBlock flows mixed text
// styles (bold / italic / underline / colour / size) and inline chips over
// one FlowDocument authored entirely in markup. There is no editable state,
// so this VM is intentionally empty — it exists only as the DataType the
// demo's DataTemplate keys off (the shell resolves the view by class
// identity via `DataTemplate [DataType = RichTextBlockVM]`).
import { Model } from '@pragmatic-lab/mural/runtime';

export class RichTextBlockVM extends Model
{
}
