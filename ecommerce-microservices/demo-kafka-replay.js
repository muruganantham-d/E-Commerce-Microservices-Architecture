const { randomUUID } = require("crypto");
const { Kafka } = require("kafkajs");
const { EVENT_TYPES, EVENT_TO_TOPIC, EVENT_VERSION } = require("@ecom/contracts");

const AUTH_BASE_URL = process.env.AUTH_BASE_URL || "http://localhost:4001";
const PRODUCT_BASE_URL = process.env.PRODUCT_BASE_URL || "http://localhost:4002";
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || "localhost:29092")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

async function main() {
  const email = `kafka-replay-${Date.now()}@example.com`;
  const password = "password123";

  const registered = await requestJson("POST", `${AUTH_BASE_URL}/auth/register`, {
    body: { email, password }
  });
  const loggedIn = await requestJson("POST", `${AUTH_BASE_URL}/auth/login`, {
    body: { email, password }
  });
  const jwt = loggedIn.body.token;

  const createdProduct = await requestJson("POST", `${PRODUCT_BASE_URL}/products`, {
    headers: { Authorization: `Bearer ${jwt}` },
    body: {
      name: "Kafka Replay Product",
      price: 15,
      inventory: 10
    }
  });

  const productId = createdProduct.body.productId;
  const before = await requestJson("GET", `${PRODUCT_BASE_URL}/products/${productId}`, {
    headers: { Authorization: `Bearer ${jwt}` }
  });

  const orderId = `ord_replay_${Date.now()}`;
  const eventId = randomUUID();
  const orderCreatedEnvelope = {
    eventId,
    eventType: EVENT_TYPES.ORDER_CREATED,
    timestamp: new Date().toISOString(),
    version: EVENT_VERSION,
    source: "order-service",
    payload: {
      orderId,
      userId: registered.body.userId,
      items: [
        {
          productId,
          quantity: 2,
          unitPrice: createdProduct.body.price
        }
      ],
      totalAmount: Number((2 * createdProduct.body.price).toFixed(2)),
      currency: "USD",
      status: "created",
      createdAt: new Date().toISOString()
    }
  };

  const topic = EVENT_TO_TOPIC[EVENT_TYPES.ORDER_CREATED];
  const kafka = new Kafka({
    clientId: "demo-kafka-replay",
    brokers: KAFKA_BROKERS
  });
  const producer = kafka.producer();
  await producer.connect();

  try {
    await publishOrderCreated(producer, topic, orderId, orderCreatedEnvelope, "first");
    await waitForInventory(productId, Number(before.body.inventory) - 2, jwt);

    const afterFirst = await requestJson("GET", `${PRODUCT_BASE_URL}/products/${productId}`, {
      headers: { Authorization: `Bearer ${jwt}` }
    });

    await publishOrderCreated(producer, topic, orderId, orderCreatedEnvelope, "duplicate");
    await sleep(2500);

    const afterSecond = await requestJson("GET", `${PRODUCT_BASE_URL}/products/${productId}`, {
      headers: { Authorization: `Bearer ${jwt}` }
    });

    const firstDelta = Number(before.body.inventory) - Number(afterFirst.body.inventory);
    const secondDelta = Number(afterFirst.body.inventory) - Number(afterSecond.body.inventory);

    console.log("\n[demo-kafka-replay] inventory snapshots");
    console.log(`[demo-kafka-replay] before=${before.body.inventory}`);
    console.log(`[demo-kafka-replay] after_first_delivery=${afterFirst.body.inventory}`);
    console.log(`[demo-kafka-replay] after_duplicate_delivery=${afterSecond.body.inventory}`);
    console.log(`[demo-kafka-replay] first_delta=${firstDelta}`);
    console.log(`[demo-kafka-replay] duplicate_delta=${secondDelta}`);

    if (firstDelta !== 2) {
      throw new Error(`Expected first delivery delta=2, observed ${firstDelta}`);
    }

    if (secondDelta !== 0) {
      throw new Error(`Expected duplicate delivery delta=0, observed ${secondDelta}`);
    }

    console.log(
      `[demo-kafka-replay] PASS: duplicate eventId ${eventId} was deduped by product-service consumer.`
    );
  } finally {
    await producer.disconnect();
  }
}

async function publishOrderCreated(producer, topic, orderId, envelope, label) {
  await producer.send({
    topic,
    messages: [
      {
        key: orderId,
        value: JSON.stringify(envelope),
        headers: {
          eventId: envelope.eventId,
          eventType: envelope.eventType,
          source: envelope.source
        }
      }
    ]
  });

  console.log(
    `[demo-kafka-replay] published_${label} eventType=${envelope.eventType} eventId=${envelope.eventId} topic=${topic} key=${orderId}`
  );
}

async function waitForInventory(productId, expected, jwt, timeoutMs = 20000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const response = await requestJson("GET", `${PRODUCT_BASE_URL}/products/${productId}`, {
      headers: { Authorization: `Bearer ${jwt}` }
    });

    if (Number(response.body.inventory) === expected) {
      return;
    }

    await sleep(500);
  }

  throw new Error(`Inventory did not reach expected value ${expected} within ${timeoutMs}ms`);
}

async function requestJson(method, url, { headers = {}, body } = {}) {
  const response = await fetchWithLocalhostFallback(
    url,
    {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    },
    20000
  );

  if (!response) {
    throw new Error(`Request failed or timed out: ${method} ${url}`);
  }

  const text = await response.text();
  const parsed = text ? safeParseJson(text) : {};
  if (!response.ok) {
    throw new Error(
      `Request failed: ${method} ${url} status=${response.status} body=${JSON.stringify(parsed)}`
    );
  }

  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: parsed
  };
}

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return { raw: value };
  }
}

async function fetchWithLocalhostFallback(url, options, timeoutMs) {
  const first = await fetchWithTimeout(url, options, timeoutMs);
  if (first) {
    return first;
  }

  const fallbackUrl = convertLocalhostToIpv4(url);
  if (!fallbackUrl || fallbackUrl === url) {
    return first;
  }

  return fetchWithTimeout(fallbackUrl, options, timeoutMs);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (_error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function convertLocalhostToIpv4(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname === "localhost") {
      parsed.hostname = "127.0.0.1";
      return parsed.toString();
    }
    return rawUrl;
  } catch (_error) {
    return rawUrl;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error("[demo-kafka-replay] failed", error.message || error);
  process.exit(1);
});
