# Architecture Location

An architecture location is a named boundary that defines the set of technologies available for building and running software components.

This is the foundational primitive of the model. Everything else is either contained within a location, moves between locations, or governs across locations.

---

## Structure

> An architecture location defines a boundary for technology choice.

The key word is *defines*. The location does not merely describe where something runs — it determines what can be built there. A component's location constrains its technology vocabulary, and from that vocabulary all other properties follow: deployment model, operational responsibility, governance model, cost structure, skill requirements.

Ownership and governance are *derivatives* of location, not independent properties. Power Platform has a specific governance model (environments, DLP policies, CoE framework) because the technology itself surfaces those governance primitives. You govern Power Platform the way you do because the platform is what it is — not because someone decided to layer governance on top.

---

## Discovery

Architecture locations are always discovered starting from the physical world.

In a discovery workshop, you do not ask "what is your deployment model?" You ask: *where does this application run?* The answer comes back in physical terms — the server room on the third floor, the co-location facility in Frankfurt, the cloud. From there the conversation descends into specificity: which cloud, which service tier, which platform.

This is not accidental. Physical locations are observable and unambiguous. Anyone in the room can confirm whether a data center exists and where it is. Logical abstractions (zones, environments, tenants) come later, once the physical foundation is established.

---

## Hierarchy

Architecture locations are hierarchical. Child locations inherit the constraints of their parent and add further constraints of their own. Each level downward narrows the available technology set and increases leverage — you can build faster but within tighter constraints. The hierarchy is determined by technology constraint, not by organizational structure or network topology.

### Standard Taxonomy for Microsoft Enterprise Estates

The default starting point for discovery workshops. Adjust to match the specific estate being documented — add locations that exist, remove those that do not.

```
On-Premises
└── Physical infrastructure owned and operated by the enterprise
    Technology set: any software runnable on owned hardware
    Operational responsibility: enterprise IT

Cloud (Azure)
├── IaaS (Azure Infrastructure as a Service)
│   Technology set: Virtual Machines, managed disks, virtual networking,
│                   load balancers, VPN/ExpressRoute
│   Operational responsibility: hyperscaler owns hardware/hypervisor;
│                                enterprise owns OS, runtime, application
│
├── PaaS (Azure Platform as a Service)
│   Technology set: App Service, Azure Functions, AKS, Azure SQL,
│                   Cosmos DB, Service Bus, Event Hub, API Management,
│                   Logic Apps, Azure AI Services, Azure OpenAI,
│                   Azure AI Foundry, Azure AI Search
│   Operational responsibility: hyperscaler owns runtime and infrastructure;
│                                enterprise owns application code and data
│
└── SaaS (Software as a Service)
    ├── Power Platform
    │   Technology set: Power Apps (canvas, model-driven),
    │                   Power Automate, Power BI,
    │                   Copilot Studio, Dataverse,
    │                   Power Platform Connectors
    │   Operational responsibility: Microsoft owns everything;
    │                                enterprise configures and governs
    │   Governance primitives: environments, DLP policies,
    │                           CoE Starter Kit, tenant settings
    │
    ├── Microsoft 365
    │   Technology set: SharePoint, Teams, Exchange, OneDrive,
    │                   Microsoft 365 Copilot, SPFx, Teams apps,
    │                   Microsoft Graph API
    │   Operational responsibility: Microsoft owns everything;
    │                                enterprise configures and extends
    │
    └── Dynamics 365
        Technology set: Sales, Customer Service, Field Service,
                        Finance, Supply Chain, Business Central
        Operational responsibility: Microsoft owns everything;
                                     enterprise configures and customises
```

### Notes on the Taxonomy

**Azure AI services span PaaS locations.** Azure OpenAI Service, Azure AI Foundry, and Azure AI Search live in PaaS. Copilot Studio lives in Power Platform (SaaS). This distinction matters because the development model differs — PaaS AI services are consumed by code; Copilot Studio is configured through a low-code interface.

**The boundary between PaaS and SaaS is sometimes blurry.** Azure Fabric can be treated as a PaaS service or as a SaaS platform depending on the level of detail required. At enterprise topology level, treat it as PaaS. At data architecture level, it may warrant its own location node.

**On-Premises can have sub-locations.** Large enterprises with multiple data centres, edge computing sites, or factory-floor infrastructure may need to express On-Premises as a parent location with named physical sub-locations. The principle holds: each sub-location defines a specific technology availability context (a factory floor PLC has a very different technology set from a corporate data centre).

