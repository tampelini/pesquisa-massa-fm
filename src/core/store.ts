import { useEffect, useSyncExternalStore } from 'react';
import { deleteParticipant, getAllParticipants, getKV, getParticipantsByEvent, putParticipant, setKV } from '../services/db';
import { newId } from '../services/files';
import { toCsv } from '../services/csv';
import { DEFAULT_MASSA_CONFIG, DEFAULT_MASSA_EVENTS, DEFAULT_MASSA_SURVEYS } from './defaults';
import { maskPhone, normalizePhone, visibleQuestions } from './validation';
import type { MassaAnswer, MassaConfig, MassaCourse, MassaDraftAnswers, MassaEvent, MassaParticipant, MassaQuestion, MassaSurvey } from './types';

const KEYS = { config: 'massaConfig', events: 'massaEvents', surveys: 'massaSurveys' } as const;

export interface MassaState {
  ready: boolean;
  config: MassaConfig;
  events: MassaEvent[];
  surveys: MassaSurvey[];
}

/**
 * Aceita a lista salva pela primeira versão (só nomes): cada nome ganha o link
 * padrão do curso correspondente, quando houver.
 */
function normalizeCourses(saved: unknown[], defaults: MassaCourse[]): MassaCourse[] {
  return saved
    .map((c) => {
      if (typeof c === 'string') return { name: c, url: defaults.find((d) => d.name === c)?.url ?? '' };
      const o = c as Partial<MassaCourse>;
      return { name: String(o?.name ?? ''), url: String(o?.url ?? '') };
    })
    .filter((c) => c.name.trim());
}

/** Mescla a configuração salva com os padrões (campos novos ganham valor padrão). */
export function mergeMassaConfig(saved: Partial<MassaConfig> | undefined): MassaConfig {
  const base = structuredClone(DEFAULT_MASSA_CONFIG);
  if (!saved) return base;
  // Campos ausentes ou indefinidos na configuração salva ficam com o valor padrão
  // (null é um valor válido: "nenhum evento em uso").
  const defined = Object.fromEntries(Object.entries(saved).filter(([, v]) => v !== undefined)) as Partial<MassaConfig>;
  return {
    ...base,
    ...defined,
    colors: { ...base.colors, ...(saved.colors ?? {}) },
    consent: { ...base.consent, ...(saved.consent ?? {}) },
    courses: Array.isArray(saved.courses) ? normalizeCourses(saved.courses, base.courses) : base.courses,
  };
}

const initial = (): MassaState => ({
  ready: false,
  config: structuredClone(DEFAULT_MASSA_CONFIG),
  events: structuredClone(DEFAULT_MASSA_EVENTS),
  surveys: structuredClone(DEFAULT_MASSA_SURVEYS),
});

// Estado único compartilhado entre o totem e o painel (um salva, o outro enxerga).
let state: MassaState = initial();
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<MassaState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function loadMassa(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      const [config, events, surveys] = await Promise.all([
        getKV<Partial<MassaConfig>>(KEYS.config).catch(() => undefined),
        getKV<MassaEvent[]>(KEYS.events).catch(() => undefined),
        getKV<MassaSurvey[]>(KEYS.surveys).catch(() => undefined),
      ]);
      set({
        ready: true,
        config: mergeMassaConfig(config),
        events: Array.isArray(events) ? events : structuredClone(DEFAULT_MASSA_EVENTS),
        surveys: Array.isArray(surveys) ? surveys : structuredClone(DEFAULT_MASSA_SURVEYS),
      });
    })();
  }
  return loading;
}

export async function saveMassaConfig(config: MassaConfig): Promise<void> {
  set({ config });
  await setKV(KEYS.config, config);
}
export async function saveMassaEvents(events: MassaEvent[]): Promise<void> {
  set({ events });
  await setKV(KEYS.events, events);
}
export async function saveMassaSurveys(surveys: MassaSurvey[]): Promise<void> {
  set({ surveys });
  await setKV(KEYS.surveys, surveys);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useMassa(): MassaState {
  const snapshot = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    void loadMassa();
  }, []);
  return snapshot;
}

