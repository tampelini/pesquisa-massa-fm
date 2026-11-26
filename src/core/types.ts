export type MassaQuestionType = 'single' | 'multiple' | 'text';

export interface MassaOption {
  id: string;
  text: string;
}

export interface MassaQuestion {
  id: string;
  prompt: string;
  type: MassaQuestionType;
  required: boolean;
  active: boolean;
  /** Alternativas (ignoradas em perguntas de texto livre). */
  options: MassaOption[];
}

export interface MassaSurvey {
  id: string;
  name: string;
  questions: MassaQuestion[];
}

export interface MassaEvent {
  id: string;
  name: string;
  description: string;
  location: string;
  /** Datas no formato AAAA-MM-DD (vazio = não informado). */
  startDate: string;
  endDate: string;
  active: boolean;
  surveyId: string | null;
}

export interface MassaConsent {
  /** Identificador da versão do texto (gravado em cada participação). */
  version: string;
  /** Consentimento obrigatório. */
  requiredText: string;
  /** Consentimento opcional de comunicações promocionais. */
  optionalText: string;
  privacyLabel: string;
  privacyUrl: string;
  /** Link do regulamento (vazio = não exibir). */
  regulationLabel: string;
  regulationUrl: string;
}

export interface MassaCourse {
  name: string;
  /** Página do curso no site da Faculdade. Vazio = o nome aparece sem link. */
  url: string;
}

export interface MassaColors {
  /** Azul do "98.5": seleção e barras. */
  blue: string;
  /** Roxo do nome e dos fones: fundo e títulos. */
  navy: string;
  /** Laranja do fundo do logotipo: botões. */
  yellow: string;
  /** Avisos de erro. */
  red: string;
}

export interface MassaConfig {
  /** Evento em uso no totem (define também a pesquisa exibida). */
  activeEventId: string | null;
  stationName: string;
  /** Site aberto ao tocar no logotipo da rádio no canto superior. Vazio = sem link. */
  stationUrl: string;
  title: string;
  intro: string;
  thanksTitle: string;
  thanksText: string;
  /** Inatividade (s) antes de limpar o preenchimento e voltar ao início. */
  idleSeconds: number;
  /** Tempo (s) da tela de agradecimento antes de voltar ao início. */
  thanksSeconds: number;
  /** Logotipo da rádio enviado pelo painel (data URL). Vazio = o oficial embutido no app. */
  logoMassa: string;
  colors: MassaColors;
  credit: string;
  /** Página aberta ao tocar no logotipo da Faculdade no rodapé. Vazio = sem link. */
  creditUrl: string;
  /** Cursos da Faculdade que passam na faixa do rodapé (vazio = sem faixa). */
  courses: MassaCourse[];
  /** Página aberta ao tocar no título da faixa (lista de todos os cursos). Vazio = sem link. */
  coursesUrl: string;
  consent: MassaConsent;
}

export interface MassaAnswer {
  questionId: string;
  /** Texto da pergunta e das respostas no momento da participação. */
  prompt: string;
  type: MassaQuestionType;
  optionIds: string[];
  values: string[];
}

export interface MassaParticipant {
  id: string;
  eventId: string;
  eventName: string;
  surveyId: string;
  surveyName: string;
  createdAt: number;
  /** Único dado pessoal coletado: somente dígitos, com DDD. Vazio depois de anonimizado. */
  phone: string;
  answers: MassaAnswer[];
  consentVersion: string;
  consentText: string;
  marketingOptIn: boolean;
  anonymizedAt?: number;
}

/** Respostas em preenchimento no totem: IDs de alternativas ou texto livre. */
export type MassaDraftAnswers = Record<string, string[] | string>;
