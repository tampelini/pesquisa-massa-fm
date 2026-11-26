import type { MassaDraftAnswers, MassaQuestion, MassaSurvey } from './types';

export const onlyDigits = (s: string) => s.replace(/\D/g, '');

/** Aceita o número colado com +55 na frente e devolve só DDD + número. */
export function normalizePhone(input: string): string {
  let d = onlyDigits(input);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length > 10 && d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 11);
}

/** Máscara progressiva: (45) 99999-9999 ou (45) 3333-4444. */
export function maskPhone(input: string): string {
  const d = normalizePhone(input);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  // Celular (começa com 9) tem 5 dígitos antes do hífen; fixo tem 4.
  const cut = rest[0] === '9' || d.length === 11 ? 5 : 4;
  if (rest.length <= cut) return `(${ddd}) ${rest}`;
  return `(${ddd}) ${rest.slice(0, cut)}-${rest.slice(cut)}`;
}

/**
 * Telefone brasileiro com DDD: celular (11 dígitos, começa com 9) ou fixo
 * (10 dígitos, começa com 2 a 5). Rejeita DDD inexistente e números repetidos.
 */
export function phoneError(input: string): string | null {
  const d = normalizePhone(input);
  if (d.length === 0) return 'Informe seu telefone com DDD.';
  if (d.length < 10) return 'Telefone incompleto: digite o DDD e o número.';
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || d[1] === '0') return 'DDD inválido.';
  const first = d[2];
  if (d.length === 11 && first !== '9') return 'Celular com DDD deve começar com 9.';
  if (d.length === 10 && !'2345'.includes(first)) return 'Número inválido: confira o DDD e o número.';
  if (/^(\d)\1+$/.test(d.slice(2))) return 'Número inválido: confira o DDD e o número.';
  return null;
}

/** Perguntas exibidas no totem: ativas e, se de escolha, com alternativas. */
export function visibleQuestions(survey: MassaSurvey | null | undefined): MassaQuestion[] {
  if (!survey) return [];
  return survey.questions.filter((q) => q.active && q.prompt.trim() && (q.type === 'text' || q.options.some((o) => o.text.trim())));
}

export function isAnswered(q: MassaQuestion, answers: MassaDraftAnswers): boolean {
  const a = answers[q.id];
  if (q.type === 'text') return typeof a === 'string' && a.trim().length > 0;
  return Array.isArray(a) && a.some((id) => q.options.some((o) => o.id === id));
}

export function missingRequired(questions: readonly MassaQuestion[], answers: MassaDraftAnswers): MassaQuestion[] {
  return questions.filter((q) => q.required && !isAnswered(q, answers));
}

export function isWebUrl(url: string): boolean {
  return /^https?:\/\/\S+\.\S+/.test(url.trim());
}
