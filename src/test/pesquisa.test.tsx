import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../App';
import * as db from '../services/db';
import { __resetDBForTests } from '../services/db';
import { DEFAULT_PIN, isDefaultPin, setPin, verifyPin } from '../services/pin';
import { DEFAULT_MASSA_CONFIG, DEFAULT_MASSA_EVENTS, DEFAULT_MASSA_SURVEYS } from '../core/defaults';
import {
  __resetMassaForTests, anonymizeParticipant, filterParticipants, listParticipants, loadMassa, participantsToCsv, phoneAlreadyInEvent, resolveActive,
  saveMassaConfig, saveMassaEvents, saveMassaSurveys, submitParticipation, totalsByQuestion, totalsToCsv, DuplicatePhoneError,
} from '../core/store';
import { maskPhone, normalizePhone, phoneError } from '../core/validation';
import type { MassaDraftAnswers } from '../core/types';

const PHONE = '45999887766';
const PHONE_MASKED = '(45) 99988-7766';

beforeEach(async () => {
  await __resetDBForTests();
  __resetMassaForTests();
  window.location.hash = '';
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const defaultActive = () => resolveActive({ config: DEFAULT_MASSA_CONFIG, events: DEFAULT_MASSA_EVENTS, surveys: DEFAULT_MASSA_SURVEYS })!;

async function renderTotem() {
  const utils = render(<App />);
  await screen.findByRole('button', { name: 'COMEÇAR' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'COMEÇAR' })).toBeEnabled());
  return utils;
}

/** Digita o telefone, marca o aceite (na mesma tela) e avança. */
async function identify(phone = PHONE, marketing = false) {
  fireEvent.click(screen.getByRole('button', { name: 'COMEÇAR' }));
  fireEvent.change(await screen.findByLabelText(/Telefone com DDD/), { target: { value: phone } });
  fireEvent.click(screen.getByTestId('massa-consent'));
  if (marketing) fireEvent.click(screen.getByTestId('massa-marketing'));
  fireEvent.click(screen.getByRole('button', { name: 'CONTINUAR' }));
}

/** Responde as perguntas de escolha única; na última, o botão é FINALIZAR. */
async function answerQuestions(total: number, pick: string[] = []) {
  for (let i = 1; i <= total; i++) {
    await screen.findByText(`Pergunta ${i} de ${total}`);
    const group = screen.getByRole('radiogroup');
    const option = pick[i - 1] ? within(group).getByRole('radio', { name: pick[i - 1] }) : within(group).getAllByRole('radio')[0];
    fireEvent.click(option);
    fireEvent.click(screen.getByRole('button', { name: i === total ? 'FINALIZAR' : 'CONTINUAR' }));
  }
}

async function participate(phone = PHONE, pick: string[] = [], marketing = false) {
  await identify(phone, marketing);
  await answerQuestions(3, pick);
  await screen.findByText('Obrigado por participar!');
}

describe('telefone', () => {
  it('aplica a máscara de telefone brasileiro', () => {
    expect(maskPhone('4')).toBe('(4');
    expect(maskPhone('4599')).toBe('(45) 99');
    expect(maskPhone('4532771234')).toBe('(45) 3277-1234');
    expect(maskPhone('45999887766')).toBe(PHONE_MASKED);
    expect(maskPhone('+55 (45) 99988-7766')).toBe(PHONE_MASKED);
    expect(normalizePhone('045 99988-7766 123')).toBe(PHONE);
  });

  it('valida DDD, tamanho e formato', () => {
    expect(phoneError('')).toMatch(/Informe/);
    expect(phoneError('459998877')).toMatch(/incompleto/);
    expect(phoneError('05999887766')).toMatch(/DDD/);
    expect(phoneError('10999887766')).toMatch(/DDD/);
    expect(phoneError('45899887766')).toMatch(/começar com 9/);
    expect(phoneError('4599887766')).toMatch(/inválido/);
    expect(phoneError('45999999999')).toMatch(/inválido/);
    expect(phoneError(PHONE)).toBeNull();
    expect(phoneError('(45) 3277-1234')).toBeNull();
  });
});

