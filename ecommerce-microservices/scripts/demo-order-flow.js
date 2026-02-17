const SERVICES = [
  { name: "auth-service", healthUrl: "http://localhost:3001/health" },
  { name: "product-service", healthUrl: "http://localhost:3002/health" },
  { name: "order-service", healthUrl: "http://localhost:3003/health" }
];

async function main() {
  for (const service of SERVICES) {
    await waitForHealth(service.healthUrl, 90000);
    console.log(`[demo] ${service.name} healthy`);
  }

  const registeredUser = await postJson("http://localhost:3001/auth/register", {
    email: `demo-${Date.now()}@example.com`,
    password: "password123"
  });
  console.log(`[demo] registered userId=${registeredUser.userId}`);

  const createdProduct = await postJson("http://localhost:3002/products", {
    name: "Demo Product",
    price: 20,
    inventory: 10
  });
  console.log(
    `[demo] created productId=${createdProduct.productId} inventory=${createdProduct.inventory}`
  );

  const before = await getJson(`http://localhost:3002/products/${createdProduct.productId}`);

  const order = await postJson(
    "http://localhost:3003/orders",
    {
      userId: registeredUser.userId,
      items: [
        {
          productId: createdProduct.productId,
          quantity: 2,
          unitPrice: createdProduct.price
        }
      ]
    },
    {
      "Idempotency-Key": `demo-order-${Date.now()}`
    }
  );

  console.log(`[demo] created orderId=${order.orderId} status=${order.status}`);

  const after = await getJson(`http://localhost:3002/products/${createdProduct.productId}`);

  console.log(`[demo] inventory before=${before.inventory}`);
  console.log(`[demo] inventory after=${after.inventory}`);
  console.log(`[demo] inventory delta=${before.inventory - after.inventory}`);
}

async function waitForHealth(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const response = await fetchWithTimeout(url, { method: "GET" }, 3000);
    if (response && response.ok) {
      return;
    }
    await sleep(1000);
  }

  throw new Error(`Timeout waiting for health endpoint: ${url}`);
}

async function postJson(url, body, headers = {}) {
  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify(body)
    },
    10000
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`POST ${url} failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function getJson(url) {
  const response = await fetchWithTimeout(url, { method: "GET" }, 10000);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`GET ${url} failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (_error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error("[demo] failed", error);
  process.exit(1);
});
