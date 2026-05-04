# Strategy Envelope

The strategy envelope of a modernization path is the subset of the 6 Rs that are applicable given the vocabulary distance between the source and destination architecture locations.

---

## Structure

> The strategy envelope constrains the strategy conversation to the choices that are architecturally viable for a given path. It eliminates inapplicable strategies before any application-specific assessment begins.

This is the mechanism by which modernization paths do useful architectural work. An architect pointing to a path on the diagram is simultaneously saying: "you can go this direction" and "when you do, these are the only legitimate strategies available to you." Everything else is off the table — not as a preference, but as a structural consequence of what the destination location can and cannot express.

---

## The 6 Rs

The 6 Rs are the canonical set of strategies for modernizing an application. They describe what happens to the application's implementation during a transition between architecture locations. Each R requires different conditions to be applicable. The 6 Rs are well-established in cloud migration literature; this section documents them in the context of the Architecture Definition Language, specifically how they relate to vocabulary distance and strategy envelopes.

### Rehost

*Also called: Lift-and-Shift*

Move the application to the destination location without changing its implementation. The application runs in the new location exactly as it ran in the source location.

**Condition for applicability:** The destination location's technology vocabulary must be a superset of what the application requires. The application must not depend on anything the destination location cannot provide. Only small-distance paths make this available.

**Typical context:** On-Premises to Azure IaaS. The VM moves; nothing else changes. This is the fastest path to cloud and the lowest-risk path for complex or poorly-understood applications. It does not realise the full benefits of the destination location — a rehosted application on IaaS is not cloud-native — but it gets the application there, and future Replatform or Refactor steps can follow.

**What it preserves:** Everything — code, dependencies, data schemas, configurations.

**What it does not deliver:** Platform benefits of the destination location. An application rehosted to IaaS does not benefit from managed services, elastic scaling, or reduced operational overhead unless further modernisation follows.

### Replatform

*Also called: Lift-and-Tinker*

Move the application to the destination location with targeted changes to take advantage of the destination's managed services, without changing the application's core architecture.

**Condition for applicability:** The application's business logic and overall structure are sound; only its infrastructure components (database, messaging, caching, runtime) need to be replaced with platform-managed equivalents. Medium-to-small distance paths.

**Typical context:** Moving from self-managed SQL Server to Azure SQL. Moving from a self-managed message queue to Azure Service Bus. Moving from a custom-managed container runtime to AKS. The application code changes minimally; the infrastructure plumbing changes significantly.

**What it preserves:** Business logic, application structure, team knowledge of the application domain.

**What it changes:** Infrastructure components, operational model for those components.

### Refactor

*Also called: Re-architect*

Restructure the application to fit the destination location's vocabulary more naturally, without rebuilding it from scratch. The business capability is expressed using the destination's primitives more fully.

**Condition for applicability:** The application's business logic is worth keeping but its structure is not well-suited to the destination location. Medium distance paths. Commonly triggered when moving to PaaS and wanting to adopt cloud-native patterns: decomposing a monolith into services, adopting event-driven communication, introducing stateless compute.

**Typical context:** Breaking apart a monolithic .NET application into Azure Functions or containerised microservices. Restructuring data access to use managed database services rather than direct SQL connections.

**What it preserves:** Business logic and domain knowledge embedded in the existing application.

**What it changes:** Application structure, component boundaries, communication patterns, data access patterns.

### Rebuild

Discard the existing implementation and build the application from scratch in the destination location's vocabulary.

**Condition for applicability:** The destination location's vocabulary cannot accommodate the existing implementation, or the existing implementation is of sufficiently poor quality that carrying it forward is more expensive than rebuilding. Available on any path — but only necessary on large-distance paths. On small-distance paths, Rebuild is technically available but wasteful unless there is a separate reason to rewrite.

**Typical context:** An on-premises data entry application rebuilt as a model-driven Power App with a Dataverse data model. A custom reporting application rebuilt as a Power BI solution. A legacy workflow system rebuilt using Power Automate.

**What it preserves:** Business capability — what the application does for users. Nothing else.

**What it discards:** All existing code, data schemas, integration implementations, test suites.

**The honest cost:** Rebuild is expensive and risky. It requires deep domain knowledge to be re-expressed in a new vocabulary. The risk of losing implicit business logic that was never documented is significant. Rebuild should be chosen when Replatform and Refactor are genuinely not viable, not as a default because the existing code is unfamiliar or uncomfortable.

### Replace

Retire the existing application and adopt a commercial product or SaaS offering that satisfies the same business capability.

**Condition for applicability:** A product exists at the destination location that covers the application's business capability with acceptable fit. The customisation required to make the product fit is less expensive than rebuilding. Available on any path but most natural at large-distance paths where rebuilding is already required — the question becomes "rebuild or buy."

**Typical context:** Replacing a custom CRM built on-premises with Dynamics 365. Replacing a custom document management system with SharePoint. Replacing a custom approval workflow with Power Automate approvals.

**What it preserves:** Business capability (ideally).

**What it discards:** Everything custom — code, data schemas, integrations, operational processes.

**The honest risk:** Replace requires process change, not just technical change. The product defines how things work; the organisation must adapt its processes to fit. Replace projects that underestimate this have high failure rates.

### Retire

Decommission the application. The business capability it served is either no longer needed or has been absorbed into another application.

**Condition for applicability:** The application has no active users, or its business capability is fully covered by another system, or the business process it supported has been discontinued. Path-independent — does not require a destination location.

