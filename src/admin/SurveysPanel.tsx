import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';
import { Btn, Card, Field, Notice } from './ui';
import { newId } from '../services/files';
import { saveMassaSurveys, useMassa } from '../core/store';
import type { MassaQuestion, MassaQuestionType, MassaSurvey } from '../core/types';

const TYPE_LABELS: Record<MassaQuestionType, string> = {
  single: 'Escolha única',
  multiple: 'Múltipla escolha',
  text: 'Texto livre',
};

const newQuestion = (): MassaQuestion => ({
  id: newId('q-'),
  prompt: '',
  type: 'single',
  required: true,
  active: true,
  options: [
    { id: newId('o-'), text: '' },
    { id: newId('o-'), text: '' },
  ],
});

export function validateSurvey(s: MassaSurvey): string[] {
  const errors: string[] = [];
  if (!s.name.trim()) errors.push('Informe o nome da pesquisa.');
  s.questions.forEach((q, i) => {
    const n = `Pergunta ${i + 1}`;
    if (!q.prompt.trim()) errors.push(`${n}: escreva o texto da pergunta.`);
    if (q.type !== 'text') {
      const texts = q.options.map((o) => o.text.trim().toLowerCase());
      if (texts.some((t) => !t)) errors.push(`${n}: preencha ou remova as alternativas vazias.`);
      else if (texts.length < 2) errors.push(`${n}: perguntas de escolha precisam de pelo menos 2 alternativas.`);
      else if (new Set(texts).size !== texts.length) errors.push(`${n}: há alternativas repetidas.`);
    }
  });
  return errors;
}

