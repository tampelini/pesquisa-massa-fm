import { useEffect, useMemo, useState } from 'react';
import { Download, EyeOff, RefreshCw, Trash2 } from 'lucide-react';
import { Btn, Card, Field, Notice } from './ui';
import { downloadText, timestampForFile } from '../services/files';
import {
  anonymizeParticipant, filterParticipants, formatDateTime, listParticipants, participantsToCsv, removeParticipant, totalsByQuestion, totalsToCsv, useMassa,
  type ParticipantFilter,
} from '../core/store';
import { maskPhone } from '../core/validation';
import type { MassaParticipant } from '../core/types';

const PAGE = 100;

export function ParticipantsPanel() {
  const { events, surveys } = useMassa();
  const [all, setAll] = useState<MassaParticipant[] | null>(null);
  const [filter, setFilter] = useState<ParticipantFilter>({});
  const [shown, setShown] = useState(PAGE);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const load = () => listParticipants().then(setAll).catch(() => setAll([]));
  useEffect(() => {
    void load();
  }, []);

  const set = (patch: Partial<ParticipantFilter>) => {
    setShown(PAGE);
    setFilter((f) => ({ ...f, ...patch }));
  };

  // Eventos e pesquisas vêm do cadastro e também dos registros (podem ter sido excluídos depois).
  const eventOptions = useMemo(() => {
    const m = new Map(events.map((e) => [e.id, e.name]));
    for (const p of all ?? []) if (!m.has(p.eventId)) m.set(p.eventId, `${p.eventName} (excluído)`);
    return [...m.entries()];
  }, [events, all]);
  const surveyOptions = useMemo(() => {
    const m = new Map(surveys.map((s) => [s.id, s.name]));
    for (const p of all ?? []) if (!m.has(p.surveyId)) m.set(p.surveyId, `${p.surveyName} (excluída)`);
    return [...m.entries()];
  }, [surveys, all]);

  // Perguntas e respostas disponíveis para filtrar, dentro do evento/pesquisa/período escolhidos.
  const base = useMemo(() => filterParticipants(all ?? [], { ...filter, questionId: undefined, answer: undefined }), [all, filter]);
  const baseTotals = useMemo(() => totalsByQuestion(base), [base]);
  const list = useMemo(() => filterParticipants(all ?? [], filter).slice().reverse(), [all, filter]);
  const totals = useMemo(() => totalsByQuestion(list), [list]);
  const answerOptions = baseTotals.find((t) => t.questionId === filter.questionId)?.options ?? [];
  const optIn = list.filter((p) => p.marketingOptIn).length;

  if (!all) return <p>Carregando participantes…</p>;
  const stamp = timestampForFile();

  async function anonymize(p: MassaParticipant) {
    if (!window.confirm(`Anonimizar o cadastro do telefone ${maskPhone(p.phone)}? O telefone será apagado e as respostas ficam apenas nas estatísticas. Não é possível desfazer.`)) return;
    try {
      await anonymizeParticipant(p);
      setMessage({ tone: 'ok', text: 'Cadastro anonimizado.' });
      void load();
    } catch {
      setMessage({ tone: 'error', text: 'Não foi possível anonimizar o cadastro.' });
    }
  }

  async function remove(p: MassaParticipant) {
    if (!window.confirm(`Excluir definitivamente o cadastro ${p.phone ? `do telefone ${maskPhone(p.phone)}` : 'anonimizado'} e suas respostas? Não é possível desfazer.`)) return;
    try {
      await removeParticipant(p.id);
      setMessage({ tone: 'ok', text: 'Cadastro excluído.' });
      void load();
    } catch {
      setMessage({ tone: 'error', text: 'Não foi possível excluir o cadastro.' });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Notice tone="info">
        Dados pessoais coletados com consentimento e guardados apenas neste aparelho. Exporte o CSV ao fim de cada evento e trate o arquivo como
        confidencial. Desinstalar o aplicativo ou limpar os dados do navegador apaga os participantes.
      </Notice>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <Card
        title="Filtros"
        actions={
          <div className="flex flex-wrap gap-2">
            <Btn onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Atualizar
            </Btn>
            <Btn onClick={() => { setShown(PAGE); setFilter({}); }}>Limpar filtros</Btn>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Evento">
            <select value={filter.eventId ?? ''} onChange={(e) => set({ eventId: e.target.value || undefined })}>
              <option value="">Todos os eventos</option>
              {eventOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pesquisa">
            <select value={filter.surveyId ?? ''} onChange={(e) => set({ surveyId: e.target.value || undefined })}>
              <option value="">Todas as pesquisas</option>
              {surveyOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="De (data)">
            <input type="date" value={filter.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} />
          </Field>
          <Field label="Até (data)">
            <input type="date" value={filter.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} />
          </Field>
          <Field label="Pergunta">
            <select value={filter.questionId ?? ''} onChange={(e) => set({ questionId: e.target.value || undefined, answer: undefined })}>
              <option value="">Qualquer pergunta</option>
              {baseTotals.map((t) => (
                <option key={t.questionId} value={t.questionId}>
                  {t.prompt}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Resposta">
            <select value={filter.answer ?? ''} disabled={!answerOptions.length} onChange={(e) => set({ answer: e.target.value || undefined })}>
              <option value="">Qualquer resposta</option>
              {answerOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.value}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Buscar por telefone">
              <input type="search" inputMode="numeric" placeholder="Telefone ou parte dele" value={filter.search ?? ''} onChange={(e) => set({ search: e.target.value })} />
            </Field>
          </div>
        </div>
      </Card>

      <Card
        title={`Totais e percentuais (${list.length} ${list.length === 1 ? 'participante' : 'participantes'})`}
        actions={
          <Btn onClick={() => downloadText(`massa-totais-${stamp}.csv`, totalsToCsv(totals, list.length), 'text/csv')} disabled={!list.length}>
            <Download className="h-4 w-4" aria-hidden="true" /> CSV de totais
          </Btn>
        }
      >
        {list.length === 0 ? (
          <p className="text-ink/60">Nenhum participante com esses filtros.</p>
        ) : (
          <div className="grid gap-5">
            <p className="text-sm">
              Aceitaram receber comunicações: <strong>{optIn}</strong> de {list.length} ({Math.round((optIn / list.length) * 100)}%).
            </p>
            {totals.map((t) => (
              <section key={t.questionId}>
                <h3 className="font-semibold">{t.prompt}</h3>
                <p className="text-xs text-ink/60">
                  {t.respondents} {t.respondents === 1 ? 'resposta' : 'respostas'}
                  {t.type === 'multiple' ? ' · múltipla escolha (os percentuais podem somar mais de 100%)' : t.type === 'text' ? ' · texto livre (veja na lista e no CSV)' : ''}
                </p>
                <ul className="mt-2 grid gap-2">
                  {t.options.map((o) => (
                    <li key={o.value}>
                      <div className="flex justify-between gap-4 text-sm">
                        <span>{o.value}</span>
                        <span className="whitespace-nowrap">
                          {o.count} · <strong>{o.percent.toFixed(1).replace('.', ',')}%</strong>
                        </span>
                      </div>
                      <div className="mt-1 h-3 overflow-hidden rounded-full bg-primary/10" role="img" aria-label={`${o.value}: ${Math.round(o.percent)}%`}>
                        <div className="h-full rounded-full bg-primary" style={{ width: `${o.percent}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Participantes"
        actions={
          <Btn tone="primary" onClick={() => downloadText(`massa-participantes-${stamp}.csv`, participantsToCsv(list.slice().reverse()), 'text/csv')} disabled={!list.length}>
            <Download className="h-4 w-4" aria-hidden="true" /> Exportar CSV (Excel)
          </Btn>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-ink/70">
              <tr>
                <th className="p-2">Data e hora</th>
                <th className="p-2">Telefone</th>
                <th className="p-2">Evento / pesquisa</th>
                <th className="p-2">Respostas</th>
                <th className="p-2">Consentimento</th>
                <th className="p-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, shown).map((p) => (
                <tr key={p.id} className="border-t border-primary/15 align-top">
                  <td className="whitespace-nowrap p-2">{formatDateTime(p.createdAt)}</td>
                  <td className="whitespace-nowrap p-2 font-semibold">
                    {p.phone ? maskPhone(p.phone) : <span className="font-normal italic text-ink/60">Anonimizado</span>}
                  </td>
                  <td className="p-2">
                    {p.eventName}
                    <span className="block text-xs text-ink/60">{p.surveyName}</span>
                  </td>
                  <td className="p-2">
                    <ul className="grid gap-1">
                      {p.answers.map((a) => (
                        <li key={a.questionId}>
                          <span className="text-xs text-ink/60">{a.prompt}</span>
                          <span className="block">{a.values.join(', ')}</span>
                        </li>
                      ))}
                      {p.answers.length === 0 && <li className="text-ink/60">Sem respostas</li>}
                    </ul>
                  </td>
                  <td className="p-2">
                    Aceito ({p.consentVersion})
                    <span className="block text-xs text-ink/60">Comunicações: {p.marketingOptIn ? 'sim' : 'não'}</span>
                    <span className="block text-xs text-ink/60">Planilha: {p.syncedAt ? 'enviado' : 'na fila'}</span>
                  </td>
                  <td className="p-2">
                    <div className="flex gap-2">
                      {!p.anonymizedAt && (
                        <Btn aria-label={`Anonimizar ${maskPhone(p.phone)}`} onClick={() => void anonymize(p)}>
                          <EyeOff className="h-4 w-4" aria-hidden="true" /> Anonimizar
                        </Btn>
                      )}
                      <Btn tone="danger" aria-label={`Excluir ${p.phone ? maskPhone(p.phone) : 'cadastro anonimizado'}`} onClick={() => void remove(p)}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-ink/60">
                    Nenhum participante encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {list.length > shown && (
          <div className="mt-3 text-center">
            <Btn onClick={() => setShown(shown + PAGE)}>
              Mostrar mais ({list.length - shown} restantes)
            </Btn>
          </div>
        )}
      </Card>
    </div>
  );
}