**What it preserves:** Nothing.

**What it delivers:** Reduced operational cost, reduced security surface area, reduced complexity.

**Note:** Retire is frequently under-used. Application portfolio assessments consistently find a significant proportion of applications that have no active users and exist only because no one has formally decided to turn them off. Retire is always the right answer for those applications — it is the cheapest and safest modernisation strategy of all.

### Retain

Keep the application where it is. A deliberate decision not to modernise, made with full awareness of what is being preserved and what is being deferred.

**Condition for applicability:** The cost, risk, or disruption of modernisation outweighs the benefit within the current planning horizon. The application is stable, low-cost to operate, and not blocking other initiatives.

**What it is not:** Retain is not the absence of a decision. It is an explicit decision to accept the current state for a defined period, subject to re-evaluation. An application on the Retain list should have a review date.

**The risk of misuse:** Retain is frequently chosen by default — the application is left alone because dealing with it seems hard, not because Retain is the right answer. This creates an ever-growing tail of legacy applications that accumulate technical debt quietly. The discipline of the 6 Rs requires that Retain be as explicit and intentional as any other strategy.

---

## Path–Strategy Matrix

For each standard modernization path, which of the 6 Rs are applicable. Derived from the vocabulary distance between source and destination architecture locations.

✓ = applicable   ◑ = applicable with caveats   — = not applicable

| Path | Distance | Rehost | Replatform | Refactor | Rebuild | Replace | Retire |
|---|---|---|---|---|---|---|---|
| On-Prem → Azure IaaS | Small | ✓ | ✓ | — | — | — | ✓ |
| On-Prem → AKS | Small* | ✓ | ✓ | ◑ | — | — | ✓ |
| On-Prem → Azure PaaS | Medium | — | ✓ | ✓ | ◑ | ◑ | ✓ |
| On-Prem → Power Platform | Maximum | — | — | — | ✓ | ✓ | ✓ |
| On-Prem → Microsoft 365 | Maximum | — | — | — | ✓ | ✓ | ✓ |
| On-Prem → Dynamics 365 | Maximum | — | — | — | ◑ | ✓ | ✓ |
| Azure IaaS → Azure PaaS | Medium | — | ✓ | ✓ | ◑ | ◑ | ✓ |
| Azure IaaS → AKS | Small | ✓ | ✓ | — | — | — | ✓ |
| Azure PaaS → Power Platform | Large | — | — | — | ✓ | ✓ | ✓ |
| Azure PaaS → Microsoft 365 | Large | — | — | — | ✓ | ✓ | ✓ |
| Power Platform → Azure PaaS | Large | — | — | — | ✓ | — | ✓ |

### Caveats

**On-Prem → AKS (Small\*):** AKS is an Azure PaaS service but vocabulary distance is effectively small because containers package existing application logic intact. Refactor is marked ◑ because containerisation is sometimes accompanied by decomposition into microservices — this crosses into Refactor territory but is not required.

**Rebuild on medium-distance paths (◑):** Rebuild is technically available on any path. It is marked ◑ on medium-distance paths to indicate it is available but not the natural first choice — Replatform or Refactor should be considered first. Rebuild on a medium-distance path is typically driven by application quality concerns (legacy code not worth carrying forward) rather than vocabulary incompatibility.

**Replace on medium-distance paths (◑):** Replace is available when a suitable product exists at the destination. It is marked ◑ rather than ✓ because the product must fit the business capability — Replace is not available just because you are moving to PaaS, it requires a specific product decision.

**Retire:** Available on any path. Retire is listed for completeness — it is always an option and should always be evaluated before assuming modernisation is required.

**Dynamics 365 Rebuild (◑):** Dynamics 365 occupies a spectrum between Replace (use it out of the box) and Rebuild (heavy custom development within the platform). The ◑ reflects that the line between Replace and Rebuild is blurry within Dynamics 365 specifically.

### Reading the Matrix

The matrix defines the strategy *envelope* — the outer boundary of available choices. Within the envelope, the specific strategy is chosen based on application assessment.

A path with only two available Rs (e.g., On-Prem → Power Platform: Rebuild or Replace) means the architectural conversation is not "should we modernise?" but "should we rebuild in Power Platform or replace with an existing product?" The matrix has already eliminated all other options.

A path with many available Rs (e.g., On-Prem → Azure PaaS: Replatform, Refactor, Rebuild, Replace) means the application characteristics drive the strategy — a simple application might Replatform, a complex one might need Refactor, one with poor code quality might warrant Rebuild, and one with a good SaaS match might be Replaced.

---

## Envelope vs. Decision

The envelope is not the decision. It is the constraint space within which the decision is made.

Once the envelope is established for a given path, the application assessment selects the specific R based on:

- **Application complexity** — highly complex applications are harder to rebuild; simpler ones are better candidates for Replace
- **Integration dependencies** — deep integration with other components constrains the available strategies; rebuilding requires re-establishing all integrations in the destination vocabulary
- **Team capability** — the destination vocabulary may require skills the team does not have
- **Business criticality and risk tolerance** — high-criticality applications warrant more conservative paths; risk-tolerant teams can pursue Rebuild aggressively
- **Cost** — Rehost is cheapest in the short term; Rebuild is most expensive upfront but may reduce long-term operational cost in a managed platform

The architecture model defines the envelope. The application assessment makes the choice within it.
