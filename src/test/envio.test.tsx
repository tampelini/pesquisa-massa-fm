import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../App';
import * as db from '../services/db';
import { __resetDBForTests } from '../services/db';
import { DEFAULT_MASSA_CONFIG, DEFAULT_MASSA_EVENTS, DEFAULT_MASSA_SURVEYS } from '../core/defaults';
import { __resetMassaForTests, anonymizeParticipant, listParticipants, loadMassa, participantsToCsv, resolveActive, saveMassaConfig, submitParticipation } from '../core/store';
import { countPending, getSyncStatus, isSyncConfigured, syncPending, testSync, toSheetRow } from '../core/sync';
import { sheetScript } from '../core/sheetScript';
import { randomToken, validateSync } from '../admin/SyncPanel';
import type { MassaDraftAnswers, MassaSyncConfig } from '../core/types';

const URL_OK = 'https://script.google.com/macros/s/AKfycbxEXEMPLO-123_abc/exec';
const SYNC: MassaSyncConfig = { enabled: true, url: URL_OK, token: 'senha-de-teste-123', device: 'Totem 1' };
const ANSWERS: MassaDraftAnswers = { 'q-periodo': ['q-periodo-o1'], 'q-conteudo': ['q-conteudo-o4'], 'q-estilo': ['q-estilo-o1'] };

const active = () => resolveActive({ config: DEFAULT_MASSA_CONFIG, events: DEFAULT_MASSA_EVENTS, surveys: DEFAULT_MASSA_SURVEYS })!;
const add = (phone: string) => submitParticipation({ active: active(), phone, answers: ANSWERS, consent: DEFAULT_MASSA_CONFIG.consent, marketingOptIn: true });

/** Planilha de mentira: guarda as linhas recebidas e confirma os ids, como o script real. */
function fakeSheet(options: { token?: string; fail?: () => boolean } = {}) {
  const rows: Record<string, unknown>[] = [];
  const calls: { totem: string; rows: Record<string, unknown>[] }[] = [];
  const mock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    if (options.fail?.()) throw new TypeError('Failed to fetch');
    const body = JSON.parse(String(init?.body));
    if (body.token !== (options.token ?? SYNC.token)) return new Response(JSON.stringify({ ok: false, erro: 'senha' }));
    calls.push(body);
    for (const r of body.rows) if (!rows.some((x) => x.id === r.id)) rows.push(r);
    return new Response(JSON.stringify({ ok: true, salvos: body.rows.map((r: { id: string }) => r.id) }));
  });
  vi.stubGlobal('fetch', mock);
  return { rows, calls, mock };
}

