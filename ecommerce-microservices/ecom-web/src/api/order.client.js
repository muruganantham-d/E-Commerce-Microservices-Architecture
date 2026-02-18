import { orderClient } from "./http";

export async function placeOrder(payload, idempotencyKey) {
  const response = await orderClient.post("/orders", payload, {
    headers: {
      "Idempotency-Key": idempotencyKey
    }
  });
  return response.data;
}
