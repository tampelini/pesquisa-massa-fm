# Pesquisa Massa FM

Aplicativo de totem touchscreen para a **Rádio Massa FM Toledo 98.5** aplicar pesquisas em eventos. Funciona
**100% offline**, como **APK Android** ou como **PWA** no Chrome, em telas verticais e horizontais.

Desenvolvido pela Faculdade Donaduzzi — Curso de Ciência de Dados e Inteligência Artificial.

- React 18 + TypeScript + Vite + Tailwind CSS + Lucide
- IndexedDB (eventos, pesquisas, configurações e participantes, tudo no próprio aparelho)
- PWA com Service Worker (Workbox) e APK via Capacitor 8

## Fluxo do participante

1. **Início:** logotipo da rádio, chamada e botão COMEÇAR.
2. **Telefone e aceite:** a pessoa informa só o telefone com DDD (máscara e validação). Na mesma tela, em formato
   discreto, ficam a caixa de aceite obrigatória e a caixa opcional de comunicações, as duas desmarcadas. Sem a
   obrigatória não se avança.
3. **Perguntas:** uma por tela. A última tem o botão FINALIZAR.
4. **Agradecimento:** animação curta; depois de alguns segundos a tela é limpa e volta ao início.

Preenchimento abandonado é apagado após o tempo de inatividade configurado. O mesmo telefone não participa duas vezes
do mesmo evento. Se a gravação falhar, as respostas ficam na tela para tentar de novo.

O rodapé de todas as telas traz o logotipo da Faculdade Donaduzzi, o crédito com o curso responsável em negrito
(Ciência de Dados e Inteligência Artificial) e uma faixa em que os nomes de todos os cursos da Faculdade correm de
lado, com os dois cursos do crédito em destaque. Tocar no nome de um curso abre a página dele em
faculdadedonaduzzi.com.br, e o título da faixa abre a lista de cursos de graduação; a faixa corre sempre, sem parar ao ser tocada.
A lista de cursos e os links são editáveis no painel (uma linha por curso: `Nome | link`).

No canto superior, o logotipo da Massa FM abre <https://massa.com.br/massa-fm-toledo/>. No rodapé, o logotipo da
Faculdade Donaduzzi abre <https://tampelini.github.io/cd-ia-donaduzzi/>. Os dois abrem em outra aba (no APK, no
navegador do aparelho), sem fechar a pesquisa, e os links são editáveis no painel.

## Painel administrativo

- Acesso: toque **5 vezes em 3 segundos no canto superior esquerdo** da tela ou abra `…/#/admin`.
- **PIN padrão: `1234`. Troque-o na aba *Segurança* antes do primeiro evento.**
- A sessão fecha após 5 min sem uso; 5 PINs errados bloqueiam o acesso por 1 minuto.

Seções:

- **Eventos:** nome, descrição, local, datas de início e término, ativo/inativo e pesquisa vinculada. O botão *Usar no
  totem* define o evento (e, com ele, a pesquisa) em uso. Evento com participantes não pode ser excluído, só desativado.
- **Pesquisas e perguntas:** criar, duplicar e excluir pesquisas; criar, editar, excluir e reordenar perguntas; tipo de
  resposta (escolha única, múltipla escolha, texto livre); obrigatória ou opcional; ativa ou inativa; alternativas com
  adicionar, editar, excluir e reordenar. Vêm três perguntas de exemplo. Nada disso exige alterar o código.
- **Totem, textos e consentimento:** textos das telas, textos e **versão** do consentimento, links (Política de
  Privacidade, regulamento e os dois logotipos), tempo de retorno por inatividade, duração do agradecimento, logotipo
  da rádio e cores.
- **Participantes e resultados:** lista com data e hora, telefone, evento, pesquisa, respostas e consentimento; filtros
  por evento, pesquisa, período e resposta; busca por telefone; totais e percentuais por pergunta; exportação em CSV
  (`;`, UTF-8, abre no Excel) dos participantes e dos totais; **anonimizar** (apaga o telefone, mantém as respostas)
  ou **excluir** um cadastro.
- **Envio online:** liga o envio para uma planilha do Google Sheets, mostra a fila e o último envio.
- **Segurança:** troca do PIN.
- **Sobre o sistema:** créditos.

## Envio online (Google Sheets)

Opcional. Com ele ligado, cada participação continua sendo gravada primeiro no aparelho e depois é enviada para uma
planilha do Google Sheets, que fica no Google Drive de quem a criou. Sem internet, a participação fica numa fila e sobe
sozinha quando a conexão voltar (ao abrir o app, quando a rede volta e a cada 2 minutos). Reenvios não duplicam linhas.

Como preparar, uma vez (o painel mostra estes passos e o script pronto para copiar, em *Envio online*):

