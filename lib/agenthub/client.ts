/**
 * Agent Hub SDK dual-instance client (ARCHITECTURE.md §5.1).
 *
 * - readonly: market + account, readOnly=true — analysis only, no writes possible.
 * - paper:    trade module, paperTrading=true, DEMO key only — the single
 *             execution path, reachable solely from the sign endpoint.
 *
 * If the SDK is unavailable at runtime (not installed / network sandbox), calls
 * degrade to demo data so the product remains demoable end-to-end (DEMO_MODE).
 */

import type { SafeResult, ToolContext, ToolSpec } from "@bitget-ai/bitget-agent-sdk";

type Sdk = typeof import("@bitget-ai/bitget-agent-sdk");

let sdkPromise: Promise<Sdk | null> | null = null;

async function loadSdk(): Promise<Sdk | null> {
  if (!sdkPromise) {
    sdkPromise = import("@bitget-ai/bitget-agent-sdk").then(
      (m) => m as Sdk,
      () => null,
    );
  }
  return sdkPromise;
}

export interface HubInstance {
  ok: boolean;
  mode: "readonly" | "paper";
  listTool(name: string): Promise<ToolSpec | undefined>;
  invoke(name: string, args: Record<string, unknown>): Promise<SafeResult>;
}

async function makeInstance(mode: "readonly" | "paper"): Promise<HubInstance> {
  const sdk = await loadSdk();
  if (!sdk) {
    return {
      ok: false,
      mode,
      listTool: async () => undefined,
      invoke: async () => ({
        ok: false,
        error: { code: "SDK_UNAVAILABLE", message: "bitget-agent-sdk not available (demo mode)" },
      } as unknown as SafeResult),
    };
  }
  const isDemoKeySet = Boolean(
    process.env.BITGET_DEMO_API_KEY && process.env.BITGET_DEMO_SECRET_KEY && process.env.BITGET_DEMO_PASSPHRASE,
  );
  if (mode === "paper" && !isDemoKeySet) {
    return {
      ok: false,
      mode,
      listTool: async () => undefined,
      invoke: async () => ({
        ok: false,
        error: {
          code: "NO_DEMO_KEY",
          message: "BITGET_DEMO_* env not set; paper trading disabled",
        },
      } as unknown as SafeResult),
    };
  }

  const config =
    mode === "readonly"
      ? sdk.loadConfig({
          modules: "market,account",
          readOnly: true,
          ...(isDemoKeySet
            ? {
                apiKey: process.env.BITGET_DEMO_API_KEY,
                secretKey: process.env.BITGET_DEMO_SECRET_KEY,
                passphrase: process.env.BITGET_DEMO_PASSPHRASE,
              }
            : {}),
        })
      : sdk.loadConfig({
          modules: "trade",
          paperTrading: true,
          apiKey: process.env.BITGET_DEMO_API_KEY,
          secretKey: process.env.BITGET_DEMO_SECRET_KEY,
          passphrase: process.env.BITGET_DEMO_PASSPHRASE,
        });

  const client = new sdk.BitgetRestClient(config);
  const tools = sdk.buildTools(config);
  const ctx: ToolContext = { config, client };

  return {
    ok: true,
    mode,
    listTool: async (name) => tools.find((t) => t.name === name),
    invoke: async (name, args) => {
      const tool = tools.find((t) => t.name === name);
      if (!tool) {
        return {
          ok: false,
          error: { code: "TOOL_NOT_FOUND", message: `tool "${name}" not mounted in ${mode} instance` },
        } as unknown as SafeResult;
      }
      return sdk.safeInvoke(tool, args, ctx);
    },
  };
}

let readonlyOnce: Promise<HubInstance> | null = null;
let paperOnce: Promise<HubInstance> | null = null;

export function getReadonlyHub(): Promise<HubInstance> {
  readonlyOnce ??= makeInstance("readonly");
  return readonlyOnce;
}

export function getPaperHub(): Promise<HubInstance> {
  paperOnce ??= makeInstance("paper");
  return paperOnce;
}
