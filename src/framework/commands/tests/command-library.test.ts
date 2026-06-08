import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    ApplicationCommands,
    EditingCommands,
    MediaCommands,
    NavigationCommands,
    RoutedCommand,
} from '../../index.js';;

describe('Named-command libraries — identity + gestures', () => {
    test('ApplicationCommands.Save is a RoutedCommand with Ctrl+S gesture', () => {
        const cmd = ApplicationCommands.Save;
        assert.ok(cmd instanceof RoutedCommand);
        assert.equal(cmd.Name, 'Save');
        assert.equal(cmd.OwnerType, ApplicationCommands);
        assert.equal(cmd.InputGestures[0]?.DisplayString, 'Ctrl+S');
    });

    test('ApplicationCommands.SaveAs uses Ctrl+Shift+S', () => {
        assert.equal(ApplicationCommands.SaveAs.InputGestures[0]?.DisplayString, 'Ctrl+Shift+S');
    });

    test('EditingCommands.Delete identity matches "Delete"', () => {
        const cmd = EditingCommands.Delete;
        assert.ok(cmd instanceof RoutedCommand);
        assert.equal(cmd.Name, 'Delete');
        assert.equal(cmd.OwnerType, EditingCommands);
    });

    test('ApplicationCommands.Delete and EditingCommands.Delete are distinct singletons', () => {
        // Same gesture, different identity — WPF parity. Important
        // because a CommandBinding for ApplicationCommands.Delete
        // shouldn't catch an EditingCommands.Delete fire and vice versa.
        assert.notEqual(ApplicationCommands.Delete, EditingCommands.Delete);
    });

    test('NavigationCommands.Refresh ships F5 as its default gesture', () => {
        assert.equal(NavigationCommands.Refresh.InputGestures[0]?.DisplayString, 'F5');
    });

    test('MediaCommands.Play exists with no default gesture (no widely-used keyboard shortcut)', () => {
        assert.ok(MediaCommands.Play instanceof RoutedCommand);
        assert.equal(MediaCommands.Play.InputGestures.length, 0);
    });

    test('Static fields are singleton references — repeated access returns same instance', () => {
        const a = ApplicationCommands.Save;
        const b = ApplicationCommands.Save;
        assert.equal(a, b, 'singleton');
    });
});
