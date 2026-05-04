# Azure OpenAI GPT-4o

## Purpose

Hosted deployment of OpenAI's GPT-4o family of multimodal language models, served through Azure with enterprise controls (private networking, content filters, customer-managed keys, capacity reservations). Used as the foundation language model for reasoning, generation, summarisation, and tool-use planning in custom-path AI architectures (Copilot Studio agents, Azure-hosted orchestrators, AI Foundry agents).

## Trade-offs

- **Strongest reasoning model in the Azure catalogue.** Best instruction-following and tool-use accuracy among Azure-hosted options; preferred default when scenario quality matters more than cost-per-token.
- **Higher per-token cost than smaller models.** For high-volume, narrow tasks (classification, simple retrieval rephrasing) GPT-4o mini or other lighter models often deliver acceptable quality at a fraction of the price — separate the mode of use from the model choice.
- **Capacity is regional and rate-limited by default.** Production scenarios should reserve provisioned throughput units (PTUs) rather than relying on pay-as-you-go quota; otherwise launches can hit token-per-minute ceilings under burst load.
- **Microsoft-managed model.** Updates and deprecations follow OpenAI's roadmap as ratified by Azure — not directly controllable. Architectures that need pinned model behaviour should snapshot prompts and evals against a specific model version.
