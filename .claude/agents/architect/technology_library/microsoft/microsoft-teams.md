# Microsoft Teams

## Purpose

Collaboration and conferencing client at the centre of the Microsoft 365 user experience: persistent chat, channels, meetings, files, and a hosting surface for tenant-installed apps and bots. In M365-centric architectures it is the dominant actor surface — the single client where employees already spend most of their day — and therefore the natural delivery point for conversational agents, message extensions, embedded canvases, and Copilot experiences.

## Trade-offs

- **Lowest-friction reach into the user base.** A Teams app installed via the tenant catalogue or Teams admin centre lands in front of every employee without driving separate adoption; for internal scenarios this beats standalone web/mobile distribution.
- **Scoping model is fiddly.** Personal vs group-chat vs channel-tab vs meeting scope each have different lifecycles, permissions, and APIs (Teams JS SDK, Bot Framework, RSC). Architects routinely under-estimate how much code is scope-specific rather than reusable.
- **Admin policies gate everything.** App permission policies, app setup policies, and Teams-wide DLP can block install or runtime behaviour irrespective of how the app is built. Production rollout requires admin-side change as well as engineering work.
- **Feature parity lags on mobile and desktop.** New surfaces (Adaptive Cards Universal Action, advanced Copilot extensions) usually ship to the web client first; mobile-only or desktop-only audiences are a real constraint when planning a launch.