beforeEach(async () => {
  await __resetDBForTests();
  __resetMassaForTests();
  window.location.hash = '';
  await loadMassa();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('envio online para a planilha', () => {
  it('vem desligado e sem endereço: nada sai do aparelho', async () => {
    const sheet = fakeSheet();
    expect(DEFAULT_MASSA_CONFIG.sync).toEqual({ enabled: false, url: '', token: '', device: '' });
    expect(isSyncConfigured(DEFAULT_MASSA_CONFIG.sync)).toBe(false);
    await add('45999110001');
    expect(await syncPending(DEFAULT_MASSA_CONFIG.sync)).toEqual({ sent: 0, pending: 1 });
    expect(sheet.mock).not.toHaveBeenCalled();
    expect(isSyncConfigured({ ...SYNC, token: ' ' })).toBe(false);
    expect(isSyncConfigured({ ...SYNC, url: 'planilha' })).toBe(false);
  });

  it('envia o que está na fila, marca como enviado e não reenvia', async () => {
    const sheet = fakeSheet();
    await add('45999110001');
    await add('45999110002');
    expect(await countPending()).toBe(2);

    expect(await syncPending(SYNC)).toEqual({ sent: 2, pending: 0 });
    expect(sheet.mock).toHaveBeenCalledTimes(1);
    const [url, init] = sheet.mock.mock.calls[0];
    expect(url).toBe(URL_OK);
    // "text/plain": requisição simples, sem a checagem prévia que o Apps Script não responde.
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
    expect(sheet.calls[0].totem).toBe('Totem 1');
    expect(sheet.rows).toHaveLength(2);
    expect(sheet.rows[0]).toMatchObject({
      evento: 'Evento Massa FM',
      pesquisa: 'Pesquisa Massa FM',
      telefone: '(45) 99911-0001',
      aceita_comunicacoes: 'sim',
      versao_consentimento: 'v1',
      respostas: [
        { pergunta: 'Em qual período do dia você mais ouve rádio?', resposta: 'Manhã' },
        { pergunta: 'Qual tipo de conteúdo você mais gosta de ouvir na rádio?', resposta: 'Promoções' },
        { pergunta: 'Qual estilo musical você mais gosta?', resposta: 'Sertanejo' },
      ],
    });
    // Só os campos que o painel já mostra: nada além do telefone identifica a pessoa.
    expect(Object.keys(sheet.rows[0]).sort()).toEqual(['aceita_comunicacoes', 'data_hora', 'evento', 'id', 'pesquisa', 'respostas', 'telefone', 'versao_consentimento']);

    const saved = await listParticipants();
    expect(saved.every((p) => typeof p.syncedAt === 'number')).toBe(true);
    expect(await countPending()).toBe(0);
    const status = await getSyncStatus();
    expect(status.lastError).toBeNull();
    expect(status.lastSuccess).toBeTypeOf('number');
    expect(participantsToCsv(saved).split('\r\n')[1]).toContain(';sim;v1;nao;sim;');

    // Nova participação: só ela sobe.
    await add('45999110003');
    expect(await syncPending(SYNC)).toEqual({ sent: 1, pending: 0 });
    expect(sheet.calls[1].rows).toHaveLength(1);
    expect(sheet.rows).toHaveLength(3);
  });

  it('sem internet a participação fica na fila e sobe quando a conexão volta', async () => {
    let offline = true;
    const sheet = fakeSheet({ fail: () => offline });
    await add('45999110001');
    const first = await syncPending(SYNC);
    expect(first).toEqual({ sent: 0, pending: 1, error: 'Sem conexão com a planilha (totem sem internet ou endereço incorreto).' });
    expect((await listParticipants())[0].syncedAt).toBeUndefined();
    expect((await getSyncStatus()).lastError).toMatch(/Sem conexão/);
    expect(sheet.rows).toHaveLength(0);

    offline = false;
    expect(await syncPending(SYNC)).toEqual({ sent: 1, pending: 0 });
    expect(sheet.rows).toHaveLength(1);
    expect((await getSyncStatus()).lastError).toBeNull();
  });

  it('senha errada: nada é marcado como enviado e o motivo fica claro', async () => {
    fakeSheet({ token: 'outra-senha' });
    await add('45999110001');
    const result = await syncPending(SYNC);
    expect(result).toMatchObject({ sent: 0, pending: 1, error: 'Senha de envio diferente da que está no script da planilha.' });
    expect(await countPending()).toBe(1);
    expect(await testSync(SYNC)).toBe('Senha de envio diferente da que está no script da planilha.');
  });

  it('testar conexão confere endereço e senha sem enviar participações', async () => {
    const sheet = fakeSheet();
    await add('45999110001');
    expect(await testSync(SYNC)).toBeNull();
    expect(sheet.calls[0].rows).toEqual([]);
    expect(await countPending()).toBe(1);
    expect(await testSync({ ...SYNC, url: '' })).toMatch(/endereço/);
    expect(await testSync({ ...SYNC, token: '' })).toMatch(/senha/);
  });

  it('resposta que não é do script (endereço errado) vira erro e mantém a fila', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Entrar no Google</html>')));
    await add('45999110001');
    expect((await syncPending(SYNC)).error).toMatch(/Resposta inesperada/);
    expect(await countPending()).toBe(1);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('erro', { status: 500 })));
    expect((await syncPending(SYNC)).error).toBe('A planilha respondeu com erro 500.');
  });

  it('cadastro anonimizado antes do envio sobe sem o telefone', async () => {
    const sheet = fakeSheet();
    await anonymizeParticipant(await add('45999110001'));
    await syncPending(SYNC);
    expect(sheet.rows[0].telefone).toBe('(anonimizado)');
    expect(JSON.stringify(sheet.rows)).not.toContain('99911');
    expect(toSheetRow((await listParticipants())[0]).telefone).toBe('(anonimizado)');
  });

  it('nenhum dado pessoal vai para o console durante o envio, nem em caso de erro', async () => {
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'info'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'debug')];
    fakeSheet({ fail: () => true });
    await add('45999110001');
    await syncPending(SYNC);
    expect(logs.flatMap((l) => l.mock.calls).map((c) => JSON.stringify(c)).join(' ')).not.toContain('99911');
  });
});

