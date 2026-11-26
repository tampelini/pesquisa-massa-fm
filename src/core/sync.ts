import { getAllParticipants, getKV, putParticipant, setKV } from '../services/db';
import { formatDateTime, getMassaConfig } from './store';
import { isWebUrl, maskPhone } from './validation';
import type { MassaParticipant, MassaSyncConfig } from './types';

/*
 * Envio online das participações para uma planilha do Google Sheets.
 *
 * O aparelho continua sendo a fonte dos dados: cada participação é gravada
 * primeiro no banco local e fica "pendente" até a planilha confirmar que a
 * recebeu. Sem internet, a fila espera; com internet, sobe sozinha. A planilha
 * ignora reenvios (cada participação tem um id), então repetir nunca duplica.
 *
 * Nenhum dado pessoal é escrito no console: os erros guardam só o motivo.
 */

const STATUS_KEY = 'massaSyncStatus';
const DEVICE_KEY = 'massaDeviceId';
const BATCH = 50;

export interface SyncStatus {
  lastAttempt: number | null;
  lastSuccess: number | null;
  lastError: string | null;
}

export interface SyncResult {
  /** Participações confirmadas pela planilha nesta tentativa. */
  sent: number;
  /** Quantas continuam na fila. */
  pending: number;
  error?: string;
}

/** Linha enviada à planilha: só o que o painel já mostra. */
export function toSheetRow(p: MassaParticipant) {
  return {
    id: p.id,
    data_hora: formatDateTime(p.createdAt),
    evento: p.eventName,
    pesquisa: p.surveyName,
    telefone: p.phone ? maskPhone(p.phone) : '(anonimizado)',
    aceita_comunicacoes: p.marketingOptIn ? 'sim' : 'nao',
    versao_consentimento: p.consentVersion,
    respostas: p.answers.map((a) => ({ pergunta: a.prompt, resposta: a.values.join(' | ') })),
  };
}

export const isSyncConfigured = (sync: MassaSyncConfig) => sync.enabled && isWebUrl(sync.url) && sync.token.trim().length > 0;

export async function getSyncStatus(): Promise<SyncStatus> {
  return (await getKV<SyncStatus>(STATUS_KEY).catch(() => undefined)) ?? { lastAttempt: null, lastSuccess: null, lastError: null };
}

export async function countPending(): Promise<number> {
  return (await getAllParticipants()).filter((p) => !p.syncedAt).length;
}

/**
 * Nome do aparelho gravado na coluna "totem". Sem um nome definido no painel, usa
 * um código curto criado na primeira vez e guardado no aparelho, para dar para
 * distinguir os totens na planilha mesmo com o app pré-configurado.
 */
export async function deviceLabel(sync: MassaSyncConfig): Promise<string> {
  if (sync.device.trim()) return sync.device.trim();
  let id = await getKV<string>(DEVICE_KEY).catch(() => undefined);
  if (!id) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    id = 'Aparelho ' + Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => chars[b % chars.length]).join('');
    await setKV(DEVICE_KEY, id).catch(() => {});
  }
  return id;
}

async function post(sync: MassaSyncConfig, rows: unknown[]): Promise<string[]> {
  // "text/plain" evita a checagem prévia (preflight) que o Apps Script não responde.
  const res = await fetch(sync.url.trim(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: sync.token.trim(), totem: await deviceLabel(sync), rows }),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`A planilha respondeu com erro ${res.status}.`);
  let data: { ok?: boolean; salvos?: unknown; erro?: string };
  try {
    data = await res.json();
  } catch {
    throw new Error('Resposta inesperada: confira se o endereço é o do "App da Web" do script, terminado em /exec.');
  }
  if (!data.ok) throw new Error(data.erro === 'senha' ? 'Senha de envio diferente da que está no script da planilha.' : `A planilha recusou o envio: ${data.erro ?? 'motivo não informado'}.`);
  return Array.isArray(data.salvos) ? data.salvos.map(String) : [];
}

const friendly = (err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  return /Failed to fetch|NetworkError|Load failed|fetch failed/i.test(msg) ? 'Sem conexão com a planilha (totem sem internet ou endereço incorreto).' : msg;
};

/** Testa endereço e senha sem enviar nenhuma participação. */
export async function testSync(sync: MassaSyncConfig): Promise<string | null> {
  if (!isWebUrl(sync.url)) return 'Informe o endereço do App da Web (começa com https://).';
  if (!sync.token.trim()) return 'Informe a senha de envio.';
  try {
    await post(sync, []);
    return null;
  } catch (err) {
    return friendly(err);
  }
}

let running: Promise<SyncResult> | null = null;

/** Envia o que estiver pendente. Chamadas simultâneas compartilham a mesma tentativa. */
export function syncPending(sync: MassaSyncConfig = getMassaConfig().sync): Promise<SyncResult> {
  running ??= run(sync).finally(() => {
    running = null;
  });
  return running;
}

async function run(sync: MassaSyncConfig): Promise<SyncResult> {
  const queue = (await getAllParticipants()).filter((p) => !p.syncedAt);
  if (!isSyncConfigured(sync) || queue.length === 0) return { sent: 0, pending: queue.length };

  const now = Date.now();
  let sent = 0;
  let error: string | undefined;
  try {
    for (let i = 0; i < queue.length; i += BATCH) {
      const batch = queue.slice(i, i + BATCH);
      const saved = new Set(await post(sync, batch.map(toSheetRow)));
      for (const p of batch) {
        if (!saved.has(p.id)) continue;
        await putParticipant({ ...p, syncedAt: Date.now() });
        sent++;
      }
    }
  } catch (err) {
    error = friendly(err);
  }
  const previous = await getSyncStatus();
  await setKV<SyncStatus>(STATUS_KEY, {
    lastAttempt: now,
    lastSuccess: error ? previous.lastSuccess : now,
    lastError: error ?? null,
  }).catch(() => {});
  return { sent, pending: queue.length - sent, ...(error ? { error } : {}) };
}

/**
 * Mantém a fila andando enquanto o app está aberto: ao iniciar, quando a internet
 * volta e a cada 2 minutos. Devolve a função que desliga.
 */
export function startBackgroundSync(intervalMs = 120_000): () => void {
  const tick = () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    void syncPending().catch(() => {});
  };
  const first = window.setTimeout(tick, 3000);
  const timer = window.setInterval(tick, intervalMs);
  window.addEventListener('online', tick);
  return () => {
    window.clearTimeout(first);
    window.clearInterval(timer);
    window.removeEventListener('online', tick);
  };
}
