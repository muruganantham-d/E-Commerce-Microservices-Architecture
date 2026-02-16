# Consumer Idempotency Pattern

Redis key format: `idem:<consumerGroup>:<eventId>`

Recommended consumer flow:
1. Parse and validate event envelope.
2. Call `claimEvent(...)` before business logic.
3. If `claimed` is `false`, treat as duplicate and commit Kafka offset.
4. Run business logic and durable inbox write in one DB transaction.
5. Commit Kafka offset only after DB transaction succeeds.
6. Call `markEventProcessed(...)` to switch status to `processed` and extend TTL.
7. On failure before commit, call `releaseClaim(...)` so the message can be retried.
