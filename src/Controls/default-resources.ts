import { Application } from '../runtime/index.js';
import { create as createControlsTheme } from '../../build/Controls/controls.template.mu.js';

// Every built-in control's default ControlTemplate ships in a single
// consolidated ResourceDictionary — see Controls/controls.template.mu.
// This helper guarantees the matching factory is registered with
// Application exactly once, regardless of which control's static block
// runs first.
//
// Dedup uses identity against the factories array rather than a
// module-local `let` flag because controls.template.mu.js imports the
// Controls barrel (it instantiates Border / StackPanel / etc.) and the
// barrel imports every control, which in turn imports this module —
// a cycle. Inside that cycle a `let` initialiser would still be in TDZ
// when the first control's static block reached us. `.includes` on the
// factories array works because function declarations are bound at
// module instantiation time, so the imported `createControlsTheme`
// reference is stable across every reentrant call.
export function ensureControlsTheme(): void
{
    if (Application.DefaultResourceFactories.includes(createControlsTheme)) return;
    Application.DefaultResourceFactories.push(createControlsTheme);
}
