// Control moved to the basic tier (src/basic/control.ts) so that both
// basic controls (Slider / SpinEdit / ScrollBar via TemplatedControl) and
// framework controls (ContentControl / ItemsControl / Drawer) descend
// from the one templated-control base. This re-export keeps every
// existing `from '../base/control.js'` import — and the framework barrel —
// pointing at the same `Control` with no churn.
export { Control } from '../../basic/control.js';
