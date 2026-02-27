Common missing pieces in real microservice systems::

1) API Gateway (Front door)

Missing in your compose.
Without it:
frontend must call 4001/4002/4003 directly
each service needs CORS, auth checks, rate limits separately

2) Service discovery / load balancing

In docker-compose you use service names (works).
In production you need:
Kubernetes service discovery, or
Consul/Eureka, or
load balancer.

3) Observability (big one)

Usually add:
centralized logs (OpenSearch/ELK/Loki)
metrics (Prometheus + Grafana)
tracing (OpenTelemetry + Jaeger)
error tracking (Sentry)
Right now not present.

4) Config & secrets management

In real prod:
env vars are not hardcoded in compose
secrets stored in Vault / AWS SSM / Kubernetes Secrets
Not present (fine for learning).

5) CI/CD pipeline

Usually:
GitHub Actions / GitLab CI
build, test, lint, security scan
Not shown here.

6) Database migrations & versioning

With Mongo, people still manage schema changes (migration scripts).
Not shown here (again ok for learning).

7) Message reliability patterns (important with Kafka)

Real systems add:
retry topics / dead letter queue (DLQ)
consumer idempotency
outbox pattern (for “DB write + publish event” consistency)
You have some retry env vars, but full DLQ/outbox not shown.

8) Rate limiting & security hardening

rate limit at gateway
JWT validation standardization
RBAC/permissions
Not visible in compose.

9) API documentation

OpenAPI/Swagger for each service, or gateway-level docs
Not shown.

10) Background workers

Sometimes separate worker services:
search indexer
email worker

order processing
Not shown (your services may be doing it inline).
