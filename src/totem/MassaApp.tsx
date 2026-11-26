import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, ExternalLink, PartyPopper, X } from 'lucide-react';
import { useIdle } from '../hooks/useIdle';
import { enterFullscreenAnyOrientation, useSecretCorner } from '../hooks/kiosk';
import { openExternal } from '../services/externalLink';
import { playSound, unlockAudio } from '../services/sound';
import { applyUpdate, onUpdateAvailable } from '../services/pwa';
import { QrCode } from '../components/QrCode';
import { MassaFooter, MassaLogo, massaThemeStyle } from './MassaBrand';
import { DuplicatePhoneError, phoneAlreadyInEvent, resolveActive, submitParticipation, useMassa } from '../core/store';
import { isAnswered, isWebUrl, maskPhone, missingRequired, phoneError } from '../core/validation';
import { syncPending } from '../core/sync';
import type { MassaDraftAnswers, MassaQuestion } from '../core/types';

type Phase = 'start' | 'identify' | 'questions' | 'thanks';

const DUPLICATE_MESSAGE = 'Este telefone já participou desta pesquisa neste evento. Obrigado pelo carinho! Cada pessoa participa uma vez.';
const SAVE_ERROR_MESSAGE = 'Não foi possível salvar agora. Seus dados continuam guardados: toque em FINALIZAR para tentar de novo.';

interface Draft {
  phone: string;
  answers: MassaDraftAnswers;
  consent: boolean;
  marketing: boolean;
}
// Consentimentos sempre começam desmarcados.
const emptyDraft = (): Draft => ({ phone: '', answers: {}, consent: false, marketing: false });

/**
 * Caixa de aceite discreta: texto pequeno, sem cartão. O texto todo é clicável e a
 * área de toque continua grande. Sempre começa desmarcada.
 */
function CheckRow({ checked, onChange, children, testId }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className="flex min-h-[max(2.4rem,48px)] w-full items-start gap-[0.7rem] rounded-[0.8rem] px-[0.3rem] py-[0.25rem] text-left active:bg-[#eef1fb]"
    >
      <span className="massa-check mt-[0.05rem] h-[1.9rem] w-[1.9rem] rounded-[0.4rem]">
        {checked && <Check aria-hidden="true" className="h-[1.4rem] w-[1.4rem]" strokeWidth={3.5} />}
      </span>
      <span className="text-[0.82rem] font-medium leading-snug text-[#3c4270]">{children}</span>
    </button>
  );
}

