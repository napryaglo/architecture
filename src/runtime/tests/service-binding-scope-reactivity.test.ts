// ServiceBinding re-resolves when the target's inherited ServiceScope
// changes. A subtree re-parented under a different provider must rebind to
// THAT provider's service instance — not stay pinned to the scope it first
// resolved (the §24 "relocatable provider" follow-up).

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { Model, MetaData, ServiceProvider, ServiceKey, Application } from '../index.js';
import { ServiceBinding } from '../binding/element-name-binding.js';

// A service exposing one bindable DP.
class Svc extends Model
{
    public static readonly Key = new ServiceKey<Svc>('Svc');
    public static readonly MsgKey = Model.RegisterProperty<string>(Svc, 'Msg', '', MetaData.None);
    public get Msg(): string { return this.get_property_value(Svc.MsgKey); }
    public set Msg(v: string) { this.set_property_value(Svc.MsgKey, v); }
    constructor(msg: string) { super(); this.Msg = msg; }
}

// A bind target carrying a `ServiceScope` slot (the inherited DP's role) and
// a plain bound DP. ServiceBinding reads/watches `ServiceScope` by name.
class Target extends Model
{
    public static readonly ServiceScopeKey = Model.RegisterProperty<unknown>(
        Target, 'ServiceScope', undefined, MetaData.None);
    public static readonly TextKey = Model.RegisterProperty<string>(
        Target, 'Text', '', MetaData.None);
    public get ServiceScope(): unknown { return this.get_property_value(Target.ServiceScopeKey); }
    public set ServiceScope(v: unknown) { this.set_property_value(Target.ServiceScopeKey, v); }
    public get Text(): string { return this.get_property_value(Target.TextKey); }
}

describe('ServiceBinding — re-resolves on ServiceScope change', () =>
{
    beforeEach(() => { Application.current = null; });

    test('a scope swap rebinds to the new provider’s service, and tracks its DP', () =>
    {
        const scopeA = new ServiceProvider().registerInstance(Svc.Key, new Svc('from-A')) as ServiceProvider;
        const scopeB = new ServiceProvider();
        const svcB = new Svc('from-B');
        scopeB.registerInstance(Svc.Key, svcB);

        const tgt = new Target();
        tgt.ServiceScope = scopeA;
        tgt.set_property_value(Target.TextKey, ServiceBinding(tgt, Svc.Key, 'Msg'));

        // Initial resolution from scope A.
        assert.equal(tgt.Text, 'from-A');

        // Re-parent under scope B → the binding rebinds to B's instance.
        tgt.ServiceScope = scopeB;
        assert.equal(tgt.Text, 'from-B');

        // And it now tracks B's DP, not A's.
        svcB.Msg = 'B-updated';
        assert.equal(tgt.Text, 'B-updated');
    });

    test('clearing the scope clears the value; re-attaching restores it', () =>
    {
        const scope = new ServiceProvider();
        scope.registerInstance(Svc.Key, new Svc('live'));

        const tgt = new Target();
        tgt.ServiceScope = scope;
        tgt.set_property_value(Target.TextKey, ServiceBinding(tgt, Svc.Key, 'Msg'));
        assert.equal(tgt.Text, 'live');

        tgt.ServiceScope = undefined;       // detached from any provider
        assert.equal(tgt.Text, undefined);  // binding now resolves to nothing

        tgt.ServiceScope = scope;           // re-attached
        assert.equal(tgt.Text, 'live');
    });
});
