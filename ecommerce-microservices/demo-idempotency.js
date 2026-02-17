const AUTH_BASE_URL = process.env.AUTH_BASE_URL || "http://localhost:4001";
const PRODUCT_BASE_URL = process.env.PRODUCT_BASE_URL || "http://localhost:4002";
const ORDER_BASE_URL = process.env.ORDER_BASE_URL || "http://localhost:4003";

async function main() {
  const email = `idem-${Date.now()}@example.com`;
  const password = "password123";

  const registered = await requestJson("POST", `${AUTH_BASE_URL}/auth/register`, {
    body: { email, password }
  });
  printStep("Register user", registered.body);

  const loggedIn = await requestJson("POST", `${AUTH_BASE_URL}/auth/login`, {
    body: { email, password }
  });
  const jwt = loggedIn.body.token;
  printStep("Login user", loggedIn.body);

  const createdProduct = await requestJson("POST", `${PRODUCT_BASE_URL}/products`, {
    headers: { Authorization: `Bearer ${jwt}` },
    body: {
      name: "Idempotency Product",
      price: 25,
      inventory: 10
    }
  });
  printStep("Create product", createdProduct.body);

  const productId = createdProduct.body.productId;
  const before = await requestJson("GET", `${PRODUCT_BASE_URL}/products/${productId}`, {
    headers: { Authorization: `Bearer ${jwt}` }
  });
  printStep("Inventory before", before.body);

  const orderRequestBody = {
    userId: registered.body.userId,
    items: [
      {
        productId,
        quantity: 2,
        unitPrice: createdProduct.body.price
      }
    ]
  };

  const idempotencyKey = `idem-order-${Date.now()}`;
  const firstOrder = await requestJson("POST", `${ORDER_BASE_URL}/orders`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Idempotency-Key": idempotencyKey
    },
    body: orderRequestBody
  });
  printStep("First order request", firstOrder.body, firstOrder);

  const secondOrder = await requestJson("POST", `${ORDER_BASE_URL}/orders`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Idempotency-Key": idempotencyKey
    },
    body: orderRequestBody
  });
  printStep("Second order request (same Idempotency-Key)", secondOrder.body, secondOrder);

  const after = await requestJson("GET", `${PRODUCT_BASE_URL}/products/${productId}`, {
    headers: { Authorization: `Bearer ${jwt}` }
  });
  printStep("Inventory after", after.body);

  const delta = Number(before.body.inventory) - Number(after.body.inventory);
  const sameOrderId = firstOrder.body.orderId === secondOrder.body.orderId;
  const decreasedOnce = delta === 2;

  console.log(`\n[demo-idempotency] same_order_id=${sameOrderId}`);
  console.log(`[demo-idempotency] inventory_before=${before.body.inventory}`);
  console.log(`[demo-idempotency] inventory_after=${after.body.inventory}`);
  console.log(`[demo-idempotency] inventory_delta=${delta}`);

  if (!sameOrderId) {
    throw new Error(
      `Expected same orderId for duplicate idempotency key, got ${firstOrder.body.orderId} vs ${secondOrder.body.orderId}`
    );
  }

  if (!decreasedOnce) {
    throw new Error(`Expected inventory to decrease once by 2, observed delta=${delta}`);
  }

  console.log("[demo-idempotency] PASS: duplicate HTTP order request reused the same order.");
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

function printStep(step, payload, metadata) {
  console.log(`\n[demo-idempotency] ${step}`);
  if (metadata && metadata.status) {
    const replayHeader = metadata.headers["idempotent-replay"] || "false";
    console.log(
      `[demo-idempotency] http_status=${metadata.status} idempotent_replay=${replayHeader}`
    );
  }
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error("[demo-idempotency] failed", error.message || error);
  process.exit(1);
});
