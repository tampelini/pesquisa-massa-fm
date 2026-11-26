import type { CSSProperties } from 'react';
import { openExternal } from '../services/externalLink';
import { isWebUrl } from '../core/validation';
import { DEFAULT_MASSA_LOGO, FACULTY_LOGO } from '../core/defaults';
import type { MassaConfig, MassaCourse } from '../core/types';

/** Variáveis CSS com as cores da rádio (editáveis no painel). */
export function massaThemeStyle(config: MassaConfig): CSSProperties {
  return {
    '--m-blue': config.colors.blue,
    '--m-navy': config.colors.navy,
    '--m-yellow': config.colors.yellow,
    '--m-red': config.colors.red,
  } as CSSProperties;
}

/**
 * Logotipo da Massa FM Toledo 98.5. O arquivo oficial embutido é um quadrado com o
 * fundo laranja da marca, a mesma cor do fundo da tela: aparece inteiro, sem recorte
 * nem distorção, fundido ao fundo. Um arquivo enviado pelo painel substitui o
 * embutido e é exibido como veio.
 */
export function MassaLogo({ config, size = 'lg' }: { config: MassaConfig; size?: 'sm' | 'lg' }) {
  const img = config.logoMassa ? (
    <img
      src={config.logoMassa}
      alt={config.stationName}
      className={`${size === 'lg' ? 'h-[13rem] max-w-[24rem] landscape:h-[15rem]' : 'h-[3.6rem] max-w-[9rem]'} w-auto object-contain`}
    />
  ) : (
    <img
      src={DEFAULT_MASSA_LOGO}
      alt={config.stationName}
      width={512}
      height={512}
      className={size === 'lg' ? 'h-[24rem] w-[24rem] object-contain landscape:h-[22rem] landscape:w-[22rem]' : 'h-[5rem] w-[5rem] object-contain'}
    />
  );
  // Só o logotipo pequeno (canto superior das telas) leva ao site da rádio: o grande,
  // da tela inicial, fica sem link para ninguém sair da pesquisa sem querer.
  const url = config.stationUrl.trim();
  if (size !== 'sm' || !isWebUrl(url)) return img;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${config.stationName}: visite o site da rádio (abre em outra aba)`}
      onClick={(e) => {
        e.preventDefault();
        void openExternal(url);
      }}
      className="inline-flex rounded-xl transition-transform active:scale-95"
    >
      {img}
    </a>
  );
}

/**
 * Logotipo da Faculdade Donaduzzi dos créditos. Com um link configurado, tocar nele
 * abre a página do curso em outra aba (no APK, no navegador do aparelho), sem fechar
 * a pesquisa.
 */
export function FacultyCreditLogo({ config, imgClass, linkClass = '' }: { config: MassaConfig; imgClass: string; linkClass?: string }) {
  const logo = <img src={FACULTY_LOGO} alt="Faculdade Donaduzzi" className={imgClass} />;
  const url = config.creditUrl.trim();
  if (!isWebUrl(url)) return logo;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Faculdade Donaduzzi: conheça o curso de Ciência de Dados e Inteligência Artificial (abre o site em outra aba)"
      onClick={(e) => {
        // Abre por código: funciona no APK e quando a nova aba é bloqueada.
        e.preventDefault();
        void openExternal(url);
      }}
      className={`inline-flex items-center justify-center rounded-lg transition-transform active:scale-95 ${linkClass}`}
    >
      {logo}
    </a>
  );
}

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Cursos citados no crédito (ex.: Ciência de Dados e Inteligência Artificial) ganham destaque na faixa. */
export function highlightedCourses(config: Pick<MassaConfig, 'courses' | 'credit'>): Set<string> {
  const credit = fold(config.credit);
  return new Set(config.courses.map((c) => c.name.trim()).filter((name) => name && credit.includes(fold(name))));
}

/**
 * Crédito de desenvolvimento. O trecho depois do travessão (o curso responsável)
 * aparece em negrito e na cor da marca, para ficar em evidência.
 */
export function CreditText({ credit, className = '' }: { credit: string; className?: string }) {
  const cut = credit.indexOf(' — ');
  if (cut === -1) return <p className={className}>{credit}</p>;
  return (
    <p className={className}>
      {credit.slice(0, cut)} — <strong className="font-extrabold text-[#732281]">{credit.slice(cut + 3)}</strong>
    </p>
  );
}

/**
 * Faixa com os cursos da Faculdade correndo de lado. O conteúdo é repetido uma
 * vez para a rolagem não ter emenda; leitores de tela recebem a lista uma só vez.
 */
function CoursesTicker({ config }: { config: MassaConfig }) {
  const courses: MassaCourse[] = config.courses.map((c) => ({ name: c.name.trim(), url: c.url.trim() })).filter((c) => c.name);
  if (!courses.length) return null;
  const featured = highlightedCourses(config);
  const title = 'Cursos da Faculdade Donaduzzi';

  // Cada item abre a página do curso em outra aba (no APK, no navegador do aparelho).
  // A cópia que fecha a emenda da rolagem também é tocável, mas fica fora da leitura de tela e do teclado.
  const item = (label: string, url: string, className: string, hidden: boolean) =>
    isWebUrl(url) ? (
      <a
        key={label}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={hidden ? -1 : undefined}
        aria-label={hidden ? undefined : `${label} (abre o site em outra aba)`}
        onClick={(e) => {
          e.preventDefault();
          e.currentTarget.blur();
          void openExternal(url);
        }}
        className={`massa-ticker-item ${className}`}
      >
        {label}
      </a>
    ) : (
      <span key={label} className={`massa-ticker-item ${className}`}>
        {label}
      </span>
    );

  const run = (hidden: boolean) => (
    <span className="massa-ticker-run" aria-hidden={hidden || undefined}>
      {item(title, config.coursesUrl.trim(), 'massa-ticker-title', hidden)}
      {courses.map((c) => item(c.name, c.url, featured.has(c.name) ? 'massa-ticker-featured' : '', hidden))}
    </span>
  );
  return (
    <div className="massa-ticker" data-testid="massa-courses" role="group" aria-label={title}>
      {/* A velocidade acompanha o tamanho da lista: cerca de 4 s por curso. Ela corre sempre, mesmo durante e depois do toque. */}
      <div className="massa-ticker-track" style={{ animationDuration: `${Math.max(20, courses.length * 4)}s` }}>
        {run(false)}
        {run(true)}
      </div>
    </div>
  );
}

/**
 * Rodapé institucional das telas públicas: logotipo da Faculdade Donaduzzi, o
 * crédito do curso responsável e a faixa com os cursos. Pequeno, para não
 * competir com a Massa FM.
 */
export function MassaFooter({ config, className = '' }: { config: MassaConfig; className?: string }) {
  return (
    <footer data-testid="massa-footer" className={`flex shrink-0 flex-col bg-white text-[#14183a] ${className}`}>
      <div className="flex flex-wrap items-center justify-center gap-x-[1.2rem] gap-y-[0.1rem] px-[1.2rem] py-[0.2rem]">
        {/* Área de toque de pelo menos 48 px, mesmo com o logotipo pequeno. */}
        <FacultyCreditLogo config={config} imgClass="h-[1.6rem] w-auto max-w-[7rem] object-contain" linkClass="min-h-[max(2.4rem,48px)] px-[0.6rem]" />
        <CreditText credit={config.credit} className="text-center text-[0.72rem] font-medium leading-snug text-[#14183a]/85" />
      </div>
      <CoursesTicker config={config} />
    </footer>
  );
}
