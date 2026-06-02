import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { compile } from '../compile.js';

function emitted(src: string): string
{
    return compile(src).js;
}

describe('compile — named storyboards (Stop / Pause / Resume)', () => {
    test('BeginStoryboard [Name="fade"] emits the 2-arg constructor form', () => {
        const js = emitted(`
            Application{ resources: {
                style[targettype=Button]{
                    on Click {
                        BeginStoryboard [Name="fade"] {
                            DoubleAnimation[TargetProperty=Width, To=100, Duration=200]
                        }
                    }
                }
            }}
        `);
        // BeginStoryboardAction((_target) => {...}, "fade")
        assert.match(
            js,
            /new BeginStoryboardAction\(\(_target\) => \{[\s\S]*?\}, "fade"\);/,
        );
    });

    test('BeginStoryboard WITHOUT Name keeps the legacy 1-arg form', () => {
        const js = emitted(`
            Application{ resources: {
                style[targettype=Button]{
                    on Click {
                        BeginStoryboard {
                            DoubleAnimation[TargetProperty=Width, To=100, Duration=200]
                        }
                    }
                }
            }}
        `);
        // The factory's closing `})` has no trailing Name arg.
        assert.match(js, /\}\);$/m);
        assert.doesNotMatch(js, /\},\s*"[^"]+"\);/);
    });

    test('StopStoryboard / PauseStoryboard / ResumeStoryboard emit single-arg action classes', () => {
        const js = emitted(`
            Application{ resources: {
                style[targettype=Button]{
                    on Click       { StopStoryboard[Name="fade"] }
                    on PointerDown { PauseStoryboard[Name="fade"] }
                    on PointerUp   { ResumeStoryboard[Name="fade"] }
                }
            }}
        `);
        assert.match(js, /new StopStoryboardAction\("fade"\);/);
        assert.match(js, /new PauseStoryboardAction\("fade"\);/);
        assert.match(js, /new ResumeStoryboardAction\("fade"\);/);
    });

    test('StopStoryboard accepts a bare-ident Name', () => {
        const js = emitted(`
            Application{ resources: {
                style[targettype=Button]{
                    on Click { StopStoryboard[Name=fade] }
                }
            }}
        `);
        assert.match(js, /new StopStoryboardAction\("fade"\);/);
    });

    test('StopStoryboard requires a Name attribute', () => {
        assert.throws(
            () => emitted(`
                Application{ resources: {
                    style[targettype=Button]{
                        on Click { StopStoryboard }
                    }
                }}
            `),
            /Name/,
        );
    });

    test('Pause / Resume in enter / exit of a property trigger', () => {
        const js = emitted(`
            Application{ resources: {
                style[targettype=Button]{
                    on Loaded {
                        BeginStoryboard [Name="loop"] {
                            DoubleAnimation[TargetProperty=Width, From=80, To=200, Duration=600, RepeatBehavior=Infinity]
                        }
                    }
                    when( IsMouseOver ){
                        on enter { PauseStoryboard[Name="loop"] }
                        on exit  { ResumeStoryboard[Name="loop"] }
                    }
                }
            }}
        `);
        // Begin in Loaded event trigger.
        assert.match(js, /new BeginStoryboardAction\([\s\S]*?\}, "loop"\)/);
        // Pause + Resume routed through enter / exit arrays.
        assert.match(js, /new PauseStoryboardAction\("loop"\)/);
        assert.match(js, /new ResumeStoryboardAction\("loop"\)/);
        // Infinity stays as a raw JS literal (not a string) so RepeatBehavior
        // remains a number.
        assert.match(js, /RepeatBehavior: Infinity/);
    });
});