function QuestionStep({ question, answers, onChange }: { question: MassaQuestion; answers: MassaDraftAnswers; onChange: (value: string[] | string) => void }) {
  const current = answers[question.id];
  if (question.type === 'text') {
    return (
      <textarea
        className="massa-input min-h-[9rem] py-[0.9rem] leading-snug"
        aria-labelledby="massa-question"
        maxLength={300}
        placeholder="Escreva aqui"
        value={typeof current === 'string' ? current : ''}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  const selected = Array.isArray(current) ? current : [];
  const multiple = question.type === 'multiple';
  const options = question.options.filter((o) => o.text.trim());
  return (
    <div role={multiple ? 'group' : 'radiogroup'} aria-labelledby="massa-question" className={`grid ${options.length > 5 ? 'gap-[0.5rem]' : 'gap-[0.7rem]'} ${options.length > 2 ? 'landscape:grid-cols-2' : ''}`}>
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={on}
            className={`massa-option ${options.length > 5 ? 'min-h-[3.7rem] py-[0.4rem]' : ''}`}
            onClick={() => {
              playSound('next');
              if (multiple) onChange(on ? selected.filter((id) => id !== o.id) : [...selected, o.id]);
              else onChange([o.id]);
            }}
          >
            <span className={`massa-check ${multiple ? 'rounded-[0.5rem]' : 'rounded-full'}`}>
              {on && <Check aria-hidden="true" className="h-[1.6rem] w-[1.6rem]" strokeWidth={3.5} />}
            </span>
            <span className="min-w-0 flex-1">{o.text}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Link exibido como QR Code (o participante lê no próprio celular) e botão para abrir. */
function LinkDialog({ label, url, onClose }: { label: string; url: string; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/65 p-[1.5rem]" role="dialog" aria-modal="true" aria-label={label}>
      <div className="massa-card flex max-h-full w-full max-w-[30rem] flex-col items-center gap-[1rem] overflow-y-auto p-[1.6rem] text-center">
        <h2 className="font-display text-[1.7rem] font-extrabold">{label}</h2>
        <p className="text-[1.1rem]">Aponte a câmera do seu celular para ler o documento completo.</p>
        <QrCode value={url} className="h-[13rem] w-[13rem]" />
        <p className="break-all text-[0.95rem] font-semibold text-[#3c4270]">{url}</p>
        <div className="flex w-full flex-wrap justify-center gap-[0.8rem]">
          <button type="button" className="massa-btn min-h-[3.6rem] flex-1 text-[1.2rem]" onClick={onClose}>
            <X aria-hidden="true" className="h-[1.5rem] w-[1.5rem]" /> FECHAR
          </button>
          <button
            type="button"
            className="inline-flex min-h-[3.6rem] flex-1 items-center justify-center gap-[0.5rem] rounded-full border-[0.15rem] border-[color:var(--m-blue)] px-[1.2rem] text-[1.1rem] font-bold text-[color:var(--m-blue)]"
            onClick={() => void openExternal(url)}
          >
            <ExternalLink aria-hidden="true" className="h-[1.3rem] w-[1.3rem]" /> Abrir aqui
          </button>
        </div>
      </div>
    </div>
  );
}

function Burst() {
  const colors = ['var(--m-navy)', '#fff', 'var(--m-blue)', '#fff3d6'];
  return (
    <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2">
      {Array.from({ length: 22 }, (_, i) => {
        const angle = (i / 22) * Math.PI * 2;
        const dist = 9 + (i % 4) * 3;
        return (
          <span
            key={i}
            className="massa-burst absolute h-[0.9rem] w-[0.9rem] rounded-full"
            style={{ background: colors[i % colors.length], '--dx': `${Math.cos(angle) * dist}rem`, '--dy': `${Math.sin(angle) * dist}rem`, animationDelay: `${(i % 5) * 0.05}s` } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}

export function MassaApp() {
  const massa = useMassa();
  const { config } = massa;
  const active = useMemo(() => resolveActive(massa), [massa]);
  const questions = active?.questions ?? [];

  const [phase, setPhase] = useState<Phase>('start');
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [touched, setTouched] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ label: string; url: string } | null>(null);
  const secretTap = useSecretCorner();
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = `${config.title} — ${config.stationName}`;
  }, [config.title, config.stationName]);

  // Atualizações do aplicativo só são aplicadas na tela inicial, nunca no meio de uma participação.
  const updatePending = useRef(false);
  useEffect(() => onUpdateAvailable((a) => (updatePending.current = a)), []);
  useEffect(() => {
    if (phase === 'start' && updatePending.current) {
      const t = window.setTimeout(applyUpdate, 1500);
      return () => window.clearTimeout(t);
    }
  }, [phase]);

  // Limpa tudo: nenhum dado do participante anterior fica na tela ou na memória.
  const reset = useCallback(() => {
    setDraft(emptyDraft());
    setTouched(false);
    setIndex(0);
    setMessage(null);
    setBusy(false);
    setLink(null);
    setPhase('start');
  }, []);

  // Abandono: volta ao início após o tempo de inatividade configurado.
  useIdle(config.idleSeconds * 1000, reset, phase !== 'start' && phase !== 'thanks', `${phase}-${index}`);

  // Agradecimento: volta sozinho ao início, pronto para a próxima pessoa.
  useEffect(() => {
    if (phase !== 'thanks') return;
    const t = window.setTimeout(reset, Math.max(2, config.thanksSeconds) * 1000);
    return () => window.clearTimeout(t);
  }, [phase, config.thanksSeconds, reset]);

  useEffect(() => {
    mainRef.current?.scrollTo?.({ top: 0 });
  }, [phase, index]);

  // A identificação é só o telefone: nenhum nome é pedido.
  const phoneErr = phoneError(draft.phone);
  const identified = !phoneErr;
  const canFinish = identified && missingRequired(questions, draft.answers).length === 0 && draft.consent && !busy && !!active;

  const go = (next: Phase) => {
    setMessage(null);
    setPhase(next);
  };

  const start = () => {
    if (!active) return;
    unlockAudio();
    enterFullscreenAnyOrientation();
    playSound('start');
    go('identify');
  };

  const finish = async () => {
    if (!canFinish || !active) return;
    setBusy(true);
    setMessage(null);
    try {
      await submitParticipation({ active, phone: draft.phone, answers: draft.answers, consent: config.consent, marketingOptIn: draft.marketing });
      playSound('finish');
      // Já gravada no aparelho: o envio para a planilha roda por fora e não segura a pessoa.
      void syncPending(config.sync).catch(() => {});
      // Os dados saem da tela assim que são gravados.
      setDraft(emptyDraft());
      setTouched(false);
      setPhase('thanks');
    } catch (err) {
      // Nunca registra dados pessoais no console: só a mensagem amigável na tela.
      setMessage(err instanceof DuplicatePhoneError ? DUPLICATE_MESSAGE : SAVE_ERROR_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  // Identificação e aceite ficam na mesma tela: sem o aceite, ninguém avança.
  const afterIdentify = async () => {
    setTouched(true);
    if (!identified || !draft.consent || !active || busy) return;
    if (!questions.length) return finish();
    setBusy(true);
    try {
      // Evita que a pessoa responda tudo para só no fim saber que já participou.
      if (await phoneAlreadyInEvent(active.event.id, draft.phone)) {
        setMessage(DUPLICATE_MESSAGE);
        return;
      }
    } catch {
      // Sem conseguir consultar agora: a checagem é refeita ao finalizar.
    } finally {
      setBusy(false);
    }
    setIndex(0);
    go('questions');
  };

  const question = questions[index];
  const isLastQuestion = index >= questions.length - 1;
  const nextQuestion = () => {
    if (isLastQuestion) return void finish();
    playSound('next');
    setMessage(null);
    setIndex(index + 1);
  };
  const back = () => {
    if (phase === 'identify') reset();
    else if (phase === 'questions') index > 0 ? (setMessage(null), setIndex(index - 1)) : go('identify');
  };

  const header = (stepLabel: string) => (
    <div className="flex shrink-0 items-center justify-between gap-[1rem] px-[1.6rem] pt-[0.8rem]">
      <button type="button" onClick={back} className="massa-btn massa-btn-ghost min-h-[3.4rem] px-[1.3rem] text-[1.1rem]" aria-label="Voltar">
        <ArrowLeft aria-hidden="true" className="h-[1.5rem] w-[1.5rem]" /> Voltar
      </button>
      <p className="font-display text-[1.1rem] font-bold uppercase tracking-[0.14em]">{stepLabel}</p>
      <MassaLogo config={config} size="sm" />
    </div>
  );

  const alert = message && (
    <p role="alert" className="rounded-[1rem] border-[0.15rem] border-[color:var(--m-red)] bg-[#fff1f2] px-[1.1rem] py-[0.8rem] text-[1.15rem] font-semibold text-[#7a0d17]">
      {message}
    </p>
  );

  const privacyOk = isWebUrl(config.consent.privacyUrl);
  const regulationOk = isWebUrl(config.consent.regulationUrl);

  return (
    <div className="massa-root" style={massaThemeStyle(config)} onContextMenu={(e) => e.preventDefault()} onPointerDownCapture={secretTap} data-phase={phase}>
      {phase === 'start' && (
        <main ref={mainRef} className="massa-main items-center justify-center gap-[0.6rem] px-[2rem] py-[1.5rem] text-center landscape:flex-row landscape:gap-[3rem] landscape:text-left">
          <div className="massa-pop flex shrink-0 justify-center">
            <MassaLogo config={config} />
          </div>
          <div className="flex max-w-[34rem] flex-col items-center gap-[1.4rem] landscape:items-start">
            <h1 className="font-display text-[3.4rem] font-extrabold leading-[1.02] tracking-tight text-[color:var(--m-navy)]">{config.title}</h1>
            <p className="text-[1.6rem] font-semibold leading-snug">{config.intro}</p>
            <button type="button" className="massa-btn mt-[0.6rem] min-h-[6rem] px-[4rem] text-[2.4rem]" onClick={start} disabled={!massa.ready || !active}>
              COMEÇAR
            </button>
            {massa.ready && !active && (
              <p role="status" className="rounded-[1rem] bg-white/70 px-[1.2rem] py-[0.7rem] text-[1.1rem] font-semibold">
                Pesquisa indisponível no momento. No painel administrativo, escolha um evento ativo com uma pesquisa vinculada.
              </p>
            )}
          </div>
        </main>
      )}

      {phase === 'identify' && (
        <>
          {header('Seu telefone')}
          <main ref={mainRef} className="massa-main items-center px-[1.6rem] py-[1.2rem] landscape:py-[0.5rem]">
            <form
              className="massa-card my-auto flex w-full max-w-[40rem] flex-col gap-[0.9rem] p-[1.7rem] landscape:max-w-[78rem] landscape:p-[1.5rem]"
              noValidate
              autoComplete="off"
              onSubmit={(e) => {
                e.preventDefault();
                void afterIdentify();
              }}
            >
              <h1 className="font-display text-[2rem] font-extrabold leading-tight text-[color:var(--m-navy)]">Qual é o seu telefone?</h1>
              <div className="grid gap-[0.7rem] landscape:grid-cols-2 landscape:gap-x-[2rem]">
              <div className="flex min-w-0 flex-col gap-[0.3rem]">
              <label className="flex flex-col gap-[0.4rem]">
                <span className="text-[1.25rem] font-bold">Telefone com DDD (de preferência WhatsApp)</span>
                <input
                  className="massa-input min-h-[5rem] text-[2rem] tracking-wide"
                  name="massa-telefone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="(45) 99999-9999"
                  enterKeyHint="done"
                  value={maskPhone(draft.phone)}
                  aria-invalid={touched && !!phoneErr}
                  aria-describedby="massa-phone-error"
                  onChange={(e) => {
                    setMessage(null);
                    setDraft((d) => ({ ...d, phone: e.target.value }));
                  }}
                  onBlur={() => setTouched(true)}
                />
                <span id="massa-phone-error" role="status" className="min-h-[1.2rem] text-[0.95rem] font-semibold leading-tight text-[#a3111f]">
                  {touched ? phoneErr : ''}
                </span>
              </label>
              </div>
              <div className="flex min-w-0 flex-col gap-[0.5rem] landscape:justify-end">
                <div className="flex flex-col gap-[0.1rem] border-t border-[#d5d9ee] pt-[0.5rem] landscape:border-t-0 landscape:pt-0">
                  <CheckRow checked={draft.consent} onChange={(v) => setDraft((d) => ({ ...d, consent: v }))} testId="massa-consent">
                    {config.consent.requiredText} <strong className="whitespace-nowrap text-[#a3111f]">(obrigatório)</strong>
                  </CheckRow>
                  {(privacyOk || regulationOk) && (
                    <div className="flex flex-wrap gap-x-[1.2rem] pl-[2.9rem]">
                      {privacyOk && (
                        <a
                          href={config.consent.privacyUrl.trim()}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            e.preventDefault();
                            setLink({ label: config.consent.privacyLabel, url: config.consent.privacyUrl.trim() });
                          }}
                          className="inline-flex min-h-[max(2rem,48px)] items-center text-[0.86rem] font-bold text-[color:var(--m-blue)] underline underline-offset-4"
                        >
                          Ler a {config.consent.privacyLabel}
                        </a>
                      )}
                      {regulationOk && (
                        <a
                          href={config.consent.regulationUrl.trim()}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            e.preventDefault();
                            setLink({ label: config.consent.regulationLabel, url: config.consent.regulationUrl.trim() });
                          }}
                          className="inline-flex min-h-[max(2rem,48px)] items-center text-[0.86rem] font-bold text-[color:var(--m-blue)] underline underline-offset-4"
                        >
                          Ler o {config.consent.regulationLabel}
                        </a>
                      )}
                    </div>
                  )}
                  <CheckRow checked={draft.marketing} onChange={(v) => setDraft((d) => ({ ...d, marketing: v }))} testId="massa-marketing">
                    {config.consent.optionalText} <span className="whitespace-nowrap font-semibold">(opcional)</span>
                  </CheckRow>
                </div>
                {alert}
                <button type="submit" className="massa-btn w-full" disabled={!identified || !draft.consent || busy}>
                  {busy ? 'AGUARDE…' : questions.length ? 'CONTINUAR' : 'FINALIZAR'}
                </button>
                {identified && !draft.consent && (
                  <span role="status" className="text-center text-[0.9rem] font-semibold leading-tight text-[#4a5080]">
                    Marque a caixa de aceite para continuar.
                  </span>
                )}
              </div>
              </div>
            </form>
          </main>
        </>
      )}

      {phase === 'questions' && question && (
        <>
          {header(`Pergunta ${index + 1} de ${questions.length}`)}
          <main ref={mainRef} className="massa-main items-center px-[1.6rem] py-[1.2rem] landscape:py-[0.5rem]">
            <section className="massa-card my-auto flex w-full max-w-[46rem] flex-col gap-[1.1rem] p-[1.6rem] landscape:max-w-[62rem] landscape:gap-[0.8rem] landscape:p-[1.2rem]" key={question.id}>
              <div className="h-[0.6rem] overflow-hidden rounded-full bg-[#e3e6f6]" role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={index + 1}>
                <div className="h-full rounded-full bg-[color:var(--m-blue)] transition-[width] duration-300" style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
              </div>
              <h1 id="massa-question" className="font-display text-[2rem] font-extrabold leading-tight text-[color:var(--m-navy)]">
                {question.prompt}
              </h1>
              <p className="-mt-[0.6rem] text-[1.05rem] font-semibold text-[#4a5080]">
                {question.type === 'multiple' ? 'Você pode marcar mais de uma opção.' : question.type === 'text' ? 'Resposta livre.' : 'Escolha uma opção.'}
                {question.required ? '' : ' (opcional)'}
              </p>
              <QuestionStep question={question} answers={draft.answers} onChange={(v) => setDraft((d) => ({ ...d, answers: { ...d.answers, [question.id]: v } }))} />
              {alert}
              <button type="button" className="massa-btn w-full" onClick={nextQuestion} disabled={busy || (question.required && !isAnswered(question, draft.answers))}>
                {busy ? 'SALVANDO…' : isLastQuestion ? 'FINALIZAR' : !question.required && !isAnswered(question, draft.answers) ? 'PULAR' : 'CONTINUAR'}
              </button>
            </section>
          </main>
        </>
      )}

      {phase === 'thanks' && (
        <main ref={mainRef} className="massa-main items-center justify-center gap-[1.4rem] px-[2rem] py-[2rem] text-center" aria-live="polite">
          <div className="relative">
            <Burst />
            <div className="massa-pop flex h-[10rem] w-[10rem] items-center justify-center rounded-full bg-[color:var(--m-navy)] text-white shadow-[0_1rem_2.5rem_rgb(0_0_0/0.3)]">
              <PartyPopper aria-hidden="true" className="h-[5.5rem] w-[5.5rem]" strokeWidth={2.2} />
            </div>
          </div>
          <h1 className="font-display text-[3.2rem] font-extrabold leading-tight text-[color:var(--m-navy)]">{config.thanksTitle}</h1>
          <p className="max-w-[32rem] text-[1.7rem] font-semibold leading-snug">{config.thanksText}</p>
          <MassaLogo config={config} size="sm" />
          <button type="button" className="massa-btn massa-btn-ghost mt-[0.4rem] min-h-[3.6rem] text-[1.2rem]" onClick={reset}>
            Concluir
          </button>
        </main>
      )}

      <MassaFooter config={config} />
      {link && <LinkDialog label={link.label} url={link.url} onClose={() => setLink(null)} />}
    </div>
  );
}
