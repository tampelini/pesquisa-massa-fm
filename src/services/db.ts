import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { MassaParticipant } from '../core/types';

interface SurveyDB extends DBSchema {
  /** Configurações, eventos, pesquisas e PIN do painel. */
  kv: { key: string; value: unknown };
  /** Participantes (telefone, com consentimento), separados por evento. */
  participants: { key: string; value: MassaParticipant; indexes: { eventId: string; createdAt: number } };
}

const DB_NAME = 'pesquisa-massa-fm';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<SurveyDB> | null> | null = null;

// Se o IndexedDB estiver indisponível (modo anônimo restrito, cota esgotada),
// o totem continua funcionando com armazenamento em memória.
const memoryKV = new Map<string, unknown>();
const memoryParticipants = new Map<string, MassaParticipant>();

function getDB(): Promise<IDBPDatabase<SurveyDB> | null> {
  if (!dbPromise) {
    dbPromise = (async () => {
      if (typeof indexedDB === 'undefined') return null;
      try {
        return await openDB<SurveyDB>(DB_NAME, DB_VERSION, {
          upgrade(db) {
            if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
            if (!db.objectStoreNames.contains('participants')) {
              const store = db.createObjectStore('participants', { keyPath: 'id' });
              store.createIndex('eventId', 'eventId');
              store.createIndex('createdAt', 'createdAt');
            }
          },
        });
      } catch (err) {
        console.warn('IndexedDB indisponível; usando memória.', err);
        return null;
      }
    })();
  }
  return dbPromise;
}

export async function getKV<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  if (!db) return memoryKV.get(key) as T | undefined;
  try {
    return (await db.get('kv', key)) as T | undefined;
  } catch {
    return memoryKV.get(key) as T | undefined;
  }
}

export async function setKV<T>(key: string, value: T): Promise<void> {
  memoryKV.set(key, value);
  const db = await getDB();
  if (!db) return;
  await db.put('kv', value as unknown, key);
}

export async function deleteKV(key: string): Promise<void> {
  memoryKV.delete(key);
  const db = await getDB();
  if (db) await db.delete('kv', key);
}

// ---------- Participantes ----------
// Uma falha de gravação é propagada: o totem precisa saber que não salvou para
// manter o preenchimento na tela.

export async function putParticipant(p: MassaParticipant): Promise<void> {
  const db = await getDB();
  if (!db) {
    memoryParticipants.set(p.id, p);
    return;
  }
  await db.put('participants', p);
}

export async function getAllParticipants(): Promise<MassaParticipant[]> {
  const db = await getDB();
  if (!db) return [...memoryParticipants.values()].sort((a, b) => a.createdAt - b.createdAt);
  return db.getAllFromIndex('participants', 'createdAt');
}

export async function getParticipantsByEvent(eventId: string): Promise<MassaParticipant[]> {
  const db = await getDB();
  if (!db) return [...memoryParticipants.values()].filter((p) => p.eventId === eventId);
  return db.getAllFromIndex('participants', 'eventId', eventId);
}

export async function deleteParticipant(id: string): Promise<void> {
  memoryParticipants.delete(id);
  const db = await getDB();
  if (db) await db.delete('participants', id);
}

/** Apenas para testes. */
export async function __resetDBForTests(): Promise<void> {
  const db = await getDB();
  if (db) {
    await db.clear('kv');
    await db.clear('participants');
  }
  memoryKV.clear();
  memoryParticipants.clear();
}
