/* Gera dados/atualizacoes.js a partir de um ou mais .docx "Atualizações dos Sistemas" (requer Node).
   Uso: node tools/gera_atualizacoes.js "Atualizacoes 02.10.2026.docx" [outro.docx ...]
   Documentos já existentes no arquivo são mantidos; o de mesma data é substituído. */
'use strict';
const fs = require('fs');
const path = require('path');
const XLSX = require('../lib/xlsx.full.min.js');
const Leitor = require('../js/atualizacoes.js');

const destino = path.join(__dirname, '..', 'dados', 'atualizacoes.js');
let docs = [];
if (fs.existsSync(destino)) {
  const s = fs.readFileSync(destino, 'utf8');
  const i = s.indexOf('[');
  if (i >= 0) docs = JSON.parse(s.slice(i, s.lastIndexOf(']') + 1));
}
const arquivos = process.argv.slice(2);
if (!arquivos.length) { console.error('Informe o(s) arquivo(s) .docx.'); process.exit(1); }
arquivos.forEach((a) => {
  const doc = Leitor.lerDocx(new Uint8Array(fs.readFileSync(a)), path.basename(a), XLSX);
  docs = docs.filter((d) => d.id !== doc.id);
  docs.push(doc);
  const itens = doc.sistemas.reduce((n, s) => n + s.itens.length, 0);
  console.log(`${path.basename(a)}: ${doc.data || 'sem data'} · ${doc.sistemas.length} sistemas · ${itens} itens`);
});
docs.sort((a, b) => String(b.data).localeCompare(String(a.data)));
fs.writeFileSync(destino, `/* Gerado por tools/gera_atualizacoes.js a partir do documento "Atualizações dos Sistemas". */\nwindow.DADOS_ATUALIZACOES = ${JSON.stringify(docs)};\n`);
console.log(`Gravado: ${destino}`);
