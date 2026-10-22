/* Base de Apoio — leitura do documento "Atualizações dos Sistemas" (.docx).
   Cada "Título 1" é um sistema com a versão; cada item termina no código do chamado, ex.: (AGW-775).
   Usado no navegador (importar um .docx novo) e no Node (tools/gera_atualizacoes.js). */
'use strict';

const LeitorAtualizacoes = (() => {
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const desescapar = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#'
    ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m));
  const RX_CHAMADO = /\(\s*([A-Z][A-Z0-9]*\s?-\s?\d+(?:-[A-Z0-9]+)?)\s*\)/g; // (AGW-775), (SRE -121), (SCEP-4-B)
  const TEM_CHAMADO = /\(\s*[A-Z][A-Z0-9]*\s?-\s?\d+(?:-[A-Z0-9]+)?\s*\)/;
  const RX_DATA = /\b(\d{2})\/(\d{2})\/(\d{4})\b/;

  // parágrafos do document.xml: estilo, se é item de lista e o texto (tabulação vira espaço)
  function paragrafos(xml) {
    const corpo = xml.slice(xml.indexOf('<w:body'));
    return (corpo.match(/<w:p(?:\s[^>]*)?\/>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) || []).map((p) => {
      const estilo = (/<w:pStyle w:val="([^"]+)"/.exec(p) || [])[1] || '';
      const texto = desescapar((p.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>|<w:tab\/>|<w:br\/>/g) || [])
        .map((t) => (t === '<w:tab/>' ? ' ' : t === '<w:br/>' ? '\n' : t.replace(/<[^>]+>/g, ''))).join(''));
      return { estilo, lista: p.includes('<w:numPr>'), texto: texto.replace(/[  ]+/g, ' ').trim() };
    });
  }

  const ehTitulo = (e) => /^(Ttulo1|Titulo1|Heading1)$/i.test(e) || /^(T[ií]tulo|Heading) ?1$/i.test(e);
  const ehSumario = (e) => /^(Sumrio|Sumario|TOC)\d*$/i.test(e);

  // "Sistema ProSindW 3.6.57.0 à 3.6.57.17" -> { nome: 'ProSindW', versao: '3.6.57.0 a 3.6.57.17' }
  function sistemaDe(titulo) {
    const t = titulo.replace(/\s+/g, ' ').trim();
    const m = /^(.*?)\s+(\d+(?:\.\d+)+(?:\s*(?:a|à|até|-)\s*\d+(?:\.\d+)+)?)$/i.exec(t);
    const nome = (m ? m[1] : t).replace(/^Sistema\s+/i, '').trim();
    const versao = m ? m[2].replace(/\s*(?:à|até|-)\s*|\s+a\s+/i, ' a ') : '';
    return { nome, versao };
  }

  function tipoDe(texto) {
    const n = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (/\b(corrigid|correcao|corrigir|ajustad|nao estava|bug)/.test(n)) return 'Correção';
    if (/\b(adicionad|incluid|criad|desenvolvid|nova |novo |implementad|liberad)/.test(n)) return 'Novidade';
    return 'Alteração';
  }

  // "Cadastro - Ficha - Botão Imprimir: Alterado..." -> caminho no menu antes dos dois-pontos
  function caminhoDe(texto) {
    const i = texto.indexOf(':');
    if (i < 3 || i > 140) return '';
    const c = texto.slice(0, i).trim();
    if (/^(adicionad|alterad|atualizad|criad|incluid|desenvolvid|corrigid|otimizad)/i.test(c)) return '';
    return / [-–>] |>/.test(c) ? c : '';
  }

  function montar(paras, arquivo = '') {
    const doc = { titulo: 'Atualizações dos Sistemas', data: '', arquivo, sistemas: [] };
    let sis = null; let linhas = [];
    const fechar = () => {
      const texto = linhas.join('\n').trim(); linhas = [];
      if (!texto || !sis) return;
      const chamados = [...texto.matchAll(RX_CHAMADO)].map((m) => m[1].replace(/\s/g, ''));
      const limpo = texto.replace(RX_CHAMADO, '').replace(/[ \t]+\./g, '.').replace(/[ \t]+$/gm, '').replace(/\n{2,}/g, '\n').trim().replace(/[.\s]*$/, (s) => (s.includes('.') ? '.' : ''));
      sis.itens.push({ texto: limpo, chamados, caminho: caminhoDe(limpo), tipo: tipoDe(limpo) });
    };
    paras.forEach((p) => {
      if (ehSumario(p.estilo)) return;
      if (!sis && !doc.data) { const m = RX_DATA.exec(p.texto); if (m) doc.data = `${m[3]}-${m[2]}-${m[1]}`; }
      if (ehTitulo(p.estilo)) {
        if (!p.texto) return;
        fechar();
        sis = { ...sistemaDe(p.texto), titulo: p.texto, itens: [] };
        doc.sistemas.push(sis);
        return;
      }
      if (!sis || !p.texto) return;
      linhas.push(p.lista ? `• ${p.texto}` : p.texto);
      if (TEM_CHAMADO.test(p.texto)) fechar(); // o chamado fecha o item
    });
    fechar();
    doc.sistemas = doc.sistemas.filter((s) => s.itens.length || s.versao);
    doc.id = doc.data || arquivo || String(Date.now());
    return doc;
  }

  /** bytes do .docx (Uint8Array) -> documento de atualizações */
  function lerDocx(bytes, arquivo = '', XLSXlib = (typeof XLSX !== 'undefined' ? XLSX : null)) {
    if (!XLSXlib || !XLSXlib.CFB) throw new Error('Biblioteca de leitura (lib/xlsx.full.min.js) não carregada.');
    let zip;
    try { zip = XLSXlib.CFB.read(bytes, { type: 'buffer' }); } catch { throw new Error('O arquivo não é um .docx válido.'); }
    const ent = XLSXlib.CFB.find(zip, '/word/document.xml');
    if (!ent) throw new Error('O arquivo não é um documento do Word (.docx).');
    const xml = new TextDecoder('utf-8').decode(ent.content instanceof Uint8Array ? ent.content : new Uint8Array(ent.content));
    const doc = montar(paragrafos(xml), arquivo);
    if (!doc.sistemas.length) throw new Error('Não encontrei sistemas no documento (os nomes dos sistemas precisam estar com o estilo "Título 1").');
    return doc;
  }

  return { lerDocx, montar, paragrafos, sistemaDe };
})();

if (typeof module !== 'undefined') module.exports = LeitorAtualizacoes;
