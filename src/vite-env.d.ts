/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Endereço do App da Web da planilha, embutido na geração do app (opcional). */
  readonly VITE_SYNC_URL?: string;
  /** Senha de envio combinada com o script da planilha (opcional). */
  readonly VITE_SYNC_TOKEN?: string;
}
