// SliderVM — empty marker model. The slider demo has no state of its
// own; the .mu file declares a DataTemplate keyed on this type so the
// platform's ContentControl can auto-resolve the template by data type.
import { Model } from '@visualisation-sub/mural/runtime';

export class SliderVM extends Model { }
