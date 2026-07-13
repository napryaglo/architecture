import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { compile } from '../compile.js';

function emitted(src: string): string
{
    return compile(src).js;
}

describe('compile — InvokeCommand trigger action', () => {
    test('on Click { InvokeCommand[Command=$SaveCommand] } emits an InvokeCommandAction reading DataContext.SaveCommand', () => {
        const js = emitted(`
            Application{
                resources: {
                    Style[TargetType=Button]{
                        on Click {
                            InvokeCommand[Command=$SaveCommand]
                        }
                    }
                }
            }
        `);

        assert.match(js, /import .*InvokeCommandAction.* from "mural\/runtime"/);
        assert.match(
            js,
            /new InvokeCommandAction\(\(_target\) => _target\.DataContext\?\.SaveCommand\);/,
        );
        assert.match(js, /new EventTrigger\("Click", \[_act\d+\]\);/);
    });

    test('multi-part path lowers to an optional-chained walk', () => {
        const js = emitted(`
            Application{
                resources: {
                    Style[TargetType=Button]{
                        on Click {
                            InvokeCommand[Command=$Vm.Commands.Save]
                        }
                    }
                }
            }
        `);
        assert.match(
            js,
            /new InvokeCommandAction\(\(_target\) => _target\.DataContext\?\.Vm\?\.Commands\?\.Save\);/,
        );
    });

    test('InvokeCommand alongside BeginStoryboard in the same EventTrigger emits both actions in order', () => {
        const js = emitted(`
            Application{
                resources: {
                    Style[TargetType=Button]{
                        on Click {
                            BeginStoryboard {
                                DoubleAnimation[TargetProperty=Width, From=80, To=240, Duration=400]
                            }
                            InvokeCommand[Command=$AfterAnimate]
                        }
                    }
                }
            }
        `);
        // Both actions packed into the EventTrigger's actions array.
        assert.match(js, /new EventTrigger\("Click", \[_act\d+, _act\d+\]\);/);
        assert.match(js, /new BeginStoryboardAction\(/);
        assert.match(js, /new InvokeCommandAction\(/);
    });

    test('InvokeCommand without Command attribute is a parse error', () => {
        assert.throws(() => emitted(`
            Application{
                resources: {
                    Style[TargetType=Button]{
                        on Click { InvokeCommand[] }
                    }
                }
            }
        `), /Command/);
    });

    test('InvokeCommand with non-binding Command is an emit error', () => {
        assert.throws(() => emitted(`
            Application{
                resources: {
                    Style[TargetType=Button]{
                        on Click { InvokeCommand[Command="oops"] }
                    }
                }
            }
        `), /\$-binding/);
    });

    test('on PointerDown { InvokeCommand } works for routed events too', () => {
        const js = emitted(`
            Application{
                resources: {
                    Style[TargetType=Button]{
                        on PointerDown {
                            InvokeCommand[Command=$Probe]
                        }
                    }
                }
            }
        `);
        assert.match(js, /new EventTrigger\("PointerDown", \[_act\d+\]\);/);
        assert.match(
            js,
            /new InvokeCommandAction\(\(_target\) => _target\.DataContext\?\.Probe\);/,
        );
    });
});
