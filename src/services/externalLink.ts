/*
 * Abre um site externo (ex.: site da rádio ou do curso) de forma confiável:
 *  - no APK: navegador interno do Android (Custom Tab) por cima da pesquisa;
 *    ao fechá-lo, a pessoa volta direto à pesquisa;
 *  - no navegador: nova aba; se ela for bloqueada (navegadores de quiosque,
 *    bloqueador de pop-ups, navegadores embutidos), abre na mesma aba.
 */

import { Capacitor } from '@capacitor/core';

export async function openExternal(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url });
      return;
    } catch {
      // Sem o plugin: segue para a navegação comum.
    }
  }
  let win: Window | null = null;
  try {
    win = window.open(url, '_blank');
  } catch {
    win = null;
  }
  if (win) {
    try {
      win.opener = null;
    } catch {
      /* ignorado */
    }
    return;
  }
  window.location.assign(url);
}
