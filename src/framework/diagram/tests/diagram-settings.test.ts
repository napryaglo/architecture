import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Application, Color } from '../../../runtime/index.js';
import { SolidColorBrush } from '../../../visual-engine/index.js';
import { ApplicationSettings } from '../../shell/services/application-settings-service.js';
import { DiagramSettings, DiagramSettingKey } from '../diagram-settings.js';

// Build an Application with ApplicationSettings registered at the ROOT — the
// same shape Plexus / EditorShell produce, and where the static helper resolves
// it (Application.current.Services).
function appWithSettings(): Application
{
    const app = new Application();
    app.Services.register(ApplicationSettings.Key, p => new ApplicationSettings(p));
    return app;
}

afterEach(() => { Application.current = null; });

describe('DiagramSettings', () => {
    test('returns compiled-in defaults when no settings host is reachable', () => {
        Application.current = null;
        assert.equal(DiagramSettings.ShapeDefaultSize(), 80);
        assert.equal(DiagramSettings.ConnectorOrthogonalStub(), 20);
        assert.equal(DiagramSettings.HoverHaloOpacity(), 0.45);
        assert.equal(DiagramSettings.GuideThickness(), 1);
    });

    test('self-publishes its definitions to the settings host on first resolve', () => {
        const app = appWithSettings();
        const settings = app.Services.getRequired(ApplicationSettings.Key);
        // Nothing contributed until the helper touches the service.
        assert.equal(settings.GetSetting(DiagramSettingKey.ShapeDefaultSize), undefined);

        // Any accessor read binds + contributes.
        assert.equal(DiagramSettings.ShapeDefaultSize(), 80);

        const s = settings.GetSetting(DiagramSettingKey.ShapeDefaultSize);
        assert.ok(s !== undefined, 'definition contributed');
        assert.equal(s!.Value, 80, 'seeded from the definition default');
        // Every catalogued key is present.
        assert.ok(settings.GetSetting(DiagramSettingKey.ConnectorLaneGap) !== undefined);
        assert.ok(settings.GetSetting(DiagramSettingKey.ChromeEndpointHandleSize) !== undefined);
    });

    test('an override in the settings host is reflected by the accessor', () => {
        const app = appWithSettings();
        const settings = app.Services.getRequired(ApplicationSettings.Key);
        // Bind first (contributes the definitions), then override.
        DiagramSettings.ConnectorOrthogonalStub();
        settings.Set(DiagramSettingKey.ConnectorOrthogonalStub, 40);
        assert.equal(DiagramSettings.ConnectorOrthogonalStub(), 40);
    });

    test('toolbox tile size defaults to 48 and honours an override', () => {
        Application.current = null;
        assert.equal(DiagramSettings.ToolboxTileSize(), 48);

        const app = appWithSettings();
        const settings = app.Services.getRequired(ApplicationSettings.Key);
        DiagramSettings.ToolboxTileSize();               // bind + contribute
        settings.Set(DiagramSettingKey.ToolboxTileSize, 64);
        assert.equal(DiagramSettings.ToolboxTileSize(), 64);
    });

    test('toolbox preview fill defaults to the #1976d2 brush', () => {
        Application.current = null;
        const fill = DiagramSettings.ToolboxPreviewFill();
        assert.ok(fill instanceof SolidColorBrush);
        assert.equal(fill.Color.ToHex().toLowerCase(), '#1976d2');
    });

    test('a Color override on the toolbox preview fill is reflected', () => {
        const app = appWithSettings();
        const settings = app.Services.getRequired(ApplicationSettings.Key);
        DiagramSettings.ToolboxPreviewFill();            // bind + contribute
        settings.Set(DiagramSettingKey.ToolboxPreviewFill, new SolidColorBrush(Color.FromHex('#ff0000')));
        assert.equal(DiagramSettings.ToolboxPreviewFill().Color.ToHex().toLowerCase(), '#ff0000');
    });

    test('Subscribe fires when a Diagram setting changes', () => {
        const app = appWithSettings();
        const settings = app.Services.getRequired(ApplicationSettings.Key);
        // Ensure definitions are contributed and listeners wired.
        DiagramSettings.ShapeDefaultSize();

        let fired = 0;
        const unsub = DiagramSettings.Subscribe(() => { fired++; });
        settings.Set(DiagramSettingKey.ShapeDefaultSize, 120);
        assert.ok(fired >= 1, 'listener notified on change');

        unsub();
        settings.Set(DiagramSettingKey.ShapeDefaultSize, 64);
        assert.equal(fired, 1, 'no further notifications after unsubscribe');
    });
});
