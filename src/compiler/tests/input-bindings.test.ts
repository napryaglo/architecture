import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../compile.js';

describe('compile — InputBindings / CommandBindings markup authoring', () => {
    test('KeyBinding[Key=…, Modifiers=…] lowers to plain-field assignment + push', () => {
        // KeyBinding is a plain value-object (not a Model/DP subclass), so
        // the emitter sets its fields directly and appends to the
        // (array-backed) InputBindings collection via push.
        const js = compile(`
            Application{ resources: {
                Button x:root {
                    InputBindings {
                        KeyBinding[Key=S, Modifiers=Control]
                    }
                }
            } }
        `).js;
        assert.match(js, /new KeyBinding\(\)/);
        assert.match(js, /\.Key = Key\.S;/);
        assert.match(js, /\.Modifiers = ModifierKeys\.Control;/);
        assert.match(js, /\.InputBindings\.push\(/);
        // Symbols pulled in from the right modules.
        assert.match(js, /import \{[^}]*KeyBinding[^}]*\} from "mural\/framework\/commands\/input-binding\.js"/);
        assert.match(js, /import \{[^}]*\bKey\b[^}]*\} from "mural\/runtime"/);
    });

    test('MouseBinding[Gesture=…] resolves the MouseAction enum', () => {
        const js = compile(`
            Application{ resources: {
                Button x:root {
                    InputBindings {
                        MouseBinding[Gesture=RightDoubleClick]
                    }
                }
            } }
        `).js;
        assert.match(js, /new MouseBinding\(\)/);
        assert.match(js, /\.Gesture = MouseAction\.RightDoubleClick;/);
        assert.match(js, /\.InputBindings\.push\(/);
    });

    test('an unknown Key member is a compile error (strict enum validation)', () => {
        assert.throws(() => compile(`
            Application{ resources: {
                Button x:root {
                    InputBindings { KeyBinding[Key=Nope] }
                }
            } }
        `), /Nope/);
    });

    test('an unknown property on a Model class still errors (plain-field path is non-DP only)', () => {
        // Regression guard: the non-DP fallback must NOT swallow real
        // authoring mistakes on DP-backed classes.
        assert.throws(() => compile(`
            Application{ resources: {
                Button x:root [Bogus=3]
            } }
        `), /not registered on class/);
    });
});
