import { useEffect, useState } from 'react';
import { RotateCcw, Trash2, Upload } from 'lucide-react';
import { Btn, Card, Field, Notice } from './ui';
import { readFileAsDataUrl } from '../services/files';
import { DEFAULT_MASSA_COLORS, DEFAULT_MASSA_CONFIG, DEFAULT_MASSA_LOGO } from '../core/defaults';
import { saveMassaConfig, useMassa } from '../core/store';
import { isWebUrl } from '../core/validation';
import type { MassaColors, MassaConfig, MassaConsent, MassaCourse } from '../core/types';

const COLOR_LABELS: Record<keyof MassaColors, string> = {
  blue: 'Azul do "98.5" (seleção e detalhes)',
  navy: 'Roxo (botões e títulos)',
  yellow: 'Laranja (fundo das telas)',
  red: 'Vermelho (avisos de erro)',
};

/** Uma linha por curso: "Nome | https://página-do-curso" (o link é opcional). */
export const coursesToText = (courses: MassaCourse[]) => courses.map((c) => (c.url ? `${c.name} | ${c.url}` : c.name)).join('\n');
export function textToCourses(text: string): MassaCourse[] {
  return text
    .split('\n')
    .map((line) => {
      const cut = line.indexOf('|');
      return cut === -1 ? { name: line.trim(), url: '' } : { name: line.slice(0, cut).trim(), url: line.slice(cut + 1).trim() };
    })
    .filter((c) => c.name);
}

const MAX_LOGO_BYTES = 1.5 * 1024 * 1024;

export function validateMassaConfig(c: MassaConfig): string[] {
  const errors: string[] = [];
  if (!c.title.trim()) errors.push('Informe a chamada principal.');
  if (!c.consent.requiredText.trim()) errors.push('O texto do consentimento obrigatório não pode ficar vazio.');
  if (!c.consent.optionalText.trim()) errors.push('O texto do consentimento opcional não pode ficar vazio.');
  if (!c.consent.version.trim()) errors.push('Informe a versão do texto de consentimento.');
  if (!isWebUrl(c.consent.privacyUrl)) errors.push('O link da Política de Privacidade deve começar com http:// ou https://.');
  if (c.consent.regulationUrl.trim() && !isWebUrl(c.consent.regulationUrl)) errors.push('O link do regulamento deve começar com http:// ou https://.');
  if (c.stationUrl.trim() && !isWebUrl(c.stationUrl)) errors.push('O link do logotipo da rádio deve começar com http:// ou https://.');
  if (c.coursesUrl.trim() && !isWebUrl(c.coursesUrl)) errors.push('O link da lista de cursos deve começar com http:// ou https://.');
  const badCourse = c.courses.find((x) => x.url.trim() && !isWebUrl(x.url));
  if (badCourse) errors.push(`O link do curso "${badCourse.name}" deve começar com http:// ou https://.`);
  if (c.creditUrl.trim() && !isWebUrl(c.creditUrl)) errors.push('O link do logotipo da Faculdade deve começar com http:// ou https://.');
  if (c.idleSeconds < 15 || c.idleSeconds > 600) errors.push('Retorno por inatividade: entre 15 e 600 segundos.');
  if (c.thanksSeconds < 2 || c.thanksSeconds > 60) errors.push('Tela de agradecimento: entre 2 e 60 segundos.');
  return errors;
}

function LogoField({ label, hint, value, onChange, builtIn }: { label: string; hint: string; value: string; onChange: (v: string) => void; builtIn?: string }) {
  const [error, setError] = useState('');
  return (
    <div className="grid gap-2 rounded-xl border border-primary/20 p-3">
      <span className="text-sm font-semibold">{label}</span>
      <div className="flex min-h-[5rem] items-center justify-center rounded-lg bg-[#f7a819] p-3">
        {value || builtIn ? (
          <img src={value || builtIn} alt={`Prévia: ${label}`} className="max-h-24 w-auto max-w-full object-contain" />
        ) : (
          <span className="rounded-lg border border-dashed border-[#3d1046] px-3 py-2 text-sm font-bold text-[#3d1046]">Espaço reservado: arquivo ainda não enviado</span>
        )}
      </div>
      <span className="text-xs text-ink/60">
        {builtIn && !value ? 'Em uso: logotipo oficial embutido no aplicativo. ' : ''}
        {hint}
      </span>
      {error && <span className="text-sm font-semibold text-danger">{error}</span>}
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-primary/25 bg-surface px-4 font-semibold">
          <Upload className="h-4 w-4" aria-hidden="true" /> Enviar arquivo
          <input
            type="file"
            accept="image/png,image/svg+xml,image/webp,image/jpeg"
            className="sr-only"
            aria-label={`Enviar ${label}`}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              if (f.size > MAX_LOGO_BYTES) return setError('Arquivo muito grande (máximo de 1,5 MB).');
              setError('');
              onChange(await readFileAsDataUrl(f));
            }}
          />
        </label>
        {value && (
          <Btn tone="danger" onClick={() => onChange('')}>
            <Trash2 className="h-4 w-4" aria-hidden="true" /> {builtIn ? 'Voltar ao embutido' : 'Remover'}
          </Btn>
        )}
      </div>
    </div>
  );
}

