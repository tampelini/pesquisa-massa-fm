/**
 * Script do Google Apps Script que recebe as participações e grava na planilha.
 * Fica aqui para o painel mostrar o texto pronto para copiar: cole em
 * Extensões → Apps Script da planilha e publique como "App da Web".
 *
 * - Só aceita envios com a senha combinada (TOKEN).
 * - Cada participação tem um id: reenvios não duplicam linhas.
 * - As perguntas viram colunas; perguntas novas ganham colunas novas no fim.
 */
export function sheetScript(token: string): string {
  return `// Pesquisa Massa FM — recebe as participações do totem e grava nesta planilha.
var TOKEN = ${JSON.stringify(token || 'TROQUE-ESTA-SENHA')};
var ABA = 'Participantes';
var FIXAS = ['id', 'data_hora', 'evento', 'pesquisa', 'telefone', 'aceita_comunicacoes', 'versao_consentimento', 'totem', 'recebido_em'];

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var dados = JSON.parse(e.postData.contents);
    if (dados.token !== TOKEN) return resposta({ ok: false, erro: 'senha' });

    var planilha = SpreadsheetApp.getActiveSpreadsheet();
    var aba = planilha.getSheetByName(ABA) || planilha.insertSheet(ABA);
    if (aba.getLastRow() === 0) {
      aba.appendRow(FIXAS);
      aba.setFrozenRows(1);
      aba.getRange(1, 1, 1, FIXAS.length).setFontWeight('bold');
    }
    var cabecalho = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0].map(String);
    var existentes = {};
    if (aba.getLastRow() > 1) {
      aba.getRange(2, 1, aba.getLastRow() - 1, 1).getValues().forEach(function (l) { existentes[l[0]] = true; });
    }

    var salvos = [];
    (dados.rows || []).forEach(function (r) {
      if (!r || !r.id) return;
      salvos.push(r.id);
      if (existentes[r.id]) return; // reenvio: já está na planilha
      existentes[r.id] = true;
      (r.respostas || []).forEach(function (a) {
        if (cabecalho.indexOf(a.pergunta) === -1) {
          cabecalho.push(a.pergunta);
          aba.getRange(1, cabecalho.length).setValue(a.pergunta).setFontWeight('bold');
        }
      });
      var linha = cabecalho.map(function () { return ''; });
      var fixos = {
        id: r.id, data_hora: r.data_hora, evento: r.evento, pesquisa: r.pesquisa, telefone: r.telefone,
        aceita_comunicacoes: r.aceita_comunicacoes, versao_consentimento: r.versao_consentimento,
        totem: dados.totem || '', recebido_em: Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss')
      };
      Object.keys(fixos).forEach(function (k) { var i = cabecalho.indexOf(k); if (i !== -1) linha[i] = fixos[k]; });
      (r.respostas || []).forEach(function (a) { linha[cabecalho.indexOf(a.pergunta)] = a.resposta; });
      var destino = aba.getRange(aba.getLastRow() + 1, 1, 1, linha.length);
      destino.setNumberFormat('@'); // texto puro: o telefone não vira número nem fórmula
      destino.setValues([linha]);
    });
    return resposta({ ok: true, salvos: salvos });
  } catch (erro) {
    return resposta({ ok: false, erro: String(erro) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return resposta({ ok: true, app: 'Pesquisa Massa FM' });
}

function resposta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
`;
}
