// One panel hosted by the PanelDockService — the shell's right-side tabbed dock.
// The dock renders each panel body-first through a DataTemplate matched to its
// runtime type (the same implicit-by-type dispatch a TabControl content area
// uses); the tab header shows the Title. The `Inspector` base already satisfies
// this (Id + Title), so every inspector is a dock panel; a Plexus AgentService
// implements it to appear as the Chat tab.
//
//   * Id    — stable identity. The host dedupes by it: Add()-ing a panel whose
//             Id already hosts re-selects the existing tab instead of stacking a
//             duplicate.
//   * Title — the tab header text.
export interface IDockPanel
{
    readonly Id: string;
    readonly Title: string;
}
