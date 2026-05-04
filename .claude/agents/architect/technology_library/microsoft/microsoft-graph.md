# Microsoft Graph

## Purpose

Unified REST/GraphQL API surface over Microsoft 365 user, group, mail, calendar, file, Teams, and SharePoint data, plus identity signals from Entra ID. The single endpoint that enterprise applications and AI agents call to read or act on user-context data inside the Microsoft cloud — without integrating against each underlying product API separately.

## Trade-offs

- **One API for the M365 estate.** Replaces a dozen product-specific APIs; permission model is unified through Entra ID app registrations and delegated/application scopes. Agents that need user-scoped data are almost always served by Graph.
- **Permission granularity is coarse-grained.** Many operations require broad scopes (`Files.Read.All`, `Mail.ReadWrite.All`); least-privilege design takes deliberate effort and often pushes teams toward narrower per-resource APIs (Graph subscription endpoints, RSC for Teams).
- **Throttling and consistency surprises.** Per-tenant and per-app throttles vary by resource and time of day; some endpoints are eventually consistent (recent writes don't appear in immediate reads). Production callers must implement exponential backoff and tolerate read-after-write delays.
- **Beta endpoints are a magnet.** A lot of valuable data sits behind `/beta` rather than `/v1.0`. Beta endpoints can change without notice — fine for prototypes, risky for production scenarios without a fall-back path.
