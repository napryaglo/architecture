// architecture-meta-models.module.mu — the Architecture Meta-models module.
//
// A ShellModule: a capability provider added to the shell via a `.modules:`
// block on the Application. Its capability is one root-nav entry (Name) whose
// Panel is the left-panel view. Icons + lazy panels are deferred — see
// diagram.module.mu.

module ArchitectureMetaModelsModule [ Name = "Architecture Meta-models" ] {
    Capability [ Name = "Architecture Meta-models", Icon = @ArchitectureMetaModels ] {
        StackPanel [ Orientation = Vertical, Margin = (12,12,12,12) ] {
            TextBlock [ Style = @TitleSmall, Text = "Architecture Meta-models", Foreground = @OnSurface,        Margin = (0,0,0,8) ]
            TextBlock [ Style = @BodyMedium, Text = "Business",                 Foreground = @OnSurfaceVariant, Margin = (0,3,0,3) ]
            TextBlock [ Style = @BodyMedium, Text = "Application",              Foreground = @OnSurfaceVariant, Margin = (0,3,0,3) ]
            TextBlock [ Style = @BodyMedium, Text = "Technology",               Foreground = @OnSurfaceVariant, Margin = (0,3,0,3) ]
        }
    }
}
