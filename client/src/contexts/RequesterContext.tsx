import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { DevelopmentRequester } from "../api.js";

interface RequesterContextValue {
  requester: DevelopmentRequester | null;
  setRequester: (r: DevelopmentRequester) => void;
  clearRequester: () => void;
}

const RequesterContext = createContext<RequesterContextValue | undefined>(undefined);

const STORAGE_KEY = "toktickit.requester";

export function RequesterProvider({ children }: { children: ReactNode }) {
  const [requester, setRequesterState] = useState<DevelopmentRequester | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as DevelopmentRequester) : null;
    } catch {
      return null;
    }
  });

  const setRequester = (r: DevelopmentRequester) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(r));
    setRequesterState(r);
  };

  const clearRequester = () => {
    localStorage.removeItem(STORAGE_KEY);
    setRequesterState(null);
  };

  // Sync if another tab changes storage
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        try {
          setRequesterState(e.newValue ? (JSON.parse(e.newValue) as DevelopmentRequester) : null);
        } catch {
          setRequesterState(null);
        }
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return (
    <RequesterContext.Provider value={{ requester, setRequester, clearRequester }}>
      {children}
    </RequesterContext.Provider>
  );
}

export function useRequester(): RequesterContextValue {
  const ctx = useContext(RequesterContext);
  if (!ctx) throw new Error("useRequester must be used within RequesterProvider");
  return ctx;
}