/** Apenas para testes: esquece o que foi carregado. */
export function __resetMassaForTests() {
  state = initial();
  loading = null;
  listeners.forEach((l) => l());
}

// ---------- Evento e pesquisa em uso no totem ----------

export interface ActiveSurvey {
  event: MassaEvent;
  survey: MassaSurvey;
  questions: MassaQuestion[];
}

/** Evento ativo escolhido no painel, com a pesquisa vinculada. null = pesquisa indisponível. */
export function resolveActive(s: Pick<MassaState, 'config' | 'events' | 'surveys'>): ActiveSurvey | null {
  const event = s.events.find((e) => e.id === s.config.activeEventId && e.active);
  if (!event) return null;
  const survey = s.surveys.find((x) => x.id === event.surveyId);
  if (!survey) return null;
  return { event, survey, questions: visibleQuestions(survey) };
}

// ---------- Participantes ----------

export class DuplicatePhoneError extends Error {
  constructor() {
    super('Telefone já cadastrado neste evento.');
    this.name = 'DuplicatePhoneError';
  }
}

/** Mesmo telefone já participou deste evento? (Cadastros anonimizados não contam.) */
export async function phoneAlreadyInEvent(eventId: string, phone: string): Promise<boolean> {
  const digits = normalizePhone(phone);
  if (!digits) return false;
  return (await getParticipantsByEvent(eventId)).some((p) => p.phone === digits);
}

export function buildAnswers(questions: readonly MassaQuestion[], draft: MassaDraftAnswers): MassaAnswer[] {
  const out: MassaAnswer[] = [];
  for (const q of questions) {
    const a = draft[q.id];
    if (q.type === 'text') {
      const text = typeof a === 'string' ? a.trim() : '';
      if (text) out.push({ questionId: q.id, prompt: q.prompt, type: q.type, optionIds: [], values: [text] });
      continue;
    }
    const chosen = q.options.filter((o) => Array.isArray(a) && a.includes(o.id));
    const picked = q.type === 'single' ? chosen.slice(0, 1) : chosen;
    if (picked.length) out.push({ questionId: q.id, prompt: q.prompt, type: q.type, optionIds: picked.map((o) => o.id), values: picked.map((o) => o.text) });
  }
  return out;
}

export interface Submission {
  active: ActiveSurvey;
  phone: string;
  answers: MassaDraftAnswers;
  consent: MassaConfig['consent'];
  marketingOptIn: boolean;
}

/**
 * Grava a participação. Lança DuplicatePhoneError se o telefone já participou do
 * evento; qualquer outra falha de gravação também é lançada (o totem mantém os dados).
 */
export async function submitParticipation(s: Submission, now = Date.now()): Promise<MassaParticipant> {
  const phone = normalizePhone(s.phone);
  if (await phoneAlreadyInEvent(s.active.event.id, phone)) throw new DuplicatePhoneError();
  const record: MassaParticipant = {
    id: newId('mp-'),
    eventId: s.active.event.id,
    eventName: s.active.event.name,
    surveyId: s.active.survey.id,
    surveyName: s.active.survey.name,
    createdAt: now,
    phone,
    answers: buildAnswers(s.active.questions, s.answers),
    consentVersion: s.consent.version,
    consentText: s.consent.requiredText,
    marketingOptIn: s.marketingOptIn,
  };
  await putParticipant(record);
  return record;
}

export const listParticipants = getAllParticipants;
export const removeParticipant = deleteParticipant;

/** Apaga o telefone, mantendo as respostas para as estatísticas. */
export async function anonymizeParticipant(p: MassaParticipant, now = Date.now()): Promise<MassaParticipant> {
  const next: MassaParticipant = { ...p, phone: '', marketingOptIn: false, anonymizedAt: now };
  await putParticipant(next);
  return next;
}

// ---------- Filtros, totais e exportação ----------

export interface ParticipantFilter {
  eventId?: string;
  surveyId?: string;
  /** AAAA-MM-DD, no fuso do aparelho. */
  from?: string;
  to?: string;
  search?: string;
  questionId?: string;
  /** Texto da resposta (alternativa) escolhida. */
  answer?: string;
}

