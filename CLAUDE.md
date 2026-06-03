# CLAUDE.md

## Workflow rules

- **Do not use the `superpowers` skills** (brainstorming, writing-plans,
  executing-plans, TDD, etc.). No spec docs, no plan files, no design-approval
  gates. Just do the work directly.

## Architecture rules

- **List-based controls descend from `ItemsControl`.** Any new control whose
  purpose is to render a collection of items (ListBox, ComboBox, TreeView,
  TabControl, DataGrid, ItemsRepeater, Menu, BreadcrumbBar, …) must extend
  `ItemsControl` rather than rolling its own item materialization. Subclass
  overrides — `GetContainerForItemOverride`, `PrepareContainerForItemOverride`,
  `ClearContainerForItemOverride` — are the seams for control-specific
  container types (ListBoxItem, TabItem, …) and behavior (selection, press,
  drag handles, etc.). `ItemContainerStyle` + `ItemTemplate(Selector)` +
  `AlternationIndex` + `HasItems` + `ItemsSource`/`CollectionView` are all
  inherited for free. Existing controls that predate this rule
  (`ListBox`, `TreeView`, `ComboBox`) are grandfathered but should be
  consolidated onto `ItemsControl` opportunistically. Deviate only when the
  user explicitly asks for a from-scratch implementation; otherwise this is
  the default.
