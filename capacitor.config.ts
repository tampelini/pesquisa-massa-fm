import type { CapacitorConfig } from '@capacitor/cli';

// appId é o identificador interno do pacote Android (não é uma URL).
// Pode ser alterado antes da primeira instalação definitiva.
const config: CapacitorConfig = {
  appId: 'br.edu.donaduzzi.pesquisamassa',
  appName: 'Pesquisa Massa FM',
  webDir: 'dist',
  android: {
    backgroundColor: '#f7a819',
    // Conteúdo 100% local: nada é carregado da internet.
    allowMixedContent: false,
  },
};

export default config;
