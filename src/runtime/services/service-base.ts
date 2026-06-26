import { Model } from '../model.js';
import type { IServiceProvider } from './service-provider.js';

// Base for application services that are also bindable view-models.
//
// Extends Model so a service can expose DPs that view content binds to
// directly (`$StatusText`, `$Target`, …) — the same "view-observable
// state lives on DPs" contract VMs follow. Registering one of these in
// the ServiceProvider lets the shell hand it to a region as DataContext
// and lets commands / behaviors / child VMs resolve the SAME instance.
//
// Convention (TS can't express a `static abstract`): every concrete
// service declares a `static readonly Key: ServiceKey<Self>` token and
// registers itself against it, so registration / resolution sites stay
// uniform and greppable (the no-string-type-proxies rule — tokens are
// real objects).
//
// Lifecycle: Dispose() releases subscriptions / timers the service
// holds. A ServiceProvider scope calls Dispose() on every ServiceBase
// it owns when the scope is disposed (see ServiceProvider.dispose), so
// a per-shell scope tears its services down with the shell.
export abstract class ServiceBase extends Model
{
    // The container that built this service, narrowed to the consumer
    // contract (resolve only — no register / scope). Every concrete
    // service ctor takes an IServiceProvider and forwards it here via
    // `super(provider)`; both the `.services:` markup block and any code
    // registration construct a service as `new Impl(provider)`. A service
    // resolves its own collaborators from here — in the ctor for eager
    // wiring, or lazily, e.g. `this.Provider.getRequired(Other.Key)`.
    protected readonly Provider: IServiceProvider;

    constructor(provider: IServiceProvider)
    {
        super();
        this.Provider = provider;
    }

    // Override to release resources (event subscriptions, timers, …).
    // Default no-op. Idempotent by contract — the container calls it
    // once on scope teardown, but a defensive double-call must be safe.
    public Dispose(): void { }
}
