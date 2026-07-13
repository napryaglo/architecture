import {
    Application,
    Color,
    MetaData,
    Model,
    Scheme,
    Theme,
    ThemeManager,
    Visibility,
    defineScheme,
    Element, } from '../../runtime/index.js';
import { ContentControl } from '../base/content-control.js';
import { ComboBox } from '../list/combo-box.js';
import { ColorPicker } from '../formatting/color-picker.js';
import { ApplicationSettings } from '../shell/services/application-settings-service.js';
import { SettingDefinition, SettingKind } from '../shell/settings/setting-definition.js';
// Import from the generator's leaf module, NOT the resources/material barrel:
// the barrel pulls in material.mu, whose static init clones the framework
// resource dictionary (which references the ThemeSelector class) — importing it
// here would form a module-init cycle and hit ThemeSelector's TDZ. dynamic-scheme
// only depends on runtime + visual-engine, so it's cycle-free.
import { makeDynamicScheme } from '../../resources/material/dynamic-scheme.js';

// Scheme-combo sentinel rows. CUSTOM_ACTION is a momentary "open the base-colour
// picker" command — it never sticks as the selection (re-selecting it re-opens
// the dialog). CUSTOM_ACTIVE represents a live generated scheme so the combo has
// a row to show while one is applied. The generated scheme itself is named
// CUSTOM_SCHEME_NAME (never collides with a hand-authored scheme's display name).
const CUSTOM_ACTION      = 'Custom…';
const CUSTOM_ACTIVE      = 'Custom';
const CUSTOM_SCHEME_NAME = 'custom';

// Persistence keys (contributed as ApplicationSettings so an app with an
// ISettingsStore round-trips them across launches). SCHEME_SETTING holds the
// chosen scheme name (or CUSTOM_ACTIVE); SEED_SETTING the custom base-colour hex.
const SCHEME_SETTING = 'theme.scheme';
const SEED_SETTING   = 'theme.customSeed';

// ThemeSelector — chrome control for picking the active Theme + Scheme
// at runtime. Reads / writes the global ThemeManager directly; no VM
// state required on the host side.
//
// Layout (default template):
//
//   ┌─ PART_ThemeIcon ─┐ ┌─ PART_ThemeCombo ─┐  ┌─ PART_SchemeIcon ─┐ ┌─ PART_SchemeCombo ─┐
//   │   icon glyph     │ │  (slides in)      │  │   icon glyph      │ │   (slides in)      │
//   └──────────────────┘ └───────────────────┘  └───────────────────┘ └────────────────────┘
//
// Icons are always visible affordances. Both ComboBoxes slide in when
// the pointer enters the ThemeSelector and slide back out when the
// pointer leaves AND no dropdown popup is currently open — declared as
// `when ( IsMouseOver or PART_xxxCombo.IsDropDownOpen )` triggers in
// the default template. The control itself owns no open/closed DPs:
// hover state lives on the standard `IsMouseOver` already exposed by
// every and dropdown state lives on the inner ComboBoxes.
//
// The scheme combo appends a "Custom…" row that opens the ColorPicker's
// extended editor as a single centred modal (its own scrim + OK/Cancel — no
// wrapping dialog). The picked base colour generates a dynamic Material scheme
// (makeDynamicScheme) for the current light/dark mode and applies it globally
// via ThemeManager.ApplyScheme; the choice + seed persist through
// ApplicationSettings and re-apply on the next launch. Persistence is inert in a
// host without an ApplicationSettings service (the demos); the picker itself
// works anywhere the control is mounted.
//
// External theme changes (AutoScheme firing, another module calling
// ActivateTheme directly) feed back through ThemeManager.Activated so
// the picker's selected items stay in sync.
//
// Extends ContentControl purely for the Template + GetTemplateChild
// inheritance; the Content slot is unused.
export class ThemeSelector extends ContentControl
{
    // ── State DPs ─────────────────────────────────────────────────────
    //
    // Read-only mirrors of ThemeManager state, useful for hosts that
    // want to bind a label or status indicator to the active theme /
    // scheme without reaching into the singleton directly. The template
    // doesn't reference them — the inner ComboBoxes are bound
    // imperatively from syncFromThemeManager.

    private static readonly _ActiveThemeNamePriv = Model.RegisterReadOnlyProperty<string | undefined>(
        ThemeSelector, 'ActiveThemeName', undefined, MetaData.None,
    );
    public  static readonly ActiveThemeNameKey  = ThemeSelector._ActiveThemeNamePriv;

    private static readonly _ActiveSchemeNamePriv = Model.RegisterReadOnlyProperty<string | undefined>(
        ThemeSelector, 'ActiveSchemeName', undefined, MetaData.None,
    );
    public  static readonly ActiveSchemeNameKey  = ThemeSelector._ActiveSchemeNamePriv;

    static
    {
        Model.OverrideMetadata(ThemeSelector, Element.DefaultStyleKeyKey, { default_value: ThemeSelector });
    }

