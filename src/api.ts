import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { DshStatus, Snapshot } from "./types";

export const busSnapshot = () => invoke<Snapshot>("bus_snapshot");

export const sendMessage = (to: string, text: string, kind?: string) =>
  invoke<string>("send_message", { to, text, kind });

export const dshStatus = () => invoke<DshStatus>("dsh_status");

export const dshRecover = () => invoke<string>("dsh_recover");

export const onBusChanged = (fn: (s: Snapshot) => void): Promise<UnlistenFn> =>
  listen<Snapshot>("bus-changed", (e) => fn(e.payload));
