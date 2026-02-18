import axios from "axios";
import { useAuthStore } from "../store/auth.store";

const AUTH_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL || "http://127.0.0.1:4001";
const PRODUCT_BASE_URL = import.meta.env.VITE_PRODUCT_BASE_URL || "http://127.0.0.1:4002";
const ORDER_BASE_URL = import.meta.env.VITE_ORDER_BASE_URL || "http://127.0.0.1:4003";

function createServiceClient(baseURL) {
  const client = axios.create({
    baseURL,
    headers: {
      "Content-Type": "application/json"
    }
  });

  client.interceptors.request.use((config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  return client;
}

export const authClient = createServiceClient(AUTH_BASE_URL);
export const productClient = createServiceClient(PRODUCT_BASE_URL);
export const orderClient = createServiceClient(ORDER_BASE_URL);
