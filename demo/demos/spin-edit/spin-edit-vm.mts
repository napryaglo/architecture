// SpinEditVM — empty marker model. The spin-edit demo has no state of
// its own; the .mu file declares a DataTemplate keyed on this type so
// the platform's ContentControl can auto-resolve the template by data
// type.
import { MuralBase } from '@pragmatic-lab/mural/runtime';

export class SpinEditVM extends MuralBase { }