    // ── Template parts ────────────────────────────────────────────────
    private _themeCombo:  ComboBox | undefined;
    private _schemeCombo: ComboBox | undefined;

    // Guard for the round-trip: setting ComboBox.SelectedItem from the
    // ThemeManager-sync path would otherwise fire the SelectionChanged
    // listener and re-activate the same theme.
    private _syncing = false;

    // One-shot guard so the persisted choice re-applies exactly once (the
    // first construction), not on every toolbar rebuild.
    private _restored = false;
    // ApplicationSettings definitions are contributed lazily, once.
    private _contributed = false;

    // ThemeManager listener kept as a field so we can detach it (tests,
    // host swap). Production chrome lives for the app's lifetime so this
    // detaches as an exercise in good hygiene rather than a hard need.
    private readonly _onThemeActivated = (_theme: Theme, _scheme: Scheme): void =>
    {
        this.syncFromThemeManager();
    };

    constructor()
    {
        super();
        this.applyDefaultStyle();

        this._themeCombo  = this.GetTemplateChild('PART_ThemeCombo')  as ComboBox | undefined;
        this._schemeCombo = this.GetTemplateChild('PART_SchemeCombo') as ComboBox | undefined;

        this._themeCombo?.AddSelectionChangedListener(() =>
        {
            if (this._syncing) return;
            const name = this._themeCombo?.SelectedItem;
            if (typeof name === 'string') this.SelectTheme(name);
        });
        this._schemeCombo?.AddSelectionChangedListener(() =>
        {
            if (this._syncing) return;
            this.onSchemeSelected(this._schemeCombo?.SelectedItem);
        });

        // Initial sync from whatever's already active, plus subscribe to
        // future activations so external code paths (AutoScheme listener,
        // direct ThemeManager calls) keep the picker honest.
        this.syncFromThemeManager();
        ThemeManager.AddActivatedListener(this._onThemeActivated);
        // Re-apply a persisted custom / scheme choice (no-op without an
        // ApplicationSettings service or a saved value).
        this.restorePersistedOnce();
    }

    // ── Public DPs ────────────────────────────────────────────────────

    public get ActiveThemeName():  string | undefined { return this.get_property_value(ThemeSelector.ActiveThemeNameKey); }
    public get ActiveSchemeName(): string | undefined { return this.get_property_value(ThemeSelector.ActiveSchemeNameKey); }

    private setActiveThemeName(v: string | undefined): void
    {
        this.set_property_value_with_key(ThemeSelector._ActiveThemeNamePriv, v);
    }
    private setActiveSchemeName(v: string | undefined): void
    {
        this.set_property_value_with_key(ThemeSelector._ActiveSchemeNamePriv, v);
    }

    // ── Public selection API ──────────────────────────────────────────
    //
    // Wired from the inner ComboBox SelectionChanged listeners but also
    // public so hosts (tests, keyboard shortcuts on the demo VM) can
    // drive the picker programmatically.

    /** Activate the named Theme on the global ThemeManager, then refresh
     *  the picker's state. No-op if the name doesn't match a registered
     *  Theme. */
    public SelectTheme(name: string): void
    {
        const tm = ThemeManager;
        if (tm.GetTheme(name) === undefined) return;
        if (tm.ActiveTheme?.name === name) return;
        tm.ActivateTheme(name);
    }

    /** Activate the named Scheme on the active Theme. No-op if no theme
     *  is active or the scheme name isn't registered on it. */
    public SelectScheme(name: string): void
    {
        const tm = ThemeManager;
        const theme = tm.ActiveTheme;
        if (theme === undefined) return;
        if (!theme.schemes.has(name)) return;
        if (tm.ActiveScheme?.name === name) return;
        tm.ActivateScheme(name);
    }

    // ── Scheme-combo selection (built-ins + Custom) ───────────────────

    private onSchemeSelected(value: unknown): void
    {
        if (value === CUSTOM_ACTION)
        {
            // Momentary action — revert the visible selection to the active
            // scheme so "Custom…" stays re-clickable, then open the dialog.
            this.syncFromThemeManager();
            void this.pickCustom();
        }
        else if (value === CUSTOM_ACTIVE)
        {
            // The active generated scheme — already applied; nothing to do.
        }
        else if (typeof value === 'string')
        {
            this.SelectScheme(value);
            this.persistScheme(value);
        }
    }

    // Open the ColorPicker's extended editor as a single centred modal and, on
    // confirm, generate + apply a dynamic scheme. The picker is a mount-only host
    // (collapsed) attached to THIS control's overlay so its editor has a
    // presentation target; no wrapping dialog — the extended editor already has
    // its own scrim + OK/Cancel.
    private async pickCustom(): Promise<void>
    {
        const picker = new ColorPicker();
        picker.Visibility = Visibility.Collapsed;
        this.AttachOverlayChild(picker);
        try
        {
            const savedSeed = this.settings()?.Get<string>(SEED_SETTING);
            const seed = typeof savedSeed === 'string' && savedSeed !== '' ? savedSeed : undefined;
            const hex = await picker.OpenMoreColorsModal(seed);
            if (typeof hex === 'string') this.applyCustom(hex);
        }
        finally
        {
            this.DetachOverlayChild(picker);
        }
    }

