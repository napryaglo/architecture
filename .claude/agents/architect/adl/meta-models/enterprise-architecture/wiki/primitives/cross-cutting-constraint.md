# Cross-Cutting Constraint

A cross-cutting constraint is a rule, policy, or governance obligation that applies across multiple architecture locations simultaneously. It is not a component — it does not run anywhere. It is not a location — it does not contain anything. It is a statement about what must be true everywhere, regardless of where components live.

---

## Structure

> A cross-cutting constraint expresses a requirement that is not localised to any single architecture location and cannot be delegated to any single component to enforce.

Security policy is the canonical example. "All data at rest must be encrypted" applies whether the data lives in an on-premises SQL Server, an Azure SQL Database, or a Dataverse table. No single component enforces it. No single location owns it. It spans all of them, and compliance must be verified at each location independently.

---

## Examples

**Federated Security** — identity and authentication standards that apply across locations. Single sign-on policy, MFA requirements, conditional access rules, privileged access management.

**Tenants Management** — rules governing the number, structure, and governance of cloud tenants. For Microsoft estates: how many Azure subscriptions, how many Power Platform environments, naming conventions, lifecycle management.

**Policies and Governance** — architectural standards, approved technology lists, change management processes, cost allocation rules. These apply to what gets built, not just how it runs.

---

## Visual Convention

In diagram notation, cross-cutting constraints appear as a distinctly bordered region that overlaps or floats adjacent to the main diagram body — visually separate from the location hierarchy. They typically contain a list of named constraint categories rather than component boxes.

The visual separation is semantic: it signals to the reader that this content is not a location and not a component. It governs the diagram, not just a part of it.

A common mistake is to draw cross-cutting constraints as a component inside one of the architecture locations. This implies they are owned by and enforced within a single location, which is both architecturally wrong and politically dangerous — it makes one team responsible for what is actually a shared obligation.

---

## Constraint vs. Governance Component

Cross-cutting constraints and governance components are related but distinct.

A **cross-cutting constraint** is a policy statement — what must be true.

A **governance component** (see [Component](component.md) — governance/meta type) is a tool that helps implement or monitor a policy — Azure Policy, CoE Starter Kit, Log Analytics.

The constraint can exist without the component (as an aspiration or a manual process). The component can exist without the constraint being formally declared (as an ad hoc operational tool). In a mature architecture both are present: the constraint declares the requirement; the governance component enforces or monitors it.

---

## Relation to Architecture Locations

Cross-cutting constraints apply *to* locations, not *within* them. The relationship is: each architecture location must satisfy the constraints declared in the cross-cutting constraint region.

This is a key architectural test: for every cross-cutting constraint, you should be able to trace how it is satisfied in each location. If you cannot, you have either a compliance gap or a constraint that cannot actually be applied uniformly and should be qualified.
