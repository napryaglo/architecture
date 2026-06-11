import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { compile } from '../compile.js';

function emitted(src: string): string
{
    return compile(src).js;
}

describe('compile — `on enter` / `on exit` inside when(){...}', () => {
    test('Single property trigger with enter + exit BeginStoryboard actions', () => {
        const js = emitted(`
            Application{ resources: {
                Style[TargetType=Button]{
                    when( IsMouseOver ){
                        Background = #2196f3;
                        on enter {
                            BeginStoryboard {
                                DoubleAnimation[TargetProperty=Opacity, To=0.8, Duration=200]
                            }
                        }
                        on exit {
                            BeginStoryboard {
                                DoubleAnimation[TargetProperty=Opacity, To=1, Duration=200]
                            }
                        }
                    }
                }
            }}
        `);

        // Enter and exit action arrays emitted as locals.
        assert.match(js, /const _enter\d+ = \[_act\d+\];/);
        assert.match(js, /const _exit\d+ = \[_act\d+\];/);

        // PropertyTrigger now gets a 6-arg call shape:
        // (owner, name, value, setters, enterArr, exitArr).
        assert.match(
            js,
            /new PropertyTrigger\(Button, "IsMouseOver", true, _sArr\d+, _enter\d+, _exit\d+\);/,
        );
    });

    test("when() without action blocks keeps the legacy 4-arg PropertyTrigger shape", () => {
        const js = emitted(`
            Application{ resources: {
                Style[TargetType=Border]{
                    when( IsMouseOver ){
                        Background = #eeeeee;
                    }
                }
            }}
        `);
        assert.match(
            js,
            /new PropertyTrigger\(Border, "IsMouseOver", true, _sArr\d+\);/,
        );
        // No enter/exit locals were emitted.
        assert.doesNotMatch(js, /_enter\d+|_exit\d+/);
    });

    test('Only `enter` or only `exit` works (the other side defaults to empty)', () => {
        const js = emitted(`
            Application{ resources: {
                Style[TargetType=Button]{
                    when( IsFocused ){
                        on enter {
                            BeginStoryboard {
                                DoubleAnimation[TargetProperty=Width, To=240, Duration=300]
                            }
                        }
                    }
                }
            }}
        `);
        // Enter array emitted; exit slot is the literal `[]` placeholder.
        assert.match(
            js,
            /new PropertyTrigger\(Button, "IsFocused", true, _sArr\d+, _enter\d+, \[\]\);/,
        );
    });

    test("Non-enter / non-exit 'on' name inside when() is rejected", () => {
        assert.throws(
            () => emitted(`
                Application{ resources: {
                    Style[TargetType=Button]{
                        when( IsMouseOver ){
                            on Click { BeginStoryboard { DoubleAnimation[TargetProperty=Width, To=100, Duration=200] } }
                        }
                    }
                }}
            `),
            /only 'enter' and 'exit'/,
        );
    });

    test('ControlTemplate `when(PART_X.IsMouseOver)` lowers to TemplatePropertyTrigger with sourceName="PART_X"', () => {
        const js = emitted(`
            Application{ resources: {
                Template x:key="Tmpl" [TargetType=Border] {
                    Border x:name="PART_Row" {}
                    when ( PART_Row.IsMouseOver ) {
                        PART_Row.Background = #eeeeee;
                    }
                }
            }}
        `);
        // 5-arg form (no enter/exit actions): the sourceName slot
        // carries "PART_Row" instead of undefined.
        assert.match(
            js,
            /new TemplatePropertyTrigger\(Border, "IsMouseOver", true, _tplSet\d+, "PART_Row"\);/,
        );
    });

    test('ControlTemplate `when(IsMouseOver)` keeps the undefined sourceName slot (templated parent watch)', () => {
        const js = emitted(`
            Application{ resources: {
                Template x:key="Tmpl" [TargetType=Border] {
                    Border x:name="PART_Row" {}
                    when ( IsMouseOver ) {
                        PART_Row.Background = #eeeeee;
                    }
                }
            }}
        `);
        // 5-arg form with explicit undefined sourceName — the
        // historic shape (watch the templated parent).
        assert.match(
            js,
            /new TemplatePropertyTrigger\(Border, "IsMouseOver", true, _tplSet\d+, undefined\);/,
        );
    });

    test('MultiTrigger (a AND b) also carries enter / exit actions', () => {
        const js = emitted(`
            Application{ resources: {
                Style[TargetType=Button]{
                    when( IsMouseOver and IsFocused ){
                        on enter {
                            BeginStoryboard {
                                DoubleAnimation[TargetProperty=Opacity, To=0.7, Duration=200]
                            }
                        }
                    }
                }
            }}
        `);
        assert.match(
            js,
            /new MultiTrigger\(\[.*\], _sArr\d+, _enter\d+, \[\]\);/,
        );
    });
});

describe('compile — Storyboard.TargetName', () => {
    test('TargetName emits a _target.FindName(...) lookup as the sb.Add target', () => {
        const js = emitted(`
            Application{ resources: {
                Style[TargetType=Button]{
                    on Click {
                        BeginStoryboard {
                            DoubleAnimation[TargetName=anim, TargetProperty=Width, To=240, Duration=400]
                        }
                    }
                }
            }}
        `);
        assert.match(
            js,
            /_sb\d+\.Add\(\(_target\.FindName\("anim"\) \?\? _target\), "Width", /,
        );
    });

    test('No TargetName falls back to _target directly', () => {
        const js = emitted(`
            Application{ resources: {
                Style[TargetType=Button]{
                    on Click {
                        BeginStoryboard {
                            DoubleAnimation[TargetProperty=Width, To=240, Duration=400]
                        }
                    }
                }
            }}
        `);
        assert.match(js, /_sb\d+\.Add\(_target, "Width", /);
        assert.doesNotMatch(js, /FindName/);
    });

    test('TargetName accepts a bare identifier OR a quoted string', () => {
        const jsIdent = emitted(`
            Application{ resources: {
                Style[TargetType=Button]{
                    on Click {
                        BeginStoryboard {
                            DoubleAnimation[TargetName=anim, TargetProperty=Width, To=200, Duration=400]
                        }
                    }
                }
            }}
        `);
        assert.match(jsIdent, /FindName\("anim"\)/);

        const jsString = emitted(`
            Application{ resources: {
                Style[TargetType=Button]{
                    on Click {
                        BeginStoryboard {
                            DoubleAnimation[TargetName="anim", TargetProperty=Width, To=200, Duration=400]
                        }
                    }
                }
            }}
        `);
        assert.match(jsString, /FindName\("anim"\)/);
    });
});
