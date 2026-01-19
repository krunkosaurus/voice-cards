// services/db.ts - IndexedDB operations for Voice Cards
import { openDB, type IDBPDatabase } from 'idb';
import type { Card, Project, Settings, AudioRecord } from '@/types';

const DB_NAME = 'voice-cards-db';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase | null = null;

export async function initDB() {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Project store
      if (!db.objectStoreNames.contains('project')) {
        db.createObjectStore('project');
      }

      // Cards store
      if (!db.objectStoreNames.contains('cards')) {
        db.createObjectStore('cards', { keyPath: 'id' });
      }

      // Audio store (separate for performance)
      if (!db.objectStoreNames.contains('audio')) {
        db.createObjectStore('audio', { keyPath: 'cardId' });
      }

      // Settings store
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
    },
  });

  return dbInstance;
}

// Project operations
export async function getProject(): Promise<Project | null> {
  const db = await initDB();
  return db.get('project', 'singleton');
}

export async function saveProject(project: Project): Promise<void> {
  const db = await initDB();
  await db.put('project', project, 'singleton');
}

// Card operations
export async function getAllCards(): Promise<Card[]> {
  const db = await initDB();
  const cards = await db.getAll('cards');
  // Sort by order field, falling back to createdAt for legacy cards without order
  return cards.sort((a, b) => {
    const orderA = a.order ?? Infinity;
    const orderB = b.order ?? Infinity;
    if (orderA !== orderB) return orderA - orderB;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export async function getCard(id: string): Promise<Card | undefined> {
  const db = await initDB();
  return db.get('cards', id);
}

export async function saveCard(card: Card): Promise<void> {
  const db = await initDB();
  await db.put('cards', card);
}

export async function deleteCard(id: string): Promise<void> {
  const db = await initDB();
  await db.delete('cards', id);
  await db.delete('audio', id);
}

export async function saveCards(cards: Card[]): Promise<void> {
  const db = await initDB();
  const tx = db.transaction('cards', 'readwrite');
  await Promise.all(cards.map(card => tx.store.put(card)));
  await tx.done;
}

// Audio operations
export async function getAudio(cardId: string): Promise<Blob | null> {
  const db = await initDB();
  const record = await db.get('audio', cardId);
  return record?.blob || null;
}

export async function saveAudio(cardId: string, blob: Blob): Promise<void> {
  const db = await initDB();
  await db.put('audio', { cardId, blob });
}

export async function deleteAudio(cardId: string): Promise<void> {
  const db = await initDB();
  await db.delete('audio', cardId);
}

// Settings operations
export async function getSettings(): Promise<Settings | null> {
  const db = await initDB();
  return db.get('settings', 'singleton');
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = await initDB();
  await db.put('settings', settings, 'singleton');
}

// Clear all data
export async function clearAllData(): Promise<void> {
  const db = await initDB();
  await db.clear('project');
  await db.clear('cards');
  await db.clear('audio');
  // Keep settings (theme preference)
}
