// demo-platform.module.mu — the demo platform composed as a ShellModule.
//
// One capability per demo GROUP (Animation / Controls / Demos / Patterns /
// Styles & Triggers) — the shell's activity-bar rail flattens these into its
// root navigation layer (NavigationService.PopulateFromModules). Each carries a
// Name (the group label, which must match the registry's `group` field), an Icon
// geometry (@<Key> from DemoPlatformIcons, merged app-global), and a `ServiceKey`
// naming the per-group service that backs its content.
//
// Selecting a group's rail item resolves that capability's service
// (NavigationService.ActiveService); the demos WITHIN a group are registry-driven
// and dynamic, so the content is a DemoGroupService (see demo-group-services.mts)
// rendered by the `DataTemplate [DataType=DemoGroupService]` in platform.mu — not
// an eager per-capability Visual.
//
// Capability order matches the registry's alphabetical group sort, so the rail
// order is stable.

import DemoGroupService from "./demo-group-services.mjs"
import AnimationsService from "./demo-group-services.mjs"
import ControlsService from "./demo-group-services.mjs"
import DemosService from "./demo-group-services.mjs"
import PatternsService from "./demo-group-services.mjs"
import StylesService from "./demo-group-services.mjs"

module DemoPlatformModule [ Name = "µ-mural demos" ] {
    .services: {
        AnimationsService
        ControlsService
        DemosService
        PatternsService
        StylesService

        // The shared content host, registered at the app root (module services
        // register on Application.Services). The group services are root
        // singletons; registering the host here too means they resolve the SAME
        // instance the shell's PART_ContentHost binds to
        // (`$service(ContentHostService).Content`) — otherwise EditorShell would
        // register its own shell-scoped host the root singletons can't reach.
        ContentHostService
    }

    resources: {
        // The content shown for the selected group: its demo list. The shell's
        // content host resolves the active group service (a DemoGroupService
        // subclass — NavigationService.ActiveService) and renders it through
        // this implicit-by-type template. The base DataType matches every
        // concrete group service via the resource-chain prototype walk, so one
        // template serves all five. Module resources merge app-global, so it's
        // in scope for the content host. SelectedItem is TwoWay by default, so a
        // row click writes back to DemoGroupService.SelectedItem (the inherited
        // DocumentSelectorService DP), which drives OnSelectedItemChanged.
        DataTemplate [ DataType = DemoGroupService ] {
            ListBox [ ItemsSource = $Items, SelectedItem = $SelectedItem ]
        }
    }

    Capability [ Name = "Animation", Icon = @AnimationIcon, ServiceKey = AnimationsService ]
    Capability [ Name = "Controls", Icon = @ControlsIcon, ServiceKey = ControlsService ]
    Capability [ Name = "Demos", Icon = @DemosIcon, ServiceKey = DemosService ]
    Capability [ Name = "Patterns", Icon = @PatternsIcon, ServiceKey = PatternsService ]
    Capability [ Name = "Styles & Triggers", Icon = @StylesIcon, ServiceKey = StylesService ]
}
