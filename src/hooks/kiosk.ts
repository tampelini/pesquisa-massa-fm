import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';

export function enterFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' })
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('portrait'))
    .catch(() => {});
}

/** Tela cheia sem travar a orientação (experiências que aceitam vertical e horizontal). */
export function enterFullscreenAnyOrientation() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}

/**
 * Toques rápidos no canto superior esquerdo abrem o acesso administrativo (com PIN).
 * Detectado pela posição do toque, sem camada por cima: o logotipo, que fica nesse
 * canto em algumas telas, continua tocável.
 */
export function useSecretCorner(taps = 5, windowMs = 3000, sizeRem = 4.5) {
  const hits = useRef<number[]>([]);
  return useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const x = (Number(e.clientX) || 0) - box.left;
    const y = (Number(e.clientY) || 0) - box.top;
    if (x > sizeRem * rem || y > sizeRem * rem) return;
    const now = Date.now();
    hits.current = [...hits.current.filter((t) => now - t < windowMs), now];
    if (hits.current.length >= taps) {
      hits.current = [];
      window.location.hash = '#/admin';
    }
  }, [taps, windowMs, sizeRem]);
}
