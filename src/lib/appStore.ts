import { load, type Store } from "@tauri-apps/plugin-store";

const STORE_PATH = "organiccord_settings.json";

let storePromise: Promise<Store> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

export async function getAppStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load(STORE_PATH, { defaults: {}, autoSave: false });
  }

  try {
    return await storePromise;
  } catch (error) {
    storePromise = null;
    throw error;
  }
}

export function persistStoreEntries(entries: ReadonlyArray<readonly [string, unknown]>): Promise<void> {
  const snapshot = entries.map(([key, value]) => [key, structuredClone(value)] as const);

  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const store = await getAppStore();
    for (const [key, value] of snapshot) {
      await store.set(key, value);
    }
    await store.save();
  });

  return writeQueue;
}