describe('totem: identidade e créditos', () => {
  it('abre direto na pesquisa, com o logotipo oficial da rádio e o rodapé só com a Faculdade', async () => {
    await renderTotem();
    expect(screen.getByRole('heading', { name: 'Participe da Pesquisa Massa FM' })).toBeInTheDocument();
    expect(document.title).toBe('Participe da Pesquisa Massa FM — Massa FM Toledo 98.5');
    // Logotipo oficial embutido: arquivo quadrado, exibido sem distorção.
    const logo = screen.getByRole('img', { name: 'Massa FM Toledo 98.5' });
    expect(logo).toHaveAttribute('src', './assets/logo-massa-fm-toledo.png');
    expect(logo).toHaveAttribute('width', '512');
    expect(logo).toHaveAttribute('height', '512');
    expect(logo.className).toContain('object-contain');
    // O logotipo grande da tela inicial não é link: ninguém sai da pesquisa sem querer.
    expect(logo.closest('a')).toBeNull();

    const footer = screen.getByTestId('massa-footer');
    // Crédito com o curso responsável em evidência (negrito).
    expect(footer).toHaveTextContent('Desenvolvido pela Faculdade Donaduzzi — Curso de Ciência de Dados e Inteligência Artificial.');
    expect(within(footer).getByText('Curso de Ciência de Dados e Inteligência Artificial.').tagName).toBe('STRONG');
    expect(footer).not.toHaveTextContent('Biopark');

    // Faixa com todos os cursos da Faculdade, com Ciência de Dados e IA em destaque.
    const ticker = within(footer).getByRole('group', { name: 'Cursos da Faculdade Donaduzzi' });
    const track = ticker.firstElementChild as HTMLElement;
    const [visible, copy] = Array.from(track.children) as HTMLElement[];
    expect(Array.from(visible.children).slice(1).map((c) => c.textContent)).toEqual(DEFAULT_MASSA_CONFIG.courses.map((c) => c.name));
    // Cada curso leva à própria página no site da Faculdade; o título leva à lista de cursos.
    const courseLinks = within(visible).getAllByRole('link');
    expect(courseLinks.map((a) => a.getAttribute('href'))).toEqual([
      'https://faculdadedonaduzzi.com.br/cursos-de-graduacao/',
      ...DEFAULT_MASSA_CONFIG.courses.map((c) => c.url),
    ]);
    for (const a of courseLinks) {
      expect(a.getAttribute('href')).toMatch(/^https:\/\/faculdadedonaduzzi\.com\.br\/[a-z-]+\/$/);
      expect(a).toHaveAttribute('target', '_blank');
      expect(a).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(new Set(DEFAULT_MASSA_CONFIG.courses.map((c) => c.url)).size).toBe(10);
    expect(within(visible).getByRole('link', { name: 'Ciência de Dados (abre o site em outra aba)' })).toHaveAttribute('href', 'https://faculdadedonaduzzi.com.br/graduacao-ciencia-de-dados/');
    // A cópia fica fora do teclado.
    expect(Array.from(copy.querySelectorAll('a')).every((a) => a.tabIndex === -1)).toBe(true);
    expect(DEFAULT_MASSA_CONFIG.courses).toHaveLength(10);
    expect(Array.from(visible.querySelectorAll('.massa-ticker-featured')).map((c) => c.textContent)).toEqual(['Ciência de Dados', 'Inteligência Artificial']);
    // A repetição que deixa a rolagem sem emenda fica escondida dos leitores de tela.
    expect(copy).toHaveAttribute('aria-hidden', 'true');
    expect(copy.textContent).toBe(visible.textContent);
    expect(track.style.animationDuration).toBe('40s');
    const link = within(footer).getByRole('link', { name: /Faculdade Donaduzzi: conheça o curso/ });
    expect(link).toHaveAttribute('href', 'https://tampelini.github.io/cd-ia-donaduzzi/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(link).getByRole('img', { name: 'Faculdade Donaduzzi' })).toHaveAttribute('src', './assets/logo-donaduzzi.png');
  });

  it('qualquer endereço que não seja o painel abre a pesquisa (inclusive o antigo #/massa)', async () => {
    window.location.hash = '#/massa';
    await renderTotem();
    expect(screen.getByRole('heading', { name: 'Participe da Pesquisa Massa FM' })).toBeInTheDocument();
  });

  it('a faixa de cursos segue a lista do painel e some quando a lista fica vazia', async () => {
    await loadMassa();
    await saveMassaConfig({ ...DEFAULT_MASSA_CONFIG, courses: [{ name: 'Ciência de Dados', url: '' }, { name: 'Medicina', url: 'https://exemplo.edu.br/medicina/' }], credit: 'Feito pelo curso de Medicina' });
    const first = await renderTotem();
    const run = within(screen.getByTestId('massa-footer')).getByRole('group', { name: 'Cursos da Faculdade Donaduzzi' }).firstElementChild!.firstElementChild!;
    expect(Array.from(run.children).slice(1).map((c) => c.textContent)).toEqual(['Ciência de Dados', 'Medicina']);
    expect(Array.from(run.querySelectorAll('.massa-ticker-featured')).map((c) => c.textContent)).toEqual(['Medicina']);
    // Curso sem link aparece só como texto.
    expect(within(run as HTMLElement).queryByRole('link', { name: /Ciência de Dados/ })).not.toBeInTheDocument();
    expect(within(run as HTMLElement).getByRole('link', { name: /Medicina/ })).toHaveAttribute('href', 'https://exemplo.edu.br/medicina/');
    first.unmount();
    await saveMassaConfig({ ...DEFAULT_MASSA_CONFIG, courses: [] });
    await renderTotem();
    expect(screen.queryByTestId('massa-courses')).not.toBeInTheDocument();
    expect(screen.getByTestId('massa-footer')).toHaveTextContent('Desenvolvido pela Faculdade Donaduzzi');
  });

  it('lista de cursos salva só com nomes (primeira versão) ganha os links padrão', async () => {
    await db.setKV('massaConfig', { ...DEFAULT_MASSA_CONFIG, coursesUrl: undefined, courses: ['Farmácia', 'Curso novo'] });
    await renderTotem();
    const footer = within(screen.getByTestId('massa-footer'));
    expect(footer.getByRole('link', { name: /^Farmácia/ })).toHaveAttribute('href', 'https://faculdadedonaduzzi.com.br/graduacao-farmacia/');
    expect(footer.queryByRole('link', { name: /Curso novo/ })).not.toBeInTheDocument();
    expect(footer.getByRole('link', { name: /^Cursos da Faculdade Donaduzzi/ })).toHaveAttribute('href', 'https://faculdadedonaduzzi.com.br/cursos-de-graduacao/');
  });

  it('logotipo enviado no painel substitui o embutido', async () => {
    await loadMassa();
    await saveMassaConfig({ ...DEFAULT_MASSA_CONFIG, logoMassa: 'data:image/png;base64,AAAA' });
    await renderTotem();
    expect(screen.getByRole('img', { name: 'Massa FM Toledo 98.5' })).toHaveAttribute('src', 'data:image/png;base64,AAAA');
  });

  it('os logotipos do canto superior e do rodapé abrem os sites em outra aba, sem sair da pesquisa', async () => {
    const fake = {} as Window;
    const open = vi.spyOn(window, 'open').mockReturnValue(fake);
    await renderTotem();
    await identify();
    await screen.findByText('Pergunta 1 de 3');

    const radio = screen.getByRole('link', { name: 'Massa FM Toledo 98.5: visite o site da rádio (abre em outra aba)' });
    expect(radio).toHaveAttribute('href', 'https://massa.com.br/massa-fm-toledo/');
    expect(radio).toHaveAttribute('target', '_blank');
    expect(radio).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.click(radio);
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://massa.com.br/massa-fm-toledo/', '_blank'));

    // O logotipo da Faculdade continua levando ao site do curso de CD e IA.
    fireEvent.click(within(screen.getByTestId('massa-footer')).getByRole('link', { name: /Faculdade Donaduzzi: conheça o curso/ }));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://tampelini.github.io/cd-ia-donaduzzi/', '_blank'));
    // Tocar em um curso da faixa abre a página daquele curso.
    const farmacia = within(screen.getByTestId('massa-footer')).getByRole('link', { name: 'Farmácia (abre o site em outra aba)' });
    farmacia.focus();
    fireEvent.click(farmacia);
    // O link não fica com o foco depois do toque (era o que deixava a faixa parada).
    expect(farmacia).not.toHaveFocus();
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://faculdadedonaduzzi.com.br/graduacao-farmacia/', '_blank'));
    fireEvent.click(within(screen.getByTestId('massa-footer')).getByRole('link', { name: 'Cursos da Faculdade Donaduzzi (abre o site em outra aba)' }));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://faculdadedonaduzzi.com.br/cursos-de-graduacao/', '_blank'));
    expect(fake.opener).toBeNull();
    // A pesquisa continua onde estava.
    expect(screen.getByText('Pergunta 1 de 3')).toBeInTheDocument();
  });

  it('sem links configurados, os logotipos não são clicáveis', async () => {
    await loadMassa();
    await saveMassaConfig({ ...DEFAULT_MASSA_CONFIG, creditUrl: '', stationUrl: '', coursesUrl: '', courses: DEFAULT_MASSA_CONFIG.courses.map((c) => ({ ...c, url: '' })) });
    await renderTotem();
    await identify();
    await screen.findByText('Pergunta 1 de 3');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Massa FM Toledo 98.5' })).toBeInTheDocument();
    expect(within(screen.getByTestId('massa-footer')).getByRole('img', { name: 'Faculdade Donaduzzi' })).toBeInTheDocument();
  });
});

describe('totem: fluxo do participante', () => {
  it('participa do início ao fim só com o telefone, grava no banco e limpa a tela para a próxima pessoa', async () => {
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'info'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'debug')];
    await renderTotem();
    fireEvent.click(screen.getByRole('button', { name: 'COMEÇAR' }));

    // Identificação: só o telefone (nenhum campo de nome) e o aceite, na mesma tela.
    const phone = await screen.findByLabelText(/Telefone com DDD/);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.queryByLabelText(/Nome/)).not.toBeInTheDocument();
    const next = screen.getByRole('button', { name: 'CONTINUAR' });
    const consent = screen.getByTestId('massa-consent');
    const marketing = screen.getByTestId('massa-marketing');
    // As duas caixas começam desmarcadas e trazem os textos do painel.
    expect(consent).toHaveAttribute('aria-checked', 'false');
    expect(marketing).toHaveAttribute('aria-checked', 'false');
    expect(consent).toHaveTextContent(DEFAULT_MASSA_CONFIG.consent.requiredText);
    expect(marketing).toHaveTextContent(DEFAULT_MASSA_CONFIG.consent.optionalText);
    expect(screen.getByRole('link', { name: 'Ler a Política de Privacidade' })).toHaveAttribute('href', 'https://massa.com.br/politica-de-privacidade-grupo-massa/');
    expect(next).toBeDisabled();
    // A máscara é aplicada e o telefone incompleto não libera o botão.
    fireEvent.change(phone, { target: { value: '4599988' } });
    expect(phone).toHaveValue('(45) 99988');
    fireEvent.blur(phone);
    expect(await screen.findByText('Telefone incompleto: digite o DDD e o número.')).toBeInTheDocument();
    fireEvent.click(consent);
    expect(next).toBeDisabled();
    fireEvent.click(consent);
    fireEvent.change(phone, { target: { value: PHONE } });
    expect(phone).toHaveValue(PHONE_MASKED);
    // Telefone válido, mas sem o aceite: não avança (a caixa opcional não substitui a obrigatória).
    expect(next).toBeDisabled();
    expect(screen.getByText('Marque a caixa de aceite para continuar.')).toBeInTheDocument();
    fireEvent.click(marketing);
    expect(next).toBeDisabled();
    fireEvent.click(consent);
    expect(next).toBeEnabled();
    fireEvent.click(consent);
    expect(next).toBeDisabled();
    fireEvent.click(consent);
    expect(screen.getByTestId('massa-footer')).toBeInTheDocument();
    fireEvent.click(next);

    // Perguntas obrigatórias: só avança depois de responder.
    await screen.findByText('Pergunta 1 de 3');
    expect(screen.getByRole('heading', { name: 'Em qual período do dia você mais ouve rádio?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CONTINUAR' })).toBeDisabled();
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(['Manhã', 'Tarde', 'Noite', 'Não tenho horário definido']);
    fireEvent.click(screen.getByRole('radio', { name: 'Noite' }));
    expect(screen.getByRole('radio', { name: 'Noite' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUAR' }));
    await screen.findByText('Pergunta 2 de 3');
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    fireEvent.click(screen.getByRole('radio', { name: 'Promoções' }));
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUAR' }));
    await screen.findByText('Pergunta 3 de 3');
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    expect(screen.getByTestId('massa-footer')).toBeInTheDocument();
    // A última pergunta finaliza: não há tela de aceite no fim.
    const finish = screen.getByRole('button', { name: 'FINALIZAR' });
    expect(finish).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Sertanejo' }));
    expect(finish).toBeEnabled();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const before = Date.now();
    fireEvent.click(finish);

    expect(await screen.findByText('Obrigado por participar!')).toBeInTheDocument();
    expect(screen.getByText('Agora você está ainda mais perto da Massa FM Toledo.')).toBeInTheDocument();
    expect(screen.getByTestId('massa-footer')).toBeInTheDocument();

    const saved = await listParticipants();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      eventId: 'evento-padrao',
      eventName: 'Evento Massa FM',
      surveyId: 'pesquisa-padrao',
      surveyName: 'Pesquisa Massa FM',
      phone: PHONE,
      consentVersion: 'v1',
      consentText: DEFAULT_MASSA_CONFIG.consent.requiredText,
      marketingOptIn: true,
    });
    // Coleta mínima: nenhum nome ou outro dado pessoal é gravado, só o telefone.
    expect(Object.keys(saved[0]).sort()).toEqual(
      ['answers', 'consentText', 'consentVersion', 'createdAt', 'eventId', 'eventName', 'id', 'marketingOptIn', 'phone', 'surveyId', 'surveyName'],
    );
    expect(saved[0].createdAt).toBeGreaterThanOrEqual(before);
    expect(saved[0].answers.map((a) => [a.prompt, a.values])).toEqual([
      ['Em qual período do dia você mais ouve rádio?', ['Noite']],
      ['Qual tipo de conteúdo você mais gosta de ouvir na rádio?', ['Promoções']],
      ['Qual estilo musical você mais gosta?', ['Sertanejo']],
    ]);

    // Volta sozinho ao início e o próximo participante encontra tudo em branco.
    await act(async () => {
      vi.advanceTimersByTime(6_500);
    });
    fireEvent.click(await screen.findByRole('button', { name: 'COMEÇAR' }));
    expect(await screen.findByLabelText(/Telefone com DDD/)).toHaveValue('');
    expect(screen.getByTestId('massa-consent')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('massa-marketing')).toHaveAttribute('aria-checked', 'false');
    expect(document.body.textContent).not.toContain('99988');

    // Nenhum dado pessoal vai para o console.
    const printed = logs.flatMap((l) => l.mock.calls).map((c) => JSON.stringify(c)).join(' ');
    expect(printed).not.toContain('99988');
  });

  it('não aceita o mesmo telefone duas vezes no mesmo evento', async () => {
    await renderTotem();
    await participate();
    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));
    await identify(PHONE_MASKED);
    expect(await screen.findByRole('alert')).toHaveTextContent('Este telefone já participou desta pesquisa neste evento.');
    expect(screen.queryByText(/Pergunta 1 de/)).not.toBeInTheDocument();
    expect(await listParticipants()).toHaveLength(1);
  });

  it('o mesmo telefone pode participar de outro evento (dados separados por evento)', async () => {
    await loadMassa();
    const active = defaultActive();
    const answers: MassaDraftAnswers = { 'q-periodo': ['q-periodo-o1'], 'q-conteudo': ['q-conteudo-o1'], 'q-estilo': ['q-estilo-o1'] };
    const base = { active, phone: PHONE, answers, consent: DEFAULT_MASSA_CONFIG.consent, marketingOptIn: false };
    await submitParticipation(base);
    await expect(submitParticipation({ ...base, phone: PHONE_MASKED })).rejects.toBeInstanceOf(DuplicatePhoneError);
    const other = { ...active, event: { ...active.event, id: 'evento-2', name: 'Segundo evento' } };
    await submitParticipation({ ...base, active: other });
    expect(await phoneAlreadyInEvent('evento-padrao', PHONE_MASKED)).toBe(true);
    expect(await phoneAlreadyInEvent('evento-3', PHONE)).toBe(false);
    expect((await listParticipants()).map((p) => p.eventName)).toEqual(['Evento Massa FM', 'Segundo evento']);
  });

  it('se a gravação falhar, mantém o preenchimento e permite tentar de novo', async () => {
    await renderTotem();
    await identify();
    const spy = vi.spyOn(db, 'putParticipant').mockRejectedValueOnce(new Error('sem espaço'));
    await answerQuestions(3);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar agora. Seus dados continuam guardados');
    // Continua na última pergunta, com a resposta marcada.
    expect(screen.getByText('Pergunta 3 de 3')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')[0]).toHaveAttribute('aria-checked', 'true');
    expect(await listParticipants()).toHaveLength(0);
    spy.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'FINALIZAR' }));
    expect(await screen.findByText('Obrigado por participar!')).toBeInTheDocument();
    expect(await listParticipants()).toHaveLength(1);
  });

  it('abandono: volta ao início após a inatividade configurada e apaga o que foi digitado', async () => {
    await loadMassa();
    await saveMassaConfig({ ...DEFAULT_MASSA_CONFIG, idleSeconds: 20 });
    await renderTotem();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await identify();
    await screen.findByText('Pergunta 1 de 3');
    await act(async () => {
      vi.advanceTimersByTime(19_000);
    });
    expect(screen.getByText('Pergunta 1 de 3')).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    fireEvent.click(await screen.findByRole('button', { name: 'COMEÇAR' }));
    expect(await screen.findByLabelText(/Telefone com DDD/)).toHaveValue('');
    expect(await listParticipants()).toHaveLength(0);
  });

  it('respeita tipos de pergunta, perguntas opcionais e inativas definidas no painel', async () => {
    await loadMassa();
    await saveMassaSurveys([
      {
        id: 'pesquisa-padrao',
        name: 'Pesquisa do evento',
        questions: [
          { id: 'm1', prompt: 'Quais redes você usa?', type: 'multiple', required: true, active: true, options: [{ id: 'a', text: 'Instagram' }, { id: 'b', text: 'TikTok' }, { id: 'c', text: 'Facebook' }] },
          { id: 'x1', prompt: 'Pergunta desativada', type: 'single', required: true, active: false, options: [{ id: 'a', text: 'Sim' }, { id: 'b', text: 'Não' }] },
          { id: 't1', prompt: 'Deixe um recado para a rádio', type: 'text', required: false, active: true, options: [] },
        ],
      },
    ]);
    await renderTotem();
    await identify();
    await screen.findByText('Pergunta 1 de 2');
    expect(screen.getByText(/Você pode marcar mais de uma opção/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Instagram' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Facebook' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'TikTok' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'TikTok' }));
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUAR' }));
    await screen.findByText('Pergunta 2 de 2');
    // Voltar preserva o que já foi marcado.
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    await screen.findByText('Pergunta 1 de 2');
    expect(screen.getByRole('checkbox', { name: 'Instagram' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: 'TikTok' })).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUAR' }));
    await screen.findByText('Pergunta 2 de 2');
    // Opcional: dá para finalizar sem responder; aqui a pessoa escreve um recado.
    expect(screen.getByRole('button', { name: 'FINALIZAR' })).toBeEnabled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Toca mais modão!  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'FINALIZAR' }));
    await screen.findByText('Obrigado por participar!');
    const [p] = await listParticipants();
    expect(p.surveyName).toBe('Pesquisa do evento');
    expect(p.answers.map((a) => [a.questionId, a.values])).toEqual([
      ['m1', ['Instagram', 'Facebook']],
      ['t1', ['Toca mais modão!']],
    ]);
  });

  it('pergunta opcional sem resposta e pesquisa sem perguntas também finalizam', async () => {
    await loadMassa();
    await saveMassaSurveys([{ id: 'pesquisa-padrao', name: 'Curta', questions: [{ id: 't1', prompt: 'Algum recado?', type: 'text', required: false, active: true, options: [] }] }]);
    const first = await renderTotem();
    await identify();
    await screen.findByText('Pergunta 1 de 1');
    fireEvent.click(screen.getByRole('button', { name: 'FINALIZAR' }));
    await screen.findByText('Obrigado por participar!');
    expect((await listParticipants())[0].answers).toEqual([]);
    first.unmount();

    // Sem nenhuma pergunta ativa: o telefone com aceite já finaliza.
    __resetMassaForTests();
    await loadMassa();
    await saveMassaSurveys([{ id: 'pesquisa-padrao', name: 'Só cadastro', questions: [] }]);
    await renderTotem();
    fireEvent.click(screen.getByRole('button', { name: 'COMEÇAR' }));
    fireEvent.change(await screen.findByLabelText(/Telefone com DDD/), { target: { value: '45999112233' } });
    const finish = screen.getByRole('button', { name: 'FINALIZAR' });
    expect(finish).toBeDisabled();
    fireEvent.click(screen.getByTestId('massa-consent'));
    fireEvent.click(finish);
    await screen.findByText('Obrigado por participar!');
    expect(await listParticipants()).toHaveLength(2);
  });

  it('sem evento ativo, a pesquisa fica indisponível', async () => {
    await loadMassa();
    await saveMassaEvents(DEFAULT_MASSA_EVENTS.map((e) => ({ ...e, active: false })));
    render(<App />);
    expect(await screen.findByText(/Pesquisa indisponível no momento/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'COMEÇAR' })).toBeDisabled();
  });

  it('5 toques rápidos no canto superior esquerdo abrem o login do painel', async () => {
    await renderTotem();
    const root = document.querySelector('.massa-root') as HTMLElement;
    for (let i = 0; i < 5; i++) fireEvent.pointerDown(root, { clientX: 10, clientY: 10 });
    expect(await screen.findByText('Área administrativa')).toBeInTheDocument();
  });
});

