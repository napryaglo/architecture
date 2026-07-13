// DashboardVM — empty marker model. The dashboard demo has no state
// of its own (it's a pure Style + when() triggers showcase); the .mu
// file declares a DataTemplate keyed on this type so the platform's
// ContentControl can auto-resolve the template by data type.
import { Model } from 'mural/runtime';
export class DashboardVM extends Model {
}
