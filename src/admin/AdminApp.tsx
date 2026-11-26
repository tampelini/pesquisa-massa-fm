import { useEffect, useState } from 'react';
import { CalendarDays, CloudUpload, Info, KeyRound, ListChecks, LogOut, MonitorSmartphone, Users } from 'lucide-react';
import { useIdle } from '../hooks/useIdle';
import { resolveActive, useMassa } from '../core/store';
import { AdminGate } from './AdminGate';
import { EventsPanel } from './EventsPanel';
import { SurveysPanel } from './SurveysPanel';
import { TotemPanel } from './TotemPanel';
import { ParticipantsPanel } from './ParticipantsPanel';
import { SyncPanel } from './SyncPanel';
import { SecurityTab } from './SecurityTab';
import { AboutPanel } from './AboutPanel';
import { Notice } from './ui';

const TABS = [
  { id: 'events', label: 'Eventos', Icon: CalendarDays },
  { id: 'surveys', label: 'Pesquisas e perguntas', Icon: ListChecks },
  { id: 'totem', label: 'Totem, textos e consentimento', Icon: MonitorSmartphone },
  { id: 'participants', label: 'Participantes e resultados', Icon: Users },
  { id: 'sync', label: 'Envio online', Icon: CloudUpload },
  { id: 'security', label: 'Segurança', Icon: KeyRound },
  { id: 'about', label: 'Sobre o sistema', Icon: Info },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function exitAdmin() {
  window.location.hash = '';
}

export default function AdminApp() {
  const massa = useMassa();
  const [unlocked, setUnlocked] = useState(false);
  const [tab, setTab] = useState<TabId>('events');
  const active = resolveActive(massa);

  useEffect(() => {
    document.title = 'Painel — Pesquisa Massa FM';
  }, []);

  // Sessão administrativa expira após 5 minutos sem uso: o totem nunca fica
  // com o painel (e os telefones dos participantes) aberto para o público.
  useIdle(5 * 60 * 1000, exitAdmin, true);

  if (!unlocked) return <AdminGate onUnlock={() => setUnlocked(true)} onCancel={exitAdmin} />;

  return (
    <div className="admin-root bg-bg text-ink">
      <header className="sticky top-0 z-20 border-b border-primary/20 bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <h1 className="mr-auto font-display text-xl font-bold">Painel — Pesquisa Massa FM</h1>
          <button type="button" onClick={exitAdmin} className="flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-bg">
            <LogOut className="h-5 w-5" aria-hidden="true" /> Sair e voltar ao totem
          </button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2" aria-label="Seções">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={`flex min-h-[48px] items-center gap-2 whitespace-nowrap border-b-2 px-4 font-semibold ${
                tab === id ? 'border-primary text-primary' : 'border-transparent text-ink/70'
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" /> {label}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
        <Notice tone={active ? 'info' : 'warn'}>
          {active ? (
            <>
              No totem agora: evento <strong>{active.event.name}</strong>, pesquisa <strong>{active.survey.name}</strong> ({active.questions.length}{' '}
              {active.questions.length === 1 ? 'pergunta ativa' : 'perguntas ativas'}).
            </>
          ) : (
            <>Nenhum evento ativo com pesquisa vinculada está em uso no totem. Em Eventos, toque em "Usar no totem".</>
          )}
        </Notice>
        {tab === 'events' && <EventsPanel />}
        {tab === 'surveys' && <SurveysPanel />}
        {tab === 'totem' && <TotemPanel />}
        {tab === 'participants' && <ParticipantsPanel />}
        {tab === 'sync' && <SyncPanel />}
        {tab === 'security' && <SecurityTab />}
        {tab === 'about' && <AboutPanel />}
      </main>
    </div>
  );
}