describe('participantes: filtros, totais e exportação', () => {
  async function seed() {
    await loadMassa();
    const active = defaultActive();
    const other = { ...active, event: { ...active.event, id: 'evento-2', name: 'Show na praça' } };
    const mk = (period: number, style: number): MassaDraftAnswers => ({ 'q-periodo': [`q-periodo-o${period}`], 'q-conteudo': ['q-conteudo-o1'], 'q-estilo': [`q-estilo-o${style}`] });
    const consent = DEFAULT_MASSA_CONFIG.consent;
    await submitParticipation({ active, phone: '45999110001', answers: mk(1, 1), consent, marketingOptIn: true }, new Date('2026-11-20T10:00:00').getTime());
    await submitParticipation({ active, phone: '45999110002', answers: mk(1, 2), consent, marketingOptIn: false }, new Date('2026-11-21T15:00:00').getTime());
    await submitParticipation({ active, phone: '45999110003', answers: mk(3, 1), consent, marketingOptIn: true }, new Date('2026-11-22T20:00:00').getTime());
    await submitParticipation({ active: other, phone: '44988220004', answers: mk(2, 1), consent, marketingOptIn: false }, new Date('2026-11-22T21:00:00').getTime());
    return listParticipants();
  }
  const phones = (list: { phone: string }[]) => list.map((p) => p.phone);

  it('filtra por evento, pesquisa, data, resposta e telefone', async () => {
    const all = await seed();
    expect(all).toHaveLength(4);
    expect(phones(filterParticipants(all, { eventId: 'evento-2' }))).toEqual(['44988220004']);
    expect(filterParticipants(all, { surveyId: 'pesquisa-padrao' })).toHaveLength(4);
    expect(phones(filterParticipants(all, { from: '2026-11-21', to: '2026-11-21' }))).toEqual(['45999110002']);
    expect(filterParticipants(all, { from: '2026-11-22' })).toHaveLength(2);
    expect(phones(filterParticipants(all, { questionId: 'q-periodo', answer: 'Manhã' }))).toEqual(['45999110001', '45999110002']);
    // Telefone com máscara, sem máscara ou só um trecho.
    expect(phones(filterParticipants(all, { search: '(45) 99911-0003' }))).toEqual(['45999110003']);
    expect(phones(filterParticipants(all, { search: '0004' }))).toEqual(['44988220004']);
    expect(filterParticipants(all, { search: '4599911' })).toHaveLength(3);
    expect(filterParticipants(all, { eventId: 'evento-padrao', search: '44988' })).toHaveLength(0);
    expect(filterParticipants(all, { search: 'abc' })).toHaveLength(0);
  });

  it('calcula totais e percentuais e exporta CSV que abre no Excel, sem coluna de nome', async () => {
    const all = await seed();
    const mine = filterParticipants(all, { eventId: 'evento-padrao' });
    const totals = totalsByQuestion(mine);
    const period = totals.find((t) => t.questionId === 'q-periodo')!;
    expect(period.respondents).toBe(3);
    expect(period.options.map((o) => [o.value, o.count, Math.round(o.percent)])).toEqual([['Manhã', 2, 67], ['Noite', 1, 33]]);

    const csv = participantsToCsv(mine).split('\r\n');
    expect(csv[0]).toBe('﻿data_hora;evento;pesquisa;telefone;aceita_comunicacoes;versao_consentimento;anonimizado;Em qual período do dia você mais ouve rádio?;Qual tipo de conteúdo você mais gosta de ouvir na rádio?;Qual estilo musical você mais gosta?');
    expect(csv).toHaveLength(4);
    expect(csv[1]).toContain(';Evento Massa FM;Pesquisa Massa FM;(45) 99911-0001;sim;v1;nao;Manhã;Música;Sertanejo');
    const tcsv = totalsToCsv(totals, mine.length);
    expect(tcsv).toContain('(geral);participantes;3;');
    expect(tcsv).toContain('Em qual período do dia você mais ouve rádio?;Manhã;2;66.7');
  });

  it('anonimizar apaga o telefone, mantém as respostas e libera o número', async () => {
    const all = await seed();
    await anonymizeParticipant(all[0]);
    const [first] = await listParticipants();
    expect(first).toMatchObject({ phone: '', marketingOptIn: false });
    expect(first.anonymizedAt).toBeTypeOf('number');
    expect(first.answers).toHaveLength(3);
    expect(await phoneAlreadyInEvent('evento-padrao', '45999110001')).toBe(false);
  });
});

