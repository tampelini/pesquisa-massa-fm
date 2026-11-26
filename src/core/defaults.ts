import type { MassaConfig, MassaEvent, MassaQuestion, MassaSurvey } from './types';

const single = (id: string, prompt: string, options: string[]): MassaQuestion => ({
  id,
  prompt,
  type: 'single',
  required: true,
  active: true,
  options: options.map((text, i) => ({ id: `${id}-o${i + 1}`, text })),
});

// Perguntas iniciais de exemplo: tudo é editável no painel administrativo.
export const DEFAULT_MASSA_SURVEYS: MassaSurvey[] = [
  {
    id: 'pesquisa-padrao',
    name: 'Pesquisa Massa FM',
    questions: [
      single('q-periodo', 'Em qual período do dia você mais ouve rádio?', ['Manhã', 'Tarde', 'Noite', 'Não tenho horário definido']),
      single('q-conteudo', 'Qual tipo de conteúdo você mais gosta de ouvir na rádio?', ['Música', 'Notícias', 'Entretenimento', 'Promoções', 'Esportes']),
      single('q-estilo', 'Qual estilo musical você mais gosta?', ['Sertanejo', 'Pop', 'Pagode', 'Rock', 'Eletrônica', 'Outro']),
    ],
  },
];

export const DEFAULT_MASSA_EVENTS: MassaEvent[] = [
  {
    id: 'evento-padrao',
    name: 'Evento Massa FM',
    description: '',
    location: '',
    startDate: '',
    endDate: '',
    active: true,
    surveyId: 'pesquisa-padrao',
  },
];

// Cores lidas do logotipo oficial da Massa FM Toledo 98.5: azul do "98.5", roxo do
// nome e dos fones, laranja do fundo. O vermelho é usado só em avisos de erro.
export const DEFAULT_MASSA_COLORS = { blue: '#0059db', navy: '#732281', yellow: '#f7a819', red: '#ba1523' };

/** Logotipo da Faculdade Donaduzzi, usado nos créditos (embutido no app). */
export const FACULTY_LOGO = './assets/logo-donaduzzi.png';

/** Logotipo oficial enviado pela rádio, embutido no app (funciona offline). */
export const DEFAULT_MASSA_LOGO = './assets/logo-massa-fm-toledo.png';

export const DEFAULT_MASSA_CONFIG: MassaConfig = {
  activeEventId: 'evento-padrao',
  stationName: 'Massa FM Toledo 98.5',
  stationUrl: 'https://massa.com.br/massa-fm-toledo/',
  title: 'Participe da Pesquisa Massa FM',
  intro: 'É rapidinho: leva menos de um minuto!',
  thanksTitle: 'Obrigado por participar!',
  thanksText: 'Agora você está ainda mais perto da Massa FM Toledo.',
  idleSeconds: 60,
  thanksSeconds: 6,
  logoMassa: '',
  colors: DEFAULT_MASSA_COLORS,
  credit: 'Desenvolvido pela Faculdade Donaduzzi — Curso de Ciência de Dados e Inteligência Artificial.',
  creditUrl: 'https://tampelini.github.io/cd-ia-donaduzzi/',
  // Cursos de graduação e páginas de cada um, como listados em
  // faculdadedonaduzzi.com.br/cursos-de-graduacao (conferidos em novembro de 2026).
  coursesUrl: 'https://faculdadedonaduzzi.com.br/cursos-de-graduacao/',
  courses: [
    { name: 'Administração', url: 'https://faculdadedonaduzzi.com.br/graduacao-administracao/' },
    { name: 'Análise e Desenvolvimento de Sistemas', url: 'https://faculdadedonaduzzi.com.br/graduacao-analise-e-desenvolvimento-de-sistemas/' },
    { name: 'Ciência de Dados', url: 'https://faculdadedonaduzzi.com.br/graduacao-ciencia-de-dados/' },
    { name: 'Direito', url: 'https://faculdadedonaduzzi.com.br/graduacao-em-direito/' },
    { name: 'Engenharia de Bioprocessos e Biotecnologia', url: 'https://faculdadedonaduzzi.com.br/graduacao-engenharia-de-bioprocessos/' },
    { name: 'Engenharia de Software', url: 'https://faculdadedonaduzzi.com.br/graduacao-engenharia-de-software/' },
    { name: 'Farmácia', url: 'https://faculdadedonaduzzi.com.br/graduacao-farmacia/' },
    { name: 'Inteligência Artificial', url: 'https://faculdadedonaduzzi.com.br/inteligencia-artificial/' },
    { name: 'Pedagogia', url: 'https://faculdadedonaduzzi.com.br/graduacao-em-pedagogia/' },
    { name: 'Psicologia', url: 'https://faculdadedonaduzzi.com.br/graduacao-em-psicologia/' },
  ],
  consent: {
    version: 'v1',
    requiredText:
      'Declaro que li e concordo com o regulamento e com a Política de Privacidade. Autorizo o tratamento dos meus dados para participação nesta ação, validação do cadastro e contato caso eu seja selecionado em uma promoção.',
    optionalText: 'Quero receber novidades, promoções e comunicações da Massa FM Toledo pelo telefone ou WhatsApp informado.',
    privacyLabel: 'Política de Privacidade',
    privacyUrl: 'https://massa.com.br/politica-de-privacidade-grupo-massa/',
    regulationLabel: 'Regulamento',
    regulationUrl: '',
  },
};
