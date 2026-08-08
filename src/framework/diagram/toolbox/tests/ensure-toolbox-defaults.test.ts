import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServiceProvider } from '../../../../runtime/index.js';
import { ToolboxRepository } from '../toolbox-repository.js';
import { ShapeVisualResolverKey } from '../shape-visual-resolver.js';
import { ShapeDropFactoryKey } from '../shape-drop-factory.js';
import { SHAPE_CATALOG } from '../../shape-catalog.js';
import { ensureToolboxDefaults } from '../ensure-toolbox-defaults.js';

test('ensureToolboxDefaults registers repo + shape services + Shapes page', () => {
    const services = new ServiceProvider();
    ensureToolboxDefaults(services);
    const repo = services.getRequired(ToolboxRepository.Key);
    assert.ok(services.has(ShapeVisualResolverKey));
    assert.ok(services.has(ShapeDropFactoryKey));
    const shapes = repo.Pages.Get(0);
    assert.equal(shapes?.Id, 'shapes');
    assert.equal(shapes?.Items.Count, SHAPE_CATALOG.length);
});

test('ensureToolboxDefaults is idempotent', () => {
    const services = new ServiceProvider();
    ensureToolboxDefaults(services);
    const repo = services.getRequired(ToolboxRepository.Key);
    ensureToolboxDefaults(services);
    assert.equal(services.getRequired(ToolboxRepository.Key), repo);   // same instance
    assert.equal(repo.Pages.Count, 1);                                  // one Shapes page
    assert.equal(repo.Pages.Get(0)!.Items.Count, SHAPE_CATALOG.length); // not doubled
});

test('ensureToolboxDefaults tolerates undefined services (headless Diagram)', () => {
    assert.doesNotThrow(() => ensureToolboxDefaults(undefined));
});
