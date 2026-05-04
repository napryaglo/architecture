# Azure Event Hub

## Purpose

Azure's high-throughput event-streaming platform: partitioned, ordered-per-partition append log with Kafka-protocol compatibility. Handles telemetry pipelines, click-stream ingestion, IoT firehose, and event-driven service-to-service flows where throughput is measured in millions of events per second and consumers replay rather than acknowledge.

## Trade-offs

- **Throughput-first design.** Partitioning by key gives near-linear horizontal scale; the right primitive when raw ingest rate is the dominant constraint and per-message reliability semantics are looser than a broker.
- **Replay vs cost trade-off.** Retention extends from one day to effectively unlimited (Event Hubs Capture / archive tiers); long retention is a real-money decision rather than a free knob, and replays at scale need throughput-unit headroom.
- **Different programming model from Service Bus.** Consumer groups, partition leases, and offsets push complexity into the consumer; teams used to broker-style ack/nack should plan for the difference rather than assume drop-in equivalence.
- **Partition design is durable.** Partition count is set at creation and notoriously hard to change later; under-partitioning bottlenecks throughput, over-partitioning fragments small workloads. Capacity planning is the most important up-front decision.
