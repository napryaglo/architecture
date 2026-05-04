# Microsoft Work IQ

## Purpose

Microsoft's work-context intelligence layer — a Graph-adjacent service that surfaces signals about what a user is currently working on across M365: documents in active editing, recent meetings and decisions, threads under attention, projects the user is implicitly co-owning. Designed to ground Copilot experiences and downstream agents in "now-context" without each agent rebuilding its own activity model from raw Graph events.

## Trade-offs

- **High-quality grounding signal with no engineering.** The "what is the user doing right now" signal is hard to derive correctly from raw Graph; Work IQ's aggregated, ranked view is closer to product-ready out of the box.
- **Newer API; surface is evolving.** Endpoints, signal taxonomy, and permission model are still maturing. Production use needs version-pinning discipline and a fallback path for breaking changes.
- **Privacy and permission-sensitive.** Activity signals are inherently personal; tenants need to evaluate the API against existing privacy and works-council commitments before broad agent access is granted.
- **Initially limited regional and tenant availability.** Rollout is staged across geos and licence tiers; designs that depend on Work IQ should confirm availability for the target tenant rather than assume universal access.
