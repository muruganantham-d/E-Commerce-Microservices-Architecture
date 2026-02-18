import { authClient } from "./http";

export async function registerUser(payload) {
  const response = await authClient.post("/auth/register", payload);
  return response.data;
}

export async function loginUser(payload) {
  const response = await authClient.post("/auth/login", payload);
  return response.data;
}