1. Crie uma planilha em branco na conta Google que vai guardar os dados.
2. Na planilha, abra *Extensões → Apps Script* e cole o script do painel (ele já vem com a senha de envio).
3. *Implantar → Nova implantação*, tipo *App da Web*, executar como *Eu*, acesso *Qualquer pessoa*. Autorize e copie o
   endereço terminado em `/exec`.
4. No painel, cole o endereço, confira a senha, dê um nome ao totem, salve e use *Testar conexão*.

Pontos de atenção:

- O endereço e a senha de envio ficam **só no aparelho** (nunca no código, que é público). Cada totem precisa ser
  configurado no próprio painel; todos podem escrever na mesma planilha, e a coluna `totem` diz de onde veio cada linha.
- O acesso "Qualquer pessoa" só permite chamar o script; ele só grava com a senha correta. A planilha continua privada.
- Os telefones vão para a conta Google dona da planilha: use uma conta da rádio e compartilhe só com quem precisa.
- O bloqueio de telefone repetido continua valendo por aparelho. Com dois totens, a mesma pessoa pode participar uma
  vez em cada; as repetições aparecem na planilha.
- Excluir ou anonimizar um cadastro no painel não altera a linha já enviada: apague-a na planilha também.
- Se o script for alterado, é preciso criar uma **nova versão** da implantação (*Implantar → Gerenciar implantações →
  Editar → Nova versão*); o endereço continua o mesmo.

## Dados pessoais (LGPD)

O único dado pessoal coletado é o **telefone**, sempre com consentimento registrado. Cada participação guarda: data e
hora, evento, pesquisa, telefone, respostas, versão e texto do consentimento aceito e se a pessoa autorizou
comunicações promocionais. Nenhum nome é pedido.

- A lista de participantes só existe no painel, atrás do PIN. Nenhum dado pessoal é escrito no console do navegador.
- **Por padrão, os dados ficam somente no aparelho.** Sem o Envio online ligado, não há sincronização: com mais de um
  totem, exporte o CSV de cada um. Desinstalar o app ou limpar os dados do navegador apaga os participantes, então exporte ao fim de cada evento.
- **O PIN é uma barreira contra o público, não uma proteção forte.** Mantenha o totem sob guarda da equipe e trate os
  arquivos CSV exportados como confidenciais.
- O link da Política de Privacidade abre um QR Code no totem, para a pessoa ler no próprio celular mesmo sem internet
  no aparelho.

## Identidade visual

A Massa FM é a identidade dominante. As cores foram lidas do logotipo oficial da rádio: laranja `#f7a819` no fundo das
telas (o logotipo se funde a ele), roxo `#732281` nos botões e títulos e azul `#0059db` na seleção e nos detalhes.
Podem ser trocadas no painel pelos códigos do manual da marca.

- **Logotipo da rádio:** o arquivo oficial enviado pela Massa FM está em `public/assets/logo-massa-fm-toledo.png`
  (512 × 512). Aparece inteiro, sem recorte nem distorção. Para trocar, envie outro arquivo oficial em *Totem, textos
  e consentimento → Logotipo oficial*.
- **Ícones do app:** gerados a partir do mesmo logotipo por `scripts/generate_icons.py` (só redimensiona e centraliza
  sobre o laranja). Para refazer: `npm run icons` (precisa de Python com Pillow).
- **Faculdade Donaduzzi:** aparece apenas no rodapé, pequena, com o crédito de desenvolvimento.

Fontes: **Sora** nos títulos e **Inter** no texto, ambas embutidas (funcionam offline).

## Scripts

| Comando | O que faz |
|---|---|
| `npm install` | instala as dependências (uma vez) |
| `npm run dev` | servidor de desenvolvimento (`http://localhost:5173`) |
| `npm run build` | verificação de tipos + build de produção em `dist/` |
| `npm run preview` | serve o build em `http://localhost:4173` (com Service Worker) |
| `npm test` | testes automatizados (Vitest) |
| `npm run verify:offline` | confere se o build pré-cacheia tudo o que o modo offline precisa |
| `npm run android:apk` | build web + sincronização + APK de depuração |
| `npm run android:open` | abre o projeto Android no Android Studio |

Requisitos: Node 20 ou mais recente. Para o APK: Android SDK (Android Studio) e **JDK 21**.

## Gerar o APK

```bash
# Windows (Git Bash). Aponte JAVA_HOME para um JDK 21.
export JAVA_HOME="$HOME/.jdks/jbr-21.0.11"
npm run android:apk
```

O arquivo sai em `android/app/build/outputs/apk/debug/app-debug.apk`. O APK de cada versão também fica para
download em <https://github.com/tampelini/pesquisa-massa-fm/releases/latest>.

