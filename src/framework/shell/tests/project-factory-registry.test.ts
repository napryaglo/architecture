import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application, ServiceKey } from '../../../runtime/index.js';
import { ShellModule } from '../module.js';
import { ProjectFactoryDefinition } from '../projects/project-factory-definition.js';
import { ProjectFactoryRegistry } from '../projects/project-factory-registry.js';

function definition(type: string): ProjectFactoryDefinition
{
    const d = new ProjectFactoryDefinition();
    d.Type = type;
    d.Title = type;
    return d;
}

function moduleWith(...defs: ProjectFactoryDefinition[]): ShellModule
{
    const mod = new ShellModule();
    for (const d of defs) mod.ProjectFactories.Add(d);
    return mod;
}

function appWith(...modules: ShellModule[]): Application
{
    const app = new Application();
    for (const m of modules) app.Modules.Add(m);
    app.Services.register(ProjectFactoryRegistry.Key, p => new ProjectFactoryRegistry(p));
    return app;
}

describe('ProjectFactoryRegistry.PopulateFromModules', () => {
    test('aggregates every module\'s project-factory definitions', () => {
        const app = appWith(
            moduleWith(definition('architecture')),
            moduleWith(definition('sheet')),
        );
        const registry = app.Services.getRequired(ProjectFactoryRegistry.Key);
        const types = [...registry.Definitions].map(d => d.Type);
        assert.deepEqual(types, ['architecture', 'sheet']);
    });

    test('GetByType resolves a definition', () => {
        const app = appWith(moduleWith(definition('architecture')));
        const registry = app.Services.getRequired(ProjectFactoryRegistry.Key);
        assert.equal(registry.GetByType('architecture')?.Type, 'architecture');
        assert.equal(registry.GetByType('missing'), undefined);
    });

    test('a duplicate type across modules registers once (first wins)', () => {
        const first  = definition('architecture');
        const second = definition('architecture');
        const app = appWith(moduleWith(first), moduleWith(second));
        const registry = app.Services.getRequired(ProjectFactoryRegistry.Key);
        assert.equal(registry.Definitions.Count, 1);
        assert.equal(registry.GetByType('architecture'), first);
    });

    test('carries the factory token through', () => {
        const factory = new ServiceKey<unknown>('DiagramProjectFactory');
        const def = definition('architecture');
        def.Factory = factory;
        const app = appWith(moduleWith(def));
        const registry = app.Services.getRequired(ProjectFactoryRegistry.Key);
        assert.equal(registry.GetByType('architecture')!.Factory, factory);
    });
});
