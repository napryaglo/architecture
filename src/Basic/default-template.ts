import { Application, Style } from '../runtime/index.js';
import { ControlTemplate } from './control-template.js';

// Resolve the default ControlTemplate for `klass` from the active
// theme's dictionaries.
//
// Controls call this in their constructors for eager PART wiring —
// reading the Template DP at construction time, BEFORE the implicit-
// Style application path runs. The theme dictionary contains a
// `Style[TargetType=klass]` registered under the class Function key,
// whose `Template` setter holds the ControlTemplate. Direct
// ControlTemplate entries are still accepted for ad-hoc usage.
//
// Resolution path is `Application.ResolveDefaultResource(klass)`. The
// active theme's dictionaries (merged into Application.Resources by
// ThemeManager.activate) are walked first; the package's bundled
// default dictionaries are walked second. A theme that adopts
// `MuralBasic` + `MuralFramework` via its `dictionaries:` header carries
// every control's default Style.
export function defaultTemplate(klass: Function): ControlTemplate
{
    const resource = Application.ResolveDefaultResource<unknown>(klass);
    if (resource === undefined)
    {
        throw new Error(
            `${klass.name}: default Style is not registered. ` +
            `Activate a theme that adopts MuralBasic (and MuralFramework for ` +
            `command-surface controls) via 'dictionaries:' before constructing the control.`);
    }
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
