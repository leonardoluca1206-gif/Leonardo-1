/* Base de Apoio — Estatísticas: gráficos de sócios e empresas com os dados do ProSindW.
   Só consultas SELECT pelo conector (BaseDeApoio.exe). Os gráficos são HTML/CSS (sem biblioteca). */
'use strict';

const ES = { de: '', ate: '', contribEmp: '', contribSoc: '', tol: 1, cadastro: false, contribs: null, dados: {}, vez: 0 };

// ============================================================ datas e competências
const idxMes = (iso) => (+iso.slice(0, 4)) * 12 + (+iso.slice(5, 7)) - 1; // mês como número contínuo
const refIdx = (i) => `${String((i % 12) + 1).padStart(2, '0')}/${Math.floor(i / 12)}`;
// isoDe vem do assistente.js
const ontemISO = () => { const d = new Date(); d.setDate(d.getDate() - 1); return isoDe(d); };
const menorISO = (a, b) => (a < b ? a : b);
const inteiro = (n) => String(Math.trunc(Number(n) || 0)); // só números entram no texto do SQL
const pct = (v, t) => (t ? `${(v * 100 / t).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '0%');
const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function periodoPadrao() { const d = new Date(); ES.de = `${d.getFullYear()}-01-01`; ES.ate = hojeISO(); }
const ATALHOS = [
  ['Este mês', () => { const d = new Date(); return [isoDe(new Date(d.getFullYear(), d.getMonth(), 1)), hojeISO()]; }],
  ['Últimos 3 meses', () => { const d = new Date(); return [isoDe(new Date(d.getFullYear(), d.getMonth() - 2, 1)), hojeISO()]; }],
  ['Últimos 12 meses', () => { const d = new Date(); return [isoDe(new Date(d.getFullYear(), d.getMonth() - 11, 1)), hojeISO()]; }],
  ['Este ano', () => [`${new Date().getFullYear()}-01-01`, hojeISO()]],
  ['Ano passado', () => { const a = new Date().getFullYear() - 1; return [`${a}-01-01`, `${a}-12-31`]; }],
];

// ============================================================ consultas
// Empresas: ATIVA (1/0) e ATRASO (1 = tem contribuição vencida e não paga com vencimento no período)
function sqlEmpresas(detalhe) {
  const lim = menorISO(ES.ate, ontemISO());
  const cond = ['C.CDEMPRESA = E.CDGRUPO', 'C.DTPAGAMENTO IS NULL', 'C.DTVENCIMENTO BETWEEN ? AND ?']; const pc = [ES.de, lim];
  if (ES.contribEmp) { cond.push('C.CDCONTRIBUICAO = ?'); pc.push(ES.contribEmp); }
  const w = []; const pw = [];
  if (ES.cadastro) { w.push('E.DTCADASTRO BETWEEN ? AND ?'); pw.push(ES.de, ES.ate); }
  const c = cond.join(' AND ');
  const extra = detalhe ? `, (SELECT COUNT(*) FROM PSW_CONTRIBEMP C WHERE ${c}) AS QTDATRASO,
      (SELECT MAX(C.DTPAGAMENTO) FROM PSW_CONTRIBEMP C WHERE C.CDEMPRESA = E.CDGRUPO AND C.DTPAGAMENTO IS NOT NULL) AS ULTPAGTO` : '';
  return {
    sql: `SELECT E.CDGRUPO, E.NMEMPRESA, E.NRCNPJ, E.NMCIDADE, E.CDUF, E.NRFONE, E.INSITUACAO,
      CASE WHEN E.INSITUACAO = 'Ativa' THEN 1 ELSE 0 END AS ATIVA,
      CASE WHEN EXISTS (SELECT 1 FROM PSW_CONTRIBEMP C WHERE ${c}) THEN 1 ELSE 0 END AS ATRASO,
      (SELECT SUM(COALESCE(C.VLPAGAMENTO, 0)) FROM PSW_CONTRIBEMP C WHERE ${c}) AS VLATRASO${extra}
      FROM PSW_EMPRESAS E ${w.length ? `WHERE ${w.join(' AND ')}` : ''}`,
    params: [...pc, ...pc, ...(detalhe ? pc : []), ...pw],
  };
}

function sqlEmpresasMeses() {
  const w = ['C.DTVENCIMENTO BETWEEN ? AND ?']; const a = [hojeISO(), hojeISO(), ES.de, ES.ate];
  if (ES.contribEmp) { w.push('C.CDCONTRIBUICAO = ?'); a.push(ES.contribEmp); }
  return {
    sql: `SELECT REF, SUM(PAGO) AS PAGAS, SUM(ATR) AS ATRASADAS, SUM(ABE) AS AVENCER, SUM(VP) AS VLPAGO, SUM(VA) AS VLATRASO FROM (
      SELECT EXTRACT(YEAR FROM C.DTVENCIMENTO) * 12 + EXTRACT(MONTH FROM C.DTVENCIMENTO) - 1 AS REF,
        CASE WHEN C.DTPAGAMENTO IS NOT NULL THEN 1 ELSE 0 END AS PAGO,
        CASE WHEN C.DTPAGAMENTO IS NULL AND C.DTVENCIMENTO < ? THEN 1 ELSE 0 END AS ATR,
        CASE WHEN C.DTPAGAMENTO IS NULL AND C.DTVENCIMENTO >= ? THEN 1 ELSE 0 END AS ABE,
        CASE WHEN C.DTPAGAMENTO IS NOT NULL THEN COALESCE(C.VLPAGAMENTO, 0) ELSE 0 END AS VP,
        CASE WHEN C.DTPAGAMENTO IS NULL THEN COALESCE(C.VLPAGAMENTO, 0) ELSE 0 END AS VA
      FROM PSW_CONTRIBEMP C WHERE ${w.join(' AND ')}) X GROUP BY REF ORDER BY REF`,
    params: a,
  };
}

function sqlSociosSituacao() {
  const w = []; const a = [];
  if (ES.cadastro) { w.push('S.DTINSCRICAO BETWEEN ? AND ?'); a.push(ES.de, ES.ate); }
  return {
    sql: `SELECT S.INSITUACAO, SUM(CASE WHEN S.CDSEXO = 'M' THEN 1 ELSE 0 END) AS MASC, SUM(CASE WHEN S.CDSEXO = 'F' THEN 1 ELSE 0 END) AS FEM,
      COUNT(*) AS TOTAL FROM PSW_SOCIOS S ${w.length ? `WHERE ${w.join(' AND ')}` : ''} GROUP BY S.INSITUACAO ORDER BY 4 DESC`,
    params: a,
  };
}

// competências exigidas da mensalidade: do mês de "De" (ou da filiação, se depois) até o mês de "Até";
// a tolerância só tira os meses mais recentes (que ainda podem estar sendo pagos)
function faixaMensalidade() {
  const ini = idxMes(ES.de);
  const fim = Math.min(idxMes(ES.ate), idxMes(hojeISO()) - ES.tol);
  return { ini, fim };
}

// Sócios (exceto desfiliados): M = 1 se falta mensalidade paga na faixa; CT = 2 contribuição vencida em aberto, 1 em dia, 0 sem lançamento
function sqlSociosFin(detalhe, filtroExterno = '') {
  const { ini, fim } = faixaMensalidade();
  const FIL = '(EXTRACT(YEAR FROM S.DTINSCRICAO) * 12 + EXTRACT(MONTH FROM S.DTINSCRICAO) - 1)';
  const INI = `(CASE WHEN COALESCE(${FIL}, ${inteiro(ini)}) > ${inteiro(ini)} THEN ${FIL} ELSE ${inteiro(ini)} END)`;
  const REFP = '(P.NRANOPAGTO * 12 + P.NRMESPAGTO - 1)';
  const lim = menorISO(ES.ate, ontemISO());
  const cAtr = ['C.NRINSSOC = S.NRINSCRICAO', 'C.DTPAGAMENTO IS NULL', 'C.DTVENCIMENTO BETWEEN ? AND ?']; const pAtr = [ES.de, lim];
  const cTod = ['C.NRINSSOC = S.NRINSCRICAO', 'C.DTVENCIMENTO BETWEEN ? AND ?']; const pTod = [ES.de, ES.ate];
  if (ES.contribSoc) { cAtr.push('C.CDCONTRIBUICAO = ?'); pAtr.push(ES.contribSoc); cTod.push('C.CDCONTRIBUICAO = ?'); pTod.push(ES.contribSoc); }
  const w = ["COALESCE(S.INSITUACAO, '') <> 'Desfiliado'"]; const pw = [];
  if (ES.cadastro) { w.push('S.DTINSCRICAO BETWEEN ? AND ?'); pw.push(ES.de, ES.ate); }
  const sel = [`(${inteiro(fim)} - ${INI} + 1) AS ESP`,
    `(SELECT COUNT(DISTINCT ${REFP}) FROM PSW_PAGTOMENSALIDADE P WHERE P.NRINSCRSOC = S.NRINSCRICAO AND P.DTPAGTO IS NOT NULL AND ${REFP} BETWEEN ${INI} AND ${inteiro(fim)}) AS PAGAS`,
    `CASE WHEN EXISTS (SELECT 1 FROM PSW_CONTRIBSOC C WHERE ${cAtr.join(' AND ')}) THEN 2 WHEN EXISTS (SELECT 1 FROM PSW_CONTRIBSOC C WHERE ${cTod.join(' AND ')}) THEN 1 ELSE 0 END AS CT`];
  const params = [...pAtr, ...pTod];
  let join = '';
  if (detalhe) {
    sel.unshift('S.NRINSCRICAO', 'S.NMSOCIO', 'S.INSITUACAO', 'E.NMABREVEMP AS EMPRESA', 'S.DTINSCRICAO', 'S.NRCELULAR',
      `(SELECT MAX(P.NRANOPAGTO * 100 + P.NRMESPAGTO) FROM PSW_PAGTOMENSALIDADE P WHERE P.NRINSCRSOC = S.NRINSCRICAO AND P.DTPAGTO IS NOT NULL) AS ULTMENS`);
    sel.push(`(SELECT SUM(COALESCE(C.VLPAGAMENTO, 0)) FROM PSW_CONTRIBSOC C WHERE ${cAtr.join(' AND ')}) AS VLCONTATR`);
    params.push(...pAtr);
    join = 'LEFT JOIN PSW_EMPRESAS E ON E.CDGRUPO = S.CDEMPRESA';
  }
  const interno = `SELECT ${sel.join(',\n      ')} FROM PSW_SOCIOS S ${join} WHERE ${w.join(' AND ')}`;
  const M = 'CASE WHEN X.ESP <= 0 OR X.PAGAS >= X.ESP THEN 0 ELSE 1 END';
  if (!detalhe) return { sql: `SELECT M, CT, COUNT(*) AS QTD FROM (SELECT ${M} AS M, X.CT FROM (${interno}) X) Y GROUP BY M, CT`, params: [...params, ...pw] };
  return {
    sql: `SELECT * FROM (SELECT X.NRINSCRICAO, X.NMSOCIO, X.INSITUACAO, X.EMPRESA, X.DTINSCRICAO, X.NRCELULAR, X.ULTMENS,
      CASE WHEN X.ESP > X.PAGAS THEN X.ESP - X.PAGAS ELSE 0 END AS MESESATR, ${M} AS M, X.CT, X.VLCONTATR FROM (${interno}) X) Y
      ${filtroExterno ? `WHERE ${filtroExterno}` : ''} ORDER BY NMSOCIO`,
    params: [...params, ...pw],
  };
}

function sqlMensalidadesMeses() {
  return {
    sql: `SELECT REF, COUNT(*) AS QTD, SUM(VL) AS VL FROM (SELECT EXTRACT(YEAR FROM P.DTPAGTO) * 12 + EXTRACT(MONTH FROM P.DTPAGTO) - 1 AS REF, COALESCE(P.VLPAGTO, 0) AS VL
      FROM PSW_PAGTOMENSALIDADE P WHERE P.DTPAGTO BETWEEN ? AND ?) X GROUP BY REF ORDER BY REF`,
    params: [ES.de, ES.ate],
  };
}

const consultaES = (q, limite = 20000) => Conector.api('consulta', { body: { sql: q.sql, params: q.params, limite } });
const linhasObj = (res) => res.linhas.map((l) => Object.fromEntries(res.colunas.map((c, i) => [c.toUpperCase(), l[i]])));

// ============================================================ categorias de cada gráfico
// cores: status (em dia / atraso) com rótulo e ícone; situações com a paleta categórica em ordem fixa
const CAT_EMPRESAS = [
  { k: '10', rotulo: 'Ativas em dia', cor: 'bom', icone: 'ok' },
  { k: '11', rotulo: 'Ativas inadimplentes', cor: 'critico', icone: 'alerta' },
  { k: '01', rotulo: 'Inativas em atraso', cor: 'serio', icone: 'alerta' },
  { k: '00', rotulo: 'Inativas sem atraso', cor: 'neutro', icone: 'ok' },
];
const CAT_MENS = [
  { k: 0, rotulo: 'Mensalidade em dia', cor: 'bom', icone: 'ok', filtro: 'M = 0' },
  { k: 1, rotulo: 'Mensalidade em atraso', cor: 'critico', icone: 'alerta', filtro: 'M = 1' },
];
const CAT_CONTRIB = [
  { k: 1, rotulo: 'Contribuição em dia', cor: 'bom', icone: 'ok', filtro: 'CT = 1' },
  { k: 2, rotulo: 'Contribuição em atraso', cor: 'critico', icone: 'alerta', filtro: 'CT = 2' },
  { k: 0, rotulo: 'Sem contribuição no período', cor: 'neutro', icone: 'info', filtro: 'CT = 0' },
];
const CAT_AMBOS = [
  { k: '00', rotulo: 'Em dia nas duas', cor: 'bom', icone: 'ok', filtro: 'M = 0 AND CT < 2' },
  { k: '10', rotulo: 'Só mensalidade em atraso', cor: 'serio', icone: 'alerta', filtro: 'M = 1 AND CT < 2' },
  { k: '01', rotulo: 'Só contribuição em atraso', cor: 'alerta', icone: 'alerta', filtro: 'M = 0 AND CT = 2' },
  { k: '11', rotulo: 'Atrasados nas duas', cor: 'critico', icone: 'alerta', filtro: 'M = 1 AND CT = 2' },
];

// ============================================================ desenho dos gráficos
/** Barra 100% (parte do todo) + lista de barras horizontais clicáveis, que também é a legenda. */
function graficoPartes(id, cats, total, opc = {}) {
  if (!total) return '<p class="vazio-gf">Nenhum registro com esses filtros.</p>';
  const faixa = cats.filter((c) => c.v > 0).map((c) => `<i class="gf-${c.cor}" style="flex-grow:${c.v}" data-tip="${esc(`${c.rotulo}: ${fmtN(c.v)} (${pct(c.v, total)})`)}"></i>`).join('');
  const max = Math.max(...cats.map((c) => c.v), 1);
  return `<div class="gf-faixa" role="img" aria-label="${esc(cats.map((c) => `${c.rotulo} ${fmtN(c.v)}`).join(', '))}">${faixa}</div>
  <div class="gf-lista">${cats.map((c, i) => `<button type="button" class="gf-linha" data-gf="${esc(id)}" data-i="${i}" ${c.v ? '' : 'disabled'} title="${c.v ? 'Ver a lista' : ''}">
    <span class="gf-rot"><span class="gf-cor gf-${c.cor}">${c.icone ? ico(c.icone, 'p') : ''}</span>${esc(c.rotulo)}</span>
    <span class="gf-trilho"><i class="gf-${c.cor}" style="width:${c.v ? Math.max(1.5, c.v * 100 / max) : 0}%"></i></span>
    <span class="gf-val num"><b>${fmtN(c.v)}</b><small>${pct(c.v, total)}${c.extra ? ` · ${esc(c.extra)}` : ''}</small></span>
    ${opc.semLista ? '' : ico('seta', 'p gf-ir')}</button>`).join('')}</div>`;
}

/** Colunas empilhadas por mês (ou por ano, se o período for longo), com eixo, grade e dica ao passar o mouse. */
function graficoMeses(linhas, series, fmtValor = fmtN) {
  if (!linhas.length) return '<p class="vazio-gf">Nenhum lançamento no período.</p>';
  let pts = linhas;
  if (pts.length > 36) { // período longo: soma por ano
    const m = new Map();
    pts.forEach((p) => { const a = Math.floor(p.i / 12); const t = m.get(a) || { i: a, ano: true, v: {} }; series.forEach((s) => { t.v[s.k] = (t.v[s.k] || 0) + (p.v[s.k] || 0); }); m.set(a, t); });
    pts = [...m.values()];
  }
  const somas = pts.map((p) => series.reduce((a, s) => a + (p.v[s.k] || 0), 0));
  const passo = escalaPasso(Math.max(...somas, 1));
  const topo = Math.ceil(Math.max(...somas, 1) / passo) * passo;
  const ticks = []; for (let t = 0; t <= topo; t += passo) ticks.push(t);
  const rot = (p) => (p.ano ? String(p.i) : `${NOMES_MES[p.i % 12]}/${String(Math.floor(p.i / 12)).slice(2)}`);
  const mostrar = Math.ceil(pts.length / 6); // no máximo ~6 rótulos no eixo (cabe no celular)
  return `<div class="gf-col-area">
    <div class="gf-eixo">${ticks.slice().reverse().map((t) => `<span>${esc(fmtCurto(t))}</span>`).join('')}</div>
    <div class="gf-plot" style="--n:${pts.length}">
      ${ticks.map((t) => `<i class="gf-grade${t === 0 ? ' base' : ''}" style="bottom:${t * 100 / topo}%"></i>`).join('')}
      ${pts.map((p, j) => `<div class="gf-col" tabindex="0" data-tip="${esc(`<b>${p.ano ? p.i : refIdx(p.i)}</b>${series.map((s) => `<br>${s.rotulo}: ${fmtValor(p.v[s.k] || 0)}`).join('')}`)}" data-html="1">
        <div class="gf-pilha" style="height:${somas[j] * 100 / topo}%">${series.map((s) => (p.v[s.k] ? `<i class="gf-${s.cor}" style="flex-grow:${p.v[s.k]}"></i>` : '')).join('')}</div>
        <span class="gf-xrot">${j % mostrar === 0 ? esc(rot(p)) : ''}</span></div>`).join('')}
    </div></div>
    <div class="gf-legenda">${series.map((s) => `<span><i class="gf-cor gf-${s.cor}"></i>${esc(s.rotulo)}</span>`).join('')}</div>
    <details class="gf-tabela"><summary>Ver tabela</summary><div class="tabela-wrap"><table><thead><tr><th>${pts[0].ano ? 'Ano' : 'Mês'}</th>${series.map((s) => `<th class="num">${esc(s.rotulo)}</th>`).join('')}</tr></thead>
      <tbody>${pts.map((p) => `<tr><td>${p.ano ? p.i : refIdx(p.i)}</td>${series.map((s) => `<td class="num">${esc(fmtValor(p.v[s.k] || 0))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}
function escalaPasso(max) { const b = 10 ** Math.floor(Math.log10(max / 4)); return [1, 2, 2.5, 5, 10].map((f) => f * b).find((s) => max / s <= 5) || b * 10; }
function fmtCurto(v) { return v >= 1e6 ? `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : v >= 1e4 ? `${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : fmtN(v); }
const fmtReal = (v) => `R$ ${fmtMoeda(v || 0)}`;

function kpi(valor, rotulo, sub = '', classe = '') {
  return `<div class="stat gf-kpi ${classe}"><b>${esc(valor)}</b><span>${esc(rotulo)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
}

// dica flutuante (mouse e teclado)
function ligarDicas(raiz) {
  let tip = $('#gf-tip');
  if (!tip) { tip = document.createElement('div'); tip.id = 'gf-tip'; tip.className = 'gf-tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
  const mostrar = (el, x, y) => {
    if (el.dataset.html) tip.innerHTML = el.dataset.tip; else tip.textContent = el.dataset.tip;
    tip.classList.add('mostrar');
    const w = tip.offsetWidth; const h = tip.offsetHeight;
    tip.style.left = `${Math.min(window.innerWidth - w - 8, Math.max(8, x - w / 2))}px`;
    tip.style.top = `${Math.max(8, y - h - 12)}px`;
  };
  const esconder = () => tip.classList.remove('mostrar');
  $$('[data-tip]', raiz).forEach((el) => {
    el.onmousemove = (e) => mostrar(el, e.clientX, e.clientY);
    el.onmouseleave = esconder;
    el.onfocus = () => { const r = el.getBoundingClientRect(); mostrar(el, r.left + r.width / 2, r.top); };
    el.onblur = esconder;
  });
}

// ============================================================ tela
async function telaEstatisticas() {
  if (!ES.de) periodoPadrao();
  app.innerHTML = `
  <div class="cabecalho-pagina"><div><h1>Estatísticas</h1>
    <p>Gráficos dos sócios e das empresas com os dados do ProSindW: situação, mensalidade, contribuição e inadimplência no período escolhido.</p></div>
    <div class="acoes"><button type="button" class="botao sec" id="es-xlsx" disabled>${ico('baixar')}Excel do resumo</button></div></div>
  <div id="es-corpo"></div>`;
  if (!Conector.ativo) {
    $('#es-corpo').innerHTML = `<div class="cartao"><p class="aviso">As estatísticas usam os dados do banco. Abra o sistema pelo <strong>BaseDeApoio.exe</strong>.</p></div>`;
    return;
  }
  $('#es-corpo').innerHTML = `
  <form class="cartao es-filtros" id="es-form">
    <div class="linha-form">
      <div class="campo"><label for="es-de">De</label><input type="date" id="es-de" value="${esc(ES.de)}" required></div>
      <div class="campo"><label for="es-ate">Até</label><input type="date" id="es-ate" value="${esc(ES.ate)}" required></div>
      <div class="campo"><label for="es-ce">Contribuição das empresas</label><select id="es-ce"><option value="">Todas</option></select></div>
      <div class="campo"><label for="es-cs">Contribuição dos sócios</label><select id="es-cs"><option value="">Todas</option></select></div>
      <div class="campo"><label for="es-tol">Mensalidade: tolerância</label><select id="es-tol">
        <option value="0">Exigir também o mês atual</option><option value="1">Não exigir o mês atual</option><option value="2">Tolerar 2 meses</option><option value="3">Tolerar 3 meses</option></select></div>
      <div class="fixo campo"><button class="botao" type="submit">${ico('filtro')}Aplicar</button></div>
    </div>
    <div class="es-linha2">
      <div class="chips">${ATALHOS.map(([r], i) => `<button type="button" class="chip peq" data-at="${i}">${esc(r)}</button>`).join('')}</div>
      <label class="check"><input type="checkbox" id="es-cad" ${ES.cadastro ? 'checked' : ''}>Só sócios filiados e empresas cadastradas no período</label>
    </div>
    <details class="es-regras"><summary>${ico('info', 'p')}Como os números são calculados</summary>
      <ul>
        <li><strong>Empresas inadimplentes / em atraso:</strong> têm contribuição (Contribuições das empresas) com vencimento entre “De” e “Até”, já vencida (antes de hoje) e sem pagamento. Ativas = situação “Ativa”; as demais contam como inativas.</li>
        <li><strong>Mensalidade dos sócios:</strong> em dia quando há pagamento de todas as competências do mês de “De” (ou do mês da filiação, se depois) até o mês de “Até”. A tolerância deixa de exigir os meses mais recentes (ex.: “Não exigir o mês atual”). Desfiliados não entram.</li>
        <li><strong>Contribuição dos sócios:</strong> em atraso quando há contribuição com vencimento no período, vencida e sem pagamento; em dia quando há lançamentos no período e nenhum vencido em aberto.</li>
        <li><strong>Sócios por situação:</strong> todos os cadastros; com a opção “Só filiados no período”, apenas os filiados entre “De” e “Até”.</li>
        <li>Clique em uma linha de qualquer gráfico para ver a lista, com Excel e PDF.</li>
      </ul></details>
  </form>
  <div class="stats es-kpis" id="es-kpis"></div>
  <div class="grade-2 es-grade">
    <section class="cartao" id="es-sit"><div class="cartao-titulo"><h3>Sócios por situação</h3><span class="contagem" id="es-sit-n"></span></div><div class="es-c"></div></section>
    <section class="cartao" id="es-emp"><div class="cartao-titulo"><h3>Empresas: ativas, inativas e inadimplência</h3><span class="contagem" id="es-emp-n"></span></div><div class="es-c"></div></section>
    <section class="cartao" id="es-mens"><div class="cartao-titulo"><h3>Sócios: mensalidade</h3><span class="contagem" id="es-mens-n"></span></div><div class="es-c"></div></section>
    <section class="cartao" id="es-cont"><div class="cartao-titulo"><h3>Sócios: contribuição</h3><span class="contagem" id="es-cont-n"></span></div><div class="es-c"></div></section>
    <section class="cartao" id="es-ambos"><div class="cartao-titulo"><h3>Sócios: mensalidade e contribuição juntas</h3></div><div class="es-c"></div></section>
    <section class="cartao" id="es-mmes"><div class="cartao-titulo"><h3>Mensalidades recebidas por mês</h3><span class="contagem">data do pagamento</span></div><div class="es-c"></div></section>
    <section class="cartao es-largo" id="es-emes"><div class="cartao-titulo"><h3>Contribuições das empresas por mês de vencimento</h3><span class="contagem">quantidade de lançamentos</span></div><div class="es-c"></div></section>
  </div>
  <section class="cartao" id="es-det" hidden></section>`;
  $('#es-tol').value = String(ES.tol);
  $$('[data-at]').forEach((b) => { b.onclick = () => { const [de, ate] = ATALHOS[+b.dataset.at][1](); $('#es-de').value = de; $('#es-ate').value = ate; $('#es-form').requestSubmit(); }; });
  $('#es-form').onsubmit = (e) => {
    e.preventDefault();
    const de = $('#es-de').value; const ate = $('#es-ate').value;
    if (!de || !ate) { toast('Informe as duas datas.', 'erro'); return; }
    if (de > ate) { toast('A data “De” precisa ser anterior a “Até”.', 'erro'); return; }
    Object.assign(ES, { de, ate, contribEmp: $('#es-ce').value, contribSoc: $('#es-cs').value, tol: +$('#es-tol').value, cadastro: $('#es-cad').checked });
    carregarEstatisticas();
  };
  $('#es-xlsx').onclick = () => excelResumoES().catch(falha);
  carregarContribsES();
  carregarEstatisticas();
}

async function carregarContribsES() {
  try { if (!ES.contribs) ES.contribs = (await Conector.api('contribuicoes')).itens || []; } catch { ES.contribs = []; }
  const ops = ES.contribs.map((c) => `<option value="${esc(c.codigo)}">${esc(`${c.codigo} - ${c.descricao}`)}${c.situacao === 'Inativa' ? ' (inativa)' : ''}</option>`).join('');
  [['#es-ce', ES.contribEmp], ['#es-cs', ES.contribSoc]].forEach(([s, v]) => { const el = $(s); if (el) { el.insertAdjacentHTML('beforeend', ops); el.value = v; } });
}

function secao(id, html) { const el = $(`#${id} .es-c`); if (el) { el.innerHTML = html; ligarDicas(el); } }
function carregandoSecao(id) { secao(id, '<p class="sutil"><span class="carregando"></span> Consultando o banco…</p>'); }
function erroSecao(id, e) { secao(id, `<p class="erro-txt">${esc(e.message || String(e))}</p>`); }

async function carregarEstatisticas() {
  const vez = ++ES.vez;
  ES.dados = {};
  $('#es-det').hidden = true;
  $('#es-xlsx').disabled = true;
  ['es-sit', 'es-emp', 'es-mens', 'es-cont', 'es-ambos', 'es-mmes', 'es-emes'].forEach(carregandoSecao);
  $('#es-kpis').innerHTML = '';
  const atual = () => vez === ES.vez && $('#es-corpo');
  const tarefas = [
    consultaES(sqlSociosSituacao()).then((r) => { if (atual()) desenharSituacao(linhasObj(r)); }).catch((e) => atual() && erroSecao('es-sit', e)),
    consultaES({ sql: `SELECT ATIVA, ATRASO, COUNT(*) AS QTD, SUM(COALESCE(VLATRASO, 0)) AS VL FROM (${sqlEmpresas(false).sql}) X GROUP BY ATIVA, ATRASO`, params: sqlEmpresas(false).params })
      .then((r) => { if (atual()) desenharEmpresas(linhasObj(r)); }).catch((e) => atual() && erroSecao('es-emp', e)),
    consultaES(sqlSociosFin(false)).then((r) => { if (atual()) desenharSociosFin(linhasObj(r)); })
      .catch((e) => { if (atual()) ['es-mens', 'es-cont', 'es-ambos'].forEach((id) => erroSecao(id, e)); }),
    consultaES(sqlMensalidadesMeses()).then((r) => { if (atual()) desenharMensMeses(linhasObj(r)); }).catch((e) => atual() && erroSecao('es-mmes', e)),
    consultaES(sqlEmpresasMeses()).then((r) => { if (atual()) desenharEmpMeses(linhasObj(r)); }).catch((e) => atual() && erroSecao('es-emes', e)),
  ];
  await Promise.allSettled(tarefas);
  if (!atual()) return;
  desenharKpis();
  $('#es-xlsx').disabled = !Object.keys(ES.dados).length;
}

const periodoTxt = () => `${fmtData(ES.de)} a ${fmtData(ES.ate)}`;
const nomeContrib = (cd) => { const c = (ES.contribs || []).find((x) => x.codigo === cd); return c ? `${c.codigo} - ${c.descricao}` : cd; };

function desenharSituacao(ls) {
  // cor pela situação (ordem alfabética, fixa entre filtros), não pela posição no ranking
  const nomes = [...new Set(ls.map((l) => String(l.INSITUACAO || '').trim() || '(não informada)'))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const cats = ls.map((l) => {
    const nome = String(l.INSITUACAO || '').trim() || '(não informada)';
    const ci = nomes.indexOf(nome);
    return { rotulo: nome, v: Number(l.TOTAL) || 0, cor: ci < 8 ? `c${ci + 1}` : 'neutro', extra: `${fmtN(l.MASC)} M · ${fmtN(l.FEM)} F`, situacao: l.INSITUACAO };
  });
  const total = cats.reduce((a, c) => a + c.v, 0);
  ES.dados.situacao = { cats, total };
  $('#es-sit-n').textContent = `${fmtN(total)} sócios${ES.cadastro ? ' filiados no período' : ''}`;
  secao('es-sit', graficoPartes('sit', cats, total));
  ligarLinhas('es-sit', cats, (c) => abrirDetalhe({
    titulo: `Sócios — situação ${c.rotulo}`,
    subtitulo: ES.cadastro ? `Filiados de ${periodoTxt()}` : 'Todos os cadastros',
    colunas: [['NRINSCRICAO', 'Inscrição', 'int'], ['NMSOCIO', 'Nome'], ['CDSEXO', 'Sexo'], ['DTINSCRICAO', 'Filiação', 'data'], ['DTSITUACAO', 'Data da situação', 'data'], ['EMPRESA', 'Empresa'], ['NMCIDADE', 'Cidade'], ['NRCELULAR', 'Celular']],
    q: {
      sql: `SELECT S.NRINSCRICAO, S.NMSOCIO, S.CDSEXO, S.DTINSCRICAO, S.DTSITUACAO, E.NMABREVEMP AS EMPRESA, S.NMCIDADE, S.NRCELULAR FROM PSW_SOCIOS S
        LEFT JOIN PSW_EMPRESAS E ON E.CDGRUPO = S.CDEMPRESA WHERE ${c.situacao === null || c.situacao === undefined ? 'S.INSITUACAO IS NULL' : 'S.INSITUACAO = ?'}
        ${ES.cadastro ? 'AND S.DTINSCRICAO BETWEEN ? AND ?' : ''} ORDER BY S.NMSOCIO`,
      params: [...(c.situacao === null || c.situacao === undefined ? [] : [c.situacao]), ...(ES.cadastro ? [ES.de, ES.ate] : [])],
    },
  }));
}

function desenharEmpresas(ls) {
  const por = Object.fromEntries(ls.map((l) => [`${l.ATIVA}${l.ATRASO}`, l]));
  const cats = CAT_EMPRESAS.map((c) => { const l = por[c.k] || {}; const vl = Number(l.VL) || 0; return { ...c, v: Number(l.QTD) || 0, vl, extra: vl ? fmtReal(vl) : '' }; });
  const total = cats.reduce((a, c) => a + c.v, 0);
  const ativas = cats[0].v + cats[1].v; const inativas = cats[2].v + cats[3].v;
  ES.dados.empresas = { cats, total, ativas, inativas };
  $('#es-emp-n').textContent = `${fmtN(total)} empresas`;
  const contrib = ES.contribEmp ? ` · contribuição ${nomeContrib(ES.contribEmp)}` : '';
  secao('es-emp', `<div class="es-mini"><span><b>${fmtN(ativas)}</b> ativas (${pct(ativas, total)})</span><span><b>${fmtN(inativas)}</b> inativas (${pct(inativas, total)})</span></div>
    ${graficoPartes('emp', cats, total)}<p class="sutil es-nota">Atraso: vencimento de ${esc(periodoTxt())}${esc(contrib)}.</p>`);
  ligarLinhas('es-emp', cats, (c) => {
    const q = sqlEmpresas(true);
    abrirDetalhe({
      titulo: `Empresas — ${c.rotulo.toLowerCase()}`,
      subtitulo: `Contribuições com vencimento de ${periodoTxt()}${contrib}${ES.cadastro ? ' · Cadastradas no período' : ''}`,
      colunas: [['CDGRUPO', 'Código', 'int'], ['NMEMPRESA', 'Empresa'], ['NRCNPJ', 'CNPJ', 'cnpj'], ['NMCIDADE', 'Cidade'], ['CDUF', 'UF'], ['NRFONE', 'Telefone'], ['INSITUACAO', 'Situação'],
        ['QTDATRASO', 'Em atraso', 'int'], ['VLATRASO', 'Valor em atraso', 'moeda'], ['ULTPAGTO', 'Último pagamento', 'data']],
      totais: ['QTDATRASO', 'VLATRASO'],
      q: { sql: `SELECT * FROM (${q.sql}) X WHERE ATIVA = ${inteiro(c.k[0])} AND ATRASO = ${inteiro(c.k[1])} ORDER BY NMEMPRESA`, params: q.params },
    });
  });
}

function desenharSociosFin(ls) {
  const soma = (f) => ls.filter(f).reduce((a, l) => a + (Number(l.QTD) || 0), 0);
  const total = soma(() => true);
  const { ini, fim } = faixaMensalidade();
  const faixa = fim < ini ? 'nenhuma competência exigida no período (veja a tolerância)' : `competências ${refIdx(ini)} a ${refIdx(fim)}`;
  const mens = CAT_MENS.map((c) => ({ ...c, v: soma((l) => +l.M === c.k) }));
  const cont = CAT_CONTRIB.map((c) => ({ ...c, v: soma((l) => +l.CT === c.k) }));
  const ambos = CAT_AMBOS.map((c) => ({ ...c, v: soma((l) => `${+l.M}${+l.CT === 2 ? 1 : 0}` === c.k) }));
  ES.dados.mens = { cats: mens, total, faixa }; ES.dados.cont = { cats: cont, total }; ES.dados.ambos = { cats: ambos, total };
  const sub = `${fmtN(total)} sócios (exceto desfiliados)`;
  $('#es-mens-n').textContent = sub; $('#es-cont-n').textContent = sub;
  const contrib = ES.contribSoc ? ` · contribuição ${nomeContrib(ES.contribSoc)}` : '';
  secao('es-mens', `${graficoPartes('mens', mens, total)}<p class="sutil es-nota">Exigidas: ${esc(faixa)} (a partir da filiação, se depois).</p>`);
  secao('es-cont', `${graficoPartes('cont', cont, total)}<p class="sutil es-nota">Vencimentos de ${esc(periodoTxt())}${esc(contrib)}.</p>`);
  secao('es-ambos', `${graficoPartes('ambos', ambos, total)}<p class="sutil es-nota">Cruza a mensalidade com a contribuição (sem contribuição no período conta como em dia).</p>`);
  const colunas = [['NRINSCRICAO', 'Inscrição', 'int'], ['NMSOCIO', 'Nome'], ['INSITUACAO', 'Situação'], ['EMPRESA', 'Empresa'], ['DTINSCRICAO', 'Filiação', 'data'], ['NRCELULAR', 'Celular'],
    ['ULTMENS', 'Última mensalidade', 'ref'], ['MESESATR', 'Meses em atraso', 'int'], ['VLCONTATR', 'Contrib. em atraso', 'moeda']];
  const abrir = (c) => abrirDetalhe({
    titulo: `Sócios — ${c.rotulo.toLowerCase()}`,
    subtitulo: `Mensalidade: ${faixa} · Contribuição: vencimentos de ${periodoTxt()}${contrib}${ES.cadastro ? ' · Filiados no período' : ''}`,
    colunas, totais: ['MESESATR', 'VLCONTATR'], q: sqlSociosFin(true, c.filtro),
  });
  ligarLinhas('es-mens', mens, abrir); ligarLinhas('es-cont', cont, abrir); ligarLinhas('es-ambos', ambos, abrir);
}

function desenharMensMeses(ls) {
  const pts = ls.map((l) => ({ i: Number(l.REF), v: { qtd: Number(l.QTD) || 0, vl: Number(l.VL) || 0 } }));
  ES.dados.mmes = pts;
  const qtd = pts.reduce((a, p) => a + p.v.qtd, 0); const vl = pts.reduce((a, p) => a + p.v.vl, 0);
  secao('es-mmes', `<div class="es-mini"><span><b>${fmtN(qtd)}</b> mensalidades pagas</span><span><b>${esc(fmtReal(vl))}</b> recebidos</span></div>
    ${graficoMeses(pts, [{ k: 'qtd', rotulo: 'Mensalidades pagas', cor: 'c1' }])}`);
}

function desenharEmpMeses(ls) {
  const pts = ls.map((l) => ({ i: Number(l.REF), v: { pagas: Number(l.PAGAS) || 0, atr: Number(l.ATRASADAS) || 0, abe: Number(l.AVENCER) || 0 }, vp: Number(l.VLPAGO) || 0, va: Number(l.VLATRASO) || 0 }));
  ES.dados.emes = pts;
  const vp = pts.reduce((a, p) => a + p.vp, 0); const va = pts.reduce((a, p) => a + p.va, 0);
  secao('es-emes', `<div class="es-mini"><span><b>${esc(fmtReal(vp))}</b> pagos</span><span><b>${esc(fmtReal(va))}</b> em aberto</span></div>
    ${graficoMeses(pts, [{ k: 'pagas', rotulo: 'Pagas', cor: 'bom' }, { k: 'atr', rotulo: 'Vencidas sem pagamento', cor: 'critico' }, { k: 'abe', rotulo: 'A vencer', cor: 'neutro' }])}`);
}

function desenharKpis() {
  const d = ES.dados; const k = [];
  if (d.situacao) { const n = d.situacao.cats.filter((c) => !/desfiliad/i.test(c.rotulo)).reduce((a, c) => a + c.v, 0); k.push(kpi(fmtN(n), 'sócios (exceto desfiliados)', ES.cadastro ? 'filiados no período' : '')); }
  if (d.empresas) {
    k.push(kpi(fmtN(d.empresas.ativas), 'empresas ativas', `${fmtN(d.empresas.inativas)} inativas`));
    k.push(kpi(fmtN(d.empresas.cats[1].v), 'ativas inadimplentes', pct(d.empresas.cats[1].v, d.empresas.ativas) + ' das ativas', d.empresas.cats[1].v ? 'gf-kpi-alerta' : ''));
    k.push(kpi(fmtReal(d.empresas.cats[1].vl + d.empresas.cats[2].vl), 'contribuições de empresas em atraso'));
  }
  if (d.mens) k.push(kpi(pct(d.mens.cats[0].v, d.mens.total), 'sócios com mensalidade em dia', `${fmtN(d.mens.cats[1].v)} em atraso`));
  if (d.cont) k.push(kpi(fmtN(d.cont.cats[1].v), 'sócios com contribuição em atraso'));
  $('#es-kpis').innerHTML = k.join('');
}

function ligarLinhas(id, cats, aoClicar) {
  $$(`#${id} .gf-linha`).forEach((b) => { b.onclick = () => aoClicar(cats[+b.dataset.i]); });
}

// ============================================================ lista do que foi clicado (com Excel e PDF)
async function abrirDetalhe(def) {
  const box = $('#es-det');
  box.hidden = false;
  box.innerHTML = `<div class="cartao-titulo"><h3>${esc(def.titulo)}</h3><button type="button" class="icone-btn" id="es-det-x" aria-label="Fechar">${ico('x')}</button></div>
    <p class="sutil"><span class="carregando"></span> Consultando o banco…</p>`;
  $('#es-det-x').onclick = () => { box.hidden = true; };
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  let res;
  try { res = await consultaES(def.q); } catch (e) { box.querySelector('p').outerHTML = `<p class="erro-txt">${esc(e.message)}</p>`; return; }
  const idx = Object.fromEntries(res.colunas.map((c, i) => [c.toUpperCase(), i]));
  const cols = def.colunas.filter(([c]) => idx[c] !== undefined);
  const tots = def.totais || [];
  const brutos = res.linhas.map((l) => cols.map(([c]) => l[idx[c]]));
  const linhas = brutos.map((b) => b.map((v, j) => formatarCelula(v, cols[j][2])));
  const alinhar = cols.map(([, , t]) => (['moeda', 'int'].includes(t) ? 'd' : ''));
  const totaisBrutos = tots.length && brutos.length ? cols.map(([c], j) => (tots.includes(c) ? brutos.reduce((a, b) => a + (Number(b[j]) || 0), 0) : null)) : null;
  const totais = totaisBrutos ? totaisBrutos.map((v, j) => (j === 0 ? 'TOTAL' : v === null ? '' : cols[j][2] === 'moeda' ? fmtMoeda(v) : fmtN(v))) : [];
  if (totaisBrutos) totaisBrutos[0] = 'TOTAL';
  const dados = { titulo: def.titulo, subtitulo: def.subtitulo, colunas: cols.map(([, r]) => r), tipos: cols.map(([, , t]) => t || 'texto'), alinhar, linhas, brutos, estilos: [], totais, totaisBrutos, resumo: null };
  const mostrar = linhas.slice(0, 500);
  box.innerHTML = `<div class="cartao-titulo"><div><h3>${esc(def.titulo)}</h3><small class="sutil">${esc(def.subtitulo)}</small></div>
      <div class="acoes">${res.total ? `<button type="button" class="botao peq" id="es-det-xlsx">${ico('baixar')}Excel</button><button type="button" class="botao sec peq" id="es-det-pdf">${ico('documento')}PDF</button>` : ''}
      <button type="button" class="icone-btn" id="es-det-x" aria-label="Fechar">${ico('x')}</button></div></div>
    <p>${res.total ? `${fmtN(res.total)} registro(s)${res.cortado ? ` (lidos ${fmtN(res.linhas.length)})` : ''}${linhas.length > mostrar.length ? ` · mostrando os ${fmtN(mostrar.length)} primeiros (o Excel e o PDF têm todos)` : ''}.` : 'Nenhum registro.'}</p>
    ${res.total ? `<div class="tabela-wrap"><table><thead><tr>${dados.colunas.map((c, j) => `<th class="${alinhar[j] ? 'num' : ''}">${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${mostrar.map((l) => `<tr>${l.map((v, j) => `<td class="${alinhar[j] ? 'num' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('')}
      ${totais.length && mostrar.length === linhas.length ? `<tr class="linha-total">${totais.map((v, j) => `<td class="${alinhar[j] ? 'num' : ''}">${esc(v)}</td>`).join('')}</tr>` : ''}</tbody></table></div>` : ''}`;
  $('#es-det-x').onclick = () => { box.hidden = true; };
  const bx = $('#es-det-xlsx'); if (bx) bx.onclick = () => excelRelatorio(dados).then(() => toast('Excel gerado.')).catch(falha);
  const bp = $('#es-det-pdf');
  if (bp) bp.onclick = async () => {
    bp.disabled = true;
    try {
      const r = await Conector.api('relatorio/pdf', { body: { titulo: dados.titulo, subtitulo: dados.subtitulo, colunas: dados.colunas, alinhar, linhas, estilos: [], totais, arquivo: dados.titulo, gerado: '' } });
      window.open(r.url, '_blank', 'noopener');
      toast(`PDF gerado em Arquivos gerados\\${r.arquivo.replace(/\//g, '\\')}`);
    } catch (e) { falha(e); }
    bp.disabled = false;
  };
}

// ============================================================ Excel com todos os gráficos (uma aba por assunto)
async function excelResumoES() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Base de Apoio';
  const filtros = [`Período: ${periodoTxt()}`, ES.contribEmp ? `Contribuição das empresas: ${nomeContrib(ES.contribEmp)}` : '', ES.contribSoc ? `Contribuição dos sócios: ${nomeContrib(ES.contribSoc)}` : '',
    `Mensalidade: tolerância de ${ES.tol} mês(es)`, ES.cadastro ? 'Só filiados/cadastrados no período' : ''].filter(Boolean).join(' · ');
  const aba = (nome, titulo, colunas, linhas, formatos = []) => {
    const ws = wb.addWorksheet(nome);
    ws.addRow([titulo]).font = { bold: true, size: 13 };
    ws.addRow([filtros]).font = { italic: true, color: { argb: 'FF555555' } };
    ws.addRow([`Gerado em ${new Date().toLocaleString('pt-BR')}`]).font = { size: 9, color: { argb: 'FF777777' } };
    const cab = ws.addRow(colunas); cab.font = { bold: true };
    cab.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F1FE' } }; });
    linhas.forEach((l) => ws.addRow(l));
    colunas.forEach((c, j) => { const col = ws.getColumn(j + 1); col.width = j === 0 ? 34 : Math.max(14, c.length + 2); if (formatos[j]) col.numFmt = formatos[j]; });
  };
  const partes = (cats, total) => [...cats.map((c) => [c.rotulo, c.v, total ? c.v / total : 0]), ['TOTAL', total, 1]];
  const d = ES.dados;
  if (d.situacao) aba('Sócios por situação', 'Sócios por situação', ['Situação', 'Sócios', '%'], partes(d.situacao.cats, d.situacao.total), [null, '#,##0', '0.0%']);
  if (d.empresas) aba('Empresas', 'Empresas: ativas, inativas e inadimplência', ['Categoria', 'Empresas', '%', 'Valor em atraso'],
    [...d.empresas.cats.map((c) => [c.rotulo, c.v, d.empresas.total ? c.v / d.empresas.total : 0, c.vl]), ['TOTAL', d.empresas.total, 1, d.empresas.cats.reduce((a, c) => a + c.vl, 0)]], [null, '#,##0', '0.0%', '#,##0.00']);
  if (d.mens) aba('Mensalidade', `Sócios: mensalidade (${d.mens.faixa})`, ['Categoria', 'Sócios', '%'], partes(d.mens.cats, d.mens.total), [null, '#,##0', '0.0%']);
  if (d.cont) aba('Contribuição', 'Sócios: contribuição', ['Categoria', 'Sócios', '%'], partes(d.cont.cats, d.cont.total), [null, '#,##0', '0.0%']);
  if (d.ambos) aba('Mensalidade e contribuição', 'Sócios: mensalidade e contribuição', ['Categoria', 'Sócios', '%'], partes(d.ambos.cats, d.ambos.total), [null, '#,##0', '0.0%']);
  if (d.mmes) aba('Mensalidades por mês', 'Mensalidades recebidas por mês', ['Mês', 'Pagas', 'Valor'], d.mmes.map((p) => [refIdx(p.i), p.v.qtd, p.v.vl]), [null, '#,##0', '#,##0.00']);
  if (d.emes) aba('Contribuições por mês', 'Contribuições das empresas por mês de vencimento', ['Mês', 'Pagas', 'Vencidas sem pagamento', 'A vencer', 'Valor pago', 'Valor em aberto'],
    d.emes.map((p) => [refIdx(p.i), p.v.pagas, p.v.atr, p.v.abe, p.vp, p.va]), [null, '#,##0', '#,##0', '#,##0', '#,##0.00', '#,##0.00']);
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `Estatisticas_${ES.de}_a_${ES.ate}.xlsx`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
