import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth(token, user) {
        set({ token, user });
      },
      clearAuth() {
        set({ token: null, user: null });
      }
    }),
    {
      name: "ecom-web-auth",
      storage: createJSONStorage(() => localStorage)
    }
  )
);
