/**
 * CÓDIGO DO GOOGLE APPS SCRIPT — "API" da página de Legislação
 * -------------------------------------------------------------
 * Este código transforma sua planilha Google em um banco de dados
 * que o site de Legislação (index.html) consegue ler e escrever.
 *
 * COMO USAR (veja o guia completo em GUIA_GOOGLE_SHEETS.md):
 * 1. Crie uma planilha nova em sheets.google.com
 * 2. Menu Extensões > Apps Script
 * 3. Apague o código de exemplo e cole TODO este arquivo
 * 4. Salve o projeto
 * 5. Implantar > Nova implantação > tipo "App da Web"
 *      - Executar como: Eu
 *      - Quem pode acessar: Qualquer pessoa
 * 6. Copie a URL gerada (termina em /exec) e cole no app,
 *    no menu "⋯" > "Conectar ao Google Sheets"
 */

function doPost(e) {
  var result;
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    var sheetName = body.sheet || 'leis';
    var sheet = getOrCreateSheet_(sheetName);

    if (action === 'list') {
      result = { items: listItems_(sheet) };
    } else if (action === 'save') {
      result = { ok: saveItem_(sheet, body.item) };
    } else if (action === 'delete') {
      result = { ok: deleteItem_(sheet, body.id) };
    } else {
      result = { error: 'Ação desconhecida: ' + action };
    }
  } catch (err) {
    result = { error: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  // Só para testar se a implantação está no ar (abra a URL /exec no navegador).
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    mensagem: 'API de Legislação está funcionando. Use POST para ler/escrever dados.'
  })).setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(['id', 'titulo', 'categoria', 'status', 'curtidas', 'favorito', 'atualizado_em', 'dados_json']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findRowById_(sheet, id) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) return i + 1; // linha (1-indexada)
  }
  return -1;
}

function listItems_(sheet) {
  var data = sheet.getDataRange().getValues();
  var items = [];
  for (var i = 1; i < data.length; i++) {
    var raw = data[i][7];
    if (!raw) continue;
    try {
      items.push(JSON.parse(raw));
    } catch (err) {
      // ignora linhas com JSON inválido
    }
  }
  return items;
}

function saveItem_(sheet, item) {
  if (!item || !item.id) return false;
  var row = findRowById_(sheet, item.id);
  var values = [
    item.id,
    item.title || item.text || '',
    item.category || '',
    item.status || '',
    item.likes || 0,
    item.favorited ? 'sim' : 'nao',
    new Date().toISOString(),
    JSON.stringify(item)
  ];
  if (row === -1) {
    sheet.appendRow(values);
  } else {
    sheet.getRange(row, 1, 1, values.length).setValues([values]);
  }
  return true;
}

function deleteItem_(sheet, id) {
  var row = findRowById_(sheet, id);
  if (row > -1) sheet.deleteRow(row);
  return true;
}
