// ShapesVM — backs the shapes demo. The demo is fully static (no state,
// no commands) so the VM is intentionally empty; it exists only because
// the platform shell expects every demo to materialise through a
// DataTemplate keyed on a DataType, and DataType matching needs an
// instance of *something*.
import { Model } from '@visualisation-sub/mural/runtime';
export class ShapesVM extends Model {
    constructor() { super(); }
}