describe('envio online: totem e painel', () => {
  it('ao finalizar no totem, a participação sobe para a planilha sem segurar a pessoa', async () => {
    const sheet = fakeSheet();
    await saveMassaConfig({ ...DEFAULT_MASSA_CONFIG, sync: SYNC });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'COMEÇAR' }));
    fireEvent.change(await screen.findByLabelText(/Telefone com DDD/), { target: { value: '45999887766' } });
    fireEvent.click(screen.getByTestId('massa-consent'));
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUAR' }));
    for (let i = 1; i <= 3; i++) {
      await screen.findByText(`Pergunta ${i} de 3`);
      fireEvent.click(screen.getAllByRole('radio')[0]);
      fireEvent.click(screen.getByRole('button', { name: i === 3 ? 'FINALIZAR' : 'CONTINUAR' }));
    }
    expect(await screen.findByText('Obrigado por participar!')).toBeInTheDocument();
    await waitFor(() => expect(sheet.rows).toHaveLength(1));
    expect(sheet.rows[0].telefone).toBe('(45) 99988-7766');
    await waitFor(async () => expect(await countPending()).toBe(0));
  });

  it('com a planilha fora do ar, o totem agradece do mesmo jeito e guarda na fila', async () => {
    fakeSheet({ fail: () => true });
    await saveMassaConfig({ ...DEFAULT_MASSA_CONFIG, sync: SYNC });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'COMEÇAR' }));
    fireEvent.change(await screen.findByLabelText(/Telefone com DDD/), { target: { value: '45999887766' } });
    fireEvent.click(screen.getByTestId('massa-consent'));
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUAR' }));
    for (let i = 1; i <= 3; i++) {
      await screen.findByText(`Pergunta ${i} de 3`);
      fireEvent.click(screen.getAllByRole('radio')[0]);
      fireEvent.click(screen.getByRole('button', { name: i === 3 ? 'FINALIZAR' : 'CONTINUAR' }));
    }
    expect(await screen.findByText('Obrigado por participar!')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await waitFor(async () => expect((await getSyncStatus()).lastError).toMatch(/Sem conexão/));
    expect(await countPending()).toBe(1);
  });

  it('painel: configura, testa, mostra a fila e envia agora', async () => {
    const sheet = fakeSheet();
    await add('45999110001');
    window.location.hash = '#/admin';
    render(<App />);
    await screen.findByText('Área administrativa');
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Envio online' }));
    await waitFor(() => expect(screen.getByTestId('sync-pending')).toHaveTextContent('1'));
    expect(screen.getByText('Desligado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar agora/ })).toBeDisabled();

    // Endereço que não é do Apps Script e senha curta são recusados.
    fireEvent.click(screen.getByLabelText(/Enviar as participações para a planilha/));
    fireEvent.change(screen.getByLabelText(/^Endereço do App da Web/), { target: { value: 'https://exemplo.com/planilha' } });
    fireEvent.change(screen.getByLabelText(/^Senha de envio/), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar envio online' }));
    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('O endereço deve ser o do App da Web do Apps Script');
    expect(error).toHaveTextContent('pelo menos 8 caracteres');

    fireEvent.change(screen.getByLabelText(/^Endereço do App da Web/), { target: { value: `  ${URL_OK} ` } });
    fireEvent.change(screen.getByLabelText(/^Senha de envio/), { target: { value: SYNC.token } });
    fireEvent.change(screen.getByLabelText(/^Nome deste totem/), { target: { value: 'Totem 1' } });
    // O script mostrado para copiar já traz a senha do painel.
    expect((screen.getByLabelText('Script da planilha') as HTMLTextAreaElement).value).toContain('var TOKEN = "senha-de-teste-123";');
    fireEvent.click(screen.getByRole('button', { name: /Testar conexão/ }));
    expect(await screen.findByText(/Conexão com a planilha funcionando/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar envio online' }));
    expect(await screen.findByText('Envio online salvo e ligado.')).toBeInTheDocument();
    expect((await db.getKV<typeof DEFAULT_MASSA_CONFIG>('massaConfig'))!.sync).toEqual(SYNC);

    fireEvent.click(screen.getByRole('button', { name: /Enviar agora/ }));
    expect(await screen.findByText('1 participação(ões) enviada(s). 0 na fila.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('sync-pending')).toHaveTextContent('0'));
    expect(sheet.rows).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Enviar agora/ }));
    expect(await screen.findByText(/Nada a enviar/)).toBeInTheDocument();
  });

  it('validação e utilitários do painel', () => {
    expect(validateSync({ ...SYNC, enabled: false, url: '', token: '' })).toEqual([]);
    expect(validateSync(SYNC)).toEqual([]);
    expect(validateSync({ ...SYNC, url: 'https://script.google.com/macros/s/abc/dev' })[0]).toMatch(/exec/);
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z2-9]{24}$/);
    expect(randomToken()).not.toBe(token);
    const script = sheetScript('minha"senha');
    expect(script).toContain('var TOKEN = "minha\\"senha";');
    expect(script).toContain("if (dados.token !== TOKEN) return resposta({ ok: false, erro: 'senha' });");
    expect(script).toContain("destino.setNumberFormat('@')");
    expect(sheetScript('')).toContain('TROQUE-ESTA-SENHA');
  });
});
