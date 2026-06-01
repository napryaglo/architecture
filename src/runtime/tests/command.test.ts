import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { RelayCommand, type ICommand } from '../command.js';

describe('RelayCommand — ICommand contract', () => {
    test('Execute invokes the supplied function with the parameter', () => {
        const seen: unknown[] = [];
        const cmd: ICommand = new RelayCommand(p => { seen.push(p); });
        cmd.Execute('hello');
        cmd.Execute({ id: 1 });
        assert.deepEqual(seen, ['hello', { id: 1 }]);
    });

    test('CanExecute defaults to true when no guard is supplied', () => {
        const cmd: ICommand = new RelayCommand(() => {});
        assert.equal(cmd.CanExecute(), true);
        assert.equal(cmd.CanExecute('whatever'), true);
    });

    test('CanExecute delegates to the guard when supplied', () => {
        const cmd: ICommand = new RelayCommand(
            () => {},
            (p) => typeof p === 'number' && p > 0,
        );
        assert.equal(cmd.CanExecute(0),   false);
        assert.equal(cmd.CanExecute(1),   true);
        assert.equal(cmd.CanExecute('x'), false);
    });

    test('AddCanExecuteChangedListener fires on RaiseCanExecuteChanged', () => {
        const cmd = new RelayCommand(() => {});
        let fired = 0;
        const listener = (): void => { fired++; };
        cmd.AddCanExecuteChangedListener(listener);

        cmd.RaiseCanExecuteChanged();
        cmd.RaiseCanExecuteChanged();
        assert.equal(fired, 2);
    });

    test('RemoveCanExecuteChangedListener stops subsequent notifications', () => {
        const cmd = new RelayCommand(() => {});
        let fired = 0;
        const listener = (): void => { fired++; };
        cmd.AddCanExecuteChangedListener(listener);
        cmd.RaiseCanExecuteChanged();
        assert.equal(fired, 1);

        cmd.RemoveCanExecuteChangedListener(listener);
        cmd.RaiseCanExecuteChanged();
        assert.equal(fired, 1, 'removed listener should not fire again');
    });

    test('Listener that detaches itself mid-fire does not perturb iteration', () => {
        // Same snapshot guarantee as Click handlers: RaiseCanExecuteChanged
        // walks a copy of the current set, so a listener removing itself
        // during dispatch still completes the rest of the round.
        const cmd = new RelayCommand(() => {});
        const order: string[] = [];
        const a = (): void => { order.push('a'); cmd.RemoveCanExecuteChangedListener(a); };
        const b = (): void => { order.push('b'); };
        cmd.AddCanExecuteChangedListener(a);
        cmd.AddCanExecuteChangedListener(b);

        cmd.RaiseCanExecuteChanged();
        // Both fired despite `a` removing itself.
        assert.deepEqual(order, ['a', 'b']);

        // Next round: `a` is gone, only `b` runs.
        order.length = 0;
        cmd.RaiseCanExecuteChanged();
        assert.deepEqual(order, ['b']);
    });
});
