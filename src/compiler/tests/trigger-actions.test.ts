import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { compile } from '../compile.js';

function emitted(src: string): string
{
    return compile(src).js;
}

describe('compile — declarative EventTrigger + BeginStoryboard', () => {
    test('Style with `on Click { BeginStoryboard { DoubleAnimation[...] } }` emits EventTrigger + Storyboard factory', () => {
        const js = emitted(`
            Application{
                resources: {
                    style[targettype=Button]{
                        on Click {
                            BeginStoryboard {
                                DoubleAnimation[TargetProperty=Width, From=80, To=240, Duration=400]
                            }
                        }
                    }
                }
            }
        `);

        // EventTrigger registered with the routed-event name "Click".
        assert.match(js, /new EventTrigger\("Click", \[_act\d+\]\);/);

        // The action is a BeginStoryboardAction whose factory builds a
        // Storyboard with sb.Add(_target, "Width", new DoubleAnimation(…)).
        assert.match(js, /new BeginStoryboardAction\(\(_target\) => \{/);
        assert.match(js, /const _sb\d+ = new Storyboard\(\);/);
        assert.match(
            js,
            /_sb\d+\.Add\(_target, "Width", new DoubleAnimation\(\{ From: 80, To: 240, Duration: 400 \}\)\);/,
        );

        // Style constructor picks up the new 6th positional arg for
        // event triggers when at least one is present.
        assert.match(
            js,
            /new Style\(Button, \[\], undefined, \[\], \[\], \[_evt\d+\]\);/,
        );
    });

    test('Style WITHOUT event triggers keeps the legacy 5-arg Style constructor shape', () => {
        const js = emitted(`
            Application{
                resources: {
                    style[targettype=Button]{
                        Background = #ff0000;
                    }
                }
            }
        `);
        // No 6th arg — preserves existing snapshot-test compatibility.
        assert.match(
            js,
            /new Style\(Button, \[_setter\d+\], undefined, \[\], \[\]\);/,
        );
        assert.doesNotMatch(js, /EventTrigger|BeginStoryboardAction|Storyboard/);
    });

    test('Multiple animations in one BeginStoryboard bundle into a single Storyboard', () => {
        const js = emitted(`
            Application{
                resources: {
                    style[targettype=Button]{
                        on Click {
                            BeginStoryboard {
                                DoubleAnimation[TargetProperty=Width, To=240, Duration=400]
                                DoubleAnimation[TargetProperty=Height, To=80, Duration=400, BeginTime=100]
                            }
                        }
                    }
                }
            }
        `);
        // Both animations added to the SAME Storyboard variable.
        const adds = js.match(/_sb(\d+)\.Add\(/g) ?? [];
        assert.equal(adds.length, 2);
        const sbVars = new Set(adds.map(s => s.split('.')[0]));
        assert.equal(sbVars.size, 1, 'both animations bind to the same Storyboard');
    });

    test('Multiple `on Click { ... }` blocks emit multiple EventTriggers', () => {
        const js = emitted(`
            Application{
                resources: {
                    style[targettype=Button]{
                        on Click {
                            BeginStoryboard {
                                DoubleAnimation[TargetProperty=Width, To=200, Duration=300]
                            }
                        }
                        on Click {
                            BeginStoryboard {
                                DoubleAnimation[TargetProperty=Height, To=40, Duration=300]
                            }
                        }
                    }
                }
            }
        `);
        const evts = js.match(/new EventTrigger\("Click"/g) ?? [];
        assert.equal(evts.length, 2);
    });

    test('TargetProperty accepts a bare identifier OR a quoted string', () => {
        const jsIdent = emitted(`
            Application{ resources: {
                style[targettype=Button]{
                    on Click { BeginStoryboard { DoubleAnimation[TargetProperty=Width, To=100, Duration=200] } }
                }
            }}
        `);
        assert.match(jsIdent, /\.Add\(_target, "Width", /);

        const jsString = emitted(`
            Application{ resources: {
                style[targettype=Button]{
                    on Click { BeginStoryboard { DoubleAnimation[TargetProperty="Width", To=100, Duration=200] } }
                }
            }}
        `);
        assert.match(jsString, /\.Add\(_target, "Width", /);
    });

    test('Animation declaration without TargetProperty is rejected with a clear error', () => {
        assert.throws(
            () => emitted(`
                Application{ resources: {
                    style[targettype=Button]{
                        on Click { BeginStoryboard { DoubleAnimation[To=100, Duration=200] } }
                    }
                }}
            `),
            /TargetProperty/,
        );
    });

    test('Empty BeginStoryboard body (no animations) is a clear error', () => {
        assert.throws(
            () => emitted(`
                Application{ resources: {
                    style[targettype=Button]{
                        on Click { BeginStoryboard { } }
                    }
                }}
            `),
            /at least one animation/,
        );
    });

    test('Setters and event triggers can coexist in one style', () => {
        const js = emitted(`
            Application{
                resources: {
                    style[targettype=Button]{
                        Background = #1976d2;
                        on Click {
                            BeginStoryboard {
                                DoubleAnimation[TargetProperty=Width, To=240, Duration=400]
                            }
                        }
                    }
                }
            }
        `);
        assert.match(js, /new Setter\(Button, "Background", /);
        assert.match(js, /new EventTrigger\("Click"/);
        // Setters arg is non-empty AND event-triggers arg is non-empty.
        assert.match(
            js,
            /new Style\(Button, \[_setter\d+\], undefined, \[\], \[\], \[_evt\d+\]\);/,
        );
    });
});