**Third-party cloud providers.** If the estate includes AWS, GCP, or other cloud providers, add them as sibling nodes to Azure under the Cloud parent. Each has its own IaaS/PaaS/SaaS sub-hierarchy. Cross-cloud connections become paths between locations belonging to different cloud parents.

**Third-party SaaS.** External SaaS products the enterprise consumes (Salesforce, ServiceNow, SAP, Workday) are typically modelled as actors or as an external system boundary rather than as architecture locations, because the enterprise does not build components within them in the same sense. Exception: if the enterprise does significant development within a platform (e.g., custom Salesforce development), it may warrant being modelled as a location.

### Using the Taxonomy in Discovery

Start by confirming which top-level locations exist in the estate being documented. Most enterprise estates have at least On-Premises and Azure. Many have Power Platform and Microsoft 365. Some have Dynamics 365.

Then ask which PaaS services are actively in use — this defines which parts of the Azure PaaS location are populated. An estate that uses only Azure SQL and App Service has a different effective PaaS vocabulary than one that also uses AKS, Service Bus, and Azure OpenAI.

Then ask about sub-locations: are there multiple data centres, multiple Azure tenants, multiple Power Platform tenants? Each of these may need to be expressed as a distinct location if the technology availability or governance differs between them.

The output of this discovery is a populated location hierarchy — the skeleton onto which components and modernization paths are then placed.

---

## Properties

Each architecture location has:

**Technology set** — the authoritative list of technologies available for building components within the location. This is the defining property. All others derive from it.

**Parent location** — the location this one is nested within. Null for root locations (On-Premises, Cloud providers).

**Operational boundary** — who is responsible for keeping the location running. For On-Premises this is the enterprise's own operations team. For IaaS, the hyperscaler owns the hardware and hypervisor. For PaaS, the hyperscaler owns the runtime. For SaaS, the hyperscaler owns everything down to the application.

**Regulatory scope** — data residency, sovereignty, and compliance constraints that apply to components within the location. These are partially determined by the physical geography of the location and partially by contractual agreements with the location operator.

---

## Location Variants

Not all architecture locations are physical or cloud deployment targets. Two variants extend the primitive beyond its default meaning:

**Logical Grouping Location** — a location that does not host components you build, but groups external services that share a common integration pattern. The defining property is the integration mechanism, not the nature of the services themselves.

Example: *3rd-Party SaaS* is a logical grouping location for external SaaS applications accessible through Power Platform connectors. The location boundary is not a network perimeter or a deployment environment — it is the shared connector surface. A Power Platform connector icon on the diagram represents the architectural interface between the cloud location and this grouping. Any SaaS application reachable via that connector pattern belongs in the group regardless of where it is hosted or who operates it.

This pattern is useful when the integration mechanism is architecturally more significant than the individual services being integrated. It avoids cluttering the diagram with individual third-party service boxes while still expressing that a class of external dependency exists and is accessed in a consistent way.

**Virtual Location** — a location that represents a logical boundary within a physical or cloud environment, such as a network segment, a tenant boundary, or a cross-tenant area. Used when the boundary has architectural significance (different governance, different trust level) even though it shares physical infrastructure with its parent.

---

## What a Location Is Not

A location is not a security zone. Security zones are a network architecture concept — they describe trust levels and traffic rules. Two components in the same architecture location can be in different security zones, and two components in different locations can share a security zone via private networking. The concepts are orthogonal.

A location is not an environment (dev, test, prod). Environments are instances of a deployment topology within a location. Multiple environments typically share the same location.

A location is not an organizational unit. The boundary of a location is determined by technology availability, not by org chart. The same team can own components in multiple locations.

---

## Relation to Other Primitives

Components live *inside* architecture locations. A component's location determines its technology vocabulary.

Modernization paths connect a source location to a destination location. The distance between the two — how different their technology vocabularies are — determines which migration strategies are available.

Cross-cutting constraints *span* locations. They express governance or policy that applies regardless of where a component runs.

---

## Example: Identifying Locations in a Workshop

A useful workshop prompt sequence:

1. "Where does this application run today?" → gets you the physical or cloud location
2. "Is that infrastructure you own and operate, or is it managed by a vendor?" → separates On-Prem from Cloud
3. "Do you control the operating system on those servers?" → separates IaaS from PaaS/SaaS
4. "Is this a Microsoft-managed platform or a custom-developed application?" → separates SaaS locations from PaaS applications

By the end of this sequence you have placed every application in the location hierarchy without using any jargon.
