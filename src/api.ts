// src/api.ts
import type { Scene, Line } from './types';

type LineRecord = Omit<Line, 'audioPath'> & {
  // Store raw audio data locally (persisted)
  audioBlob: Blob | null;
};

const DB_NAME = 'auditionmate';
const DB_VERSION = 1;

const STORES = {
  scenes: 'scenes',
  lines: 'lines',
} as const;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORES.scenes)) {
        db.createObjectStore(STORES.scenes, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.lines)) {
        const store = db.createObjectStore(STORES.lines, { keyPath: 'id' });
        // Helps us query lines by sceneId efficiently
        store.createIndex('bySceneId', 'sceneId', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGetAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

function idbPut<T>(db: IDBDatabase, storeName: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value as any);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbDelete(db: IDBDatabase, storeName: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbGetByIndex<T>(
  db: IDBDatabase,
  storeName: string,
  indexName: string,
  query: IDBValidKey | IDBKeyRange
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const req = index.getAll(query);
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

function safeCreateObjectURL(blob: Blob | null): string | null {
  if (!blob) return null;
  try {
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

function normalizeScene(scene: Scene): Scene {
  // Ensure createdAt exists
  return {
    ...scene,
    createdAt: scene.createdAt || new Date().toISOString(),
  };
}

function normalizeLine(rec: LineRecord): Line {
  // Keep strong reference to blob to prevent GC. URL will be created
  // just-in-time before playback to avoid timing-dependent validity issues.
  return {
    ...rec,
    audioPath: null, // Deprecated - will be created JIT in playback
    audioBlob: rec.audioBlob || null,
  };
}

export const api = {
  async getScenes(): Promise<Scene[]> {
    const db = await openDB();
    const scenes = await idbGetAll<Scene>(db, STORES.scenes);
    // Sort newest first (matches typical UX)
    return scenes
      .map(normalizeScene)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  },

  async createScene(title: string): Promise<Scene> {
    const db = await openDB();
    const scene: Scene = {
      id: crypto.randomUUID(),
      title,
      createdAt: new Date().toISOString(),
    };
    await idbPut(db, STORES.scenes, scene);
    return scene;
  },

  async deleteScene(id: string): Promise<void> {
    const db = await openDB();

    // Delete scene
    await idbDelete(db, STORES.scenes, id);

    // Delete all lines for this scene
    const lines = await idbGetByIndex<LineRecord>(db, STORES.lines, 'bySceneId', id);
    await Promise.all(lines.map((l) => idbDelete(db, STORES.lines, l.id)));
  },

  async getLines(sceneId: string): Promise<Line[]> {
    const db = await openDB();
    const recs = await idbGetByIndex<LineRecord>(db, STORES.lines, 'bySceneId', sceneId);
    // Sort by orderIndex (what your UI expects)
    return recs
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(normalizeLine);
  },

  async createLine(formData: FormData): Promise<{ id: string; audioPath: string }> {
    const db = await openDB();

    const sceneId = String(formData.get('sceneId') ?? '');
    const orderIndex = Number(formData.get('orderIndex') ?? 0);
    const speakerRole = (String(formData.get('speakerRole') ?? 'MYSELF') as Line['speakerRole']);
    const text = String(formData.get('text') ?? '');
    const cueWord = String(formData.get('cueWord') ?? '');
    const durationMs = Number(formData.get('durationMs') ?? 0);

    const audioFile = formData.get('audio');
    const audioBlob =
      audioFile instanceof Blob ? audioFile : null;

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const rec: LineRecord = {
      id,
      sceneId,
      orderIndex,
      speakerRole,
      text,
      cueWord,
      audioBlob,
      durationMs,
      createdAt,
    };

    await idbPut(db, STORES.lines, rec);

    const audioPath = safeCreateObjectURL(audioBlob) ?? '';
    return { id, audioPath };
  },

  async updateLine(id: string, data: Partial<Line>): Promise<void> {
    const db = await openDB();

    // Load existing
    const existing: LineRecord | undefined = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.lines, 'readonly');
      const store = tx.objectStore(STORES.lines);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result as LineRecord | undefined);
      req.onerror = () => reject(req.error);
    });

    if (!existing) return;

    // We don't accept updating audioPath directly (it's derived from audioBlob)
    const { audioPath: _ignore, ...rest } = data as any;

    const updated: LineRecord = {
      ...existing,
      ...rest,
    };

    await idbPut(db, STORES.lines, updated);
  },

  async deleteLine(id: string): Promise<void> {
    const db = await openDB();
    await idbDelete(db, STORES.lines, id);
  },
};