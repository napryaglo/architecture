# Dynamics 365

## Purpose

Microsoft's CRM and ERP suite — Sales, Customer Service, Field Service, Finance, Supply Chain, Project Operations, Business Central, and adjacent modules. In Microsoft-centric estates it is most often the canonical system of record for customer, opportunity, case, and order data; the data layer underneath is Dataverse, so it slots naturally into Power Platform extensions, Copilot Studio agents, and Microsoft Graph-grounded Copilot scenarios.

## Trade-offs

- **First-class Microsoft estate integration.** Identity, security, and data flow line up cleanly with M365, Power Platform, and Azure; building a comparable cross-product fabric on a non-Microsoft CRM is a substantial integration programme.
- **Licensing is a planning exercise of its own.** Per-app, per-user, attach licences, capacity packs, and storage charges combine in ways that are easy to under-estimate; production rollouts need a deliberate licensing model alongside the architectural one.
- **Customisation has three doors with different ceilings.** Power Platform low-code (model-driven apps, Power Fx, plug-ins via Power Automate), pro-code plug-ins / custom workflow assemblies (.NET), and integration via Dataverse APIs each suit different scenarios; choosing the wrong one inflates total cost over the application's life.
- **Often the "modern legacy" in modernisation programmes.** A heavily customised Dynamics tenant behaves like a legacy-application from a modernisation lens — visible API surface, but real business logic baked into plug-ins and workflows that can't be lifted and shifted without re-implementation.
