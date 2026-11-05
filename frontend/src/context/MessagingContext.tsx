import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { MessagingClient } from "../services/messaging";

const MessagingContext = createContext<MessagingClient | null>(null);

interface MessagingProviderProps {
  children: ReactNode;
}

function SessionMessaging({ children }: MessagingProviderProps) {
  const { user, token } = useAuth();
  const [client, setClient] = useState(
    () =>
      new MessagingClient(
        token,
        user?.role === "admin" || user?.role === "user",
      ),
  );
  useEffect(() => {
    // A fresh instance also makes React StrictMode's effect replay safe.
    const connection = new MessagingClient(
      token,
      user?.role === "admin" || user?.role === "user",
    );
    setClient(connection);
    return connection.start();
  }, [token, user?.role]);
  return (
    <MessagingContext.Provider value={client}>
      {children}
    </MessagingContext.Provider>
  );
}

export function MessagingProvider({ children }: MessagingProviderProps) {
  const { user, token } = useAuth();
  return (
    <SessionMessaging key={`${user?.id}:${token}`}>{children}</SessionMessaging>
  );
}

export function useMessaging() {
  const client = useContext(MessagingContext);
  if (!client) throw new Error("MessagingProvider is required.");
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot);
  return { client, ...snapshot };
}
