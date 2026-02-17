# E-Commerce Microservices (Event-Driven)

Monorepo for an event-driven e-commerce backend with:
- `auth-service` (HTTP + MongoDB)
- `product-service` (HTTP + gRPC + Kafka consumer + MongoDB)
- `order-service` (HTTP + Kafka producer + MongoDB)
- Kafka, Redis, and per-service MongoDB in Docker Compose

## Quick Runbook
1. Build and start:
```bash
docker compose up -d --build
```
2. Check service health:
```bash
curl -4 http://127.0.0.1:4001/health
curl -4 http://127.0.0.1:4002/health
curl -4 http://127.0.0.1:4003/health
```
3. Run the end-to-end flow:
```bash
node demo-order-flow.js
```
4. Expected order-flow result:
- Product starts at inventory `10`
- Order quantity is `2`
- Inventory ends at `8` (`10 -> 8`)

## Reliability Demos
- HTTP idempotency (same `Idempotency-Key` twice, same `orderId`, inventory decremented once):
```bash
node demo-idempotency.js
```
- Kafka duplicate replay with same `eventId` (consumer dedupe, inventory unchanged on duplicate):
```bash
node demo-kafka-replay.js
```

## How To Verify Kafka Path
1. Stream logs:
```bash
docker compose logs -f order-service
docker compose logs -f product-service
```
2. Place an order (`node demo-order-flow.js`).
3. Expected log lines:
- `order-service`: `Published order.created eventId=... topic=ecom.order.order.v1 key=...`
- `product-service`: `Consumed eventType=order.created eventId=... status=processed`
- `product-service`: `Published inventory.updated eventId=... topic=ecom.product.inventory.v1 key=...`
- For duplicate replay: `product-service` shows `Duplicate prevented eventType=order.created eventId=...`

## Environment Variables

### Auth Service
- `SERVICE_NAME` (default: `auth-service`)
- `HTTP_PORT` (default: `3001`, Docker uses `4001`)
- `MONGO_URI` (default: `mongodb://localhost:27017/auth_db`)
- `KAFKA_BROKERS` (default: `localhost:9092`)

### Product Service
- `SERVICE_NAME` (default: `product-service`)
- `HTTP_PORT` (default: `3002`, Docker uses `4002`)
- `GRPC_PORT` (default: `50051`)
- `MONGO_URI` (default: `mongodb://localhost:27018/product_db`)
- `KAFKA_BROKERS` (default: `localhost:9092`)
- `REDIS_URL` (default: `redis://localhost:6379`)
- `ORDER_CREATED_CONSUMER_GROUP` (default: `product-service-order-created-v1`)
- `ORDER_CREATED_CONSUMER_RETRY_MAX` (default: `3`)
- `ORDER_CREATED_CONSUMER_RETRY_INITIAL_DELAY_MS` (default: `250`)
- `ORDER_CREATED_CONSUMER_RETRY_MAX_DELAY_MS` (default: `2000`)
- `ORDER_CREATED_CONSUMER_RETRY_BACKOFF_MULTIPLIER` (default: `2`)

### Order Service
- `SERVICE_NAME` (default: `order-service`)
- `HTTP_PORT` (default: `3003`, Docker uses `4003`)
- `MONGO_URI` (default: `mongodb://localhost:27019/order_db`)
- `KAFKA_BROKERS` (default: `localhost:9092`)
- `REDIS_URL` (default: `redis://localhost:6379`)
- `PRODUCT_GRPC_ADDR` (default: `localhost:50051`, Docker uses `product-service:50051`)
- `ORDER_IDEMPOTENCY_TTL_SECONDS` (default: `300`)

### Demo Scripts
- `AUTH_BASE_URL` (default: `http://localhost:4001`)
- `PRODUCT_BASE_URL` (default: `http://localhost:4002`)
- `ORDER_BASE_URL` (default: `http://localhost:4003`)
- `KAFKA_BROKERS` for `demo-kafka-replay.js` (default: `localhost:29092`)

## Localhost IPv6/IPv4 Note
On some machines, `localhost` resolves to IPv6 first and can cause intermittent timeouts. Use `127.0.0.1` (or `curl -4`) for stable local demos.