    // Generate a dynamic Material scheme for the current light/dark mode from
    // the seed and apply it globally; the Activated listener re-syncs the combo.
    private applyCustom(hex: string): void
    {
        const tm = ThemeManager;
        const active    = tm.ActiveScheme;
        const themeName = tm.ActiveTheme?.name ?? 'material';
        const isDark    = (active?.name ?? '').toLowerCase().includes('dark');
        const generated = makeDynamicScheme({
            name:   CUSTOM_SCHEME_NAME,
            theme:  themeName,
            seed:   Color.FromHex(hex),
            isDark,
        });
        // makeDynamicScheme emits only the ~30 M3 colour roles, but a real scheme
        // carries ~195 tokens (spacing, typography, state layers, opacities, …).
        // Overlay the generated colours onto the ACTIVE scheme's full token set so
        // the applied scheme stays COMPLETE — replacing the dict with just the
        // colours would drop every @Spacing/@FontSize token to undefined and lay
        // the whole app out with NaN.
        const tokens = new Map<string, unknown>([
            ...(active?.tokens ?? new Map<string, unknown>()),
            ...generated.tokens,
        ]);
        const scheme = defineScheme({ name: CUSTOM_SCHEME_NAME, theme: themeName, tokens });
        tm.ApplyScheme(scheme);
        this.persistCustom(hex);
    }

    // Pull the picker's full state from ThemeManager. Called on
    // construction and on every ThemeManager.Activated event so external
    // theme writers (AutoScheme, direct API calls) stay in sync.
    private syncFromThemeManager(): void
    {
        this._syncing = true;
        try
        {
            const tm     = ThemeManager;
            const theme  = tm.ActiveTheme;
            const scheme = tm.ActiveScheme;

            this.setActiveThemeName(theme?.name);
            this.setActiveSchemeName(scheme?.name);

            const themeNames = tm.RegisteredThemes.map(t => t.name);
            if (this._themeCombo !== undefined)
            {
                this._themeCombo.Items        = themeNames;
                this._themeCombo.SelectedItem = theme?.name;
            }

            const builtinSchemes = theme !== undefined
                ? [...theme.schemes.values()].map(s => s.name)
                : [];
            const activeName     = scheme?.name;
            const activeIsCustom = activeName !== undefined && !builtinSchemes.includes(activeName);

            const schemeNames = [...builtinSchemes];
            if (activeIsCustom) schemeNames.push(CUSTOM_ACTIVE);
            schemeNames.push(CUSTOM_ACTION);

            if (this._schemeCombo !== undefined)
            {
                this._schemeCombo.Items        = schemeNames;
                this._schemeCombo.SelectedItem = activeIsCustom
                    ? CUSTOM_ACTIVE
                    : (activeName !== undefined && builtinSchemes.includes(activeName) ? activeName : undefined);
            }
        }
        finally
        {
            this._syncing = false;
        }
    }

    // ── Persistence ───────────────────────────────────────────────────

    private settings(): ApplicationSettings | undefined
    {
        const settings = Application.current?.Services.get(ApplicationSettings.Key);
        if (settings !== undefined && !this._contributed)
        {
            settings.Contribute([
                this.settingDef(SCHEME_SETTING, 'Colour scheme'),
                this.settingDef(SEED_SETTING,   'Custom base colour'),
            ]);
            this._contributed = true;
        }
        return settings;
    }

    private settingDef(key: string, label: string): SettingDefinition
    {
        const d = new SettingDefinition();
        d.Key      = key;
        d.Label    = label;
        d.Kind     = SettingKind.String;
        d.Category = 'Appearance';
        d.Default  = '';
        return d;
    }

    private persistScheme(name: string): void { this.settings()?.Set(SCHEME_SETTING, name); }

    private persistCustom(hex: string): void
    {
        const settings = this.settings();
        settings?.Set(SCHEME_SETTING, CUSTOM_ACTIVE);
        settings?.Set(SEED_SETTING, hex);
    }

    // Re-apply the persisted choice once, the first time the control builds.
    private restorePersistedOnce(): void
    {
        if (this._restored) return;
        this._restored = true;
        const settings = this.settings();
        if (settings === undefined) return;
        const saved = settings.Get<string>(SCHEME_SETTING);
        if (saved === undefined || saved === '') return;
        if (saved === CUSTOM_ACTIVE)
        {
            const hex = settings.Get<string>(SEED_SETTING);
            if (typeof hex === 'string' && hex !== '') this.applyCustom(hex);
        }
        else
        {
            this.SelectScheme(saved);
        }
    }
}
