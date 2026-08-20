"use client";

import { createContext, useContext, type JSX, type ReactNode } from "react";

import type { ClientConfig } from "./public-config";

export type { ClientConfig } from "./public-config";

const ClientConfigContext = createContext<ClientConfig | null>(null);

export interface ClientConfigProviderProps {
  config: ClientConfig;
  children: ReactNode;
}

/**
 * Makes the server-resolved `ClientConfig` available to client components via context.
 * Mount this inside a `force-dynamic` server component (never the root layout — see
 * spec §5.1) after calling `getClientConfig()`.
 */
export function ClientConfigProvider({ config, children }: ClientConfigProviderProps): JSX.Element {
  return <ClientConfigContext.Provider value={config}>{children}</ClientConfigContext.Provider>;
}

/** Reads the `ClientConfig` from context. Throws when rendered outside the provider. */
export function useClientConfig(): ClientConfig {
  const config = useContext(ClientConfigContext);
  if (config === null) {
    throw new Error(
      "useClientConfig() was called outside a <ClientConfigProvider>. Wrap the tree with " +
        "<ClientConfigProvider config={getClientConfig()}> in a server component first.",
    );
  }
  return config;
}
