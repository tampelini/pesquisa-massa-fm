import { useEffect, useState } from 'react';
import { CloudUpload, Copy, PlugZap, RefreshCw } from 'lucide-react';
import { Btn, Card, Field, Notice } from './ui';
import { formatDateTime, saveMassaConfig, useMassa } from '../core/store';
import { countPending, getSyncStatus, syncPending, testSync, type SyncStatus } from '../core/sync';
import { sheetScript } from '../core/sheetScript';
import { isWebUrl } from '../core/validation';
import type { MassaSyncConfig } from '../core/types';

/** Senha de envio aleatória (só letras e números, fácil de copiar). */
export function randomToken(length = 24): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export function validateSync(s: MassaSyncConfig): string[] {
  const errors: string[] = [];
  if (!s.enabled) return errors;
  if (!isWebUrl(s.url)) errors.push('Informe o endereço do App da Web da planilha (começa com https://).');
  else if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(s.url.trim())) errors.push('O endereço deve ser o do App da Web do Apps Script: https://script.google.com/macros/s/…/exec.');
  if (s.token.trim().length < 8) errors.push('A senha de envio precisa de pelo menos 8 caracteres.');
  return errors;
}

export function SyncPanel() {
  const { config } = useMassa();
  const [s, setS] = useState<MassaSyncConfig>(config.sync);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => setS(config.sync), [config.sync]);

  const refresh = async () => {
    setStatus(await getSyncStatus());
    setPending(await countPending().catch(() => null));
  };
  useEffect(() => {
    void refresh();
  }, []);

  const set = (patch: Partial<MassaSyncConfig>) => {
    setMessage(null);
    setS((prev) => ({ ...prev, ...patch }));
  };

  async function save() {
    const clean: MassaSyncConfig = { ...s, url: s.url.trim(), token: s.token.trim(), device: s.device.trim() };
    const errs = validateSync(clean);
    if (errs.length) return setMessage({ tone: 'error', text: errs.join(' ') });
    await saveMassaConfig({ ...config, sync: clean });
    setMessage({ tone: 'ok', text: clean.enabled ? 'Envio online salvo e ligado.' : 'Envio online salvo (desligado).' });
  }

  async function test() {
    setBusy(true);
    const error = await testSync({ ...s, enabled: true });
    setBusy(false);
    setMessage(error ? { tone: 'error', text: `Não conectou: ${error}` } : { tone: 'ok', text: 'Conexão com a planilha funcionando (endereço e senha conferem).' });
  }

  async function sendNow() {
    setBusy(true);
    const result = await syncPending(config.sync);
    setBusy(false);
    await refresh();
    if (result.error) setMessage({ tone: 'error', text: `Envio interrompido: ${result.error} ${result.pending} na fila.` });
    else if (result.sent === 0 && result.pending === 0) setMessage({ tone: 'ok', text: 'Nada a enviar: a planilha já tem todas as participações deste aparelho.' });
    else setMessage({ tone: result.pending ? 'warn' : 'ok', text: `${result.sent} participação(ões) enviada(s). ${result.pending} na fila.` });
  }

  const script = sheetScript(s.token.trim());
  const savedOn = config.sync.enabled;

  return (
    <div className="flex flex-col gap-4">
      <Notice tone="info">
        Cada participação é gravada primeiro neste aparelho e depois enviada para uma planilha do Google Sheets. Sem internet, fica na fila e sobe
        sozinha quando a conexão voltar. O endereço e a senha ficam só neste aparelho. Os telefones vão para a conta Google dona da planilha:
        use uma conta da rádio e compartilhe só com quem precisa.
      </Notice>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <Card
        title="Situação"
        actions={
          <div className="flex flex-wrap gap-2">
            <Btn onClick={() => void refresh()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Atualizar
            </Btn>
            <Btn tone="primary" onClick={() => void sendNow()} disabled={busy || !savedOn}>
              <CloudUpload className="h-4 w-4" aria-hidden="true" /> Enviar agora
            </Btn>
          </div>
        }
      >
        <dl className="grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-ink/70">Envio online</dt>
            <dd className="font-display text-lg font-bold">{savedOn ? 'Ligado' : 'Desligado'}</dd>
          </div>
          <div>
            <dt className="text-ink/70">Na fila (não enviadas)</dt>
            <dd className="font-display text-lg font-bold" data-testid="sync-pending">
              {pending ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-ink/70">Último envio com sucesso</dt>
            <dd className="font-semibold">{status?.lastSuccess ? formatDateTime(status.lastSuccess) : 'ainda não houve'}</dd>
          </div>
          <div>
            <dt className="text-ink/70">Último problema</dt>
            <dd className="font-semibold">{status?.lastError ?? 'nenhum'}</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-ink/60">
          Excluir ou anonimizar um cadastro neste painel não altera a linha que já foi para a planilha: apague-a lá também.
        </p>
      </Card>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Card title="Configuração">
          <div className="grid gap-4">
            <label className="flex items-center gap-2 font-semibold">
              <input type="checkbox" checked={s.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Enviar as participações para a planilha
            </label>
            <Field label="Endereço do App da Web da planilha" hint="Gerado ao publicar o script (passo 3 abaixo). Termina em /exec.">
              <input type="url" placeholder="https://script.google.com/macros/s/…/exec" value={s.url} onChange={(e) => set({ url: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Senha de envio" hint="A mesma que está no script da planilha (TOKEN). Impede que outros gravem na planilha.">
                <div className="flex gap-2">
                  <input className="min-w-0 flex-1 font-mono" value={s.token} autoComplete="off" spellCheck={false} onChange={(e) => set({ token: e.target.value })} />
                  <Btn onClick={() => set({ token: randomToken() })}>Gerar</Btn>
                </div>
              </Field>
              <Field label="Nome deste totem" hint="Vira a coluna 'totem' da planilha. Útil com mais de um aparelho.">
                <input value={s.device} placeholder="Totem 1" onChange={(e) => set({ device: e.target.value })} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-3">
              <Btn tone="primary" type="submit">
                Salvar envio online
              </Btn>
              <Btn onClick={() => void test()} disabled={busy}>
                <PlugZap className="h-4 w-4" aria-hidden="true" /> Testar conexão
              </Btn>
            </div>
          </div>
        </Card>
      </form>

      <Card title="Como preparar a planilha (uma vez)">
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>No Google Drive da conta que vai guardar os dados, crie uma planilha em branco.</li>
          <li>
            Na planilha, abra <strong>Extensões → Apps Script</strong>, apague o que estiver no editor e cole o script abaixo. Ele já vem com a senha
            de envio deste painel.
          </li>
          <li>
            Clique em <strong>Implantar → Nova implantação</strong>, tipo <strong>App da Web</strong>, executar como <strong>Eu</strong>, acesso{' '}
            <strong>Qualquer pessoa</strong>. Autorize quando o Google pedir e copie o endereço terminado em <code>/exec</code>.
          </li>
          <li>Cole o endereço acima, marque a caixa, salve e toque em Testar conexão.</li>
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Btn
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(script);
                setCopied(true);
              } catch {
                setCopied(false);
                setMessage({ tone: 'warn', text: 'Não foi possível copiar sozinho: selecione o texto do script e copie.' });
              }
            }}
          >
            <Copy className="h-4 w-4" aria-hidden="true" /> Copiar script
          </Btn>
          {copied && <span className="text-sm font-semibold text-success">Script copiado.</span>}
        </div>
        <textarea readOnly rows={10} className="mt-3 w-full font-mono text-xs" aria-label="Script da planilha" value={script} />
      </Card>
    </div>
  );
}