describe('painel administrativo', () => {
  async function openAdmin(section?: string) {
    window.location.hash = '#/admin';
    render(<App />);
    await screen.findByText('Área administrativa');
    // Créditos na tela de login.
    expect(within(screen.getByTestId('credits')).getByText(/Desenvolvido pela Faculdade Donaduzzi/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await screen.findByText(/No totem agora: evento/);
    if (section) fireEvent.click(screen.getByRole('button', { name: section }));
  }

  const backToTotem = async () => {
    fireEvent.click(screen.getByRole('button', { name: /Sair e voltar ao totem/ }));
    act(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
    await screen.findByRole('button', { name: 'COMEÇAR' });
  };

  it('o painel só tem as seções da pesquisa (nada do antigo quiz)', async () => {
    await openAdmin();
    expect(screen.getByRole('heading', { name: 'Painel — Pesquisa Massa FM' })).toBeInTheDocument();
    const tabs = within(screen.getByRole('navigation', { name: 'Seções' })).getAllByRole('button').map((b) => b.textContent?.trim());
    expect(tabs).toEqual(['Eventos', 'Pesquisas e perguntas', 'Totem, textos e consentimento', 'Participantes e resultados', 'Segurança', 'Sobre o sistema']);
    expect(document.body.textContent).not.toMatch(/Cursos|Quiz|Estatísticas/);
  });

  it('o painel exige PIN: sem login, nenhum telefone aparece', async () => {
    await loadMassa();
    await submitParticipation({ active: defaultActive(), phone: PHONE, answers: {}, consent: DEFAULT_MASSA_CONFIG.consent, marketingOptIn: false });
    window.location.hash = '#/admin';
    render(<App />);
    await screen.findByText('Área administrativa');
    expect(document.body.textContent).not.toContain('99988');
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '9999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('PIN incorreto.')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('99988');
  });

  it('usa o PIN padrão até ser alterado', async () => {
    expect(await isDefaultPin()).toBe(true);
    expect(await verifyPin(DEFAULT_PIN)).toBe(true);
    await setPin('987654');
    expect(await isDefaultPin()).toBe(false);
    expect(await verifyPin(DEFAULT_PIN)).toBe(false);
    expect(await verifyPin('987654')).toBe(true);
    await expect(setPin('12')).rejects.toThrow();
  });

  it('cria evento, vincula pesquisa e define o que roda no totem', async () => {
    await openAdmin();
    fireEvent.click(screen.getByRole('button', { name: /Novo evento/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar evento' }));
    expect(await screen.findByText(/Informe o nome do evento/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nome do evento'), { target: { value: 'Expo Toledo 2026' } });
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Estande da rádio' } });
    fireEvent.change(screen.getByLabelText('Local'), { target: { value: 'Parque de Exposições' } });
    fireEvent.change(screen.getByLabelText('Data de início'), { target: { value: '2026-12-10' } });
    fireEvent.change(screen.getByLabelText('Data de término'), { target: { value: '2026-12-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar evento' }));
    expect(await screen.findByText(/término não pode ser anterior/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Data de término'), { target: { value: '2026-12-13' } });
    expect(screen.getByLabelText(/Pesquisa vinculada/)).toHaveValue('pesquisa-padrao');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar evento' }));
    expect(await screen.findByText('Evento "Expo Toledo 2026" salvo.')).toBeInTheDocument();
    expect(screen.getByText('Parque de Exposições · 10/12/2026 a 13/12/2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Usar Expo Toledo 2026 no totem' }));
    expect(await screen.findByText(/O totem agora usa o evento "Expo Toledo 2026"/)).toBeInTheDocument();
    await waitFor(async () => {
      const kv = await db.getKV<typeof DEFAULT_MASSA_CONFIG>('massaConfig');
      const events = await db.getKV<typeof DEFAULT_MASSA_EVENTS>('massaEvents');
      expect(events).toHaveLength(2);
      expect(kv?.activeEventId).toBe(events![1].id);
      expect(events![1]).toMatchObject({ name: 'Expo Toledo 2026', location: 'Parque de Exposições', startDate: '2026-12-10', endDate: '2026-12-13', active: true, surveyId: 'pesquisa-padrao' });
    });
  });

  it('edita perguntas e alternativas sem mexer no código, e o totem passa a usá-las', async () => {
    await openAdmin('Pesquisas e perguntas');
    expect(await screen.findByLabelText('Texto da pergunta 1')).toHaveValue('Em qual período do dia você mais ouve rádio?');
    // Edita o texto, reordena, troca o tipo, torna opcional e mexe nas alternativas.
    fireEvent.change(screen.getByLabelText('Texto da pergunta 1'), { target: { value: 'Quando você mais ouve a Massa?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Descer a pergunta 1' }));
    expect(screen.getByLabelText('Texto da pergunta 2')).toHaveValue('Quando você mais ouve a Massa?');
    fireEvent.change(screen.getByLabelText('Tipo da pergunta 1'), { target: { value: 'multiple' } });
    fireEvent.click(screen.getByRole('button', { name: 'Excluir a alternativa 2 da pergunta 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar alternativa à pergunta 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar pesquisa' }));
    expect(await screen.findByText(/preencha ou remova as alternativas vazias/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Alternativa 5 da pergunta 1'), { target: { value: 'Podcasts' } });
    fireEvent.click(screen.getByRole('button', { name: 'Subir a alternativa 5 da pergunta 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir a pergunta 3' }));
    fireEvent.click(screen.getByRole('button', { name: /Adicionar pergunta/ }));
    fireEvent.change(screen.getByLabelText('Texto da pergunta 3'), { target: { value: 'Quer mandar um recado?' } });
    fireEvent.change(screen.getByLabelText('Tipo da pergunta 3'), { target: { value: 'text' } });
    fireEvent.click(within(screen.getByRole('group', { name: 'Pergunta 3' })).getByLabelText('Obrigatória'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar pesquisa' }));
    expect(await screen.findByText(/Pesquisa "Pesquisa Massa FM" salva/)).toBeInTheDocument();

    const saved = (await db.getKV<typeof DEFAULT_MASSA_SURVEYS>('massaSurveys'))![0];
    expect(saved.questions.map((q) => [q.prompt, q.type, q.required])).toEqual([
      ['Qual tipo de conteúdo você mais gosta de ouvir na rádio?', 'multiple', true],
      ['Quando você mais ouve a Massa?', 'single', true],
      ['Quer mandar um recado?', 'text', false],
    ]);
    expect(saved.questions[0].options.map((o) => o.text)).toEqual(['Música', 'Entretenimento', 'Promoções', 'Podcasts', 'Esportes']);

    // Nova pesquisa para outro evento.
    fireEvent.click(screen.getByRole('button', { name: /Nova pesquisa/ }));
    expect(await screen.findByText(/Pesquisa "Nova pesquisa" criada/)).toBeInTheDocument();
    await waitFor(async () => expect(await db.getKV<unknown[]>('massaSurveys')).toHaveLength(2));

    // O totem usa a versão salva.
    await backToTotem();
    await identify();
    await screen.findByText('Pergunta 1 de 3');
    expect(screen.getAllByRole('checkbox').map((c) => c.textContent)).toEqual(['Música', 'Entretenimento', 'Promoções', 'Podcasts', 'Esportes']);
  });

  it('edita consentimento, versão, links e tempo de retorno', async () => {
    await openAdmin('Totem, textos e consentimento');
    fireEvent.change(await screen.findByLabelText(/^Consentimento obrigatório/), { target: { value: 'Concordo com o novo regulamento.' } });
    expect(await screen.findByText(/mude também a versão/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Versão do texto/), { target: { value: 'v2' } });
    fireEvent.change(screen.getByLabelText('Link da Política de Privacidade'), { target: { value: 'sem-link' } });
    fireEvent.change(screen.getByLabelText(/^Link ao tocar no logotipo da rádio/), { target: { value: 'radio' } });
    fireEvent.change(screen.getByLabelText(/Retorno à tela inicial por inatividade/), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar configurações da pesquisa' }));
    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('O link da Política de Privacidade deve começar com http');
    expect(error).toHaveTextContent('O link do logotipo da rádio deve começar com http');
    expect(error).toHaveTextContent('entre 15 e 600 segundos');
    fireEvent.change(screen.getByLabelText('Link da Política de Privacidade'), { target: { value: 'https://exemplo.com.br/privacidade' } });
    fireEvent.change(screen.getByLabelText(/^Link ao tocar no logotipo da rádio/), { target: { value: 'https://exemplo.com.br/radio' } });
    fireEvent.change(screen.getByLabelText(/^Link ao tocar no logotipo da Faculdade/), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/^Cursos que passam na faixa do rodapé/), { target: { value: 'Ciência de Dados | https://exemplo.edu.br/cd/\n  Inteligência Artificial  \n\nMedicina|sem-link' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar configurações da pesquisa' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('O link do curso "Medicina" deve começar com http');
    fireEvent.change(screen.getByLabelText(/^Cursos que passam na faixa do rodapé/), { target: { value: 'Ciência de Dados | https://exemplo.edu.br/cd/\n  Inteligência Artificial  \n\nMedicina' } });
    fireEvent.change(screen.getByLabelText(/Retorno à tela inicial por inatividade/), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar configurações da pesquisa' }));
    expect(await screen.findByText('Configurações da Pesquisa Massa FM salvas.')).toBeInTheDocument();
    const cfg = (await db.getKV<typeof DEFAULT_MASSA_CONFIG>('massaConfig'))!;
    expect(cfg).toMatchObject({ idleSeconds: 45, stationUrl: 'https://exemplo.com.br/radio', creditUrl: '' });
    expect(cfg.courses).toEqual([
      { name: 'Ciência de Dados', url: 'https://exemplo.edu.br/cd/' },
      { name: 'Inteligência Artificial', url: '' },
      { name: 'Medicina', url: '' },
    ]);
    expect(cfg.consent).toMatchObject({ version: 'v2', requiredText: 'Concordo com o novo regulamento.', privacyUrl: 'https://exemplo.com.br/privacidade' });

    // A participação seguinte registra a nova versão do consentimento.
    await backToTotem();
    await participate();
    const [p] = await listParticipants();
    expect(p).toMatchObject({ consentVersion: 'v2', consentText: 'Concordo com o novo regulamento.' });
  });

  it('lista, filtra, anonimiza e exclui participantes pelo telefone; mostra totais', async () => {
    await loadMassa();
    const active = defaultActive();
    const consent = DEFAULT_MASSA_CONFIG.consent;
    const a1: MassaDraftAnswers = { 'q-periodo': ['q-periodo-o1'], 'q-conteudo': ['q-conteudo-o1'], 'q-estilo': ['q-estilo-o1'] };
    const a2: MassaDraftAnswers = { 'q-periodo': ['q-periodo-o3'], 'q-conteudo': ['q-conteudo-o1'], 'q-estilo': ['q-estilo-o4'] };
    await submitParticipation({ active, phone: '45999110001', answers: a1, consent, marketingOptIn: true });
    await submitParticipation({ active, phone: '45999110002', answers: a2, consent, marketingOptIn: false });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await openAdmin('Participantes e resultados');
    expect(await screen.findByText('(45) 99911-0001')).toBeInTheDocument();
    expect(screen.getByText('(45) 99911-0002')).toBeInTheDocument();
    // A tabela não tem coluna de nome.
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Data e hora', 'Telefone', 'Evento / pesquisa', 'Respostas', 'Consentimento', 'Ações']);
    expect(screen.getByText('Totais e percentuais (2 participantes)')).toBeInTheDocument();
    expect(screen.getByText(/Aceitaram receber comunicações:/)).toHaveTextContent('1 de 2 (50%)');
    expect(screen.getByRole('img', { name: 'Manhã: 50%' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Música: 100%' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Buscar por telefone'), { target: { value: '0002' } });
    expect(screen.queryByText('(45) 99911-0001')).not.toBeInTheDocument();
    expect(screen.getByText('Totais e percentuais (1 participante)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    fireEvent.change(screen.getByLabelText('Pergunta'), { target: { value: 'q-estilo' } });
    fireEvent.change(screen.getByLabelText('Resposta'), { target: { value: 'Rock' } });
    expect(screen.queryByText('(45) 99911-0001')).not.toBeInTheDocument();
    expect(screen.getByText('(45) 99911-0002')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));

    fireEvent.click(screen.getByRole('button', { name: 'Anonimizar (45) 99911-0001' }));
    expect(await screen.findByText('Cadastro anonimizado.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('(45) 99911-0001')).not.toBeInTheDocument());
    expect(screen.getByText('Anonimizado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir (45) 99911-0002' }));
    expect(await screen.findByText('Cadastro excluído.')).toBeInTheDocument();
    await waitFor(async () => expect((await listParticipants()).map((p) => p.phone)).toEqual(['']));
    expect(screen.getByText('Totais e percentuais (1 participante)')).toBeInTheDocument();
  });

  it('mostra os créditos em "Sobre o sistema"', async () => {
    await openAdmin('Sobre o sistema');
    expect(await screen.findByRole('heading', { name: 'Sobre o sistema' })).toBeInTheDocument();
    expect(within(screen.getByTestId('credits')).getByText('Desenvolvido pela Faculdade Donaduzzi — Curso de Ciência de Dados e Inteligência Artificial.')).toBeInTheDocument();
  });
});
