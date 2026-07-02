import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Me } from "@/types";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: Me | null;
  setTokens: (access: string, refresh: string) => void;
  setUser: (user: Me | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setTokens: (access, refresh) =>
        set({ accessToken: access, refreshToken: refresh }),
      setUser: (user) => set({ user }),
      logout: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: "rack-insight-auth" },
  ),
);
