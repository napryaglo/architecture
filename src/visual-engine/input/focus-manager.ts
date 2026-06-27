// WPF-parity FocusManager façade (System.Windows.Input.FocusManager).
//
// WPF separates KEYBOARD focus (the single element receiving key events,
// = Keyboard.FocusedElement) from LOGICAL focus (per focus scope: the
// element that regains focus when its scope is re-entered). A focus scope
// is any element with the FocusManager.IsFocusScope attached property set
// to true (Window / Menu / ToolBar are scopes in WPF).
//
//   * IsFocusScope (attached, bool) — marks an element a focus scope.
//   * FocusedElement (attached) — the logical-focus element WITHIN a
//     scope. Stored on the scope element; updated as keyboard focus moves.
//   * GetFocusedElement(scope) — logical focus of `scope` (or the global
//     keyboard focus when called with no scope).
//   * SetFocusedElement(scope, element) — record + move focus.

import { Model } from '../../runtime/model.js';
import { MetaData } from '../../runtime/metadata.js';
import type { Element } from '../element.js';
import { Keyboard } from './keyboard.js';

export class FocusManager
{
    // Attached: marks an element a focus scope.
    public static readonly IsFocusScopeKey = Model.RegisterAttachedProperty<boolean>(
        FocusManager, 'IsFocusScope', false, MetaData.None);

    // Attached: the logical-focus element within a focus scope. Stored on
    // the scope element; read back by GetFocusedElement(scope).
    public static readonly FocusedElementKey = Model.RegisterAttachedProperty<Element | undefined>(
        FocusManager, 'FocusedElement', undefined, MetaData.None);

    public static GetIsFocusScope(element: Element): boolean
    {
        return element.get_property_value(FocusManager.IsFocusScopeKey);
    }
    public static SetIsFocusScope(element: Element, value: boolean): void
    {
        element.set_property_value(FocusManager.IsFocusScopeKey, value);
    }

    // Logical focus of `scope`, or the global keyboard focus when no scope
    // is supplied. WPF's signature is GetFocusedElement(DependencyObject).
    public static GetFocusedElement(scope?: Element): Element | undefined
    {
        if (scope === undefined) return Keyboard.FocusedElement;
        return scope.get_property_value(FocusManager.FocusedElementKey);
    }

    // Record `element` as the logical focus of `scope` AND move keyboard
    // focus to it. Supports both the WPF two-arg form
    // (SetFocusedElement(scope, element)) and a one-arg convenience form
    // (SetFocusedElement(element)).
    public static SetFocusedElement(scopeOrElement?: Element, element?: Element): Element | undefined
    {
        if (element === undefined)
        {
            return Keyboard.Focus(scopeOrElement);
        }
        scopeOrElement?.set_property_value(FocusManager.FocusedElementKey, element);
        return Keyboard.Focus(element);
    }

    // @internal — called by the InputManager whenever keyboard focus
    // changes. Records `element` as the logical focus of every focus-scope
    // ancestor on its visual-parent chain (WPF updates each enclosing
    // scope so re-entering any of them restores this element).
    public static _recordLogicalFocus(element: Element | undefined): void
    {
        if (element === undefined) return;
        let cur: Element | undefined = element;
        while (cur !== undefined)
        {
            if (cur.get_property_value(FocusManager.IsFocusScopeKey) === true)
            {
                cur.set_property_value(FocusManager.FocusedElementKey, element);
            }
            cur = cur.GetVisualParent() as Element | undefined;
        }
    }
}