const dayStart = (d: string) => new Date(`${d}T00:00:00`).getTime();
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999`).getTime();

export function filterParticipants(list: readonly MassaParticipant[], f: ParticipantFilter): MassaParticipant[] {
  // Busca por telefone: aceita o número com ou sem máscara, inteiro ou um trecho.
  const searchDigits = (f.search ?? '').replace(/\D/g, '');
  return list.filter((p) => {
    if (f.eventId && p.eventId !== f.eventId) return false;
    if (f.surveyId && p.surveyId !== f.surveyId) return false;
    if (f.from && p.createdAt < dayStart(f.from)) return false;
    if (f.to && p.createdAt > dayEnd(f.to)) return false;
    if ((f.search ?? '').trim() && !(searchDigits && p.phone.includes(searchDigits))) return false;
    if (f.questionId) {
      const a = p.answers.find((x) => x.questionId === f.questionId);
      if (!a) return false;
      if (f.answer && !a.values.includes(f.answer)) return false;
    }
    return true;
  });
}

export interface QuestionTotals {
  questionId: string;
  prompt: string;
  type: MassaAnswer['type'];
  /** Participantes que responderam a pergunta. */
  respondents: number;
  /** Alternativas com quantidade e percentual sobre quem respondeu. */
  options: { value: string; count: number; percent: number }[];
}

/** Totais e percentuais por pergunta. Texto livre conta apenas quantos responderam. */
export function totalsByQuestion(list: readonly MassaParticipant[]): QuestionTotals[] {
  const map = new Map<string, { prompt: string; type: MassaAnswer['type']; respondents: number; counts: Map<string, number> }>();
  for (const p of list) {
    for (const a of p.answers) {
      let t = map.get(a.questionId);
      if (!t) {
        t = { prompt: a.prompt, type: a.type, respondents: 0, counts: new Map() };
        map.set(a.questionId, t);
      }
      t.prompt = a.prompt; // texto mais recente da pergunta
      t.respondents++;
      if (a.type !== 'text') for (const v of a.values) t.counts.set(v, (t.counts.get(v) ?? 0) + 1);
    }
  }
  return [...map.entries()].map(([questionId, t]) => ({
    questionId,
    prompt: t.prompt,
    type: t.type,
    respondents: t.respondents,
    options: [...t.counts.entries()]
      .map(([value, count]) => ({ value, count, percent: t.respondents ? (count / t.respondents) * 100 : 0 }))
      .sort((a, b) => b.count - a.count),
  }));
}

export const formatDateTime = (t: number) => new Date(t).toLocaleString('pt-BR');

export function participantsToCsv(list: readonly MassaParticipant[]): string {
  const questions = new Map<string, string>();
  for (const p of list) for (const a of p.answers) questions.set(a.questionId, a.prompt);
  const ids = [...questions.keys()];
  const rows: unknown[][] = [[
    'data_hora', 'evento', 'pesquisa', 'telefone', 'aceita_comunicacoes', 'versao_consentimento', 'anonimizado', ...ids.map((id) => questions.get(id)),
  ]];
  for (const p of list) {
    rows.push([
      formatDateTime(p.createdAt), p.eventName, p.surveyName, maskPhone(p.phone), p.marketingOptIn ? 'sim' : 'nao', p.consentVersion,
      p.anonymizedAt ? 'sim' : 'nao',
      ...ids.map((id) => p.answers.find((a) => a.questionId === id)?.values.join(' | ') ?? ''),
    ]);
  }
  return toCsv(rows);
}

export function totalsToCsv(totals: readonly QuestionTotals[], participants: number): string {
  const rows: unknown[][] = [['pergunta', 'resposta', 'quantidade', 'percentual']];
  rows.push(['(geral)', 'participantes', participants, '']);
  for (const t of totals) {
    if (t.type === 'text') rows.push([t.prompt, '(texto livre) responderam', t.respondents, '']);
    for (const o of t.options) rows.push([t.prompt, o.value, o.count, o.percent.toFixed(1)]);
  }
  return toCsv(rows);
}
