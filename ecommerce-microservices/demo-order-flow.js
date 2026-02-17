const AUTH_BASE_URL = process.env.AUTH_BASE_URL || "http://localhost:4001";
const PRODUCT_BASE_URL = process.env.PRODUCT_BASE_URL || "http://localhost:4002";
const ORDER_BASE_URL = process.env.ORDER_BASE_URL || "http://localhost:4003";

async function main() {
  console.log("[demo] Using endpoints:");
  console.log(`[demo] AUTH_BASE_URL=${AUTH_BASE_URL}`);
  console.log(`[demo] PRODUCT_BASE_URL=${PRODUCT_BASE_URL}`);
  console.log(`[demo] ORDER_BASE_URL=${ORDER_BASE_URL}`);

  const email = `demo-${Date.now()}@example.com`;
  const password = "password123";

  const registerResponse = await postJson(`${AUTH_BASE_URL}/auth/register`, {
    email,
    password
  });
  printStep("Register user", registerResponse);

  const loginResponse = await postJson(`${AUTH_BASE_URL}/auth/login`, {
    email,
    password
  });
  const jwt = loginResponse.token;
  printStep("Login user", loginResponse);
  console.log(`[demo] JWT=${jwt}`);

  const createProductResponse = await postJson(
    `${PRODUCT_BASE_URL}/products`,
    {
      name: "Demo Product",
      price: 20,
      inventory: 10
    },
    {
      Authorization: `Bearer ${jwt}`
    }
  );
  printStep("Create product", createProductResponse);

  const productId = createProductResponse.productId;
  const userId = registerResponse.userId;

  const inventoryBefore = await getJson(`${PRODUCT_BASE_URL}/products/${productId}`, {
    Authorization: `Bearer ${jwt}`
  });
  printStep("Inventory before order", inventoryBefore);

  const idempotencyKey = `demo-order-${Date.now()}`;
  const createOrderResponse = await postJson(
    `${ORDER_BASE_URL}/orders`,
    {
      userId,
      items: [
        {
          productId,
          quantity: 2,
          unitPrice: createProductResponse.price
        }
      ]
    },
    {
      Authorization: `Bearer ${jwt}`,
      "Idempotency-Key": idempotencyKey
    }
  );
  printStep("Create order", createOrderResponse);

  const inventoryAfter = await getJson(`${PRODUCT_BASE_URL}/products/${productId}`, {
    Authorization: `Bearer ${jwt}`
  });
  printStep("Inventory after order", inventoryAfter);

  console.log(
    `[demo] inventory_delta=${Number(inventoryBefore.inventory) - Number(inventoryAfter.inventory)}`
  );
}

async function postJson(url, body, headers = {}) {
  const response = await fetchWithLocalhostFallback(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify(body)
    },
    15000
  );

  return parseResponse(url, response);
}

async function getJson(url, headers = {}) {
  const response = await fetchWithLocalhostFallback(
    url,
    {
      method: "GET",
      headers: {
        ...headers
      }
    },
    15000
  );

  return parseResponse(url, response);
}

async function fetchWithLocalhostFallback(url, options, timeoutMs) {
  const primaryResponse = await fetchWithTimeout(url, options, timeoutMs);
  if (primaryResponse) {
    return primaryResponse;
  }

  const fallbackUrl = convertLocalhostToIpv4(url);
  if (!fallbackUrl || fallbackUrl === url) {
    return primaryResponse;
  }

  return fetchWithTimeout(fallbackUrl, options, timeoutMs);
}

async function parseResponse(url, response) {
  if (!response) {
    throw new Error(`Request failed or timed out: ${url}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`Invalid JSON response from ${url}`);
  }

  if (!response.ok) {
    throw new Error(`Request to ${url} failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  return payload;
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
    if (parsed.hostname !== "localhost") {
      return rawUrl;
    }

    parsed.hostname = "127.0.0.1";
    return parsed.toString();
  } catch (_error) {
    return rawUrl;
  }
}

function printStep(step, payload) {
  console.log(`\n[demo] ${step}`);
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error("[demo] failed", error.message || error);
  process.exit(1);
});