> O Gradle 8.14 usado pelo Capacitor não roda com o JDK 25 embutido no Android Studio mais recente. Use um JDK 21
> (em Android Studio: *Settings → Build Tools → Gradle → Gradle JDK*).
>
> Se o projeto estiver numa pasta sincronizada (OneDrive, Google Drive), a sincronização pode travar arquivos da pasta
> de build e o Gradle falha com "Unable to delete directory". Apague `android/app/build` e rode de novo, ou mova o
> projeto para fora da pasta sincronizada.

`android/local.properties` aponta para o SDK da máquina (`sdk.dir=...`) e não vai para o repositório. Em outro
computador, abra o projeto no Android Studio para criá-lo.

**APK de depuração x APK de versão:** o `app-debug.apk` é assinado com a chave de depuração e serve para instalar
manualmente nos totens. Para distribuir pela Play Store ou por MDM, gere uma versão assinada em
*Android Studio → Build → Generate Signed App Bundle / APK* e guarde a chave em local seguro.

### Instalar no totem

1. No Android, habilite *Configurações → Segurança → Instalar apps desconhecidos* para o gerenciador de arquivos.
2. Copie o `app-debug.apk` (cabo USB, pendrive ou e-mail) e toque nele para instalar. Ou, com depuração USB:
   `adb install -r app-debug.apk`.
3. Abra **Pesquisa Massa FM**. O app abre em tela cheia, com a tela sempre ligada e o botão "voltar" desativado, e
   acompanha a orientação do aparelho (vertical ou horizontal).

Atualizar = instalar um APK mais novo por cima (mantém os dados). Antes, aumente `versionCode` em
`android/app/build.gradle`. Desinstalar o app **apaga os participantes** (exporte antes).

## Modo quiosque (importante)

Nenhum app ou página web consegue, sozinho, impedir que o público saia dele. Para bloquear o totem:

- **Fixação de tela (qualquer Android):** *Configurações → Segurança → Fixar app*. Abra a Pesquisa Massa FM, toque no
  ícone do app na tela de recentes e escolha *Fixar*. Para sair é preciso o gesto/PIN do aparelho.
- **Quiosque gerenciado (recomendado em eventos):** um MDM em modo *dedicated device / single-app kiosk* com o pacote
  `br.edu.donaduzzi.pesquisamassa`.
- Com a fixação de tela ou o quiosque ativos, o sistema pode impedir que os logotipos abram o navegador; nesse caso o
  toque não faz nada.
- Desative notificações, suspensão automática e atualizações automáticas do sistema durante eventos.

## Versão web / PWA

Publicada gratuitamente no **GitHub Pages**: <https://tampelini.github.io/pesquisa-massa-fm/> (painel: `…/#/admin`).
Cada `git push` na branch `main` roda os testes, gera o build e publica a nova versão
(`.github/workflows/deploy.yml`).

Os dados ficam **em cada aparelho**, não no servidor: o site só entrega os arquivos do aplicativo. No Chrome do
Android, use *Menu → Instalar app*. Depois de aberto uma vez com internet, funciona offline; novas versões são
baixadas em segundo plano e só são aplicadas com a pesquisa na tela inicial, nunca no meio de uma participação.

## Estrutura

```
src/
  core/        tipos, dados padrão, validações e armazenamento (eventos, pesquisas, participantes, CSV)
  totem/       telas do participante, logotipos e rodapé de créditos
  admin/       painel administrativo (login por PIN e seções)
  services/    IndexedDB, PIN, som, PWA, arquivos, links externos
  hooks/       inatividade, tela cheia e acesso secreto ao painel
  components/  QR Code e tratamento de erros
  test/        testes automatizados
android/       projeto nativo (Capacitor)
scripts/       verificação offline e geração de ícones
```

## Acessibilidade e desempenho

- Interface em `rem` proporcional à tela: conferida em 1080 × 1920, 768 × 1024, 1920 × 1080 e 1280 × 800, sem rolagem
  com as perguntas padrão. Com muitas alternativas ou textos longos, a área central rola sem cobrir o rodapé.
- Áreas de toque de pelo menos 48 px, foco visível, erros indicados por texto (não só por cor) e rótulos para leitores
  de tela. Respeita "reduzir movimento" do sistema.

## Testes

`npm test` roda 41 testes: máscara e validação de telefone, identidade e créditos (logotipos, links e faixa de cursos), fluxo completo
do participante, aceite obrigatório, telefone duplicado por evento, falha de gravação, inatividade, tipos de pergunta,
filtros, totais, CSV, anonimização, PIN, as seções do painel e o envio online (fila, falta de internet, senha errada,
reenvio sem duplicar). `npm run verify:offline` confere o pré-cache do Service
Worker.