function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const out = list.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export function SurveysPanel() {
  const { surveys, events } = useMassa();
  const [selectedId, setSelectedId] = useState<string | null>(surveys[0]?.id ?? null);
  const [draft, setDraft] = useState<MassaSurvey | null>(null);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  // Carrega no editor a pesquisa selecionada (sempre uma cópia: nada muda até salvar).
  useEffect(() => {
    const s = surveys.find((x) => x.id === selectedId) ?? null;
    setDraft(s ? structuredClone(s) : null);
    setDirty(false);
    setErrors([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const change = (next: MassaSurvey) => {
    setDraft(next);
    setDirty(true);
    setMessage(null);
  };
  const setQuestion = (i: number, patch: Partial<MassaQuestion>) => {
    if (!draft) return;
    change({ ...draft, questions: draft.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  };

  const select = (id: string) => {
    if (dirty && !window.confirm('Há alterações não salvas nesta pesquisa. Descartar?')) return;
    setSelectedId(id);
  };

  async function create(copyFrom?: MassaSurvey) {
    if (dirty && !window.confirm('Há alterações não salvas nesta pesquisa. Descartar?')) return;
    const s: MassaSurvey = copyFrom
      ? {
          id: newId('pq-'),
          name: `${copyFrom.name} (cópia)`,
          questions: copyFrom.questions.map((q) => ({ ...q, id: newId('q-'), options: q.options.map((o) => ({ ...o, id: newId('o-') })) })),
        }
      : { id: newId('pq-'), name: 'Nova pesquisa', questions: [] };
    await saveMassaSurveys([...surveys, s]);
    setSelectedId(s.id);
    setMessage({ tone: 'ok', text: `Pesquisa "${s.name}" criada. Edite as perguntas e salve.` });
  }

  async function save() {
    if (!draft) return;
    const clean: MassaSurvey = {
      ...draft,
      name: draft.name.trim(),
      questions: draft.questions.map((q) => ({
        ...q,
        prompt: q.prompt.trim(),
        options: q.type === 'text' ? [] : q.options.map((o) => ({ ...o, text: o.text.trim() })),
      })),
    };
    const errs = validateSurvey(clean);
    setErrors(errs);
    if (errs.length) return;
    await saveMassaSurveys(surveys.map((s) => (s.id === clean.id ? clean : s)));
    setDraft(structuredClone(clean));
    setDirty(false);
    setMessage({ tone: 'ok', text: `Pesquisa "${clean.name}" salva. O totem já usa a nova versão.` });
  }

  async function remove(s: MassaSurvey) {
    const linked = events.filter((e) => e.surveyId === s.id);
    if (linked.length) {
      setMessage({ tone: 'warn', text: `A pesquisa "${s.name}" está vinculada a: ${linked.map((e) => e.name).join(', ')}. Troque a pesquisa desses eventos antes de excluir.` });
      return;
    }
    if (!window.confirm(`Excluir a pesquisa "${s.name}"? As respostas já coletadas continuam guardadas.`)) return;
    const next = surveys.filter((x) => x.id !== s.id);
    await saveMassaSurveys(next);
    setDirty(false);
    setSelectedId(next[0]?.id ?? null);
    setMessage({ tone: 'ok', text: 'Pesquisa excluída.' });
  }

  return (
    <div className="flex flex-col gap-4">
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <Card
        title={`Pesquisas (${surveys.length})`}
        actions={
          <Btn tone="primary" onClick={() => void create()}>
            <Plus className="h-5 w-5" aria-hidden="true" /> Nova pesquisa
          </Btn>
        }
      >
        <ul className="flex flex-wrap gap-2">
          {surveys.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => select(s.id)}
                aria-current={selectedId === s.id ? 'true' : undefined}
                className={`min-h-[44px] rounded-lg px-4 font-semibold ${selectedId === s.id ? 'bg-primary text-bg' : 'border border-primary/30 bg-bg'}`}
              >
                {s.name} ({s.questions.length})
              </button>
            </li>
          ))}
          {surveys.length === 0 && <li className="text-ink/60">Nenhuma pesquisa cadastrada.</li>}
        </ul>
      </Card>

      {draft && (
        <Card
          title="Editar pesquisa"
          actions={
            <div className="flex flex-wrap gap-2">
              <Btn onClick={() => void create(draft)}>
                <Copy className="h-4 w-4" aria-hidden="true" /> Duplicar
              </Btn>
              <Btn tone="danger" onClick={() => void remove(draft)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Excluir pesquisa
              </Btn>
            </div>
          }
        >
          <div className="grid gap-4">
            {errors.length > 0 && (
              <Notice tone="error">
                <ul className="list-disc pl-5">
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </Notice>
            )}
            <Field label="Nome da pesquisa">
              <input value={draft.name} onChange={(e) => change({ ...draft, name: e.target.value })} />
            </Field>

            {draft.questions.map((q, i) => (
              <fieldset key={q.id} className={`grid gap-3 rounded-xl border border-primary/25 p-4 ${q.active ? '' : 'opacity-70'}`}>
                <legend className="px-2 text-sm font-bold text-primary">Pergunta {i + 1}</legend>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[14rem] flex-1">
                    <Field label="Texto da pergunta">
                      <input value={q.prompt} aria-label={`Texto da pergunta ${i + 1}`} onChange={(e) => setQuestion(i, { prompt: e.target.value })} />
                    </Field>
                  </div>
                  <Btn aria-label={`Subir a pergunta ${i + 1}`} disabled={i === 0} onClick={() => change({ ...draft, questions: move(draft.questions, i, -1) })}>
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </Btn>
                  <Btn
                    aria-label={`Descer a pergunta ${i + 1}`}
                    disabled={i === draft.questions.length - 1}
                    onClick={() => change({ ...draft, questions: move(draft.questions, i, 1) })}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </Btn>
                  <Btn tone="danger" aria-label={`Excluir a pergunta ${i + 1}`} onClick={() => change({ ...draft, questions: draft.questions.filter((_, j) => j !== i) })}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Btn>
                </div>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <Field label="Tipo de resposta">
                    <select
                      value={q.type}
                      aria-label={`Tipo da pergunta ${i + 1}`}
                      onChange={(e) => {
                        const type = e.target.value as MassaQuestionType;
                        setQuestion(i, { type, options: type !== 'text' && q.options.length === 0 ? newQuestion().options : q.options });
                      }}
                    >
                      {(Object.keys(TYPE_LABELS) as MassaQuestionType[]).map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <label className="flex min-h-[44px] items-center gap-2 font-semibold">
                    <input type="checkbox" checked={q.required} onChange={(e) => setQuestion(i, { required: e.target.checked })} /> Obrigatória
                  </label>
                  <label className="flex min-h-[44px] items-center gap-2 font-semibold">
                    <input type="checkbox" checked={q.active} onChange={(e) => setQuestion(i, { active: e.target.checked })} /> Ativa
                  </label>
                </div>
                {q.type !== 'text' && (
                  <div className="grid gap-2">
                    <span className="text-sm font-semibold text-ink/85">Alternativas</span>
                    {q.options.map((o, k) => (
                      <div key={o.id} className="flex items-center gap-2">
                        <input
                          className="min-w-0 flex-1"
                          value={o.text}
                          aria-label={`Alternativa ${k + 1} da pergunta ${i + 1}`}
                          onChange={(e) => setQuestion(i, { options: q.options.map((x, m) => (m === k ? { ...x, text: e.target.value } : x)) })}
                        />
                        <Btn aria-label={`Subir a alternativa ${k + 1} da pergunta ${i + 1}`} disabled={k === 0} onClick={() => setQuestion(i, { options: move(q.options, k, -1) })}>
                          <ArrowUp className="h-4 w-4" aria-hidden="true" />
                        </Btn>
                        <Btn
                          aria-label={`Descer a alternativa ${k + 1} da pergunta ${i + 1}`}
                          disabled={k === q.options.length - 1}
                          onClick={() => setQuestion(i, { options: move(q.options, k, 1) })}
                        >
                          <ArrowDown className="h-4 w-4" aria-hidden="true" />
                        </Btn>
                        <Btn
                          tone="danger"
                          aria-label={`Excluir a alternativa ${k + 1} da pergunta ${i + 1}`}
                          onClick={() => setQuestion(i, { options: q.options.filter((_, m) => m !== k) })}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Btn>
                      </div>
                    ))}
                    <div>
                      <Btn aria-label={`Adicionar alternativa à pergunta ${i + 1}`} onClick={() => setQuestion(i, { options: [...q.options, { id: newId('o-'), text: '' }] })}>
                        <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar alternativa
                      </Btn>
                    </div>
                  </div>
                )}
              </fieldset>
            ))}
            {draft.questions.length === 0 && <p className="text-ink/60">Esta pesquisa ainda não tem perguntas.</p>}

            <div className="flex flex-wrap items-center gap-3">
              <Btn onClick={() => change({ ...draft, questions: [...draft.questions, newQuestion()] })}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar pergunta
              </Btn>
              <Btn tone="primary" onClick={() => void save()} disabled={!dirty}>
                Salvar pesquisa
              </Btn>
              {dirty && <span className="text-sm font-semibold text-gold">Alterações não salvas</span>}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
