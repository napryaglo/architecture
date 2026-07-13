import { ServiceKey, type Scheme, type Theme, ThemeManager } from '../../../runtime/index.js';

// IThemeService — the shell-facing contract for reading / driving the global
// theme + scheme state. Its members are exactly the public surface of
// `ThemeManager` a picker needs, so ThemeManager (a static class) satisfies it
// structurally and is registered AS this service (see ThemeServiceInstance).
//
// Why an interface over the static singleton rather than a bespoke wrapper
// service: composition code binds a control's DataContext to `ThemeServiceKey`
// and the control talks to the one true ThemeManager — no second source of
// truth to keep in sync. A control that needs reactive list / selection state
// layers its own DP-backed view-model on top and subscribes via
// Add/RemoveActivatedListener (ThemeManager itself is not DP-reactive).
export interface IThemeService
{
    /** Every registered Theme, in registration order. */
    readonly RegisteredThemes: readonly Theme[];
    /** The active Theme, or undefined before the first activation. */
    readonly ActiveTheme: Theme | undefined;
    /** The active Scheme, or undefined before the first activation. */
    readonly ActiveScheme: Scheme | undefined;

    /** Activate a registered Theme by name (optionally a starting scheme). */
    ActivateTheme(name: string, opts?: { scheme?: string }): void;
    /** Swap to a named scheme on the active Theme. */
    ActivateScheme(name: string): void;
    /** Activate an arbitrary Scheme OBJECT (e.g. a runtime-generated dynamic
     *  scheme) globally — the seam a custom-colour picker applies through. */
    ApplyScheme(scheme: Scheme): void;
    /** Look up a registered Theme by name. */
    GetTheme(name: string): Theme | undefined;

    /** Subscribe to activations (theme or scheme swaps) so a picker keeps its
     *  selection in sync when the scheme changes out from under it. */
    AddActivatedListener(cb: (theme: Theme, scheme: Scheme) => void): void;
    RemoveActivatedListener(cb: (theme: Theme, scheme: Scheme) => void): void;
}

// The token a control's DataContext / a `$service(ThemeService)` binding resolves.
export const ThemeServiceKey = new ServiceKey<IThemeService>('ThemeService');

// ThemeManager (static) IS the service instance. The direct-typed binding here
// is the compile-time conformance check: if ThemeManager's public surface ever
// drifts from IThemeService, this line fails to type. Registered as a singleton
// instance in global scope by EditorShell.
export const ThemeServiceInstance: IThemeService = ThemeManager;
