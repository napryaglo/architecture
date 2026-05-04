# Azure Service Bus

## Purpose

Azure's enterprise message broker: queues, topics with subscriptions, ordered sessions, transactions, dead-letter queues, scheduled and deferred messages. The default reliability primitive between services in Microsoft-stack architectures where guaranteed delivery, ordering, and decoupling matter more than raw ingest throughput.

## Trade-offs

- **Reliability features are first-class.** Sessions for ordered processing, transactions for atomic enqueue/dequeue, dead-letter queues for poison handling, and duplicate detection all sit in the broker; a comparable feature surface in Storage Queues or Event Hubs requires substantial application-side code.
- **Higher per-message cost than Storage Queues or Event Hubs.** Suited to lower-volume, higher-value messages (orders, work items, integration events), not to telemetry firehoses; choosing the wrong primitive shows up as runaway operations cost.
- **Throughput ceiling vs streaming platforms.** Per-namespace throughput is bounded by tier and partition count; once an architecture needs millions of messages per second, Event Hub or Kafka is the right tool, not a Service Bus topic.
- **Premium SKU unlocks important features.** Geo-disaster recovery, larger message size, dedicated capacity, and consistent latency are Premium-tier features; production-grade messaging architectures usually end up on Premium and should be costed accordingly.
