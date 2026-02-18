import { productClient } from "./http";

export async function listProducts() {
  const response = await productClient.get("/products");
  return response.data;
}

export async function createProduct(payload) {
  const response = await productClient.post("/products", payload);
  return response.data;
}

export async function getProductById(productId) {
  const response = await productClient.get(`/products/${productId}`);
  return response.data;
}
