import { Application, Style } from '../runtime/index.js';
import { create as createControlsTheme } from '../../build/Controls/controls.template.mu.js';
import { ControlTemplate } from './control-template.js';

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

// Resolve the bundled default ControlTemplate for `klass`. Each
// single-template control's constructor calls this with its class
// function — the controls theme registers a Style under the Function
// key whose single Template setter holds the ControlTemplate. Reading
// the Template DP at construction time (eager PART wiring) needs the
// ControlTemplate instance directly; this helper digs it out of the
// Style. resolve_implicit_style applies the Style itself on attach;
// the Template setter there is a no-op when the same instance is
// already on Control.Template (ContentControl.set Template short-
// circuits old === value).
export function defaultTemplate(klass: Function): ControlTemplate
{
    const resource = Application.ResolveDefaultResource<unknown>(klass);
    if (resource === undefined)
    {
        throw new Error(
            `${klass.name}: default Style is not registered. ` +
            `Did you import the Controls barrel before constructing the control?`);
    }
    // Style-wrapping is the current shape (each `Template [TargetType=X]`
    // in controls.template.mu auto-wraps in a Style with a single
    // Template setter). Direct ControlTemplate entries are still
    // accepted for ad-hoc usage outside the bundled theme.
    if (resource instanceof ControlTemplate) return resource;
    if (resource instanceof Style)
    {
        for (const setter of resource.Setters)
        {
            if (setter.property === 'Template' && setter.value instanceof ControlTemplate)
            {
                return setter.value;
            }
        }
        throw new Error(
            `${klass.name}: default Style is missing a 'Template' setter.`);
    }
    throw new Error(
        `${klass.name}: default resource is neither a Style nor a ControlTemplate.`);
}
