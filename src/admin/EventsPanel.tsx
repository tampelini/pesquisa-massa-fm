import { useEffect, useState } from 'react';
import { MonitorCheck, Pencil, Plus, Trash2 } from 'lucide-react';
import { Btn, Card, Field, Notice } from './ui';
import { newId } from '../services/files';
import { listParticipants, saveMassaConfig, saveMassaEvents, useMassa } from '../core/store';
import type { MassaEvent } from '../core/types';

const blank = (surveyId: string | null): MassaEvent => ({
  id: newId('ev-'),
  name: '',
  description: '',
  location: '',
  startDate: '',
  endDate: '',
  active: true,
  surveyId,
});

export function validateEvent(e: MassaEvent): string[] {
  const errors: string[] = [];
  if (!e.name.trim()) errors.push('Informe o nome do evento.');
  if (e.startDate && e.endDate && e.endDate < e.startDate) errors.push('A data de término não pode ser anterior à de início.');
  return errors;
}

const formatDay = (d: string) => (d ? d.split('-').reverse().join('/') : '');

export function EventsPanel() {
  const { config, events, surveys } = useMassa();
  const [editing, setEditing] = useState<MassaEvent | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    listParticipants()
      .then((all) => {
        const c: Record<string, number> = {};
        for (const p of all) c[p.eventId] = (c[p.eventId] ?? 0) + 1;
        setCounts(c);
      })
      .catch(() => setCounts({}));
  }, [events]);

  const surveyName = (id: string | null) => surveys.find((s) => s.id === id)?.name;

  async function save() {
    if (!editing) return;
    const clean = { ...editing, name: editing.name.trim(), description: editing.description.trim(), location: editing.location.trim() };
    const errs = validateEvent(clean);
    setErrors(errs);
    if (errs.length) return;
    await saveMassaEvents(isNew ? [...events, clean] : events.map((e) => (e.id === clean.id ? clean : e)));
    setEditing(null);
    setMessage({ tone: 'ok', text: `Evento "${clean.name}" salvo.` });
  }

  async function remove(e: MassaEvent) {
    if (counts[e.id]) {
      setMessage({
        tone: 'warn',
        text: `O evento "${e.name}" tem ${counts[e.id]} participante(s) e não pode ser excluído. Exporte e exclua os participantes antes, ou apenas desative o evento.`,
      });
      return;
    }
    if (!window.confirm(`Excluir o evento "${e.name}"?`)) return;
    await saveMassaEvents(events.filter((x) => x.id !== e.id));
    if (config.activeEventId === e.id) await saveMassaConfig({ ...config, activeEventId: null });
    setMessage({ tone: 'ok', text: 'Evento excluído.' });
  }

  async function useOnTotem(e: MassaEvent) {
    if (!e.active) return setMessage({ tone: 'warn', text: 'Ative o evento antes de usá-lo no totem.' });
    if (!surveyName(e.surveyId)) return setMessage({ tone: 'warn', text: 'Vincule uma pesquisa ao evento antes de usá-lo no totem.' });
    await saveMassaConfig({ ...config, activeEventId: e.id });
    setMessage({ tone: 'ok', text: `O totem agora usa o evento "${e.name}" com a pesquisa "${surveyName(e.surveyId)}".` });
  }

  if (editing) {
    const set = <K extends keyof MassaEvent>(k: K, v: MassaEvent[K]) => setEditing({ ...editing, [k]: v });
    return (
      <Card title={isNew ? 'Novo evento' : `Editar evento`}>
        <form
          className="grid gap-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            void save();
          }}
        >
          {errors.length > 0 && <Notice tone="error">{errors.join(' ')}</Notice>}
          <Field label="Nome do evento">
            <input value={editing.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Descrição">
            <textarea rows={2} value={editing.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
          <Field label="Local">
            <input value={editing.location} onChange={(e) => set('location', e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Data de início">
              <input type="date" value={editing.startDate} onChange={(e) => set('startDate', e.target.value)} />
            </Field>
            <Field label="Data de término">
              <input type="date" value={editing.endDate} onChange={(e) => set('endDate', e.target.value)} />
            </Field>
          </div>
          <Field label="Pesquisa vinculada" hint="As perguntas exibidas no totem durante este evento.">
            <select value={editing.surveyId ?? ''} onChange={(e) => set('surveyId', e.target.value || null)}>
              <option value="">Nenhuma</option>
              {surveys.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={editing.active} onChange={(e) => set('active', e.target.checked)} /> Evento ativo
          </label>
          <div className="flex gap-3">
            <Btn tone="primary" type="submit">
              Salvar evento
            </Btn>
            <Btn onClick={() => setEditing(null)}>Cancelar</Btn>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <Card
        title={`Eventos (${events.length})`}
        actions={
          <Btn
            tone="primary"
            onClick={() => {
              setErrors([]);
              setIsNew(true);
              setEditing(blank(surveys[0]?.id ?? null));
            }}
          >
            <Plus className="h-5 w-5" aria-hidden="true" /> Novo evento
          </Btn>
        }
      >
        <ul className="divide-y divide-primary/15">
          {events.map((e) => {
            const onTotem = config.activeEventId === e.id;
            return (
              <li key={e.id} className={`flex flex-wrap items-start gap-3 py-3 ${e.active ? '' : 'opacity-60'}`}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {e.name}
                    {onTotem && <span className="rounded-full bg-success/20 px-2 py-0.5 text-xs font-bold text-success">Em uso no totem</span>}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${e.active ? 'bg-primary/10 text-primary' : 'bg-ink/10 text-ink/70'}`}>
                      {e.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </p>
                  {e.description && <p className="text-sm text-ink/80">{e.description}</p>}
                  <p className="text-sm text-ink/70">
                    {[e.location, e.startDate && `${formatDay(e.startDate)}${e.endDate ? ` a ${formatDay(e.endDate)}` : ''}`].filter(Boolean).join(' · ') ||
                      'Local e datas não informados'}
                  </p>
                  <p className="text-sm text-ink/70">
                    Pesquisa: {surveyName(e.surveyId) ?? <span className="font-semibold text-danger">nenhuma vinculada</span>} · {counts[e.id] ?? 0}{' '}
                    participante(s)
                  </p>
                </div>
                <Btn onClick={() => void useOnTotem(e)} disabled={onTotem} aria-label={`Usar ${e.name} no totem`}>
                  <MonitorCheck className="h-4 w-4" aria-hidden="true" /> Usar no totem
                </Btn>
                <Btn
                  aria-label={`Editar ${e.name}`}
                  onClick={() => {
                    setErrors([]);
                    setIsNew(false);
                    setEditing(structuredClone(e));
                  }}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" /> Editar
                </Btn>
                <Btn tone="danger" aria-label={`Excluir ${e.name}`} onClick={() => void remove(e)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Btn>
              </li>
            );
          })}
          {events.length === 0 && <li className="py-6 text-center text-ink/60">Nenhum evento cadastrado.</li>}
        </ul>
      </Card>
    </div>
  );
}
