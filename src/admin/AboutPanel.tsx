import { Card } from './ui';
import { useMassa } from '../core/store';
import { FacultyCreditLogo } from '../totem/MassaBrand';

/** Créditos institucionais: tela de login do painel e seção "Sobre o sistema". */
export function Credits({ compact = false }: { compact?: boolean }) {
  const { config } = useMassa();
  return (
    <div data-testid="credits" className={`flex flex-col items-center gap-3 text-center ${compact ? 'max-w-sm' : ''}`}>
      <FacultyCreditLogo config={config} imgClass="h-10 w-auto max-w-[10rem] object-contain" linkClass="min-h-[48px] px-2" />
      <p className={`font-semibold text-ink/80 ${compact ? 'text-xs' : 'text-sm'}`}>{config.credit}</p>
    </div>
  );
}

export function AboutPanel() {
  const { config } = useMassa();
  return (
    <div className="flex flex-col gap-4">
      <Card title="Sobre o sistema">
        <div className="grid gap-4 text-sm leading-relaxed">
          <p>
            <strong>Pesquisa Massa FM</strong> é o aplicativo de totem usado pela {config.stationName} em eventos. Funciona sem internet: eventos,
            pesquisas, configurações e participantes ficam guardados apenas neste aparelho.
          </p>
          <Credits />
          <ul className="list-disc space-y-1 pl-5 text-ink/80">
            <li>
              O totem abre direto na pesquisa. Este painel fica em <code>#/admin</code> ou com 5 toques rápidos no canto superior esquerdo da tela.
            </li>
            <li>
              O único dado pessoal coletado é o telefone, com consentimento registrado. Ele fica separado por evento e pode ser exportado, anonimizado
              ou excluído em Participantes e resultados.
            </li>
            <li>
              Com o Envio online ligado, cada participação também vai para uma planilha do Google Sheets (com fila para quando não houver internet).
              Sem ele, cada aparelho guarda só os próprios participantes: exporte o CSV de cada um ao fim do evento.
            </li>
            <li>O PIN protege o painel contra o público do totem. Troque o PIN padrão em Segurança e mantenha o aparelho sob guarda da equipe.</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
