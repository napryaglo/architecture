import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    Application,
    EventTrigger,
    InvokeCommandAction,
    PointerButton,
    NoModifiers,
    RelayCommand,
    Style,
    type ICommand,
} from '../index.js';
import { Button } from 'mural/framework';

describe('InvokeCommandAction', () => {
    beforeEach(() => { Application.current = null; });

    test('Invoke calls the factory and executes the command with the args', () => {
        const calls: Array<{ p: unknown }> = [];
        const cmd: ICommand = new RelayCommand((p) => { calls.push({ p }); });
        const btn = new Button();
        const action = new InvokeCommandAction((_target) => cmd);
        action.Invoke(btn, { tag: 'args' });
        assert.deepEqual(calls, [{ p: { tag: 'args' } }]);
    });

    test('Invoke is a no-op when the factory returns undefined', () => {
        let factoryCalls = 0;
        const action = new InvokeCommandAction(() => { factoryCalls++; return undefined; });
        action.Invoke(new Button(), undefined);
        assert.equal(factoryCalls, 1);             // factory still called
        // No throw, no command execute — the factory returning undefined
        // is the documented "no command bound yet" case.
    });

    test('Invoke skips Execute when CanExecute returns false', () => {
        let executeCalls = 0;
        const cmd = new RelayCommand(() => { executeCalls++; }, () => false);
        const action = new InvokeCommandAction(() => cmd);
        action.Invoke(new Button(), undefined);
        assert.equal(executeCalls, 0);
    });

    test('factory re-runs on every fire — VM-side command swap propagates', () => {
        let calls = 0;
        const cmdA = new RelayCommand(() => { calls += 1; });
        const cmdB = new RelayCommand(() => { calls += 10; });
        let current: ICommand = cmdA;
        const action = new InvokeCommandAction(() => current);
        action.Invoke(new Button(), undefined);    // +1
        current = cmdB;
        action.Invoke(new Button(), undefined);    // +10
        assert.equal(calls, 11);
    });
});

describe('EventTrigger + InvokeCommandAction wiring', () => {
    beforeEach(() => { Application.current = null; });

    test('on Click { InvokeCommand } subscribes through Button.AddClickHandler', () => {
        // AddClickHandler is the seam install_event_trigger uses for
        // 'Click'. We assert the listener install side-effect rather
        // than driving a full click pipeline (which needs the
        // PointerDown/Up + ClickMode plumbing).
        const btn = new Button();
        const trigger = new EventTrigger('Click', [
            new InvokeCommandAction(() => undefined),
        ]);
        const style = new Style(Button, [], undefined, [], [], [trigger]);
        btn.Style = style;
        // After Style install the EventTrigger should be subscribed —
        // detected by checking the Button's internal click-handler list
        // grew. (Private field reach via duck-cast; matches existing
        // trigger-actions test pattern.)
        const clicks = (btn as unknown as { _clickHandlers: unknown[] })._clickHandlers;
        assert.equal(clicks.length, 1);
    });

    test('on PointerDown { InvokeCommand } forwards PointerEventArgs as the command parameter', () => {
        const btn = new Button();
        let seenArgs: unknown = null;
        btn.DataContext = {
            Probe: new RelayCommand((p) => { seenArgs = p; }),
        };

        const trigger = new EventTrigger('PointerDown', [
            new InvokeCommandAction((target) => {
                const dc = (target as unknown as { DataContext: { Probe: ICommand } }).DataContext;
                return dc.Probe;
            }),
        ]);
        const style = new Style(Button, [], undefined, [], [], [trigger]);
        btn.Style = style;

        // Drive a PointerDown via the generic routed-listener registry,
        // matching how the InputManager would fire it.
        const fakeArgs = {
            Kind: 'PointerDown', Source: btn, HostX: 12, HostY: 34,
            Button: PointerButton.Primary, Buttons: 1,
            Modifiers: NoModifiers, PointerId: 0, Pressure: 0,
            PointerType: 'mouse',
            Handled: false, Strategy: 'bubble',
            Visual: btn,
        };
        btn.FireRoutedListeners('PointerDown', fakeArgs);
        assert.equal(seenArgs, fakeArgs);
    });
});
