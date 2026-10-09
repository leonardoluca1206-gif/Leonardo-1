/* Base de Apoio — motor local (roda 100% no navegador, sem servidor).
   PROCV, geração/leitura de arquivos por layout, busca da ajuda e armazenamento local. */
'use strict';

const Motor = (() => {
  // ============================================================ utilidades
  const norm = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
  const semAcentos = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  const agora = () => {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  const erro = (msg) => { const e = new Error(msg); e.status = 400; return e; };
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /** Data sem fuso horário. */
  class Dia {
    constructor(y, m, d) { this.y = y; this.m = m; this.d = d; }
    valida() { const t = new Date(Date.UTC(this.y, this.m - 1, this.d)); return t.getUTCFullYear() === this.y && t.getUTCMonth() === this.m - 1 && t.getUTCDate() === this.d; }
    static hoje() { const t = new Date(); return new Dia(t.getFullYear(), t.getMonth() + 1, t.getDate()); }
    static deSerial(n) { const t = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000); return new Dia(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); }
    formatar(fmt) {
      const p2 = (n) => String(n).padStart(2, '0');
      return fmt.replace('AAAA', String(this.y).padStart(4, '0')).replace('AA', p2(this.y % 100)).replace('MM', p2(this.m)).replace('DD', p2(this.d));
    }
    toString() { return this.formatar('DD/MM/AAAA'); }
  }

  const vazio = (v) => v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));

  function fmtCelula(v) {
    if (vazio(v)) return '';
    if (v instanceof Dia) return v.toString();
    if (v instanceof Date) return new Dia(v.getFullYear(), v.getMonth() + 1, v.getDate()).toString();
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
    if (typeof v === 'boolean') return v ? 'VERDADEIRO' : 'FALSO';
    return String(v);
  }

  function unicos(nomes) {
    const vistos = {};
    return nomes.map((n) => {
      n = n || 'Coluna';
      if (vistos[n]) { vistos[n] += 1; return `${n} (${vistos[n]})`; }
      vistos[n] = 1; return n;
    });
  }

  // ---------- codificação Windows-1252
  const CP1252_EXTRA = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
  function codificavel(ch, enc) {
    const c = ch.codePointAt(0);
    if (enc === 'utf-8') return true;
    if (enc === 'latin-1') return c < 256;
    return c < 0x80 || (c >= 0xA0 && c <= 0xFF) || CP1252_EXTRA[c] !== undefined;
  }
  function codificar(texto, enc) {
    if (enc === 'utf-8') return new TextEncoder().encode(texto);
    const out = new Uint8Array(texto.length);
    let i = 0;
    for (const ch of texto) {
      const c = ch.codePointAt(0);
      if (c < 0x80 || (c >= 0xA0 && c <= 0xFF) || (enc === 'latin-1' && c < 256)) out[i++] = c;
      else if (enc !== 'latin-1' && CP1252_EXTRA[c] !== undefined) out[i++] = CP1252_EXTRA[c];
      else out[i++] = 0x3F; // ?
    }
    return out.slice(0, i);
  }
  function decodificar(bytes, preferido) {
    const tentar = (enc, fatal) => { try { return new TextDecoder(enc, { fatal }).decode(bytes); } catch { return null; } };
    if (preferido === 'utf-8') { const t = tentar('utf-8', true); if (t !== null) return [t.replace(/^﻿/, ''), 'utf-8']; }
    if (!preferido) { const t = tentar('utf-8', true); if (t !== null) return [t.replace(/^﻿/, ''), 'utf-8']; }
    return [tentar('windows-1252', false), 'cp1252'];
  }

  // ============================================================ armazenamento local
  const CHAVE = 'centralApoio.v1';
  let est;
  let armazenamentoOk = true;
  function carregarEstado() {
    try { est = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch { est = null; armazenamentoOk = false; }
    est = Object.assign({ layouts: {}, excluidos: [], procedimentos: null, modelos: [], seqModelo: 1, seqProc: 1000, historico: [], relatorios: {}, pastaReports: 'Reports\\' }, est || {});
  }
  function salvarEstado() {
    try { localStorage.setItem(CHAVE, JSON.stringify(est)); armazenamentoOk = true; }
    catch (e) { armazenamentoOk = false; throw erro('Não foi possível gravar no navegador (armazenamento cheio ou bloqueado). Faça um backup em Configurações.'); }
  }
  carregarEstado();

  function todosLayouts() {
    const mapa = new Map();
    (window.DADOS_LAYOUTS || []).forEach((l) => mapa.set(l.id, l));
    Object.values(est.layouts).forEach((l) => mapa.set(l.id, l));
    est.excluidos.forEach((id) => mapa.delete(id));
    return mapa;
  }
  let _cacheLayouts = null;
  const layoutsMapa = () => (_cacheLayouts || (_cacheLayouts = todosLayouts()));
  const invalidarLayouts = () => { _cacheLayouts = null; _indice = null; };

  function procedimentos() {
    if (!est.procedimentos) {
      est.procedimentos = (window.DADOS_PROCEDIMENTOS || []).map((p, i) => Object.assign({ id: i + 1, criado_em: agora(), atualizado_em: agora() }, p));
    }
    return est.procedimentos;
  }

  function registrarHistorico(modulo, descricao) {
    est.historico.unshift({ modulo, descricao, criado_em: agora() });
    est.historico = est.historico.slice(0, 50);
    try { salvarEstado(); } catch { /* histórico é opcional */ }
  }

  // ============================================================ arquivos em memória
  const ENVIOS = new Map();   // token -> {nome, bytes, planilha}
  const GERADOS = new Map();  // token -> {nome, blob}

  function guardarGerado(nome, blob) {
    const t = uid();
    GERADOS.set(t, { nome, blob });
    return t;
  }

  function baixar(token) {
    const g = GERADOS.get(token);
    if (!g) throw erro('Arquivo expirou. Gere novamente.');
    const url = URL.createObjectURL(g.blob);
    const a = document.createElement('a');
    a.href = url; a.download = g.nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function baixarTexto(nome, texto, tipo = 'application/json') { baixar(guardarGerado(nome, new Blob([texto], { type: tipo }))); }

  // ---------- leitura de planilhas
  function detectarSep(amostra) {
    const primeira = (amostra.split(/\r?\n/).find((l) => l.trim()) || '');
    const ordem = [';', '\t', '|', ','];
    let melhor = ';', max = 0;
    ordem.forEach((sep) => { const n = primeira.split(sep).length - 1; if (n > max) { max = n; melhor = sep; } });
    return melhor;
  }

  function linhasCsv(texto, sep) {
    const linhas = []; let campo = '', linha = [], aspas = false;
    for (let i = 0; i < texto.length; i++) {
      const ch = texto[i];
      if (aspas) {
        if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
        else if (ch === '"') aspas = false;
        else campo += ch;
      } else if (ch === '"' && campo === '') aspas = true;
      else if (ch === sep) { linha.push(campo); campo = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && texto[i + 1] === '\n') i++;
        linha.push(campo); linhas.push(linha); linha = []; campo = '';
      } else campo += ch;
    }
    if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
    return linhas;
  }

  function montarAba(matriz) {
    matriz = matriz.filter((l) => l.some((v) => !vazio(v) && String(v).trim() !== ''));
    if (!matriz.length) return { colunas: [], linhas: [] };
    const larg = Math.max(...matriz.map((l) => l.length));
    const cab = matriz[0];
    const colunas = unicos(Array.from({ length: larg }, (_, i) => {
      const c = cab[i];
      return vazio(c) || String(c).trim() === '' ? `Coluna ${i + 1}` : fmtCelula(c).trim();
    }));
    const linhas = matriz.slice(1).map((l) => Object.fromEntries(colunas.map((c, i) => {
      let v = l[i];
      if (typeof v === 'string' && v.trim() === '') v = null;
      return [c, vazio(v) ? null : v];
    })));
    return { colunas, linhas };
  }

  function lerPlanilha(env) {
    if (env.planilha) return env.planilha;
    const ext = (env.nome.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    const abas = {};
    if (ext === '.csv' || ext === '.txt') {
      const [texto] = decodificar(env.bytes);
      abas.Planilha = montarAba(linhasCsv(texto, detectarSep(texto.slice(0, 5000))));
    } else if (['.xlsx', '.xlsm', '.xls'].includes(ext)) {
      if (!window.XLSX) throw erro('Biblioteca de planilhas não carregada (pasta lib).');
      const wb = XLSX.read(env.bytes, { type: 'array', cellDates: false, cellNF: true });
      wb.SheetNames.forEach((nome) => {
        const ws = wb.Sheets[nome];
        if (!ws['!ref']) { abas[nome] = { colunas: [], linhas: [] }; return; }
        const r = XLSX.utils.decode_range(ws['!ref']);
        const matriz = [];
        for (let R = r.s.r; R <= r.e.r; R++) {
          const linha = [];
          for (let C = r.s.c; C <= r.e.c; C++) {
            const cel = ws[XLSX.utils.encode_cell({ r: R, c: C })];
            let v = null;
            if (cel) {
              if (cel.t === 'n' && cel.z && XLSX.SSF.is_date(cel.z)) {
                const p = XLSX.SSF.parse_date_code(cel.v);
                v = new Dia(p.y, p.m, p.d);
              } else if (cel.t === 'd') v = new Dia(cel.v.getFullYear(), cel.v.getMonth() + 1, cel.v.getDate());
              else if (cel.t === 'e') v = null;
              else v = cel.v;
            }
            linha.push(v);
          }
          matriz.push(linha);
        }
        abas[nome] = montarAba(matriz);
      });
    } else throw erro(`Formato não suportado: ${ext}. Use .xlsx, .xls, .csv ou .txt`);
    env.planilha = abas;
    return abas;
  }

  async function enviar(arquivo, planilha = true) {
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const token = uid();
    const env = { nome: arquivo.name, bytes };
    ENVIOS.set(token, env);
    const resp = { token, nome: arquivo.name, tamanho: bytes.length };
    if (planilha) {
      try {
        const abas = lerPlanilha(env);
        resp.abas = Object.entries(abas).map(([nome, a]) => ({
          nome, colunas: a.colunas, linhas: a.linhas.length,
          amostra: a.linhas.slice(0, 5).map((l) => a.colunas.map((c) => fmtCelula(l[c]))),
        }));
      } catch (e) { ENVIOS.delete(token); throw erro(`Não foi possível ler a planilha: ${e.message}`); }
    }
    return resp;
  }

  function envio(token) {
    const e = ENVIOS.get(token);
    if (!e) throw erro('Arquivo não encontrado. Envie novamente.');
    return e;
  }
  function abaDe(token, aba) {
    const abas = lerPlanilha(envio(token));
    return abas[aba] || Object.values(abas)[0];
  }

  // ---------- gravação de Excel (ExcelJS)
  const COR = { cab: 'FF1F4E79', amarelo: 'FFFFF2CC', vermelho: 'FFF8D7DA' };
  async function salvarExcel(abas, nome) {
    if (!window.ExcelJS) throw erro('Biblioteca de Excel não carregada (pasta lib).');
    const wb = new ExcelJS.Workbook();
    const usados = new Set();
    for (const aba of abas) {
      let t = String(aba.titulo).replace(/[[\]*?/\\:]/g, ' ').slice(0, 31).trim() || 'Planilha';
      let k = 2; const base = t;
      while (usados.has(t)) { t = `${base.slice(0, 27)} ${k++}`; }
      usados.add(t);
      const ws = wb.addWorksheet(t, { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.addRow(aba.colunas);
      ws.getRow(1).eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR.cab } }; });
      const largs = aba.colunas.map((c) => String(c).length);
      aba.linhas.forEach((l) => {
        const vals = l.map((v) => (vazio(v) ? null : v instanceof Dia ? new Date(Date.UTC(v.y, v.m - 1, v.d)) : (typeof v === 'object' ? JSON.stringify(v) : v)));
        const row = ws.addRow(vals);
        l.forEach((v, i) => {
          if (v instanceof Dia) row.getCell(i + 1).numFmt = 'dd/mm/yyyy';
          largs[i] = Math.max(largs[i] || 0, fmtCelula(v).length);
        });
        const cor = aba.cor ? aba.cor(l) : null;
        if (cor) row.eachCell({ includeEmpty: true }, (c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR[cor] } }; });
      });
      largs.forEach((w, i) => { ws.getColumn(i + 1).width = Math.min(Math.max(w + 2, 8), 60); });
      if (aba.colunas.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: aba.colunas.length } };
    }
    const buf = await wb.xlsx.writeBuffer();
    if (!/\.xlsx$/i.test(nome)) nome += '.xlsx';
    return { token: guardarGerado(nome, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })), nome };
  }

  // ============================================================ PROCV
  const PALAVRAS_CHAVE = ['cpf', 'cnpj', 'matricula', 'inscricao', 'cadastro', 'codigo', 'cod', 'id', 'chave', 'documento', 'doc', 'registro', 'pis', 'nit', 'cei', 'socio', 'empresa'];
  const DIGITOS_NOMES = /\b(cpf|cnpj|matricula|inscricao|cadastro|codigo|cod|pis|nit|cei|cep|numero|nr)\b/;

  function modoAuto(nomeCol, valores) {
    if (DIGITOS_NOMES.test(norm(nomeCol))) return 'digitos';
    const vals = valores.filter((v) => !vazio(v)).slice(0, 200).map(String);
    if (vals.length && vals.filter((v) => /^[\d.\-/ ]+$/.test(v)).length / vals.length >= 0.9) return 'digitos';
    return 'texto';
  }

  function chave(v, modo) {
    if (vazio(v)) return '';
    const s = fmtCelula(v).trim();
    if (modo === 'exato') return s;
    if (modo === 'digitos') { const d = s.replace(/\D/g, ''); return d.replace(/^0+/, '') || (d ? '0' : ''); }
    return semAcentos(s).toUpperCase().replace(/\s+/g, ' ').trim();
  }

  function coluna(aba, c) { return aba.linhas.map((l) => l[c]); }

  function procvSugerir(p) {
    const a = abaDe(p.token_a, p.aba_a), b = abaDe(p.token_b, p.aba_b);
    const amostraB = {};
    b.colunas.forEach((cb) => {
      const vals = coluna(b, cb).slice(0, 3000);
      const m = modoAuto(cb, vals);
      amostraB[cb] = new Set(vals.map((v) => chave(v, m)).filter(Boolean));
    });
    const ranking = [];
    a.colunas.forEach((ca) => {
      const na = norm(ca);
      const valsA = coluna(a, ca);
      const modo = modoAuto(ca, valsA);
      const va = new Set(valsA.slice(0, 3000).map((v) => chave(v, modo)).filter(Boolean));
      const naoVazios = valsA.filter((v) => !vazio(v)).length;
      b.colunas.forEach((cb) => {
        const nb = norm(cb);
        let s = 0;
        if (na && na === nb) s += 10;
        else if (na && nb && (na.includes(nb) || nb.includes(na))) s += 5;
        if (PALAVRAS_CHAVE.some((w) => na.split(' ').includes(w)) && PALAVRAS_CHAVE.some((w) => nb.split(' ').includes(w))) s += 3;
        const sb = amostraB[cb];
        if (va.size && sb.size) {
          let inter = 0; va.forEach((x) => { if (sb.has(x)) inter++; });
          s += (inter / Math.max(1, Math.min(va.size, sb.size))) * 12;
          s += 2 * Math.min(va.size / Math.max(1, naoVazios), 1);
        }
        if (s > 0) ranking.push({ coluna_a: ca, coluna_b: cb, pontos: Math.round(s * 100) / 100 });
      });
    });
    ranking.sort((x, y) => y.pontos - x.pontos);
    const melhor = ranking[0] || null;
    let trazer = [];
    if (melhor) {
      const nomesA = new Set(a.colunas.map(norm));
      trazer = b.colunas.filter((c) => c !== melhor.coluna_b && !nomesA.has(norm(c)));
    }
    return { melhor, ranking: ranking.slice(0, 10), trazer, colunas_a: a.colunas, colunas_b: b.colunas };
  }

  function paraNumero(v) {
    if (typeof v === 'number') return v;
    if (vazio(v) || typeof v === 'boolean' || v instanceof Dia) return null;
    let s = String(v).trim().replace('R$', '').replace(/\s/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return s !== '' && Number.isFinite(n) ? n : null;
  }

  async function procvExecutar(p) {
    const a = abaDe(p.token_a, p.aba_a), b = abaDe(p.token_b, p.aba_b);
    const ca = p.chave_a, cb = p.chave_b;
    if (!a.colunas.includes(ca) || !b.colunas.includes(cb)) throw erro('Coluna-chave não encontrada nas planilhas.');
    const colunas = (p.colunas || []).filter((c) => b.colunas.includes(c) && c !== cb);
    if (!colunas.length) throw erro('Escolha ao menos uma coluna para trazer da Planilha 2.');
    const modo = p.normalizar || 'auto';
    let ma = modo === 'auto' ? modoAuto(ca, coluna(a, ca)) : modo;
    let mb = modo === 'auto' ? modoAuto(cb, coluna(b, cb)) : modo;
    if (modo === 'auto' && ma !== mb) ma = mb = [ma, mb].includes('texto') ? 'texto' : 'digitos';
    const dup = p.duplicados || 'primeiro';
    const ka = a.linhas.map((l) => chave(l[ca], ma));
    const kb = b.linhas.map((l) => chave(l[cb], mb));
    const contA = {}, contB = {}, indice = {};
    ka.forEach((k) => { if (k) contA[k] = (contA[k] || 0) + 1; });
    kb.forEach((k, i) => { if (k) { contB[k] = (contB[k] || 0) + 1; (indice[k] = indice[k] || []).push(i); } });
    const nomeSaida = Object.fromEntries(colunas.map((c) => [c, a.colunas.includes(c) ? `${c} (Planilha 2)` : c]));
    const colsRes = [...a.colunas, ...colunas.map((c) => nomeSaida[c]), 'Resultado PROCV'];
    const status = [];
    const linhasRes = a.linhas.map((l, i) => {
      const k = ka[i];
      const base = a.colunas.map((c) => l[c]);
      const idx = k ? indice[k] : null;
      let st, extra;
      if (!k) { st = 'Chave vazia'; extra = colunas.map(() => null); }
      else if (!idx) { st = 'Não encontrado'; extra = colunas.map(() => null); }
      else {
        st = idx.length === 1 ? 'Encontrado' : `Encontrado (${idx.length} ocorrências)`;
        extra = colunas.map((c) => {
          if (dup === 'ultimo') return b.linhas[idx[idx.length - 1]][c];
          if (dup === 'todos' && idx.length > 1) return idx.map((j) => fmtCelula(b.linhas[j][c])).filter(Boolean).join(' | ');
          if (dup === 'somar' && idx.length > 1) {
            const nums = idx.map((j) => paraNumero(b.linhas[j][c])).filter((n) => n !== null);
            return nums.length ? Math.round(nums.reduce((x, y) => x + y, 0) * 100) / 100 : b.linhas[idx[0]][c];
          }
          return b.linhas[idx[0]][c];
        });
      }
      status.push(st);
      return [...base, ...extra, st];
    });
    const chavesA = new Set(ka.filter(Boolean));
    const linhasB = (filtro) => b.linhas.filter((_, i) => filtro(i)).map((l) => b.colunas.map((c) => l[c]));
    const soB = linhasB((i) => kb[i] && !chavesA.has(kb[i]));
    const dupB = linhasB((i) => (contB[kb[i]] || 0) > 1);
    const dupA = a.linhas.filter((_, i) => (contA[ka[i]] || 0) > 1).map((l) => a.colunas.map((c) => l[c]));
    const nao = linhasRes.filter((l) => ['Não encontrado', 'Chave vazia'].includes(l[l.length - 1]));
    const nomesModo = { digitos: 'Somente dígitos (ignora pontos, traços e zeros à esquerda)', texto: 'Texto (ignora maiúsculas, acentos e espaços)', exato: 'Exato' };
    const e = {
      total_a: a.linhas.length, total_b: b.linhas.length,
      encontrados: status.filter((s) => s.startsWith('Encontrado')).length,
      nao_encontrados: status.filter((s) => s === 'Não encontrado').length,
      chave_vazia: status.filter((s) => s === 'Chave vazia').length,
      chaves_duplicadas_b: Object.values(contB).filter((v) => v > 1).length,
      linhas_duplicadas_b: dupB.length,
      chaves_duplicadas_a: Object.values(contA).filter((v) => v > 1).length,
      so_na_planilha_2: soB.length,
      modo_comparacao: nomesModo[ma],
    };
    const resumo = [['Linhas na Planilha 1', e.total_a], ['Linhas na Planilha 2', e.total_b], ['Encontrados', e.encontrados],
      ['Não encontrados', e.nao_encontrados], ['Chave vazia na Planilha 1', e.chave_vazia], ['Chaves repetidas na Planilha 1', e.chaves_duplicadas_a],
      ['Chaves repetidas na Planilha 2', e.chaves_duplicadas_b], ['Registros só na Planilha 2', e.so_na_planilha_2],
      ['Chave Planilha 1', ca], ['Chave Planilha 2', cb], ['Comparação', e.modo_comparacao], ['Colunas trazidas', colunas.join(', ')]];
    const cor = (l) => { const s = l[l.length - 1]; return ['Não encontrado', 'Chave vazia'].includes(s) ? 'vermelho' : String(s).includes('(') ? 'amarelo' : null; };
    const x = await salvarExcel([
      { titulo: 'Resultado', colunas: colsRes, linhas: linhasRes, cor },
      { titulo: 'Não encontrados', colunas: colsRes, linhas: nao },
      { titulo: 'Repetidos Planilha 2', colunas: b.colunas, linhas: dupB },
      { titulo: 'Repetidos Planilha 1', colunas: a.colunas, linhas: dupA },
      { titulo: 'Só na Planilha 2', colunas: b.colunas, linhas: soB },
      { titulo: 'Resumo', colunas: ['Item', 'Valor'], linhas: resumo },
    ], p.nome_saida || 'resultado_procv.xlsx');
    registrarHistorico('PROCV', `${e.total_a} linhas · ${e.encontrados} encontrados · ${e.nao_encontrados} não encontrados`);
    return { estatisticas: e, download: x.token, arquivo: x.nome,
      previa: { colunas: colsRes, linhas: linhasRes.slice(0, 100).map((l) => l.map(fmtCelula)) } };
  }

  // ============================================================ LAYOUTS: sugestão de mapeamento
  const ESPECIAIS = {
    SEQUENCIAL: 'Nº da linha no arquivo (1, 2, 3...)', SEQ_DETALHE: 'Nº sequencial do detalhe',
    QTD_DETALHES: 'Quantidade de registros de detalhe', QTD_LINHAS: 'Quantidade total de linhas do arquivo',
    DATA_HOJE: 'Data de hoje', COMPETENCIA: 'Competência informada (mês/ano)', SOMA: 'Soma de um campo do detalhe',
  };
  const GRUPOS = {
    cpf: [4, ['cpf']], cnpj: [4, ['cnpj']], pis: [4, ['pis', 'nit', 'pasep']], rg: [4, ['rg', 'identidade']],
    email: [4, ['email', 'e mail']], telefone: [4, ['telefone', 'fone', 'celular', 'whatsapp']], cep: [4, ['cep']],
    nascimento: [4, ['nascimento', 'nasc']], vencimento: [4, ['vencimento', 'vencto', 'venc']],
    pagamento: [3, ['pagamento', 'pagto', 'pago', 'debito']], admissao: [4, ['admissao']],
    matricula: [4, ['matricula', 'cadastro', 'chapa', 'funcional']], inscricao: [4, ['inscricao']],
    parcela: [4, ['parcela', 'parcelas']], agencia: [4, ['agencia']], conta: [3, ['conta']], banco: [3, ['banco']],
    competencia: [3, ['competencia', 'referencia', 'mes ano', 'ano mes']], endereco: [3, ['endereco', 'logradouro', 'rua']],
    bairro: [4, ['bairro']], cidade: [4, ['cidade', 'municipio']], uf: [4, ['uf', 'estado']], sexo: [4, ['sexo']],
    nome: [2, ['nome', 'funcionario', 'associado', 'socio']], empresa: [2, ['empresa', 'razao', 'fantasia', 'empregador']],
    valor: [2, ['valor', 'vl', 'total', 'desconto', 'mensalidade', 'contribuicao']], data: [2, ['data', 'dt']],
    codigo: [2, ['codigo', 'cod', 'numero', 'nr']], documento: [3, ['documento', 'doc']], dependente: [3, ['dependente']],
  };
  function grupos(texto) {
    const t = ` ${norm(texto)} `;
    const r = {};
    Object.entries(GRUPOS).forEach(([g, [peso, termos]]) => { if (termos.some((x) => t.includes(` ${x} `))) r[g] = peso; });
    return r;
  }
  function nomeCampo(c) {
    let d = String(c.descricao || '').split(' — ')[0];
    d = d.replace(/\(.*?\)/g, '').replace(/^[\s\-–:.]+|[\s\-–:.]+$/g, '');
    return d.slice(0, 45).trim() || `Pos ${c.inicio || ''}`.trim();
  }
  const semCodigo = (t) => String(t || '').replace(/^\s*[A-Za-z]\d{2,3}\s*[-–]\s*/, '');

  function similaridade(a, b) { // equivalente simples ao SequenceMatcher.ratio
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    const m = a.length, n = b.length;
    const dp = new Array(n + 1).fill(0);
    for (let i = 1; i <= m; i++) {
      let prev = 0;
      for (let j = 1; j <= n; j++) {
        const tmp = dp[j];
        dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
        prev = tmp;
      }
    }
    return (2 * dp[n]) / (m + n);
  }

  function campoValor(reg, ri) {
    const ci = (reg.campos || []).findIndex((c) => c.tipo === 'numerico' && /^(valor|vl|vlr)\b/.test(norm(semCodigo(c.descricao))));
    return ci >= 0 ? `${ri}.${ci}` : null;
  }

  function sugerirMapa(layout, colunas) {
    const regs = layout.registros;
    const cols = colunas.map((c) => [c, grupos(c), norm(c)]);
    const mapa = {}, incluir = {};
    let prim = regs.findIndex((r) => r.papel === 'detalhe'); if (prim < 0) prim = 0;
    regs.forEach((reg, ri) => {
      const papel = reg.papel || 'detalhe';
      incluir[ri] = papel === 'header' || papel === 'trailer' || ri === prim;
      const cand = [];
      reg.campos.forEach((c, ci) => {
        const k = `${ri}.${ci}`;
        if (c.delimitador) { mapa[k] = { origem: 'fixo', valor: c.fixo || layout.separador || ';' }; return; }
        if (c.fixo !== undefined && c.fixo !== null) { mapa[k] = { origem: 'fixo', valor: c.fixo }; return; }
        mapa[k] = { origem: 'vazio', valor: '' };
        const desc = semCodigo(c.descricao);
        const nd = norm(desc);
        if (papel !== 'detalhe') {
          if (/\b(valor|vl|vlr)\b/.test(nd) && /\b(total|soma|somatorio)\b/.test(nd) && c.tipo === 'numerico') {
            const alvo = campoValor(regs[prim], prim);
            if (alvo) mapa[k] = { origem: 'especial', valor: `SOMA:${alvo}` };
          } else if (/\b(quantidade|qtde|qtd|total de registros|numero de registros|total de linhas)\b/.test(nd)) {
            mapa[k] = { origem: 'especial', valor: /linha|header|trail|inclu/.test(nd) ? 'QTD_LINHAS' : 'QTD_DETALHES' };
          } else if (/\bsequencial\b/.test(nd)) mapa[k] = { origem: 'especial', valor: 'SEQUENCIAL' };
          else if (/\b(data de geracao|data da gravacao|data do arquivo|data de gravacao)\b/.test(nd)) mapa[k] = { origem: 'especial', valor: 'DATA_HOJE' };
          return;
        }
        if (/\bsequencial\b/.test(nd) && !colunas.length) mapa[k] = { origem: 'especial', valor: 'SEQ_DETALHE' };
        const gd = grupos(desc);
        const curto = norm(semCodigo(nomeCampo(c)));
        const p1 = curto.split(' ')[0] || '';
        const palD = new Set(nd.split(' ').filter((w) => w.length >= 4));
        cols.forEach(([col, gc, nc]) => {
          let s = 0;
          Object.keys(gd).forEach((g) => { if (gc[g]) s += Math.min(gd[g], gc[g]); });
          if (nc && (nc === curto || nc === nd)) s += 6;
          s += similaridade(curto, nc) * 2;
          if (p1 && nc.split(' ')[0] === p1) s += 2;
          s += 1.5 * nc.split(' ').filter((w) => w.length >= 4 && palD.has(w)).length;
          if (s >= 2.8) cand.push([s, ci, col]);
        });
      });
      const usC = new Set(), usCol = new Set();
      cand.sort((x, y) => y[0] - x[0]).forEach(([, ci, col]) => {
        if (usC.has(ci) || usCol.has(col)) return;
        mapa[`${ri}.${ci}`] = { origem: 'coluna', valor: col };
        usC.add(ci); usCol.add(col);
      });
    });
    return { mapa, incluir };
  }

  // ============================================================ LAYOUTS: conversões
  /** Converte para texto decimal "-123.45" ou lança erro. */
  function textoDecimal(v) {
    if (vazio(v) || v === '') return null;
    if (typeof v === 'boolean') return v ? '1' : '0';
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw new Error('valor não numérico');
      return v.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 15 });
    }
    let s = String(v).trim().replace('R$', '').replace(/\s/g, '');
    const neg = s.startsWith('(') && s.endsWith(')');
    s = s.replace(/^\(|\)$/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) throw new Error('valor não numérico');
    if (s.startsWith('+')) s = s.slice(1);
    return neg ? `-${s.replace(/^-/, '')}` : s;
  }
  /** Escala um decimal em texto para inteiro (BigInt) com arredondamento meio-para-cima. */
  function escalar(txt, dec) {
    const neg = txt.startsWith('-');
    const [ip, fp = ''] = txt.replace('-', '').split('.');
    const frac = fp.padEnd(dec + 1, '0');
    let n = BigInt((ip || '0') + frac.slice(0, dec));
    if (+frac[dec] >= 5) n += 1n;
    const perdeu = /[1-9]/.test(fp.slice(dec));
    return { neg: neg && n !== 0n, n, perdeu };
  }
  function bigParaTexto(n, dec, sepDec) {
    const neg = n < 0n; let s = (neg ? -n : n).toString().padStart(dec + 1, '0');
    if (dec) s = `${s.slice(0, -dec)}${sepDec}${s.slice(-dec)}`;
    return (neg ? '-' : '') + s;
  }

  function paraData(v) {
    if (vazio(v) || v === '') return null;
    if (v instanceof Dia) return v;
    if (v instanceof Date) return new Dia(v.getFullYear(), v.getMonth() + 1, v.getDate());
    if (typeof v === 'number' && v > 20000 && v < 80000) return Dia.deSerial(v);
    const s = String(v).trim();
    const pads = [
      [/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, (m) => [m[3], m[2], m[1]]],
      [/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, (m) => [+m[3] < 69 ? 2000 + +m[3] : 1900 + +m[3], m[2], m[1]]],
      [/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/, (m) => [m[1], m[2], m[3]]],
      [/^(\d{1,2})[-.](\d{1,2})[-.](\d{4})$/, (m) => [m[3], m[2], m[1]]],
      [/^(\d{2})(\d{2})(\d{4})$/, (m) => [m[3], m[2], m[1]]],
      [/^(\d{4})(\d{2})(\d{2})$/, (m) => [m[1], m[2], m[3]]],
      [/^(\d{1,2})\/(\d{4})$/, (m) => [m[2], m[1], 1]],
      [/^(\d{4})(\d{2})$/, (m) => [m[1], m[2], 1]],
    ];
    for (const [rx, f] of pads) {
      const m = rx.exec(s);
      if (m) { const [y, mo, d] = f(m).map(Number); const dia = new Dia(y, mo, d); if (dia.valida()) return dia; }
    }
    throw new Error('data inválida');
  }
  function lerDataFormato(v, fmt) {
    let rx = fmt.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    const ordem = [];
    rx = rx.replace(/AAAA|AA|MM|DD/g, (t) => { ordem.push(t); return t === 'AAAA' ? '(\\d{4})' : '(\\d{2})'; });
    const m = new RegExp(`^${rx}$`).exec(v);
    if (!m) return null;
    let y = 0, mo = 1, d = 1;
    ordem.forEach((t, i) => { const n = +m[i + 1]; if (t === 'AAAA') y = n; else if (t === 'AA') y = 2000 + n; else if (t === 'MM') mo = n; else d = n; });
    const dia = new Dia(y, mo, d);
    return dia.valida() ? dia : null;
  }

  function formatoData(c, delimitado) {
    if (c.formato_data) return c.formato_data;
    const txt = `${c.formato || ''} ${c.descricao || ''}`.toUpperCase().replace(/\s/g, '');
    for (const p of ['DDMMAAAA', 'AAAAMMDD', 'DD/MM/AAAA', 'DDMMAA', 'AAMMDD', 'AAAAMM', 'MMAAAA', 'AAAA-MM-DD']) if (txt.includes(p)) return p;
    if (delimitado) return 'DD/MM/AAAA';
    return { 6: 'DDMMAA', 8: 'DDMMAAAA', 10: 'DD/MM/AAAA' }[c.tamanho || 0] || 'DDMMAAAA';
  }

  const padL = (s, n, ch) => (s.length >= n ? s : ch.repeat(n - s.length) + s);
  const padR = (s, n, ch) => (s.length >= n ? s : s + ch.repeat(n - s.length));

  function formatar(v, c, delimitado, op, sep) {
    const av = [];
    const tam = c.tamanho || 0;
    const tipo = c.tipo || 'texto';
    const dec = parseInt(c.decimais || 0, 10) || 0;
    const ehVazio = vazio(v) || (typeof v === 'string' && !v.trim());
    const alinhar = c.alinhamento || (tipo === 'numerico' ? 'direita' : 'esquerda');
    const preencher = c.preencher || (tipo === 'numerico' ? '0' : ' ');

    if (tipo === 'data' || (v instanceof Dia && tipo !== 'texto')) {
      const fd = formatoData(c, delimitado);
      if (ehVazio) return [delimitado ? '' : (c.tipo === 'numerico' ? '0' : ' ').repeat(tam), av];
      let s = '';
      try { s = paraData(v).formatar(fd); } catch { av.push(`data inválida: "${fmtCelula(v)}"`); }
      if (!delimitado && tam) s = padR(s.slice(0, tam), tam, ' ');
      return [s, av];
    }
    if (tipo === 'numerico') {
      if (ehVazio) return [delimitado ? '' : preencher.repeat(tam), av];
      let s;
      if (dec > 0 || (/valor|vl\b/.test(norm(c.descricao)) && typeof v === 'number' && !Number.isInteger(v))) {
        let t;
        try { t = textoDecimal(v); } catch { av.push(`valor não numérico: "${fmtCelula(v)}"`); return [delimitado ? '' : preencher.repeat(tam), av]; }
        const e = escalar(t, dec);
        if (e.neg) av.push('valor negativo');
        if (e.perdeu) av.push(`valor ${fmtCelula(v)} tem mais casas que as ${dec} decimais do campo`);
        if (delimitado) return [bigParaTexto(e.neg ? -e.n : e.n, dec, op.separador_decimal || ','), av];
        s = e.n.toString();
      } else {
        const bruto = fmtCelula(v).trim();
        s = bruto.replace(/\D/g, '');
        if (/[A-Za-z]/.test(bruto)) av.push(`letras em campo numérico: "${bruto}"`);
        if (!s) return [delimitado ? '' : preencher.repeat(tam), av];
        if (delimitado) return [s, av];
      }
      if (tam && s.length > tam) { av.push(`valor com ${s.length} dígitos excede o tamanho ${tam}`); s = s.slice(-tam); }
      if (tam) s = alinhar === 'direita' ? padL(s, tam, preencher) : padR(s, tam, preencher);
      return [s, av];
    }
    let s = ehVazio ? '' : fmtCelula(v);
    s = s.replace(/[\r\n\t]+/g, ' ').trim();
    if (op.remover_acentos) s = semAcentos(s);
    if (op.maiusculas) s = s.toUpperCase();
    const enc = op.encoding || 'cp1252';
    if ([...s].some((ch) => !codificavel(ch, enc))) {
      av.push(`caracteres não suportados em ${enc} substituídos: "${s}"`);
      s = [...s].map((ch) => (codificavel(ch, enc) ? ch : '?')).join('');
    }
    if (delimitado) {
      if (sep && s.includes(sep)) { s = s.split(sep).join(' '); av.push(`separador "${sep}" removido do texto`); }
      return [s, av];
    }
    if (tam && s.length > tam) { av.push(`texto cortado em ${tam} caracteres (${s.length})`); s = s.slice(0, tam); }
    if (tam) s = alinhar === 'esquerda' ? padR(s, tam, preencher) : padL(s, tam, preencher);
    return [s, av];
  }

  function montarLinha(valores, delimitado, sep) {
    if (delimitado) return valores.filter(([c]) => !c.delimitador).map(([, t]) => t).join(sep);
    const buf = []; let cursor = 0;
    valores.forEach(([c, t]) => {
      const ini = (c.inicio || 0) - 1;
      const pos = ini >= 0 ? ini : cursor;
      const tam = c.tamanho || (t || '').length;
      const txt = tam ? padR((t || '').slice(0, tam), tam, ' ') : (t || '');
      while (buf.length < pos) buf.push(' ');
      for (let i = 0; i < txt.length; i++) buf[pos + i] = txt[i];
      cursor = pos + txt.length;
    });
    for (let i = 0; i < buf.length; i++) if (buf[i] === undefined) buf[i] = ' ';
    return buf.join('');
  }

  function nomeArquivoSaida(l, op) {
    let nome = String(op.nome_arquivo || l.nome_arquivo || `${l.id}.txt`).trim();
    const m = /^(\d{4})-(\d{2})$/.exec(op.competencia || '');
    if (m) nome = nome.replace('AAAA', m[1]).replace('MM', m[2]).replace('AA', m[1].slice(2));
    if (!nome.includes('.')) nome += l.formato === 'delimitado' ? '.csv' : '.txt';
    return nome.replace(/[\\/:*?"<>|]+/g, '_');
  }
  const posCampo = (c) => (c.inicio && c.fim ? `${c.inicio}-${c.fim}` : String(c.inicio || ''));
  function campoEfetivo(c, org, val) {
    if (org === 'fixo' && c.tipo === 'data') return Object.assign({}, c, { tipo: 'texto' });
    if (org === 'especial' && val && (['SEQUENCIAL', 'SEQ_DETALHE', 'QTD_DETALHES', 'QTD_LINHAS'].includes(val) || val.startsWith('SOMA:'))) return Object.assign({}, c, { tipo: 'numerico' });
    return c;
  }

  async function gerar(l, token, aba, config) {
    const op = config.opcoes || {}, mapa = config.mapa || {}, incluir = config.incluir || {};
    const delimitado = l.formato === 'delimitado';
    const sep = l.separador || ';';
    let dados = null;
    if (token) dados = abaDe(token, aba);
    const regs = l.registros;
    const inc = regs.map((_, i) => i).filter((i) => incluir[i] || incluir[String(i)]);
    if (!inc.length) throw erro('Selecione ao menos um registro do layout.');
    const headers = inc.filter((i) => regs[i].papel === 'header');
    const trailers = inc.filter((i) => regs[i].papel === 'trailer');
    const detalhes = inc.filter((i) => !headers.includes(i) && !trailers.includes(i));
    if (detalhes.length && !dados) throw erro('Envie a planilha com os dados.');
    const avisos = [], somas = {}, linhasDet = [];
    const comp = (() => { const m = /^(\d{4})-(\d{2})$/.exec(op.competencia || ''); return m ? new Dia(+m[1], +m[2], 1) : (() => { const h = Dia.hoje(); h.d = 1; return h; })(); })();

    const especial = (tok, c, seqLinha, seqDet, tot) => {
      if (tok === 'SEQUENCIAL') return seqLinha;
      if (tok === 'SEQ_DETALHE') return seqDet;
      if (tok === 'QTD_DETALHES') return tot.qtd_detalhes || 0;
      if (tok === 'QTD_LINHAS') return tot.qtd_linhas || 0;
      if (tok === 'DATA_HOJE') return Dia.hoje();
      if (tok === 'COMPETENCIA') {
        if (c.tipo !== 'data') {
          let fd = formatoData(c, delimitado);
          if (c.tamanho === 6 && !['MMAAAA', 'AAAAMM', 'DDMMAA', 'AAMMDD'].includes(fd)) fd = `${c.descricao || ''}${c.formato || ''}`.toUpperCase().includes('MMAAAA') ? 'MMAAAA' : 'AAAAMM';
          return comp.formatar(fd);
        }
        return comp;
      }
      if (tok.startsWith('SOMA:')) return bigParaTexto(somas[tok.slice(5)] || 0n, 6, '.');
      return '';
    };
    const add = (linha, reg, c, a) => avisos.push({ linha_planilha: linha, registro: String(reg.nome || '').slice(0, 40), campo: nomeCampo(c), posicao: posCampo(c), aviso: a });
    const linhasDados = dados ? dados.linhas.filter((r) => dados.colunas.some((c) => !vazio(r[c]) && r[c] !== '')) : [];

    linhasDados.forEach((linha, li) => {
      detalhes.forEach((ri) => {
        const reg = regs[ri];
        const seqDet = linhasDet.length + 1;
        const valores = [];
        reg.campos.forEach((c, ci) => {
          const k = `${ri}.${ci}`;
          if (delimitado && c.delimitador) { valores.push([c, '']); return; }
          const m = mapa[k] || { origem: 'vazio' };
          const org = m.origem, val = m.valor;
          let v = null;
          if (org === 'coluna') v = dados.colunas.includes(val) ? linha[val] : null;
          else if (org === 'fixo') v = val;
          else if (org === 'especial') v = especial(val || '', c, headers.length + seqDet, seqDet, {});
          if (c.delimitador && !delimitado) v = v || sep;
          const [txt, av] = formatar(v, campoEfetivo(c, org, val), delimitado, op, sep);
          av.forEach((a) => add(li + 2, reg, c, a));
          if (c.tipo === 'numerico' && org === 'coluna' && !vazio(v) && v !== '') {
            try { const t = textoDecimal(v); const e = escalar(t, 6); somas[k] = (somas[k] || 0n) + (e.neg ? -e.n : e.n); } catch { /* ignora */ }
          }
          if (c.obrigatorio && (vazio(v) || v === '')) add(li + 2, reg, c, 'campo obrigatório vazio');
          valores.push([c, txt]);
        });
        linhasDet.push(montarLinha(valores, delimitado, sep));
      });
    });
    const tot = { qtd_detalhes: linhasDet.length, qtd_linhas: linhasDet.length + headers.length + trailers.length };
    const fixa = (ri, seqLinha) => {
      const reg = regs[ri];
      const valores = [];
      reg.campos.forEach((c, ci) => {
        const m = mapa[`${ri}.${ci}`] || { origem: 'vazio' };
        const org = m.origem, val = m.valor;
        let v = null;
        if (org === 'fixo') v = val;
        else if (org === 'especial') v = especial(val || '', c, seqLinha, 0, tot);
        else if (org === 'coluna' && linhasDados.length && dados.colunas.includes(val)) v = linhasDados[0][val];
        if (delimitado && c.delimitador) { valores.push([c, '']); return; }
        if (c.delimitador && !delimitado) v = v || sep;
        const [txt, av] = formatar(v, campoEfetivo(c, org, val), delimitado, op, sep);
        av.forEach((a) => add('-', reg, c, a));
        valores.push([c, txt]);
      });
      return montarLinha(valores, delimitado, sep);
    };
    const topo = headers.map((ri, i) => fixa(ri, i + 1));
    const base = trailers.map((ri, i) => fixa(ri, topo.length + linhasDet.length + i + 1));
    const todas = [...topo, ...linhasDet, ...base];
    const quebra = op.quebra === 'LF' ? '\n' : '\r\n';
    const texto = todas.join(quebra) + (todas.length ? quebra : '');
    const nome = nomeArquivoSaida(l, op);
    const token_out = guardarGerado(nome, new Blob([codificar(texto, op.encoding || 'cp1252')], { type: 'text/plain' }));
    let token_av = null;
    if (avisos.length) {
      token_av = (await salvarExcel([{ titulo: 'Avisos', colunas: ['Linha da planilha', 'Registro', 'Campo', 'Posição', 'Aviso'],
        linhas: avisos.map((a) => [a.linha_planilha, a.registro, a.campo, a.posicao, a.aviso]) }], `avisos_${nome.replace(/\.[^.]+$/, '')}`)).token;
    }
    registrarHistorico('Importação', `${l.titulo.slice(0, 60)} · ${linhasDet.length} registros · ${avisos.length} avisos`);
    return { download: token_out, arquivo: nome, linhas: todas.length, detalhes: linhasDet.length,
      larguras: [...new Set(todas.map((x) => x.length))].sort((a, b) => a - b).slice(0, 5),
      avisos: avisos.slice(0, 500), total_avisos: avisos.length, download_avisos: token_av, previa: todas.slice(0, 30) };
  }

  // ---------- ler / validar
  function pontua(reg, linha, partes, delimitado) {
    let pts = 0, tem = false;
    reg.campos.filter((c) => !(delimitado && c.delimitador)).forEach((c, i) => {
      const fx = c.fixo;
      if (fx === undefined || fx === null || fx === '' || c.delimitador) return;
      tem = true;
      if (delimitado) { if (i < partes.length) pts += partes[i].trim() === String(fx).trim() ? 2 : -1; }
      else {
        const ini = (c.inicio || 0) - 1;
        if (ini < 0) return;
        pts += linha.slice(ini, ini + (c.tamanho || String(fx).length)).trim() === String(fx).trim() ? 2 : -1;
      }
    });
    return [pts, tem];
  }

  async function ler(l, token, encoding) {
    const env = envio(token);
    const [texto, enc] = decodificar(env.bytes, encoding || 'cp1252');
    const linhas = texto.split(/\r\n|\n|\r/).filter((x) => x.trim());
    const regs = l.registros;
    const delimitado = l.formato === 'delimitado';
    const sep = l.separador || ';';
    const headers = regs.map((r, i) => (r.papel === 'header' ? i : -1)).filter((i) => i >= 0);
    const trailers = regs.map((r, i) => (r.papel === 'trailer' ? i : -1)).filter((i) => i >= 0);
    let detalhes = regs.map((_, i) => i).filter((i) => !headers.includes(i) && !trailers.includes(i));
    if (!detalhes.length) detalhes = [0];
    const saida = regs.map(() => []);
    const avisos = [];
    const esperado = regs.map((r) => Math.max(0, ...r.campos.map((c) => c.fim || 0)));
    const colunasReg = regs.map((r) => ['Linha', ...unicos(r.campos.filter((c) => !c.delimitador).map(nomeCampo))]);

    linhas.forEach((linha, idx) => {
      const n = idx + 1;
      const partes = delimitado ? linha.split(sep) : [];
      const melhores = [];
      regs.forEach((reg, ri) => { const [pts, tem] = pontua(reg, linha, partes, delimitado); if (tem) melhores.push([pts, ri]); });
      melhores.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
      let ri;
      if (melhores.length && melhores[0][0] > 0) ri = melhores[0][1];
      else if (n === 1 && headers.length) ri = headers[0];
      else if (n === linhas.length && trailers.length) ri = trailers[0];
      else ri = detalhes[0];
      const reg = regs[ri];
      const campos = reg.campos.filter((c) => !c.delimitador);
      const nomes = colunasReg[ri].slice(1);
      const regNome = String(reg.nome || '').slice(0, 40);
      if (!delimitado && esperado[ri] && linha.length !== esperado[ri]) avisos.push([n, regNome, '-', '-', `linha com ${linha.length} caracteres; layout prevê ${esperado[ri]}`]);
      const dados = [n];
      let cursor = 0;
      campos.forEach((c, i) => {
        let bruto;
        if (delimitado) bruto = i < partes.length ? partes[i] : '';
        else {
          const ini = (c.inicio || 0) - 1;
          const pos = ini >= 0 ? ini : cursor;
          const tam = c.tamanho || 0;
          bruto = linha.slice(pos, pos + tam);
          cursor = pos + tam;
        }
        const v = bruto.trim();
        let valor = v, aviso = null;
        if (c.tipo === 'numerico' && v) {
          const dec = parseInt(c.decimais || 0, 10) || 0;
          if (delimitado) { try { valor = Number(textoDecimal(v)); } catch { aviso = `valor não numérico: "${v}"`; } }
          else if (!/^-?\d+$/.test(v)) aviso = `campo numérico com conteúdo "${v}"`;
          else if (dec) valor = Number(bigParaTexto(BigInt(v), dec, '.'));
        } else if (c.tipo === 'data' && v && !/^0+$/.test(v)) {
          const fd = formatoData(c, delimitado);
          const d = lerDataFormato(v, fd);
          if (d) valor = d; else aviso = `data inválida "${v}" (esperado ${fd})`;
        }
        if (aviso) avisos.push([n, regNome, nomes[i], posCampo(c), aviso]);
        dados.push(valor);
      });
      saida[ri].push(dados);
    });
    const abas = [];
    saida.forEach((rows, ri) => { if (rows.length) abas.push({ titulo: String(regs[ri].nome || `Registro ${ri + 1}`).replace(/[[\]*?/\\:]/g, ' ').slice(0, 28).trim() || `Registro ${ri + 1}`, colunas: colunasReg[ri], linhas: rows }); });
    // títulos únicos
    const us = new Set();
    abas.forEach((a) => { let t = a.titulo, k = 2; while (us.has(t)) t = `${a.titulo.slice(0, 25)} ${k++}`; us.add(t); a.titulo = t; });
    if (avisos.length) abas.push({ titulo: 'Avisos', colunas: ['Linha', 'Registro', 'Campo', 'Posição', 'Aviso'], linhas: avisos, cor: () => 'vermelho' });
    if (!abas.length) throw erro('Arquivo vazio.');
    const x = await salvarExcel(abas, `${env.nome.replace(/\.[^.]+$/, '')}_lido.xlsx`);
    const previa = {};
    abas.forEach((a) => { previa[a.titulo] = { colunas: a.colunas, linhas: a.linhas.slice(0, 50).map((r) => r.map(fmtCelula)) }; });
    const por = {};
    abas.filter((a) => a.titulo !== 'Avisos').forEach((a) => { por[a.titulo] = a.linhas.length; });
    registrarHistorico('Leitura', `${l.titulo.slice(0, 60)} · ${linhas.length} linhas · ${avisos.length} avisos`);
    return { download: x.token, arquivo: x.nome, linhas: linhas.length, encoding: enc, por_registro: por,
      avisos: avisos.slice(0, 500).map((a) => ({ Linha: a[0], Registro: a[1], Campo: a[2], 'Posição': a[3], Aviso: a[4] })),
      total_avisos: avisos.length, previa };
  }

  // ============================================================ LAYOUTS: cadastro
  function resumoLayout(l) {
    return { id: l.id, titulo: l.titulo, categoria: l.categoria, modulo: l.modulo || '', nome_arquivo: l.nome_arquivo || '',
      tipo_arquivo: l.tipo_arquivo || '', formato: l.formato, separador: l.separador || '', observacao: l.observacao || '',
      origem: l.origem || 'ajuda', qtd_registros: l.registros.length, qtd_campos: l.registros.reduce((s, r) => s + r.campos.length, 0) };
  }
  function obterLayout(id) {
    const l = layoutsMapa().get(id);
    if (!l) { const e = erro('Layout não encontrado.'); e.status = 404; throw e; }
    const c = clone(l);
    c.modelos = est.modelos.filter((m) => m.layout_id === id).map((m) => ({ id: m.id, nome: m.nome, criado_em: m.criado_em })).sort((a, b) => a.nome.localeCompare(b.nome));
    return c;
  }
  function validarLayout(l) {
    if (!String(l.titulo || '').trim()) throw erro('Informe o título do layout.');
    l.id = String(l.id || semAcentos(l.titulo)).replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 80).replace(/^_+|_+$/g, '');
    if (!l.id) throw erro('Identificador inválido.');
    if (!(l.registros || []).length) throw erro('O layout precisa de ao menos um registro.');
    l.registros.forEach((r) => {
      r.nome = r.nome || 'Registro'; r.papel = r.papel || 'detalhe';
      (r.campos || []).forEach((c) => {
        ['inicio', 'fim', 'tamanho', 'decimais'].forEach((k) => {
          const v = c[k];
          c[k] = v !== null && v !== undefined && v !== '' && /^-?\d+$/.test(String(v)) ? parseInt(v, 10) : (k === 'decimais' ? 0 : null);
        });
        if (c.inicio && c.tamanho && !c.fim) c.fim = c.inicio + c.tamanho - 1;
        if (c.inicio && c.fim && !c.tamanho) c.tamanho = c.fim - c.inicio + 1;
        if (c.fixo === '') delete c.fixo;
      });
    });
    delete l.modelos; delete l._substituir; delete l.criado_em;
    return l;
  }
  function gravarLayout(l, origem) {
    l.origem = origem || l.origem || 'manual';
    l.atualizado_em = agora();
    est.layouts[l.id] = l;
    est.excluidos = est.excluidos.filter((x) => x !== l.id);
    salvarEstado(); invalidarLayouts();
  }

  // ============================================================ AJUDA: busca
  const STOP = new Set(`a o as os um uma uns umas de da do das dos em no na nos nas para pra por com sem que qual quais
como onde quando porque e ou se eu faco fazer faz fazemos consigo posso pode podemos devo deve ter tem tenho
me meu minha meus minhas seu sua isso isto esse essa este esta ao aos sobre sistema prosind prosindw agendaw
ja nao sim mais menos muito ser estou quero preciso gostaria saber ajuda duvida`.split(/\s+/));
  const SINONIMOS = [
    ['boleto', 'boletos', 'bloqueto', 'bloquetos', 'bloq'], ['socio', 'socios', 'associado', 'associados', 'filiado', 'filiados'],
    ['cadastrar', 'cadastro', 'incluir', 'inclusao', 'novo', 'criar', 'lancar'], ['excluir', 'exclusao', 'apagar', 'remover', 'deletar'],
    ['alterar', 'alteracao', 'editar', 'mudar', 'corrigir'], ['importar', 'importacao', 'carregar'], ['exportar', 'exportacao', 'gerar'],
    ['mensalidade', 'mensalidades', 'mensal'], ['lancamento', 'lancamentos', 'desconto', 'descontos'], ['contribuicao', 'contribuicoes', 'contrib'],
    ['baixa', 'baixar', 'pagamento', 'pago', 'quitar', 'quitacao'], ['debito', 'debitos'], ['remessa', 'remessas'], ['retorno', 'retornos'],
    ['desfiliar', 'desfiliacao', 'desfiliado'], ['filiar', 'filiacao'], ['oposicao', 'oposicoes', 'carta', 'recusa'],
    ['empresa', 'empresas', 'empregador'], ['dependente', 'dependentes'], ['relatorio', 'relatorios', 'listagem', 'imprimir'],
    ['layout', 'layouts', 'arquivo', 'leiaute'], ['senha', 'login', 'acesso', 'usuario'], ['erro', 'problema', 'falha', 'rejeicao', 'critica', 'criticas'],
    ['telefone', 'telefones', 'fone', 'fones', 'celular', 'contato'], ['endereco', 'enderecos', 'rua', 'logradouro'],
    ['aniversario', 'aniversariantes', 'nascimento'], ['atraso', 'atrasos', 'atrasados', 'devedores', 'inadimplentes', 'aberto', 'aberta'],
    ['inscricao', 'filiacao', 'filiados'], ['lista', 'listagem', 'relacao'], ['estatistica', 'estatisticas', 'quantidade', 'contagem', 'resumo'],
    ['matricula', 'cadastro'], ['email', 'mail'], ['aposentado', 'aposentados', 'aposentadoria'], ['convenio', 'convenios', 'conveniada', 'conveniadas'],
  ];
  const SIN = {};
  SINONIMOS.forEach((g) => g.forEach((w) => { SIN[w] = new Set([...(SIN[w] || []), ...g]); }));
  const SUFIXOS = ['amentos', 'amento', 'acoes', 'acao', 'mente', 'ados', 'adas', 'ado', 'ada', 'ar', 'er', 'ir', 'os', 'as', 'es', 'o', 'a', 's'];
  function raiz(t) {
    if (t.length <= 4) return t;
    for (const s of SUFIXOS) if (t.endsWith(s) && t.length - s.length >= 5) return t.slice(0, -s.length);
    return t;
  }

  let _indice = null;
  function indice() {
    if (_indice) return _indice;
    const docs = [];
    (window.DADOS_AJUDA || []).forEach((p) => docs.push({ tipo: 'pagina', ref: p.id, titulo: p.titulo, chaves: p.modulo, texto: p.texto }));
    layoutsMapa().forEach((l) => docs.push({ tipo: 'layout', ref: l.id, titulo: l.titulo, chaves: `layout ${l.categoria} ${l.id}`,
      texto: [l.observacao, l.nome_arquivo, ...l.registros.flatMap((r) => [r.nome, ...r.campos.map((c) => c.descricao)])].filter(Boolean).join('\n') }));
    procedimentos().forEach((p) => docs.push({ tipo: 'procedimento', ref: String(p.id), titulo: p.titulo, chaves: `${p.palavras_chave || ''} ${p.categoria || ''}`,
      texto: [p.procedimento, p.atencao, p.solucao].filter(Boolean).join('\n') }));
    const vocab = new Map();
    const campos = ['titulo', 'chaves', 'texto'];
    const somaLen = { titulo: 0, chaves: 0, texto: 0 };
    docs.forEach((d, di) => {
      d.len = {};
      campos.forEach((f) => {
        const pal = norm(d[f]).split(' ').filter(Boolean);
        d.len[f] = pal.length || 1; somaLen[f] += d.len[f];
        const tf = {};
        pal.forEach((w) => { tf[w] = (tf[w] || 0) + 1; });
        Object.entries(tf).forEach(([w, n]) => { if (!vocab.has(w)) vocab.set(w, []); vocab.get(w).push([di, f, n]); });
      });
    });
    const media = {}; campos.forEach((f) => { media[f] = somaLen[f] / Math.max(1, docs.length); });
    const palavras = [...vocab.keys()];
    _indice = { docs, vocab, palavras, media };
    return _indice;
  }

  function regexVariantes(variantes) {
    const cls = { a: '[aáàâã]', e: '[eéê]', i: '[ií]', o: '[oóôõ]', u: '[uúü]', c: '[cç]' };
    const partes = [...variantes].filter((v) => v.length > 1).map((v) => v.split('').map((ch) => cls[ch] || ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(''));
    return partes.length ? new RegExp(`(^|[^0-9A-Za-zÀ-ú])((?:${partes.join('|')})[0-9A-Za-zÀ-ú]*)`, 'gi') : null;
  }

  function trecho(texto, rx) {
    if (!texto) return '';
    const plano = texto.replace(/\s+/g, ' ');
    let pos = 0;
    if (rx) { rx.lastIndex = 0; const m = rx.exec(plano); if (m) pos = m.index; }
    const ini = Math.max(0, pos - 90);
    let t = plano.slice(ini, pos + 170);
    if (rx) { rx.lastIndex = 0; t = t.replace(rx, '$1[[[$2]]]'); }
    return (ini > 0 ? '… ' : '') + t + (pos + 170 < plano.length ? ' …' : '');
  }

  function buscar(q, limite = 20) {
    const termos = norm(q).split(' ').filter((t) => t.length > 1 && !STOP.has(t));
    if (!termos.length) return { consulta: q, termos: [], resultados: [], melhor: null };
    const idx = indice();
    const N = idx.docs.length;
    const pesos = { titulo: 6, chaves: 8, texto: 1 };
    const grupos = termos.map((t) => new Set([...(SIN[t] || [t]), t].map(raiz)));
    const porGrupo = grupos.map((vars) => {
      const pontos = new Map();
      const tfDoc = new Map();
      idx.palavras.forEach((w) => {
        for (const v of vars) {
          if (w.startsWith(v)) {
            idx.vocab.get(w).forEach(([di, f, n]) => {
              const k = `${di}|${f}`;
              tfDoc.set(k, (tfDoc.get(k) || 0) + n);
            });
            break;
          }
        }
      });
      const docsComMatch = new Set([...tfDoc.keys()].map((k) => +k.split('|')[0]));
      const idf = Math.log(1 + (N - docsComMatch.size + 0.5) / (docsComMatch.size + 0.5));
      tfDoc.forEach((tf, k) => {
        const [di, f] = k.split('|');
        const d = idx.docs[+di];
        const s = idf * pesos[f] * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * d.len[f] / idx.media[f]));
        pontos.set(+di, (pontos.get(+di) || 0) + s);
      });
      return pontos;
    });
    const combinar = (todos) => {
      const r = new Map();
      const cand = new Set(); porGrupo.forEach((m) => m.forEach((_, di) => cand.add(di)));
      cand.forEach((di) => {
        const presentes = porGrupo.filter((m) => m.has(di));
        if (todos && presentes.length < porGrupo.length) return;
        r.set(di, presentes.reduce((s, m) => s + m.get(di), 0));
      });
      return r;
    };
    let res = combinar(true);
    if (res.size < 3 && grupos.length > 1) { const extra = combinar(false); extra.forEach((v, k) => { if (!res.has(k)) res.set(k, v * 0.5); }); }
    const peso = { procedimento: 2.2, pagina: 1, layout: 0.8 };
    const rxTodos = regexVariantes(new Set(grupos.flatMap((g) => [...g])));
    let lista = [...res.entries()].map(([di, s]) => {
      const d = idx.docs[di];
      const tit = norm(d.titulo);
      const bonus = termos.filter((t) => [...(SIN[t] || [t]), t].some((v) => tit.includes(raiz(v)))).length * 1.5;
      return { tipo: d.tipo, ref: d.ref, titulo: d.titulo, pontos: Math.round((s * peso[d.tipo] + bonus) * 1000) / 1000, _d: d };
    }).sort((a, b) => b.pontos - a.pontos);
    const paginas = new Set(lista.filter((r) => r.tipo === 'pagina').map((r) => r.ref));
    lista = lista.filter((r) => !(r.tipo === 'layout' && paginas.has(r.ref))).slice(0, limite);
    const ids = layoutsMapa();
    lista.forEach((r) => { r.trecho = trecho(r._d.texto, rxTodos); r.tem_layout = r.tipo === 'layout' || (r.tipo === 'pagina' && ids.has(r.ref)); delete r._d; });
    return { consulta: q, termos, resultados: lista, melhor: lista.length ? detalhe(lista[0].tipo, lista[0].ref) : null };
  }

  function detalhe(tipo, ref) {
    if (tipo === 'procedimento') {
      const p = procedimentos().find((x) => String(x.id) === String(ref));
      if (!p) return null;
      return Object.assign({ tipo, ref }, p, { passos: String(p.procedimento || '').split('\n').map((s) => s.trim().replace(/^[-•\t ]+/, '')).filter(Boolean) });
    }
    if (tipo === 'pagina') {
      const p = (window.DADOS_AJUDA || []).find((x) => x.id === ref);
      if (!p) return null;
      const blocos = p.texto.split(/\n+/).map((b) => b.trim()).filter(Boolean);
      const partesT = new Set(p.titulo.split(/\s+—\s+/).map(norm));
      while (blocos.length && (partesT.has(norm(blocos[0])) || ['layout', 'sistema prosind'].includes(norm(blocos[0])))) blocos.shift();
      return { tipo, ref, titulo: p.titulo, modulo: p.modulo, blocos, layout: layoutsMapa().has(ref) };
    }
    if (tipo === 'layout') {
      const l = layoutsMapa().get(ref);
      return l ? { tipo, ref, id: l.id, titulo: l.titulo, categoria: l.categoria, observacao: l.observacao, nome_arquivo: l.nome_arquivo } : null;
    }
    return null;
  }

  // ============================================================ RELATÓRIOS: catálogo (um item por entrada do menu)
  const TIPOS_REL = { relatorio: 'Relatório', documento: 'Documento/Recibo' };
  let _cacheRel = null, _idxRel = null;
  const invalidarRel = () => { _cacheRel = null; _idxRel = null; };
  const caminhoArquivo = (arq) => `${est.pastaReports || ''}${arq}`;

  function arquivosMapa() {
    const m = new Map();
    (window.DADOS_RELATORIOS || []).forEach((r) => {
      if (r.tipo === 'consulta' || r.tipo === 'modelo') return; // só relatórios
      const x = Object.assign({ sistema: 'ProSindW' }, r);
      m.set(`${x.sistema}|${x.arquivo.toLowerCase()}`, x);
    });
    return m;
  }

  function tituloAmigavel(caminho, reserva) {
    const partes = caminho.split(' > ').filter((p) => p !== 'Relatórios' && p !== 'Listas');
    if (!partes.length) return reserva || caminho;
    const ult = partes[partes.length - 1];
    if (/^por\s/i.test(ult)) return `${partes[partes.length - 2] || ''} ${ult}`.trim();
    if (ult.split(/\s+/).length >= 2 || partes.length === 1) return ult;
    return `${partes[partes.length - 2]} – ${ult}`;
  }

  function escolherPrincipal(e) {
    if (!e.membros.length) return null;
    if (e.membros.length === 1) return e.membros[0];
    const alvo = norm(`${e.caminho_base.split(' > ').pop()} ${e.tela}`).split(' ').filter((w) => w.length > 3 && w !== 'por');
    const pont = (r) => {
      const toks = norm(r.arquivo.replace(/\.\w+$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')).split(' ');
      let p = alvo.filter((w) => toks.some((t) => t.length >= 3 && (t.startsWith(w.slice(0, 4)) || w.startsWith(t.slice(0, 4))))).length * 10;
      if (/mascfem/i.test(r.arquivo)) p -= 3;
      return p + Math.min(r.campos.length, 20) / 10;
    };
    return [...e.membros].sort((a, b) => pont(b) - pont(a))[0];
  }

  function montarEntradas() {
    const arqs = arquivosMapa();
    const usados = new Set();
    const ent = new Map();
    Object.entries(window.MENU_RELATORIOS || {}).forEach(([sis, def]) => {
      (def.ITENS || []).forEach(([caminho, lista, extra]) => {
        extra = extra || {};
        const membros = (lista || []).map((a) => arqs.get(`${sis}|${a.toLowerCase()}`)).filter(Boolean);
        (lista || []).forEach((a) => usados.add(`${sis}|${a.toLowerCase()}`));
        const id = `menu:${sis}|${caminho}`;
        ent.set(id, { id, sistema: sis, caminho_base: caminho, fonte: 'menu', dica: extra.dica || '', tela: extra.tela || '',
          filtros: extra.filtros || [], titulos: extra.titulos || [], membros, arquivos_menu: lista || [],
          tabelas: extra.tabelas || [], campos_tabela: extra.campos_tabela || {} });
      });
    });
    arqs.forEach((r, k) => {
      if (usados.has(k)) return;
      const def = (window.MENU_RELATORIOS || {})[r.sistema];
      const regra = def && (def.REGRAS || []).find(([rx]) => rx.test(r.arquivo));
      ent.set(r.id, { id: r.id, sistema: r.sistema, caminho_base: regra ? regra[1] : '', fonte: regra ? 'provavel' : '', dica: '', tela: '',
        filtros: [], titulos: [], membros: [r], avulso: true, arquivos_menu: [r.arquivo], tabelas: [], campos_tabela: {} });
    });
    ent.forEach((e) => {
      const o = (est.relatorios || {})[e.id] || {};
      e.caminho_menu = o.caminho_menu || '';
      e.descricao = o.descricao || '';
      e.palavras_chave = o.palavras_chave || '';
      const cam = e.caminho_menu || e.caminho_base;
      e.menu = { caminho: cam, fonte: e.caminho_menu ? 'confirmado' : e.fonte };
      e.principal = escolherPrincipal(e);
      e.titulo = e.avulso ? (e.principal ? e.principal.titulo : e.id) : tituloAmigavel(e.caminho_base, e.tela);
      const seg = cam.split(' > ').filter((p) => p !== 'Relatórios');
      e.assunto = seg[0] || (e.principal && e.principal.assunto) || 'Outros';
      e.tipo = e.principal ? e.principal.tipo : 'relatorio';
      const todos = new Map();
      e.membros.forEach((m) => m.campos.forEach((c) => { if (!todos.has(c.codigo)) todos.set(c.codigo, c); }));
      e.camposTodos = [...todos.values()].filter((c) => !['CABECALHO', 'RODAPE'].includes(c.codigo));
    });
    // títulos repetidos: acrescenta o trecho do menu que diferencia
    const cont = {};
    ent.forEach((e) => { cont[e.titulo] = (cont[e.titulo] || 0) + 1; });
    ent.forEach((e) => {
      if (cont[e.titulo] > 1 && e.menu.caminho) {
        const seg = e.menu.caminho.split(' > ');
        const ctx = seg[0] === 'Relatórios' ? seg[1] : seg[0];
        if (ctx && !norm(e.titulo).startsWith(norm(ctx))) e.titulo = `${e.titulo} (${ctx})`;
      }
    });
    return ent;
  }
  const relMapa = () => (_cacheRel || (_cacheRel = montarEntradas()));

  function indiceRel() {
    if (_idxRel) return _idxRel;
    const docs = [...relMapa().values()].map((e) => ({
      e,
      titulo: `${e.titulo} ${e.tela} ${e.dica} ${e.caminho_base.split(' > ').slice(-2).join(' ')}`,
      chaves: `${e.palavras_chave} ${e.assunto} ${e.menu.caminho} ${e.membros.map((m) => m.arquivo.replace(/[_.]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')).join(' ')}`,
      campos: e.camposTodos.map((c) => `${c.descricao} ${c.rotulo || ''}`).join(' '),
      texto: [e.descricao, ...e.titulos, ...e.tabelas, ...e.filtros.flatMap((f) => [f.rotulo, ...(f.opcoes || [])]),
        ...e.membros.flatMap((m) => [...(m.opcoes || []), ...(m.agrupamentos || []).map((a) => (a && a.descricao) || a)])].filter(Boolean).join(' '),
    }));
    const vocab = new Map(); const somaLen = {}; const campos = ['titulo', 'chaves', 'campos', 'texto'];
    campos.forEach((f) => { somaLen[f] = 0; });
    docs.forEach((d, di) => {
      d.len = {};
      campos.forEach((f) => {
        const pal = norm(d[f]).split(' ').filter(Boolean);
        d.len[f] = pal.length || 1; somaLen[f] += d.len[f];
        const tf = {}; pal.forEach((w) => { tf[w] = (tf[w] || 0) + 1; });
        Object.entries(tf).forEach(([w, n]) => { if (!vocab.has(w)) vocab.set(w, []); vocab.get(w).push([di, f, n]); });
      });
    });
    const media = {}; campos.forEach((f) => { media[f] = somaLen[f] / Math.max(1, docs.length); });
    _idxRel = { docs, vocab, palavras: [...vocab.keys()], media };
    return _idxRel;
  }

  const STOP_REL = new Set(['relatorio', 'relatorios', 'report', 'reports', 'preciso', 'quero', 'mostre', 'mostrar', 'traga', 'trazer', 'imprimir', 'listar', 'campo', 'campos', 'contendo', 'contenha', 'mostrando', 'tenha', 'onde']);

  const nomeCampoRel = (c) => {
    const bruto = String(c.rotulo || '').trim();
    const r = bruto.replace(/[:.]+$/, '');
    if (!r || r.length < 2 || (/\./.test(bruto) && r.length <= 8)) return c.descricao;
    return r[0] + r.slice(1).toLowerCase();
  };

  function resumoEntrada(e, extra) {
    return Object.assign({ id: e.id, sistema: e.sistema, tipo: e.tipo, tipo_nome: TIPOS_REL[e.tipo] || e.tipo, assunto: e.assunto,
      titulo: e.titulo, dica: e.dica, menu: e.menu, qtd_arquivos: e.membros.length }, extra || {});
  }

  function buscarRelatorios(q, assunto, sistema, incluirCampos = false, limite = 60) {
    const todos = [...relMapa().values()].filter((e) => (!assunto || e.assunto === assunto) && (!sistema || e.sistema === sistema));
    const termos = norm(q).split(' ').filter((t) => t.length > 1 && !STOP.has(t) && !STOP_REL.has(t));
    if (!termos.length) {
      const lista = todos.sort((a, b) => (a.menu.fonte === 'menu' ? 0 : 1) - (b.menu.fonte === 'menu' ? 0 : 1) || a.menu.caminho.localeCompare(b.menu.caminho, 'pt-BR'));
      return { termos: [], total: lista.length, resultados: lista.slice(0, 200).map((e) => resumoEntrada(e)) };
    }
    const idx = indiceRel();
    const N = idx.docs.length;
    const pesos = { titulo: 6, chaves: 4, campos: 3, texto: 1 };
    const grupos = termos.map((t) => new Set([...(SIN[t] || [t]), t].map(raiz)));
    const fortesGrupo = [];
    const porGrupo = grupos.map((vars) => {
      const tfDoc = new Map();
      idx.palavras.forEach((w) => {
        for (const v of vars) if (w.startsWith(v)) { idx.vocab.get(w).forEach(([di, f, n]) => { const k = `${di}|${f}`; tfDoc.set(k, (tfDoc.get(k) || 0) + n); }); break; }
      });
      fortesGrupo.push(new Set([...tfDoc.keys()].filter((k) => /\|(titulo|chaves)$/.test(k)).map((k) => +k.split('|')[0])));
      const dfs = new Set([...tfDoc.keys()].map((k) => +k.split('|')[0]));
      const idf = Math.log(1 + (N - dfs.size + 0.5) / (dfs.size + 0.5));
      const pts = new Map();
      tfDoc.forEach((tf, k) => {
        const [di, f] = k.split('|'); const d = idx.docs[+di];
        pts.set(+di, (pts.get(+di) || 0) + idf * pesos[f] * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * d.len[f] / idx.media[f])));
      });
      return pts;
    });
    const rxOrdem = new RegExp(grupos.map((g) => `(?:${[...g].map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\w*`).join('.*'));
    const cand = new Set(); porGrupo.forEach((m) => m.forEach((_, di) => cand.add(di)));
    let lista = [];
    cand.forEach((di) => {
      const d = idx.docs[di];
      if (assunto && d.e.assunto !== assunto) return;
      if (sistema && d.e.sistema !== sistema) return;
      const presentes = porGrupo.filter((m) => m.has(di)).length;
      const fortes = fortesGrupo.filter((st) => st.has(di)).length;
      let s = porGrupo.reduce((acc, m) => acc + (m.get(di) || 0), 0);
      if (d.e.menu.fonte === 'menu' || d.e.menu.fonte === 'confirmado') s *= 1.3;
      if (!d.e.membros.length) s *= 0.8;
      if (rxOrdem.test(norm(d.e.titulo))) s *= 1.8; // termos na mesma ordem no título
      lista.push([s, di, presentes, fortes]);
    });
    const noTitulo = lista.filter((x) => x[3] === porGrupo.length);
    const completos = lista.filter((x) => x[2] === porGrupo.length && x[3] < porGrupo.length);
    const parcial = !noTitulo.length && !completos.length;
    let outros = 0;
    if (noTitulo.length) { outros = completos.length; lista = incluirCampos ? noTitulo.concat(completos.map((x) => [x[0] * 0.3, x[1], x[2], x[3]])) : noTitulo; }
    else if (completos.length) lista = completos;
    else if (lista.length) {
      // parcial: só os que têm o maior número de termos (e no máximo 30)
      const max = Math.max(...lista.map((x) => x[2] + x[3] / 10));
      lista = lista.filter((x) => x[2] + x[3] / 10 >= max - 0.05).sort((a, b) => b[0] - a[0]).slice(0, 30);
    }
    lista.sort((a, b) => b[0] - a[0]);
    const rxs = grupos.map((g) => regexVariantes(g));
    const resultados = lista.slice(0, limite).map(([s, di]) => {
      const e = idx.docs[di].e;
      const achados = e.camposTodos.filter((c) => rxs.some((rx) => rx && (rx.lastIndex = 0, rx.test(`${c.descricao} ${c.rotulo || ''}`)))).map(nomeCampoRel);
      return resumoEntrada(e, { pontos: Math.round(s * 100) / 100, campos_encontrados: [...new Set(achados)].slice(0, 6) });
    });
    return { termos, total: lista.length, parcial, outros_por_campos: incluirCampos ? 0 : outros, resultados };
  }

  // ---------- prévia com dados de exemplo (fictícios)
  const EXEMPLOS = [
    [/cpf/, ['000.000.000-01', '000.000.000-02', '000.000.000-03']],
    [/cnpj/, ['00.000.000/0001-01', '00.000.000/0001-02', '00.000.000/0001-03']],
    [/e ?mail/, ['ana@exemplo.com', 'bruno@exemplo.com', 'carla@exemplo.com']],
    [/telefone|celular|fax/, ['(00) 0000-0001', '(00) 0000-0002', '(00) 0000-0003']],
    [/cep/, ['00000-001', '00000-002', '00000-003']],
    [/endereco/, ['Rua das Flores, 100', 'Av. Central, 250', 'Rua Nova, 12']],
    [/bairro/, ['Centro', 'Jardim', 'Vila Nova']],
    [/cidade/, ['Cidade A', 'Cidade B', 'Cidade A']],
    [/\buf\b/, ['UF', 'UF', 'UF']],
    [/sexo/, ['Masculino', 'Feminino', 'Masculino']],
    [/situacao/, ['Sócio', 'Sócio', 'Afastado']],
    [/(data|nascimento|inscricao data|vencimento|pagamento data)/, ['01/04/2010', '12/08/2015', '20/03/2021']],
    [/(valor|total|desconto|juros|multa|salario)/, ['150,00', '89,90', '1.200,00']],
    [/(inscricao|inscr|matricula|cadastro)/, ['101', '102', '103']],
    [/(quantidade|qtde|nº de|n de socios|numero de (socios|empregados|funcionarios|dependentes))/, ['12', '5', '30']],
    [/(abreviado|abrev)/, ['ALFA', 'BETA', 'GAMA']],
    [/empresa/, ['Empresa Alfa', 'Empresa Beta', 'Empresa Gama']],
    [/escritorio/, ['Escritório Um', 'Escritório Dois', 'Escritório Um']],
    [/(convenio|conveniada)/, ['Convênio A', 'Convênio B', 'Convênio A']],
    [/contribuic/, ['Mensalidade', 'Assistencial', 'Confederativa']],
    [/filtro/, ['Geral', 'Empresa Alfa', 'Empresa Beta']],
    [/funcao/, ['Auxiliar', 'Operador', 'Técnico']],
    [/classificacao/, ['Classe 1', 'Classe 2', 'Classe 1']],
    [/(dependente|parentesco)/, ['Filho(a)', 'Cônjuge', 'Filho(a)']],
    [/(nome|socio|funcionario)/, ['Ana Exemplo', 'Bruno Modelo', 'Carla Teste']],
    [/(inscricao|codigo|cadastro|matricula|numero)/, ['101', '102', '103']],
    [/(mes|ano|competencia|exercicio)/, ['09/2026', '09/2026', '09/2026']],
  ];
  function exemplo(c, i, sistema) {
    const bd = sistema ? (((window.CAMPOS_BD || {})[sistema]) || {})[c.codigo] : null;
    if (bd) {
      const dom = bd.dominio || '';
      if (/^CPF/.test(dom)) return ['000.000.000-01', '000.000.000-02', '000.000.000-03'][i];
      if (/^CNPJ/.test(dom)) return ['00.000.000/0001-01', '00.000.000/0001-02', '00.000.000/0001-03'][i];
      if (/^CEP/.test(dom)) return ['00000-001', '00000-002', '00000-003'][i];
      if (/^FONE/.test(dom)) return ['(00) 0000-0001', '(00) 0000-0002', '(00) 0000-0003'][i];
      if (/^EMAIL/.test(dom)) return ['ana@exemplo.com', 'bruno@exemplo.com', 'carla@exemplo.com'][i];
      if (/^Data/.test(bd.tipo)) return ['01/04/2010', '12/08/2015', '20/03/2021'][i];
      if (/^Valor \(2/.test(bd.tipo)) return ['150,00', '89,90', '1.200,00'][i];
      if (/^Texto \(1\)$/.test(bd.tipo) && /sexo/i.test(c.codigo)) return ['M', 'F', 'M'][i];
    }
    const t = norm(`${c.rotulo || ''} ${c.descricao} ${c.codigo}`);
    if (/^(nr|vl)?(ano)/i.test(c.codigo) || /\bano\b/.test(norm(c.descricao))) return ['2026', '2025', '2026'][i];
    if (/^(nr)?mes/i.test(c.codigo) || /\bmes\b/.test(norm(c.descricao))) return ['09', '08', '07'][i];
    if (/^(nr|qt)(empregados|funcionarios|socios|naosocios|dependentes|qdade|quantidade)/i.test(c.codigo)) return ['12', '5', '30'][i];
    if (/^dt|data/.test(norm(c.codigo)) || /^dt/i.test(c.codigo)) return ['01/04/2010', '12/08/2015', '20/03/2021'][i];
    if (/^vl/i.test(c.codigo)) return ['150,00', '89,90', '1.200,00'][i];
    for (const [rx, vals] of EXEMPLOS) if (rx.test(t)) return vals[i];
    if (bd && /^Valor/.test(bd.tipo)) return ['150,00', '89,90', '1.200,00'][i];
    if (bd && /^(Número|Número inteiro)/.test(bd.tipo)) return ['10', '25', '7'][i];
    return ['Exemplo', 'Exemplo', 'Exemplo'][i];
  }
  // ---- expressões do FastReport ([IF(...)], [FORMATTEXT(...)], 'a'+b ...) reduzidas a texto de exemplo
  const VARS_FR = { DATE: '01/04/2026', TIME: '10:00', 'PAGE#': '1', PAGE: '1', HOJE: '01/04/2026', LINE: '1', 'LINE#': '1' };
  function dividirTopo(s, sep) {
    const out = []; let d = 0; let q = false; let ini = 0;
    for (let i = 0; i < s.length; i += 1) {
      const ch = s[i];
      if (ch === "'") q = !q;
      else if (!q && (ch === '(' || ch === '[')) d += 1;
      else if (!q && (ch === ')' || ch === ']')) d -= 1;
      else if (!q && d <= 0 && s.startsWith(sep, i)) { out.push(s.slice(ini, i)); ini = i + sep.length; }
    }
    out.push(s.slice(ini));
    return out;
  }
  function avaliarExpr(s, vals, prof = 0) {
    s = s.trim();
    if (!s || prof > 12) return '';
    const soma = dividirTopo(s, '+');
    if (soma.length > 1) return soma.map((x) => avaliarExpr(x, vals, prof + 1)).join('');
    let m = s.match(/^'((?:[^']|'')*)'?$/);
    if (m) return m[1].replace(/''/g, "'");
    m = s.match(/^\u0001(\d+)\u0001$/);
    if (m) return vals[+m[1]];
    for (const op of ['-', '*', '/']) {
      const partes = dividirTopo(s, op);
      if (partes.length > 1 && partes.every((x) => x.trim())) {
        const vs = partes.map((x) => avaliarExpr(x, vals, prof + 1));
        const ns = vs.map((v) => (/^-?[\d.]*\d(,\d+)?$/.test(v.trim()) ? parseFloat(v.trim().replace(/\./g, '').replace(',', '.')) : NaN));
        if (ns.every((n) => !Number.isNaN(n))) {
          const r = ns.slice(1).reduce((a, n) => (op === '-' ? a - n : op === '*' ? a * n : n ? a / n : a), ns[0]);
          return vs.some((v) => /,\d\d$/.test(v)) || !Number.isInteger(r) ? r.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(r);
        }
        if (op === '-') return vs.filter(Boolean).join(' - ');
        return /\b100\b/.test(s) ? '25,00' : '';
      }
    }
    if (s[0] === '(' && fechaPar(s) === s.length - 1) return avaliarExpr(s.slice(1, -1), vals, prof + 1);
    if (/^\[/.test(s) && fechaCol(s, 0) === s.length - 1) return avaliarExpr(s.slice(1, -1), vals, prof + 1);
    if (/^\[/.test(s)) return avaliarTexto(s, vals);
    m = s.match(/^([A-Za-z_]\w*)\s*\(([\s\S]*?)\)?$/);
    if (m) {
      const fn = m[1].toUpperCase(); const args = dividirTopo(m[2], ',');
      const ev = (i) => avaliarExpr(args[i] || '', vals, prof + 1);
      if (fn === 'IF' || fn === 'IIF') return ev(1) || ev(2);
      if (['FORMATTEXT', 'FORMATFLOAT', 'FORMATDATETIME', 'FORMATMASKTEXT'].includes(fn)) return ev(1) || ev(0);
      if (['UPPERCASE', 'UPPER', 'ANSIUPPERCASE'].includes(fn)) return ev(0).toUpperCase();
      if (['LOWERCASE', 'LOWER'].includes(fn)) return ev(0).toLowerCase();
      for (let i = 0; i < args.length; i += 1) { const v = ev(i); if (v && !/^-?\d+$/.test(args[i].trim())) return v; }
      return ev(0);
    }
    if (dividirTopo(s, '=').length > 1 || /<>|>=|<=/.test(s)) return '';
    const cmp = s.match(/^(\S+)\s*[<>]\s*\S+$/); if (cmp) return '';
    if (/^-?\d+([.,]\d+)?$/.test(s)) return s;
    const u = s.toUpperCase(); if (VARS_FR[u]) return VARS_FR[u];
    if (/\u0001/.test(s)) return s.replace(/\u0001(\d+)\u0001/g, (_, i) => vals[+i]);
    return /^[A-Za-z_#][\w#]*$/.test(s) ? '' : s;
  }
  function fechaPar(t) {
    let d = 0; let q = false;
    for (let j = 0; j < t.length; j += 1) {
      if (t[j] === "'") q = !q;
      else if (!q && t[j] === '(') d += 1;
      else if (!q && t[j] === ')') { d -= 1; if (d === 0) return j; }
    }
    return -1;
  }
  function fechaCol(t, i) {
    let d = 0; let q = false;
    for (let j = i; j < t.length; j += 1) {
      if (t[j] === "'") q = !q;
      else if (!q && t[j] === '[') d += 1;
      else if (!q && t[j] === ']') { d -= 1; if (d === 0) return j; }
    }
    return t.length;
  }
  function avaliarTexto(t, vals) {
    t = t.replace(/\[?\w+\."[^"\]]*$/, '');
    let out = ''; let i = 0;
    while (i < t.length) {
      if (t[i] === '[') {
        let d = 0; let q = false; let j = i;
        for (; j < t.length; j += 1) {
          if (t[j] === "'") q = !q;
          else if (!q && t[j] === '[') d += 1;
          else if (!q && t[j] === ']') { d -= 1; if (d === 0) break; }
        }
        out += avaliarExpr(t.slice(i + 1, j), vals);
        i = j + 1;
      } else { out += t[i]; i += 1; }
    }
    return out.replace(/\u0001(\d+)\u0001/g, (_, x) => vals[+x]);
  }

  // ---- prévia a partir do layout do relatório (colunas, sub-linhas, grupos e totais)
  const hashTxt = (t) => {
    let h = 2166136261;
    for (const ch of String(t)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15; return h >>> 0;
  };
  const fmtMoeda = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function numerico(c, sistema) {
    const cod = c.codigo || '';
    const naoNum = /inscr|matric|cpf|cnpj|cep|fone|rg\b|doc|ano|mes|codigo|^cd|conta|agencia|banco|parcela|cheque/i;
    const bd = sistema ? (((window.CAMPOS_BD || {})[sistema]) || {})[cod] : null;
    if (bd && /^Valor \(2/.test(bd.tipo)) return 'moeda';
    if (/^vl/i.test(cod) && !naoNum.test(cod.slice(2))) return 'moeda';
    if (/^(nr|qt|qtd|tot)/i.test(cod) && !naoNum.test(cod)) return 'int';
    const ex = exemplo(c, 0, sistema);
    if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(ex)) return 'moeda';
    if (/^\d+$/.test(ex) && /^(nr|qt|vl|tot)/i.test(c.codigo) && !/inscr|matric|cpf|cep|fone|ano|mes|codigo|cd/i.test(c.codigo)) return 'int';
    return '';
  }
  function valorNum(c, k, tipo) {
    const h = hashTxt(c.codigo);
    const h2 = hashTxt(`${c.codigo}#${k}`);
    return tipo === 'moeda' ? (h2 % 850) + 40 + ((h >>> 5) % 100) / 100 : (h2 % 45) + 1;
  }
  function previaLayout(r, sistema, titulo) {
    const L = r.layout; const mapa = {};
    (r.campos || []).forEach((c) => { mapa[c.codigo] = c; });
    const campo = (cod) => mapa[cod] || { codigo: cod, descricao: cod, rotulo: '' };
    const nsub = Math.max(1, ...L.colunas.map((c) => (c.cel || []).length));
    const tipoCel = (cel) => {
      if (!cel || cel.t !== undefined) return '';
      const ts = cel.c.map((x) => numerico(campo(x), sistema));
      if (cel.calc === 'soma' && ts.every(Boolean)) return ts.includes('moeda') ? 'moeda' : 'int';
      return !cel.e && ts[0] ? ts[0] : '';
    };
    const subst = (e, cods, k, rot) => {
      const vals = [];
      let t = e;
      cods.forEach((x) => {
        const c = campo(x); const cc = /^cd/i.test(x) ? Object.assign({}, c, { rotulo: '' }) : Object.assign({}, c, { rotulo: rot || c.rotulo || '' });
        const v = /^cd/i.test(x) && !/inscr|empresa/i.test(x) ? String(k + 1) : exemplo(cc, k, sistema);
        t = t.replace(new RegExp(`[\\w.]+\\."${x}"`, 'gi'), () => { vals.push(v); return `\u0001${vals.length - 1}\u0001`; });
      });
      return avaliarTexto(t, vals).replace(/\s{3,}/g, '  ').replace(/^[\s:\-–]+|[\s:\-–]+$/g, '').trim();
    };
    const valor = (cel, col, k) => {
      if (!cel) return { txt: '', num: null };
      if (cel.t !== undefined) return { txt: cel.t, num: null };
      const tp = tipoCel(cel);
      if (tp) {
        const n = cel.calc === 'soma' ? cel.c.reduce((a, x) => a + valorNum(campo(x), k, numerico(campo(x), sistema)), 0) : valorNum(campo(cel.c[0]), k, tp);
        return { txt: tp === 'moeda' ? fmtMoeda(n) : String(Math.round(n)), num: n, tp };
      }
      if (cel.calc && cel.e && cel.c.every((x) => numerico(campo(x), sistema))) {
        const vals = []; let t = cel.e;
        cel.c.forEach((x) => {
          const c = campo(x); const tpx = numerico(c, sistema); const n = valorNum(c, k, tpx);
          t = t.replace(new RegExp(`[\\w.]+\\."${x}"`, 'gi'), () => { vals.push(tpx === 'moeda' ? fmtMoeda(n) : String(Math.round(n))); return `\u0001${vals.length - 1}\u0001`; });
        });
        const txt = avaliarTexto(t, vals).trim();
        const n = /^-?[\d.]*\d(,\d+)?$/.test(txt) ? parseFloat(txt.replace(/\./g, '').replace(',', '.')) : null;
        return { txt, num: n, tp: /,\d\d$/.test(txt) ? 'moeda' : 'int' };
      }
      if (cel.e) return { txt: subst(cel.e, cel.c, k, col.rotulo), num: null };
      const c = campo(cel.c[0]);
      return { txt: exemplo(Object.assign({}, c, { rotulo: c.rotulo || col.rotulo || '' }), k, sistema), num: null };
    };
    const colunas = L.colunas.map((c) => {
      if (c.rotulo) return c.rotulo.trim();
      const cel = (c.cel || []).find((x) => x && x.c);
      return cel ? (campo(cel.c[0]).descricao || '').toUpperCase() : '';
    });
    const sobre = [];
    L.colunas.forEach((c) => {
      const g = c.grupo || '';
      if (sobre.length && sobre[sobre.length - 1].texto === g) sobre[sobre.length - 1].span += 1; else sobre.push({ texto: g, span: 1 });
    });
    const linhas = []; const somas = [];
    for (let k = 0; k < 3; k += 1) {
      for (let i = 0; i < nsub; i += 1) {
        const vs = L.colunas.map((col) => valor((col.cel || [])[i], col, k));
        vs.forEach((v, j) => {
          somas[i] = somas[i] || [];
          if (v.num !== null) { const a = somas[i][j] || { n: 0, tp: v.tp }; a.n += v.num; somas[i][j] = a; }
        });
        linhas.push({ valores: vs.map((v) => v.txt), sub: i, inicio: i === 0 && k > 0 });
      }
    }
    let totais = [];
    if (L.colunas.some((c) => c.total)) {
      for (let i = 0; i < nsub; i += 1) {
        const lin = L.colunas.map((col, j) => {
          const cel = (col.cel || [])[i];
          if (cel && cel.t !== undefined) return cel.t;
          if (!col.total) return '';
          if (col.total === 'COUNT') return i === 0 ? '3' : '';
          const a = (somas[i] || [])[j];
          return a ? (a.tp === 'moeda' ? fmtMoeda(a.n) : String(Math.round(a.n))) : '';
        });
        if (lin.some((v, j) => v && L.colunas[j].total)) totais.push(lin);
      }
      if (totais.length) {
        const rot = (L.total_rotulo || (L.colunas.some((c) => c.total === 'SUM') ? 'TOTAIS:' : 'TOTAL:')).trim();
        if (L.colunas[0].total === 'COUNT' && totais[0][0]) totais[0][0] = `${rot} ${totais[0][0]}`;
        else if (!L.colunas[0].total && !totais[0][0]) totais[0][0] = rot;
        else totais.unshift(L.colunas.map((_, x) => (x === 0 ? rot : '')));
      }
    }
    const grupo = (L.grupos || []).map((g) => {
      let ctx = '';
      return g.map((it) => { if (it.t !== undefined) { ctx = it.t; return it.t; } return subst(it.e, it.c, 0, ctx); })
        .filter(Boolean).join(' ').replace(/\s+/g, ' ').replace(/\s+:/g, ':').trim();
    }).filter(Boolean);
    return {
      titulo, grupo: grupo.map((t) => ({ texto: t })), sobre: sobre.some((x) => x.texto) ? sobre : null,
      colunas, linhas, totais, subs: nsub,
    };
  }
  function resumoTotais(p) {
    const out = []; let bloco = null;
    p.layout.colunas.filter((c) => c.total).forEach((c) => {
      const cel = (c.cel || []).find((x) => x && x.c); const cc = cel ? (p.campos.find((x) => x.codigo === cel.c[0]) || {}) : {};
      const fn = c.total === 'COUNT' ? 'Quantidade' : 'Soma'; const rot = (c.rotulo || cc.descricao || '').trim();
      if (c.grupo && bloco && bloco.grupo === c.grupo && bloco.fn === fn) { bloco.fim = rot; bloco.n += 1; return; }
      bloco = { fn, grupo: c.grupo || '', ini: rot, fim: rot, n: 1 }; out.push(bloco);
    });
    return out.map((b) => (b.fn === 'Quantidade' ? 'Quantidade de registros' : b.grupo ? `${b.fn} de ${b.grupo} (${b.n > 1 ? `${b.ini} a ${b.fim}` : b.ini})` : `${b.fn} de ${b.ini}`));
  }
  function tituloPrevia(e) {
    const t = ((e.titulos || [])[0] || '').trim();
    if (!t || /\b(d[oae]s?|em|por|com|e|a|at[ée]|de)$/i.test(t) || t.length < 8) return e.titulo;
    return t;
  }
  function previa(r, sistema, titulo) {
    if (r.layout && (r.layout.colunas || []).length) return previaLayout(r, sistema, titulo);
    const cs = (r.campos || []).filter((c) => !['CABECALHO', 'RODAPE'].includes(c.codigo) && c.y !== undefined);
    if (!cs.length) return null;
    const freq = {}; cs.forEach((c) => { freq[c.y] = (freq[c.y] || 0) + 1; });
    const yDet = +Object.entries(freq).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
    const det = cs.filter((c) => c.y === yDet).sort((a, b) => a.x - b.x);
    const grp = cs.filter((c) => c.y < yDet && c.y !== yDet).sort((a, b) => a.y - b.y || a.x - b.x).slice(0, 3);
    let grupo = grp.map((c) => ({ rotulo: c.rotulo ? nomeCampoRel(c) : c.descricao, valor: exemplo(c, 0, sistema) }));
    if (!grupo.length && (r.agrupamentos || []).length) {
      const a = r.agrupamentos[0]; const cod = a.codigo || a; const desc = a.descricao || cod;
      const c = { codigo: cod, descricao: desc.replace(/^(Código|Número) de /, ''), rotulo: '' };
      grupo = [{ rotulo: c.descricao, valor: exemplo(c, 0, sistema) }];
    }
    const tot = (r.totais || []).some((t) => /count/i.test(t)) ? 'TOTAL: 3' : '';
    return {
      titulo, grupo: grupo.map((g) => ({ texto: `${g.rotulo.toUpperCase()}: ${g.valor}` })), sobre: null,
      colunas: det.map((c) => (c.rotulo ? c.rotulo : c.descricao.toUpperCase())),
      linhas: [0, 1, 2].map((i) => ({ valores: det.map((c) => exemplo(c, i, sistema)), sub: 0 })),
      totais: tot ? [det.map((_, j) => (j === 0 ? tot : ''))] : [], subs: 1,
    };
  }


  function infoBD(sistema, codigo) { return (((window.CAMPOS_BD || {})[sistema]) || {})[codigo] || null; }
  function enriquecer(e, c) {
    const bd = infoBD(e.sistema, c.codigo);
    const x = Object.assign({}, c);
    if (bd) { x.tipo_bd = bd.tipo; if (bd.dominio) x.dominio = bd.dominio; }
    x.tabela = e.campos_tabela[c.codigo] || (bd && bd.n_tabelas <= 3 ? bd.tabelas[0] : '');
    return x;
  }

  function detalheRel(id) {
    const e = relMapa().get(id);
    if (!e) throw erro('Relatório não encontrado.');
    const p = e.principal;
    const opcoes = [...new Set(e.membros.flatMap((m) => m.opcoes || []))].filter((o) => !/^(ok|cancela|cancelar|fechar|imprimir)$/i.test(o));
    return Object.assign(resumoEntrada(e), {
      descricao: e.descricao, palavras_chave: e.palavras_chave, caminho_menu: e.caminho_menu, tela: e.tela,
      filtros: clone(e.filtros), opcoes, campos: p ? p.campos.filter((c) => !['CABECALHO', 'RODAPE'].includes(c.codigo)).map((c) => enriquecer(e, c)) : [],
      agrupamentos: p ? p.agrupamentos : [], totais: p ? p.totais : [], previa: p ? previa(p, e.sistema, tituloPrevia(e)) : null, formato: p ? p.formato : '',
      tabelas: e.tabelas,
      titulos: e.titulos,
      totais_resumo: p && p.layout ? resumoTotais(p) : null,
      variantes: e.membros.map((m) => ({ id: m.id, arquivo: m.arquivo, caminho_arquivo: caminhoArquivo(m.arquivo), titulo: m.titulo, principal: m === p })),
      arquivos_sem_catalogo: e.arquivos_menu.filter((a) => !e.membros.some((m) => m.arquivo.toLowerCase() === a.toLowerCase())),
    });
  }

  function csvCatalogo() {
    const esc = (v) => { const t = String(v ?? ''); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const linhas = [['id', 'sistema', 'caminho_menu', 'titulo', 'origem_caminho', 'palavras_chave', 'arquivos', 'campos'].join(';')];
    [...relMapa().values()].sort((a, b) => a.menu.caminho.localeCompare(b.menu.caminho, 'pt-BR')).forEach((e) => {
      linhas.push([e.id, e.sistema, e.menu.caminho, e.titulo, { menu: 'menu do sistema', confirmado: 'confirmado', provavel: 'provável' }[e.menu.fonte] || '',
        e.palavras_chave, e.membros.map((m) => m.arquivo).join(', '), e.camposTodos.map(nomeCampoRel).join(', ')].map(esc).join(';'));
    });
    return '﻿' + linhas.join('\r\n');
  }

  function importarCaminhos(token) {
    const env = envio(token);
    const aba = Object.values(lerPlanilha(env))[0];
    const col = (re) => aba.colunas.find((c) => re.test(norm(c)));
    const cId = col(/^id$/), cArq = col(/^(arquivo|arquivos|report)$/) || col(/arquivo|report/);
    const cCam = col(/caminho menu|caminho|menu/);
    if ((!cId && !cArq) || !cCam) throw erro('A planilha precisa das colunas "id" (ou "arquivo") e "caminho_menu".');
    const cPal = col(/palavras/);
    const mapa = relMapa();
    const porArq = new Map();
    mapa.forEach((e) => e.membros.forEach((m) => { const k = m.arquivo.toLowerCase(); if (!porArq.has(k) || e.avulso) porArq.set(k, e.id); }));
    let ok = 0; const nao = [];
    aba.linhas.forEach((l) => {
      let id = cId ? String(l[cId] ?? '').trim() : '';
      if (!id || !mapa.has(id)) {
        const arq = cArq ? String(l[cArq] ?? '').split(',')[0].trim().split(/[\\/]/).pop() : '';
        id = porArq.get(arq.toLowerCase()) || porArq.get(`${arq}.frf`.toLowerCase()) || '';
        if (!id) { if (arq || cId) nao.push(arq || String(l[cId] || '')); return; }
      }
      const e = mapa.get(id);
      const antes = JSON.stringify(est.relatorios[id] || {});
      const o = Object.assign({}, est.relatorios[id] || {});
      const cam = vazio(l[cCam]) ? '' : String(l[cCam]).trim();
      if (cam && cam !== e.caminho_base) o.caminho_menu = cam;
      if (cPal && !vazio(l[cPal]) && String(l[cPal]).trim()) o.palavras_chave = String(l[cPal]).trim();
      if (JSON.stringify(o) !== antes) { est.relatorios[id] = o; ok++; }
    });
    salvarEstado(); invalidarRel();
    return { atualizados: ok, nao_encontrados: nao.slice(0, 50), total_nao_encontrados: nao.length };
  }

  // ============================================================ roteador (mesmas rotas da versão com servidor)
  async function api(url, opcoes = {}) {
    const u = new URL(url, 'http://local');
    const caminho = u.pathname.replace(/^\/api\//, '').split('/').map(decodeURIComponent);
    const m = (opcoes.method || 'GET').toUpperCase();
    const b = opcoes.body || {};
    const [r0, r1, r2] = caminho;

    if (r0 === 'status') {
      const cats = {};
      layoutsMapa().forEach((l) => { cats[l.categoria] = (cats[l.categoria] || 0) + 1; });
      return { layouts: layoutsMapa().size, procedimentos: procedimentos().length, paginas: (window.DADOS_AJUDA || []).length,
        modelos: est.modelos.length, relatorios: relMapa().size, categorias: cats, historico: est.historico.slice(0, 8), admin_protegido: false, armazenamento: armazenamentoOk };
    }
    if (r0 === 'login') return { token: 'livre' };
    if (r0 === 'relatorios') {
      if (r1 === '_config') {
        if (m === 'PUT') { est.pastaReports = String(b.pasta ?? '').trim(); if (est.pastaReports && !/[\\/]$/.test(est.pastaReports)) est.pastaReports += '\\'; salvarEstado(); }
        const cats = {}, sistemas = {}, fontes = {};
        relMapa().forEach((e) => { cats[e.assunto] = (cats[e.assunto] || 0) + 1; sistemas[e.sistema] = (sistemas[e.sistema] || 0) + 1; fontes[e.menu.fonte || 'nenhum'] = (fontes[e.menu.fonte || 'nenhum'] || 0) + 1; });
        return { pasta: est.pastaReports, sistemas, total: relMapa().size, assuntos: cats, fontes,
          com_caminho: (fontes.menu || 0) + (fontes.confirmado || 0), com_provavel: fontes.provavel || 0 };
      }
      if (r1 === '_csv') return { csv: csvCatalogo() };
      if (r1 === '_importar') return importarCaminhos(b.token);
      if (!r1) return buscarRelatorios(u.searchParams.get('q') || '', u.searchParams.get('assunto') || '', u.searchParams.get('sistema') || '', u.searchParams.get('campos') === '1');
      if (m === 'PUT') {
        const e = relMapa().get(r1);
        if (!e) throw erro('Relatório não encontrado.');
        const o = Object.assign({}, est.relatorios[r1] || {});
        ['caminho_menu', 'descricao', 'palavras_chave'].forEach((k) => { if (b[k] !== undefined) o[k] = String(b[k]).trim(); });
        if (!o.caminho_menu || o.caminho_menu === e.caminho_base) delete o.caminho_menu;
        est.relatorios[r1] = o; salvarEstado(); invalidarRel();
        return { ok: true, id: r1 };
      }
      return detalheRel(r1);
    }
    if (r0 === 'procv' && r1 === 'sugerir') return procvSugerir(b);
    if (r0 === 'procv' && r1 === 'executar') return procvExecutar(b);
    if (r0 === 'especiais') return ESPECIAIS;

    if (r0 === 'layouts') {
      if (!r1 && m === 'GET') {
        const q = semAcentos(u.searchParams.get('q') || '').toLowerCase().split(/\s+/).filter(Boolean);
        const cat = u.searchParams.get('categoria') || '';
        return [...layoutsMapa().values()].filter((l) => (!cat || l.categoria === cat) &&
          q.every((t) => semAcentos(`${l.titulo} ${l.id} ${l.nome_arquivo} ${l.observacao}`).toLowerCase().includes(t)))
          .map(resumoLayout).sort((a, x) => a.titulo.localeCompare(x.titulo, 'pt-BR'));
      }
      if (!r1 && m === 'POST') {
        const substituir = b._substituir;
        const l = validarLayout(clone(b));
        if (layoutsMapa().has(l.id) && !substituir) throw erro(`Já existe um layout com o identificador ${l.id}.`);
        gravarLayout(l, b.origem && b.origem !== 'ajuda' ? b.origem : 'manual');
        return { id: l.id };
      }
      if (r1 && r2 === 'exportar') return obterLayout(r1);
      if (r1 && m === 'GET') return obterLayout(r1);
      if (r1 && m === 'PUT') {
        const atual = layoutsMapa().get(r1);
        if (!atual) throw erro('Layout não encontrado.');
        const l = validarLayout(Object.assign(clone(b), { id: r1 }));
        gravarLayout(l, ['ajuda', 'editado'].includes(atual.origem || 'ajuda') ? 'editado' : atual.origem);
        return { id: r1 };
      }
      if (r1 && m === 'DELETE') {
        delete est.layouts[r1];
        if ((window.DADOS_LAYOUTS || []).some((x) => x.id === r1) && !est.excluidos.includes(r1)) est.excluidos.push(r1);
        est.modelos = est.modelos.filter((x) => x.layout_id !== r1);
        salvarEstado(); invalidarLayouts();
        return { ok: true };
      }
    }
    if (r0 === 'importacao') {
      const l = obterLayout(b.layout_id);
      if (r1 === 'sugerir') return sugerirMapa(l, b.colunas || []);
      if (r1 === 'gerar') return gerar(l, b.token, b.aba, b.config || {});
      if (r1 === 'ler') return ler(l, b.token, b.encoding);
    }
    if (r0 === 'modelos') {
      if (!r1 && m === 'POST') {
        const nome = String(b.nome || '').trim().slice(0, 80);
        if (!nome || !b.layout_id) throw erro('Informe o nome do modelo.');
        const ex = est.modelos.find((x) => x.layout_id === b.layout_id && x.nome === nome);
        if (ex) { ex.config = clone(b.config || {}); ex.criado_em = agora(); }
        else est.modelos.push({ id: est.seqModelo++, layout_id: b.layout_id, nome, config: clone(b.config || {}), criado_em: agora() });
        salvarEstado();
        return { ok: true };
      }
      const mod = est.modelos.find((x) => String(x.id) === String(r1));
      if (m === 'GET') { if (!mod) throw erro('Modelo não encontrado.'); return clone(mod); }
      if (m === 'DELETE') { est.modelos = est.modelos.filter((x) => String(x.id) !== String(r1)); salvarEstado(); return { ok: true }; }
    }
    if (r0 === 'ajuda') {
      if (r1 === 'buscar') return buscar(u.searchParams.get('q') || '');
      const d = detalhe(r1, r2);
      if (!d) throw erro('Conteúdo não encontrado.');
      return d;
    }
    if (r0 === 'procedimentos') {
      const lista = procedimentos();
      if (!r1 && m === 'GET') return clone(lista).sort((a, x) => `${a.categoria}${a.titulo}`.localeCompare(`${x.categoria}${x.titulo}`, 'pt-BR'));
      const dados = () => {
        if (!String(b.titulo || '').trim()) throw erro('Informe o título do procedimento.');
        const d = {};
        ['titulo', 'categoria', 'palavras_chave', 'procedimento', 'atencao', 'solucao'].forEach((k) => { d[k] = String(b[k] || '').trim(); });
        return d;
      };
      if (!r1 && m === 'POST') { const d = Object.assign(dados(), { id: est.seqProc++, criado_em: agora(), atualizado_em: agora() }); lista.push(d); salvarEstado(); _indice = null; return { id: d.id }; }
      const p = lista.find((x) => String(x.id) === String(r1));
      if (!p) throw erro('Procedimento não encontrado.');
      if (m === 'PUT') { Object.assign(p, dados(), { atualizado_em: agora() }); salvarEstado(); _indice = null; return { id: p.id }; }
      if (m === 'DELETE') { est.procedimentos = lista.filter((x) => x !== p); salvarEstado(); _indice = null; return { ok: true }; }
    }
    throw erro(`Rota desconhecida: ${url}`);
  }

  // ============================================================ backup
  function exportarBackup() {
    return JSON.stringify({ tipo: 'central-apoio-backup', versao: 1, gerado_em: agora(), dados: est }, null, 1);
  }
  function importarBackup(texto) {
    const j = JSON.parse(texto);
    if (!j || j.tipo !== 'central-apoio-backup' || !j.dados) throw erro('Arquivo não é um backup da Base de Apoio.');
    est = Object.assign({ layouts: {}, excluidos: [], procedimentos: null, modelos: [], seqModelo: 1, seqProc: 1000, historico: [], relatorios: {}, pastaReports: 'Reports\\' }, j.dados);
    salvarEstado(); invalidarLayouts(); invalidarRel();
    return { layouts: Object.keys(est.layouts).length, procedimentos: (est.procedimentos || []).length, modelos: est.modelos.length };
  }
  function restaurarPadrao() { localStorage.removeItem(CHAVE); carregarEstado(); invalidarLayouts(); invalidarRel(); }
  function resumoAlteracoes() {
    return { layouts: Object.keys(est.layouts).length, excluidos: est.excluidos.length, procedimentos: est.procedimentos ? est.procedimentos.length : 0,
      procedimentos_alterados: !!est.procedimentos, modelos: est.modelos.length, relatorios: Object.keys(est.relatorios || {}).length, armazenamento: armazenamentoOk };
  }

  return { api, enviar, baixar, baixarTexto, exportarBackup, importarBackup, restaurarPadrao, resumoAlteracoes,
    csvCatalogo, _teste: { formatar, escalar, textoDecimal, paraData, Dia, norm, sugerirMapa, buscar, layoutsMapa } };
})();