export function TotemPanel() {
  const { config } = useMassa();
  const [c, setC] = useState<MassaConfig>(config);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  // A lista de cursos é editada como texto e convertida ao salvar.
  const [coursesText, setCoursesText] = useState(() => coursesToText(config.courses));
  useEffect(() => {
    setC(config);
    setCoursesText(coursesToText(config.courses));
  }, [config]);

  const set = <K extends keyof MassaConfig>(k: K, v: MassaConfig[K]) => {
    setStatus(null);
    setC((prev) => ({ ...prev, [k]: v }));
  };
  const setConsent = (p: Partial<MassaConsent>) => set('consent', { ...c.consent, ...p });
  const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
  const consentChanged = c.consent.requiredText !== config.consent.requiredText || c.consent.optionalText !== config.consent.optionalText;

  async function save() {
    const errs = validateMassaConfig({ ...c, courses: textToCourses(coursesText) });
    if (errs.length) return setStatus({ tone: 'error', text: errs.join(' ') });
    await saveMassaConfig({ ...c, title: c.title.trim(), creditUrl: c.creditUrl.trim(), stationUrl: c.stationUrl.trim(), coursesUrl: c.coursesUrl.trim(), courses: textToCourses(coursesText), consent: { ...c.consent, version: c.consent.version.trim(), privacyUrl: c.consent.privacyUrl.trim(), regulationUrl: c.consent.regulationUrl.trim() } });
    setStatus({ tone: 'ok', text: 'Configurações da Pesquisa Massa FM salvas.' });
  }

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Card title="Totem">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Retorno à tela inicial por inatividade (s)" hint="Limpa o preenchimento abandonado.">
            <input type="number" inputMode="numeric" min={15} max={600} value={c.idleSeconds} onChange={(e) => set('idleSeconds', num(e.target.value))} />
          </Field>
          <Field label="Duração do agradecimento (s)">
            <input type="number" inputMode="numeric" min={2} max={60} value={c.thanksSeconds} onChange={(e) => set('thanksSeconds', num(e.target.value))} />
          </Field>
        </div>
      </Card>

      <Card title="Textos das telas">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome da rádio" hint="Usado como texto alternativo do logotipo.">
            <input value={c.stationName} onChange={(e) => set('stationName', e.target.value)} />
          </Field>
          <Field label="Link ao tocar no logotipo da rádio (canto superior)" hint="Abre em outra aba. Deixe vazio para o logotipo não ser clicável.">
            <input type="url" placeholder="https://" value={c.stationUrl} onChange={(e) => set('stationUrl', e.target.value)} />
          </Field>
          <Field label="Chamada principal">
            <input value={c.title} onChange={(e) => set('title', e.target.value)} />
          </Field>
          <Field label="Texto curto da tela inicial">
            <input value={c.intro} onChange={(e) => set('intro', e.target.value)} />
          </Field>
          <Field label="Título do agradecimento">
            <input value={c.thanksTitle} onChange={(e) => set('thanksTitle', e.target.value)} />
          </Field>
          <Field label="Mensagem do agradecimento">
            <input value={c.thanksText} onChange={(e) => set('thanksText', e.target.value)} />
          </Field>
          <Field label="Crédito do rodapé" hint="O trecho depois do travessão ( — ) aparece em negrito.">
            <input value={c.credit} onChange={(e) => set('credit', e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field
              label="Cursos que passam na faixa do rodapé"
              hint="Um curso por linha, no formato: Nome | link da página do curso (o link é opcional). Os citados no crédito ganham destaque. Deixe vazio para tirar a faixa."
            >
              <textarea
                rows={10}
                className="font-mono text-sm"
                value={coursesText}
                onChange={(e) => {
                  setStatus(null);
                  setCoursesText(e.target.value);
                }}
              />
            </Field>
          </div>
          <Field label="Link ao tocar no título da faixa" hint="Página com todos os cursos. Deixe vazio para o título não ser clicável.">
            <input type="url" placeholder="https://" value={c.coursesUrl} onChange={(e) => set('coursesUrl', e.target.value)} />
          </Field>
          <Field label="Link ao tocar no logotipo da Faculdade (rodapé)" hint="Abre em outra aba. Deixe vazio para o logotipo não ser clicável.">
            <input type="url" placeholder="https://" value={c.creditUrl} onChange={(e) => set('creditUrl', e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card
        title="Consentimento e privacidade"
        actions={
          <Btn onClick={() => set('consent', structuredClone(DEFAULT_MASSA_CONFIG.consent))}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Textos padrão
          </Btn>
        }
      >
        <div className="grid gap-4">
          <Field label="Consentimento obrigatório" hint="Sem esta caixa marcada, o participante não consegue finalizar.">
            <textarea rows={4} value={c.consent.requiredText} onChange={(e) => setConsent({ requiredText: e.target.value })} />
          </Field>
          <Field label="Consentimento opcional (comunicações promocionais)" hint="Caixa separada, sempre desmarcada no início.">
            <textarea rows={2} value={c.consent.optionalText} onChange={(e) => setConsent({ optionalText: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Versão do texto" hint="Gravada em cada participação. Mude sempre que alterar o texto.">
              <input value={c.consent.version} onChange={(e) => setConsent({ version: e.target.value })} />
            </Field>
            <Field label="Nome do link de privacidade">
              <input value={c.consent.privacyLabel} onChange={(e) => setConsent({ privacyLabel: e.target.value })} />
            </Field>
            <Field label="Link da Política de Privacidade">
              <input type="url" placeholder="https://" value={c.consent.privacyUrl} onChange={(e) => setConsent({ privacyUrl: e.target.value })} />
            </Field>
            <Field label="Nome do link do regulamento">
              <input value={c.consent.regulationLabel} onChange={(e) => setConsent({ regulationLabel: e.target.value })} />
            </Field>
            <Field label="Link do regulamento" hint="Deixe vazio para não exibir.">
              <input type="url" placeholder="https://" value={c.consent.regulationUrl} onChange={(e) => setConsent({ regulationUrl: e.target.value })} />
            </Field>
          </div>
          {consentChanged && c.consent.version.trim() === config.consent.version && (
            <Notice tone="warn">Você alterou o texto do consentimento: mude também a versão (ex.: v2), para saber qual texto cada participante aceitou.</Notice>
          )}
        </div>
      </Card>

      <Card title="Logotipo oficial">
        <Notice tone="info">
          O logotipo oficial da Massa FM Toledo 98.5 já vem embutido no aplicativo. Envie outro arquivo oficial só se quiser substituí-lo: a imagem é
          exibida sem distorção.
        </Notice>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <LogoField label="Logotipo Massa FM Toledo 98.5" hint="Envie outro arquivo oficial só se quiser substituir o embutido." value={c.logoMassa} onChange={(v) => set('logoMassa', v)} builtIn={DEFAULT_MASSA_LOGO} />
        </div>
        <p className="mt-3 text-sm text-ink/60">O logotipo da Faculdade Donaduzzi, usado no rodapé, vem embutido no aplicativo.</p>
      </Card>

      <Card
        title="Cores da rádio"
        actions={
          <Btn onClick={() => set('colors', { ...DEFAULT_MASSA_COLORS })}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Cores padrão
          </Btn>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(COLOR_LABELS) as (keyof MassaColors)[]).map((k) => (
            <Field key={k} label={COLOR_LABELS[k]}>
              <div className="flex items-center gap-2">
                <input type="color" value={c.colors[k]} aria-label={COLOR_LABELS[k]} onChange={(e) => set('colors', { ...c.colors, [k]: e.target.value })} />
                <code className="text-sm">{c.colors[k]}</code>
              </div>
            </Field>
          ))}
        </div>
        <p className="mt-3 text-sm text-ink/60">Padrão lido do logotipo oficial da rádio. Ajuste pelos códigos do manual da marca, se houver.</p>
      </Card>

      {status && <Notice tone={status.tone}>{status.text}</Notice>}
      <div>
        <Btn tone="primary" type="submit">
          Salvar configurações da pesquisa
        </Btn>
      </div>
    </form>
  );
}
