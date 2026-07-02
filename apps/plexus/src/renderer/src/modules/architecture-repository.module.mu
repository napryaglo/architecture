// architecture-repository.module.mu — the Architecture Repository module.
//
// A ShellModule: a capability provider added to the shell via a `.modules:`
// block on the Application. Its capability is one root-nav entry (Name) whose
// Panel is the left-panel view. Icons + lazy panels are deferred — see
// diagram.module.mu.

module ArchitectureRepositoryModule [ Name = "Architecture Repository" ] {
    Capability [ Name = "Architecture Repository", Icon = @ArchitectureRepository ] {
        StackPanel [ Orientation = Vertical, Margin = (12,12,12,12) ] {
            TextBlock [ Style = @TitleSmall, Text = "Architecture Repository", Foreground = @OnSurface,        Margin = (0,0,0,8) ]
            TextBlock [ Style = @BodyMedium, Text = "Elements",                Foreground = @OnSurfaceVariant, Margin = (0,3,0,3) ]
            TextBlock [ Style = @BodyMedium, Text = "Relationships",           Foreground = @OnSurfaceVariant, Margin = (0,3,0,3) ]
            TextBlock [ Style = @BodyMedium, Text = "Views",                   Foreground = @OnSurfaceVariant, Margin = (0,3,0,3) ]
        }
    }
}
