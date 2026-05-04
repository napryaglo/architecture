# SharePoint Embedded

## Purpose

Headless storage service that lets ISV and line-of-business apps persist documents inside the customer's Microsoft 365 tenant without exposing a SharePoint UI to end users. The application owns the experience; the content benefits from the tenant's compliance, eDiscovery, retention, and DLP boundaries by virtue of living in M365 storage. Common targets: SaaS apps that want "data stays in the customer's tenant" without building tenant-isolated storage themselves.

## Trade-offs

- **Customer-tenant data residency without UI cost.** Files are stored under the customer's existing M365 boundary — no new compliance posture for the customer to evaluate, no parallel storage account for the ISV to operate.
- **App-only authentication model.** Access is mediated by the app's identity rather than user delegation; the app must enforce its own per-user authorisation rules. Easy to under-implement and end up with broader access than intended.
- **Newer product, smaller ecosystem.** Tooling, samples, and community knowledge are thinner than SharePoint Online proper. Edge cases and quirks are still being smoothed; non-trivial scenarios may need direct engagement with Microsoft.
- **Storage billed against tenant quota.** Embedded containers consume the customer's M365 storage allocation. ISVs offering large-content scenarios need to size that explicitly with the customer or risk surprise pool-exhaustion incidents.
