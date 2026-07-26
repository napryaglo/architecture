import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile } from '../../compiler/compile.js';
import { makeIncludeResolver } from '../include-resolver.js';

// End-to-end: the real filesystem resolver over on-disk .svg fixtures,
// driven through the compiler. Monochrome → Geometry; colored → IconDefinition.

function fixtureDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'mural-include-'));
    writeFileSync(join(dir, 'home.svg'),
        `<svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20"/></svg>`);
    writeFileSync(join(dir, 'logo.svg'),
        `<svg viewBox="0 0 24 24"><rect x="0" y="0" width="12" height="12" fill="#ff0000"/><circle cx="18" cy="18" r="4" fill="#0000ff"/></svg>`);
    return dir;
}

describe('makeIncludeResolver — colored vs monochrome', () => {

    test('monochrome include emits a Geometry from visual-engine (unchanged)', () => {
        const dir = fixtureDir();
        const js = compile(`resources I { include "home.svg" }`,
            { include: makeIncludeResolver(dir) }).js;
        assert.match(js, /\.Set\("home", new RectangleGeometry\(/);
        assert.match(js, /from "@pragmatic-lab\/mural\/visual-engine"/);
        assert.doesNotMatch(js, /IconDefinition/);
    });

    test('colored include emits an IconDefinition + basic import', () => {
        const dir = fixtureDir();
        const js = compile(`resources I { include colored "logo.svg" as logo }`,
            { include: makeIncludeResolver(dir) }).js;
        assert.match(js, /\.Set\("logo", new IconDefinition\(24, 24, \[/);
        assert.match(js, /Fill: new Color\(255, 0, 0, 255\)/);
        assert.match(js, /import \{ IconDefinition \} from "@pragmatic-lab\/mural\/basic"/);
        assert.match(js, /Color/);   // Color imported from visual-engine
    });
});
