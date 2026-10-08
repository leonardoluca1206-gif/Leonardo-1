/* Base de Apoio — interface (HTML + CSS + JavaScript puro). Os dados ficam no navegador (ver js/motor.js). */
'use strict';

// ============================================================ utilidades
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const app = $('#app');
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = (n) => Number(n || 0).toLocaleString('pt-BR');
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

let tokenAdmin = sessionStorageGet('tokenAdmin') || '';

// ícones em linha (traço), no estilo dos modelos de tela
const ICONES = {
  casa: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  barras: '<path d="M5 20v-7M10 20V6M15 20v-9M20 20V4"/>',
  nuvem: '<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1 .5 7.97"/><path d="M12 12v9M8.5 15.5 12 12l3.5 3.5"/>',
  documento: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6M9 9h2"/>',
  ajuda: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.3M12 17h.01"/>',
  engrenagem: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  lua: '<path d="M20.5 13.4A8.5 8.5 0 1 1 10.6 3.5a6.8 6.8 0 0 0 9.9 9.9z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  seta: '<path d="m9 6 6 6-6 6"/>',
  voltar: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  pino: '<path d="M12 21s-7-6.1-7-11.4a7 7 0 0 1 14 0C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.6" r="2.6"/>',
  copiar: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  lapis: '<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/>',
  camadas: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/><path d="m3 17.5 9 5 9-5"/>',
  calculadora: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h.01M12 11h.01M16 11h.01M8 14.5h.01M12 14.5h.01M16 14.5h.01M8 18h.01M12 18h.01M16 18h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6h.01"/>',
  recarregar: '<path d="M20 12a8 8 0 1 1-2.34-5.66L20 8.7"/><path d="M20 3.5V9h-5.5"/>',
  docok: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 14.5l2 2 4-4"/>',
  docenvio: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 18v-6M9.2 14.6 12 11.8l2.8 2.8"/>',
  docbusca: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M14 3v5h5v2.5"/><circle cx="15.5" cy="15.5" r="3.2"/><path d="m21 21-3.2-3.2"/>',
  livro: '<path d="M2.5 5.5H8a4 4 0 0 1 4 4V20a3 3 0 0 0-3-3H2.5zM21.5 5.5H16a4 4 0 0 0-4 4V20a3 3 0 0 1 3-3h6.5z"/>',
  pontos: '<path d="M12 5.5h.01M12 12h.01M12 18.5h.01" stroke-width="3"/>',
  lixeira: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3"/>',
  baixar: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  exportar: '<path d="M12 15V3M7.5 7.5 12 3l4.5 4.5M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5"/>',
  importar: '<path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  ok: '<circle cx="12" cy="12" r="9"/><path d="m8.2 12.2 2.6 2.6 5-5.4"/>',
  tabela: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18M3 15h18M9 4v16"/>',
  filtro: '<path d="M3 5h18l-7 8.5V19l-4 2v-7.5z"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z"/>',
  salvar: '<path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8M7 21v-7h10v7"/>',
  olho: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  sair: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>',
  historico: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  alerta: '<path d="M10.3 3.9 2.5 17.5A2 2 0 0 0 4.2 20.5h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4.5M12 17h.01"/>',
  chave: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.7-8.7M16 7l3 3M14 9l2 2"/>',
  checar: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/><path d="M8.5 10.5h7M8.5 13.5h4.5"/>',
  enviar: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  servidor: '<rect x="4" y="3" width="16" height="7" rx="1.5"/><rect x="4" y="14" width="16" height="7" rx="1.5"/><path d="M8 6.5h.01M8 17.5h.01M12 6.5h4M12 17.5h4"/>',
  pasta: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  banco: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v6.5c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V5.5M4.5 12v6.5c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V12"/>',
};
function ico(nome, cls = '') { return `<span class="ico ${cls}" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONES[nome] || ''}</svg></span>`; }
function pintarIcones(raiz = document) { $$('[data-ico]', raiz).forEach((el) => { if (!el.firstChild) el.innerHTML = `<svg viewBox="0 0 24 24">${ICONES[el.dataset.ico] || ''}</svg>`; }); }

// tema claro/escuro (preferência só deste navegador)
function temaAtual() {
  const d = document.documentElement.dataset.theme;
  if (d) return d === 'dark' ? 'escuro' : 'claro';
  return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}
function aplicarTema(t) {
  document.documentElement.dataset.theme = t === 'escuro' ? 'dark' : 'light';
  try { localStorage.setItem('baseApoio.tema', t); } catch { /* sem armazenamento */ }
  marcarTema();
}
function marcarTema() { $$('.tema button').forEach((b) => { const a = b.dataset.tema === temaAtual(); b.classList.toggle('ativo', a); b.setAttribute('aria-pressed', a); }); }

const NOMES_ROTA = { inicio: 'Visão geral', assistente: 'Assistente', procv: 'Comparar planilhas', importacao: 'Importação de dados', relatorios: 'Buscar relatórios', ajuda: 'Área de ajuda', config: 'Configurações', conexao: 'Conexão com o banco' };
function migalha(rota, extra) {
  const m = $('#migalha'); if (!m) return;
  const partes = [`<a href="#inicio" title="Visão geral">${ico('casa', 'p')}</a><span class="sep">›</span><a href="#inicio" class="ocultar-cel">Base de Apoio</a>`];
  const nome = NOMES_ROTA[rota] || NOMES_ROTA.inicio;
  if (extra) partes.push(`<span class="sep ocultar-cel">/</span><a href="#${rota}">${esc(nome)}</a><span class="sep">/</span><span class="atual">${esc(extra)}</span>`);
  else partes.push(`<span class="sep ocultar-cel">/</span><span class="atual">${esc(nome)}</span>`);
  m.innerHTML = partes.join('');
}

// menu suspenso (⋮)
function abrirMenuSuspenso(botao, itens) {
  fecharMenuSuspenso();
  const r = botao.getBoundingClientRect();
  const m = document.createElement('div');
  m.className = 'menu-suspenso'; m.id = 'menu-suspenso'; m.setAttribute('role', 'menu');
  m.innerHTML = itens.map((it, i) => (it === '-' ? '<hr>' : `<button type="button" role="menuitem" data-i="${i}" class="${it.perigo ? 'perigo' : ''}">${ico(it.icone)}${esc(it.rotulo)}</button>`)).join('');
  document.body.appendChild(m);
  const w = m.offsetWidth;
  m.style.top = `${window.scrollY + r.bottom + 6}px`;
  m.style.left = `${Math.max(8, window.scrollX + r.right - w)}px`;
  botao.setAttribute('aria-expanded', 'true');
  $$('button', m).forEach((b) => { b.onclick = () => { fecharMenuSuspenso(); itens[+b.dataset.i].acao(); }; });
  setTimeout(() => document.addEventListener('click', fecharMenuSuspenso, { once: true }), 0);
}
function fecharMenuSuspenso() {
  const m = $('#menu-suspenso'); if (m) m.remove();
  $$('[aria-expanded=true]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}
function sessionStorageGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function sessionStorageSet(k, v) { try { sessionStorage.setItem(k, v); } catch { /* sem armazenamento */ } }

async function api(url, opcoes = {}) {
  return Motor.api(url, opcoes);
}

async function enviarArquivo(arquivo, planilha = true) {
  return Motor.enviar(arquivo, planilha);
}

let toastTimer;
function toast(msg, tipo = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast mostrar ${tipo}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, tipo === 'erro' ? 6000 : 3200);
}
const falha = (e) => toast(e.message || String(e), 'erro');

function modal(titulo, corpoHtml, botoes) {
  return new Promise((resolve) => {
    const m = $('#modal');
    $('#modal-titulo').textContent = titulo;
    $('#modal-corpo').innerHTML = corpoHtml;
    const acoes = $('#modal-acoes');
    acoes.innerHTML = '';
    const fechar = (v) => { m.hidden = true; document.removeEventListener('keydown', tecla); resolve(v); };
    const tecla = (e) => { if (e.key === 'Escape') fechar(null); if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { const p = botoes.find((b) => b.principal); if (p) fechar(p.valor()); } };
    botoes.forEach((b) => {
      const el = document.createElement('button');
      el.className = `botao ${b.classe || ''}`;
      el.textContent = b.rotulo;
      el.onclick = () => fechar(b.valor());
      acoes.appendChild(el);
    });
    document.addEventListener('keydown', tecla);
    m.hidden = false;
    const foco = $('#modal-corpo input') || acoes.lastChild;
    setTimeout(() => foco && foco.focus(), 30);
  });
}
const confirmar = (titulo, texto, rotulo = 'Confirmar', classe = 'perigo') =>
  modal(titulo, `<p>${esc(texto)}</p>`, [
    { rotulo: 'Cancelar', classe: 'sec', valor: () => false },
    { rotulo, classe, principal: true, valor: () => true },
  ]);
const pedirTexto = (titulo, rotulo, valor = '') =>
  modal(titulo, `<label for="modal-in">${esc(rotulo)}</label><input type="text" id="modal-in" value="${esc(valor)}">`, [
    { rotulo: 'Cancelar', classe: 'sec', valor: () => null },
    { rotulo: 'Salvar', principal: true, valor: () => $('#modal-in').value.trim() || null },
  ]);

function baixar(token) { try { Motor.baixar(token); } catch (e) { falha(e); } }

/** Área de envio com clique e arrastar-soltar. */
function zonaEnvio({ titulo, dica, aceitar, planilha = true, atual, aoCarregar, aoLimpar, arraste }) {
  const div = document.createElement('div');
  const desenhar = (info) => {
    if (info) {
      div.className = 'envio carregado';
      div.innerHTML = `<div class="info-arquivo"><div><strong>${ico('docok')}${esc(info.nome)}</strong>
        <small>${info.abas ? info.abas.map((a) => `${esc(a.nome)}: ${fmtN(a.linhas)} linhas, ${a.colunas.length} colunas`).join(' · ') : fmtN(info.tamanho) + ' bytes'}</small></div>
        <button class="botao sec peq" type="button">Trocar arquivo</button></div>`;
      $('button', div).onclick = (e) => { e.stopPropagation(); input.click(); };
    } else {
      div.className = 'envio';
      div.innerHTML = `${ico('documento', 'ico-envio')}<strong>${esc(arraste || (planilha ? 'Arraste a planilha para cá' : 'Arraste o arquivo para cá'))}</strong>
        <span class="botao">${esc(titulo)}</span><small>${esc(dica || 'Ou clique para selecionar')}</small>`;
    }
    div.appendChild(input);
  };
  const input = document.createElement('input');
  input.type = 'file';
  if (aceitar) input.accept = aceitar;
  const processar = async (arq) => {
    if (!arq) return;
    div.className = 'envio';
    div.innerHTML = `<strong><span class="carregando"></span> Lendo ${esc(arq.name)}…</strong>`;
    div.appendChild(input);
    try {
      const info = await enviarArquivo(arq, planilha);
      desenhar(info);
      aoCarregar && aoCarregar(info);
    } catch (e) { falha(e); desenhar(atual); aoLimpar && aoLimpar(); }
  };
  input.onchange = () => processar(input.files[0]);
  div.onclick = () => input.click();
  div.ondragover = (e) => { e.preventDefault(); div.classList.add('arrastando'); };
  div.ondragleave = () => div.classList.remove('arrastando');
  div.ondrop = (e) => { e.preventDefault(); div.classList.remove('arrastando'); processar(e.dataTransfer.files[0]); };
  desenhar(atual);
  return div;
}

function tabelaHtml(colunas, linhas, classeLinha) {
  return `<div class="tabela-wrap"><table><thead><tr>${colunas.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
  <tbody>${linhas.map((l, i) => `<tr class="${classeLinha ? classeLinha(l, i) : ''}">${l.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function stat(valor, rotulo, classe = '') {
  return `<div class="stat ${classe}"><b>${fmtN(valor)}</b><span>${esc(rotulo)}</span></div>`;
}

// ============================================================ roteamento
const rotas = { inicio: telaInicio, assistente: telaAssistente, procv: telaProcv, importacao: telaImportacao, ajuda: telaAjuda, relatorios: telaRelatorios, config: telaConfig, conexao: telaConexao };

function rotear() {
  const hash = location.hash.replace(/^#/, '') || 'inicio';
  const [rota, ...resto] = hash.split('/').map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
  const fn = rotas[rota] || telaInicio;
  $$('.lateral .menu a').forEach((a) => a.classList.toggle('ativo', a.dataset.rota === (rotas[rota] ? rota : 'inicio')));
  document.body.classList.remove('menu-aberto');
  fecharMenuSuspenso();
  migalha(rotas[rota] ? rota : 'inicio');
  app.innerHTML = '';
  fn(resto);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', rotear);

// ============================================================ início
async function telaInicio() {
  const mods = [
    ['assistente', 'chat', 'Assistente', 'Peça boletos e relatórios com os dados do ProSindW, ou tire dúvidas de uso.'],
    ['procv', 'barras', 'Comparar / PROCV', 'Cruze duas planilhas por CNPJ, CPF ou matrícula e traga colunas da segunda para a primeira.'],
    ['importacao', 'nuvem', 'Importação de dados', 'Escolha um layout, envie o Excel e receba o arquivo no formato exigido. Também lê e valida arquivos.'],
    ['relatorios', 'documento', 'Buscar relatórios', 'Descreva o relatório que precisa e veja qual usar, onde está e quais campos ele traz.'],
    ['ajuda', 'ajuda', 'Área de ajuda', 'Digite sua dúvida e veja o procedimento, os pontos de atenção e a solução de problemas.'],
  ];
  app.innerHTML = `
  <div class="cabecalho-pagina"><div><h1>O que você precisa fazer?</h1>
    <p>Cruze planilhas, gere arquivos nos layouts do sistema e encontre respostas na base de ajuda.</p></div></div>
  <div class="modulos">${mods.map(([r, i, t, d]) => `<a class="modulo" href="#${r}"><span class="tile">${ico(i)}</span><h2>${t}</h2><p>${d}</p><span class="ir">Abrir ${ico('seta', 'p')}</span></a>`).join('')}</div>
  <div class="grade-2" style="margin-top:18px">
    <div class="cartao"><div class="cartao-titulo"><h3>Base cadastrada</h3></div><div class="stats" id="ini-stats" style="margin:0"><span class="carregando"></span></div></div>
    <div class="cartao"><div class="cartao-titulo"><h3>Últimos processamentos</h3>${ico('historico')}</div><ul class="lista-simples" id="ini-hist"><li class="sutil">Carregando…</li></ul></div>
  </div>`;
  try {
    const s = await api('/api/status');
    $('#ini-stats').innerHTML = stat(s.layouts, 'layouts') + stat(s.procedimentos, 'procedimentos') + stat(s.paginas, 'páginas de ajuda') + stat(s.relatorios || 0, 'relatórios e documentos') + stat(s.modelos, 'modelos salvos');
    $('#ini-hist').innerHTML = s.historico.length
      ? s.historico.map((h) => `<li><span><span class="selo azul">${esc(h.modulo)}</span> ${esc(h.descricao)}</span><small class="nowrap">${esc(h.criado_em.slice(8, 10) + '/' + h.criado_em.slice(5, 7) + ' ' + h.criado_em.slice(11, 16))}</small></li>`).join('')
      : '<li class="sutil">Nenhum processamento ainda.</li>';
  } catch (e) { falha(e); }
}

// ============================================================ 1. PROCV
const P = { a: null, b: null, abaA: null, abaB: null, sug: null, res: null, cfg: null };

function telaProcv() {
  app.innerHTML = `
  <div class="cabecalho-pagina"><div><h1>Comparar planilhas <span class="selo-titulo">PROCV</span></h1>
    <p>Cruze informações de duas planilhas usando uma coluna em comum.</p></div>
    <button class="botao sec grande" id="pv-limpar" type="button">${ico('recarregar')}Começar de novo</button></div>
  <div class="cartao">
    <h2>Selecione as duas planilhas</h2>
    <p class="sutil">O sistema identifica a coluna-chave pelo nome e pelo conteúdo.</p>
    <div class="grade-2" style="margin-top:20px">
      <div class="cartao-planilha"><div class="passo"><span class="numero">1</span><div><h3>Planilha que recebe os dados</h3><p>Esta é a base que você deseja completar.</p></div></div>
        <div id="pv-za"></div><div id="pv-aba-a"></div></div>
      <div class="cartao-planilha"><div class="passo"><span class="numero">2</span><div><h3>Planilha de onde vêm os dados</h3><p>Este arquivo contém as informações que serão buscadas.</p></div></div>
        <div id="pv-zb"></div><div id="pv-aba-b"></div></div>
    </div>
    <div class="ligacao">${ico('voltar')}</div>
    <p class="ligacao-texto">Os dados da planilha 2 completam a planilha 1.</p>
  </div>
  <div id="pv-config"></div><div id="pv-res"></div>
  <div class="info-caixa" style="margin-top:18px">${ico('info')}<div class="corpo"><strong>Como funciona</strong>
    <p>Use uma coluna em comum, como CPF, CNPJ ou matrícula, para relacionar os registros.</p></div></div>`;
  $('#pv-limpar').onclick = () => { Object.assign(P, { a: null, b: null, abaA: null, abaB: null, sug: null, res: null, cfg: null }); telaProcv(); };
  $('#pv-za').appendChild(zonaEnvio({ titulo: 'Selecionar planilha 1', dica: 'Excel (.xlsx, .xls) ou CSV', aceitar: '.xlsx,.xlsm,.xls,.csv,.txt', atual: P.a,
    aoCarregar: (i) => { P.a = i; P.abaA = i.abas[0].nome; P.sug = null; P.res = null; desenharAbasProcv(); sugerirProcv(); } }));
  $('#pv-zb').appendChild(zonaEnvio({ titulo: 'Selecionar planilha 2', dica: 'Excel (.xlsx, .xls) ou CSV', aceitar: '.xlsx,.xlsm,.xls,.csv,.txt', atual: P.b,
    aoCarregar: (i) => { P.b = i; P.abaB = i.abas[0].nome; P.sug = null; P.res = null; desenharAbasProcv(); sugerirProcv(); } }));
  desenharAbasProcv();
  if (P.sug) desenharConfigProcv();
  if (P.res) desenharResultadoProcv();
}

function desenharAbasProcv() {
  [['a', 'abaA', '#pv-aba-a'], ['b', 'abaB', '#pv-aba-b']].forEach(([k, ka, sel]) => {
    const info = P[k];
    const alvo = $(sel);
    if (!alvo) return;
    if (!info || info.abas.length < 2) { alvo.innerHTML = ''; return; }
    alvo.innerHTML = `<div class="campo" style="margin-top:12px"><label>Aba</label><select>${info.abas.map((a) => `<option ${a.nome === P[ka] ? 'selected' : ''}>${esc(a.nome)}</option>`).join('')}</select></div>`;
    $('select', alvo).onchange = (e) => { P[ka] = e.target.value; P.res = null; sugerirProcv(); };
  });
}

async function sugerirProcv() {
  if (!P.a || !P.b) return;
  $('#pv-config').innerHTML = '<div class="cartao" style="margin-top:16px"><span class="carregando"></span> Analisando colunas…</div>';
  try {
    P.sug = await api('/api/procv/sugerir', { method: 'POST', body: { token_a: P.a.token, aba_a: P.abaA, token_b: P.b.token, aba_b: P.abaB } });
    P.cfg = {
      chave_a: P.sug.melhor ? P.sug.melhor.coluna_a : P.sug.colunas_a[0],
      chave_b: P.sug.melhor ? P.sug.melhor.coluna_b : P.sug.colunas_b[0],
      colunas: P.sug.trazer.slice(),
      normalizar: 'auto', duplicados: 'primeiro',
    };
    desenharConfigProcv();
    $('#pv-res').innerHTML = '';
  } catch (e) { falha(e); $('#pv-config').innerHTML = ''; }
}

function desenharConfigProcv() {
  const s = P.sug, c = P.cfg;
  const opts = (lista, sel) => lista.map((x) => `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');
  const colsB = s.colunas_b.filter((x) => x !== c.chave_b);
  $('#pv-config').innerHTML = `
  <div class="cartao" style="margin-top:18px">
    <div class="cartao-titulo"><h2>Configuração</h2>
      ${s.melhor ? `<span class="selo ok">Chave sugerida: ${esc(s.melhor.coluna_a)} ↔ ${esc(s.melhor.coluna_b)}</span>` : '<span class="selo alerta">Nenhuma chave em comum encontrada — escolha manualmente</span>'}</div>
    <div class="linha-form">
      <div class="campo"><label for="pv-ca">Coluna-chave na Planilha 1</label><select id="pv-ca">${opts(s.colunas_a, c.chave_a)}</select></div>
      <div class="campo"><label for="pv-cb">Coluna-chave na Planilha 2</label><select id="pv-cb">${opts(s.colunas_b, c.chave_b)}</select></div>
      <div class="campo"><label for="pv-norm">Comparação</label><select id="pv-norm">
        <option value="auto">Automática</option><option value="digitos">Somente dígitos (CPF, CNPJ, códigos)</option>
        <option value="texto">Texto (ignora maiúsculas e acentos)</option><option value="exato">Exata</option></select></div>
      <div class="campo"><label for="pv-dup">Chave repetida na Planilha 2</label><select id="pv-dup">
        <option value="primeiro">Usar o primeiro</option><option value="ultimo">Usar o último</option>
        <option value="todos">Juntar todos ( | )</option><option value="somar">Somar valores</option></select></div>
    </div>
    <label>Colunas para trazer da Planilha 2</label>
    <div class="acoes" id="pv-cols" style="margin:6px 0 14px">${colsB.map((x) => `<label class="check"><input type="checkbox" value="${esc(x)}" ${c.colunas.includes(x) ? 'checked' : ''}> ${esc(x)}</label>`).join('') || '<span class="sutil">Sem outras colunas.</span>'}</div>
    <div class="acoes"><button class="botao grande" id="pv-exec" type="button">${ico('play')}Executar</button>
      <button class="botao sec peq" id="pv-todas" type="button">Marcar todas</button><button class="botao sec peq" id="pv-nenhuma" type="button">Desmarcar</button></div>
  </div>`;
  $('#pv-norm').value = c.normalizar; $('#pv-dup').value = c.duplicados;
  $('#pv-ca').onchange = (e) => { c.chave_a = e.target.value; };
  $('#pv-cb').onchange = (e) => { c.chave_b = e.target.value; c.colunas = c.colunas.filter((x) => x !== c.chave_b); desenharConfigProcv(); };
  $('#pv-norm').onchange = (e) => { c.normalizar = e.target.value; };
  $('#pv-dup').onchange = (e) => { c.duplicados = e.target.value; };
  $$('#pv-cols input').forEach((i) => { i.onchange = () => { c.colunas = $$('#pv-cols input:checked').map((x) => x.value); }; });
  $('#pv-todas').onclick = () => { c.colunas = colsB.slice(); desenharConfigProcv(); };
  $('#pv-nenhuma').onclick = () => { c.colunas = []; desenharConfigProcv(); };
  $('#pv-exec').onclick = executarProcv;
}

async function executarProcv() {
  const b = $('#pv-exec');
  b.disabled = true; b.innerHTML = '<span class="carregando"></span> Processando…';
  try {
    P.res = await api('/api/procv/executar', { method: 'POST', body: {
      token_a: P.a.token, aba_a: P.abaA, token_b: P.b.token, aba_b: P.abaB, ...P.cfg,
      nome_saida: (P.a.nome || 'planilha').replace(/\.[^.]+$/, '') + '_procv.xlsx' } });
    desenharResultadoProcv();
    $('#pv-res').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { falha(e); }
  b.disabled = false; b.innerHTML = `${ico('play')}Executar`;
}

function desenharResultadoProcv() {
  const r = P.res, e = r.estatisticas;
  $('#pv-res').innerHTML = `
  <div class="cartao" style="margin-top:18px">
    <div class="cartao-titulo"><h2>Resultado</h2><button class="botao" id="pv-baixar" type="button">${ico('baixar')}Baixar Excel</button></div>
    <div class="stats">
      ${stat(e.total_a, 'total processado')}${stat(e.encontrados, 'encontrados', 'ok')}
      ${stat(e.nao_encontrados, 'não encontrados', e.nao_encontrados ? 'erro' : '')}
      ${stat(e.chaves_duplicadas_b, 'chaves repetidas na Planilha 2', e.chaves_duplicadas_b ? 'alerta' : '')}
      ${stat(e.chaves_duplicadas_a, 'chaves repetidas na Planilha 1', e.chaves_duplicadas_a ? 'alerta' : '')}
      ${stat(e.so_na_planilha_2, 'só na Planilha 2')}
      ${e.chave_vazia ? stat(e.chave_vazia, 'sem chave', 'alerta') : ''}
    </div>
    <p class="sutil">Comparação: ${esc(e.modo_comparacao)}. O Excel traz as abas Resultado, Não encontrados, Repetidos, Só na Planilha 2 e Resumo.</p>
    ${tabelaHtml(r.previa.colunas, r.previa.linhas, (l) => { const s = l[l.length - 1]; return s === 'Não encontrado' || s === 'Chave vazia' ? 'linha-erro' : s.includes('(') ? 'linha-alerta' : ''; })}
    ${r.previa.linhas.length >= 100 ? '<p class="sutil" style="margin-top:8px">Prévia das 100 primeiras linhas. O Excel tem todas.</p>' : ''}
  </div>`;
  $('#pv-baixar').onclick = () => baixar(r.download);
}

// ============================================================ 2. IMPORTAÇÃO
// "Arquivo de Carnês de ..." → "Carnês de ..." (só na exibição)
const tituloCurto = (t) => String(t || '').replace(/^arquivos? (de|do|da|dos|das) /i, '').replace(/^./, (c) => c.toUpperCase());
const CATEGORIAS = { importacao: 'Importação', exportacao: 'Exportação', conferencia: 'Conferência', remessa: 'Remessa', retorno: 'Retorno', outro: 'Outros' };
const PAPEIS = { header: 'Header', detalhe: 'Detalhe', trailer: 'Trailer' };
const I = { layouts: null, busca: '', cat: '', sel: null, aba: 'gerar', plan: null, abaPlan: null, config: null, res: null, arqLer: null, ler: null, abaLer: null, especiais: null };

async function telaImportacao(params) {
  app.innerHTML = `
  <div class="cabecalho-pagina"><div><h1>Importação de dados</h1>
    <p>Escolha um layout para gerar um arquivo ou conferir um arquivo recebido.</p></div></div>
  <div class="layout-importacao">
    <aside class="cartao painel-lista">
      <div class="topo-lista"><h2>Layouts disponíveis <span class="contagem" id="im-total"></span></h2>
        <label for="im-busca">Pesquisar layout</label>
        <div class="com-icone">${ico('busca')}<input type="search" id="im-busca" placeholder="Nome, banco ou empresa" value="${esc(I.busca)}"></div>
        <div class="chips" id="im-cats" style="margin-top:14px"></div></div>
      <div class="itens" id="im-lista"><div class="vazio"><span class="carregando"></span></div></div>
    </aside>
    <section id="im-detalhe"></section>
  </div>`;
  $('#im-busca').oninput = (e) => { I.busca = e.target.value; listarLayouts(); };
  try {
    if (!I.layouts) I.layouts = await api('/api/layouts');
    if (!I.especiais) I.especiais = await api('/api/especiais');
  } catch (e) { falha(e); return; }
  desenharCategorias();
  listarLayouts();
  const alvo = params && params[0];
  if (alvo && (!I.sel || I.sel.id !== alvo)) await selecionarLayout(alvo);
  else desenharDetalheLayout();
}

function desenharCategorias() {
  const cont = {};
  I.layouts.forEach((l) => { cont[l.categoria] = (cont[l.categoria] || 0) + 1; });
  const itens = [['', 'Todos', I.layouts.length], ...Object.entries(CATEGORIAS).filter(([k]) => cont[k]).map(([k, v]) => [k, v, cont[k]])];
  $('#im-cats').innerHTML = itens.map(([k, v, n]) => `<button type="button" class="chip ${I.cat === k ? 'ativo' : ''}" data-cat="${k}">${esc(v)} <b>${fmtN(n)}</b></button>`).join('');
  const t = $('#im-total'); if (t) t.textContent = `${fmtN(I.layouts.length)} layouts`;
  $$('#im-cats .chip').forEach((b) => { b.onclick = () => { I.cat = b.dataset.cat; desenharCategorias(); listarLayouts(); }; });
}

function listarLayouts() {
  const termos = semAcento(I.busca).split(/\s+/).filter(Boolean);
  const lista = I.layouts.filter((l) => (!I.cat || l.categoria === I.cat) &&
    termos.every((t) => semAcento(`${l.titulo} ${l.id} ${l.nome_arquivo}`).includes(t)));
  const el = $('#im-lista');
  if (!el) return;
  el.innerHTML = lista.length ? lista.slice(0, 400).map((l) => {
    const [tit, ...sub] = tituloCurto(l.titulo).split(' — ');
    const sub1 = sub.join(' — ') || l.nome_arquivo || '';
    return `<button type="button" class="item-lista item-layout ${I.sel && I.sel.id === l.id ? 'ativo' : ''}" data-id="${esc(l.id)}">${ico('documento')}
      <span class="txt"><strong>${esc(tit)}</strong>${sub1 ? `<small>${esc(sub1)}</small>` : ''}
      <small>${esc(CATEGORIAS[l.categoria] || l.categoria)} · ${l.formato === 'delimitado' ? `Delimitado “${esc(l.separador)}”` : 'Posicional'} · ${l.qtd_campos} campos</small></span>${ico('seta', 'seta')}
    </button>`;
  }).join('') : '<div class="vazio">Nenhum layout encontrado.</div>';
  $$('.item-layout', el).forEach((b) => { b.onclick = () => { location.hash = `importacao/${b.dataset.id}`; }; });
}

async function selecionarLayout(id) {
  $('#im-detalhe').innerHTML = '<div class="cartao"><span class="carregando"></span> Carregando layout…</div>';
  try {
    I.sel = await api(`/api/layouts/${encodeURIComponent(id)}`);
    I.res = null; I.ler = null;
    I.config = { mapa: {}, incluir: {}, opcoes: { competencia: mesAtual(), encoding: 'cp1252', quebra: 'CRLF', remover_acentos: false, maiusculas: false, nome_arquivo: '' } };
    await sugerirMapa();
    $$('.item-layout').forEach((b) => b.classList.toggle('ativo', b.dataset.id === id));
    desenharDetalheLayout();
  } catch (e) { falha(e); $('#im-detalhe').innerHTML = ''; }
}

function mesAtual() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

function colunasPlan() {
  if (!I.plan) return [];
  const aba = I.plan.abas.find((a) => a.nome === I.abaPlan) || I.plan.abas[0];
  return aba.colunas;
}
function amostraPlan() {
  if (!I.plan) return null;
  const aba = I.plan.abas.find((a) => a.nome === I.abaPlan) || I.plan.abas[0];
  return aba.amostra && aba.amostra[0] ? Object.fromEntries(aba.colunas.map((c, i) => [c, aba.amostra[0][i]])) : null;
}

async function sugerirMapa(manterFixos) {
  const r = await api('/api/importacao/sugerir', { method: 'POST', body: { layout_id: I.sel.id, colunas: colunasPlan() } });
  if (manterFixos && I.config.mapa) {
    Object.entries(I.config.mapa).forEach(([k, v]) => { if (v.origem === 'fixo' || v.origem === 'especial') r.mapa[k] = r.mapa[k] && r.mapa[k].origem === 'coluna' ? r.mapa[k] : v; });
  }
  I.config.mapa = r.mapa;
  if (!manterFixos) I.config.incluir = r.incluir;
}

function nomeArquivoPadrao() {
  let n = I.sel.nome_arquivo || `${I.sel.id}.${I.sel.formato === 'delimitado' ? 'csv' : 'txt'}`;
  const m = /^(\d{4})-(\d{2})$/.exec(I.config.opcoes.competencia || '');
  if (m) n = n.replace('AAAA', m[1]).replace('MM', m[2]).replace('AA', m[1].slice(2));
  if (!n.includes('.')) n += I.sel.formato === 'delimitado' ? '.csv' : '.txt';
  return n;
}

function desenharDetalheLayout() {
  const d = $('#im-detalhe');
  if (!I.sel) {
    d.innerHTML = `<div class="cartao vazio-layout"><span class="tile g">${ico('docok')}</span>
      <h2>Selecione um layout</h2><p>Escolha um item na lista para ver os detalhes e as opções disponíveis.</p>
      <div class="opcoes-acao">
        <div class="opcao-acao"><span class="tile">${ico('docenvio')}</span><div><strong>Gerar arquivo</strong><small>Use uma planilha no formato exigido pelo layout.</small></div></div>
        <div class="opcao-acao"><span class="tile">${ico('docbusca')}</span><div><strong>Ler e validar</strong><small>Confira o conteúdo de um arquivo recebido.</small></div></div>
      </div>
      <div class="dica-rodape">${ico('info')}Pesquise pelo nome, banco, empresa ou tipo de arquivo.</div></div>`;
    return;
  }
  const l = I.sel;
  d.innerHTML = `
  <div class="cartao">
    <div class="cartao-titulo"><div><h2>${esc(tituloCurto(l.titulo))}</h2>
      <div class="acoes" style="margin-top:6px"><span class="selo azul">${esc(CATEGORIAS[l.categoria] || l.categoria)}</span>
      <span class="selo">${l.formato === 'delimitado' ? `Delimitado por “${esc(l.separador)}”` : 'Posicional'}</span>
      ${l.nome_arquivo ? `<span class="selo">Arquivo: ${esc(l.nome_arquivo)}</span>` : ''}
      ${l.tipo_arquivo ? `<span class="selo">${esc(l.tipo_arquivo)}</span>` : ''}
      <span class="selo">${l.registros.length} registro(s)</span></div></div>
      <a class="botao sec" href="#config/layout/${encodeURIComponent(l.id)}">${ico('lapis')}Editar layout</a></div>
    ${l.observacao ? `<details class="detalhes-obs"><summary>Observações do layout</summary><div>${esc(l.observacao)}</div></details>` : ''}
    <div class="abas" role="tablist">
      <button class="aba ${I.aba === 'gerar' ? 'ativa' : ''}" data-aba="gerar" type="button">Gerar arquivo</button>
      <button class="aba ${I.aba === 'ler' ? 'ativa' : ''}" data-aba="ler" type="button">Ler e validar</button>
      <button class="aba ${I.aba === 'campos' ? 'ativa' : ''}" data-aba="campos" type="button">Campos do layout</button>
    </div>
    <div id="im-aba"></div>
  </div>`;
  $$('.aba', d).forEach((b) => { b.onclick = () => { I.aba = b.dataset.aba; desenharDetalheLayout(); }; });
  ({ gerar: abaGerar, ler: abaLer, campos: abaCampos })[I.aba]();
}

// ---------- aba gerar
function abaGerar() {
  const alvo = $('#im-aba');
  const op = I.config.opcoes;
  const modelos = I.sel.modelos || [];
  alvo.innerHTML = `
  <div class="grade-2">
    <div><h3>1. Planilha com os dados</h3><div id="im-zona"></div><div id="im-abas-plan"></div></div>
    <div><h3>2. Opções do arquivo</h3>
      <div class="linha-form">
        <div class="campo"><label for="im-comp">Competência (mês/ano)</label><input type="month" id="im-comp" value="${esc(op.competencia)}"></div>
        <div class="campo"><label for="im-nome">Nome do arquivo</label><input type="text" id="im-nome" value="${esc(op.nome_arquivo || nomeArquivoPadrao())}"></div>
      </div>
      <div class="linha-form">
        <div class="campo"><label for="im-enc">Codificação</label><select id="im-enc"><option value="cp1252">Windows (ANSI / WIN1252)</option><option value="utf-8">UTF-8</option><option value="latin-1">ISO-8859-1</option></select></div>
        <div class="campo"><label for="im-quebra">Quebra de linha</label><select id="im-quebra"><option value="CRLF">Windows (CRLF)</option><option value="LF">Linux (LF)</option></select></div>
      </div>
      <div class="acoes"><label class="check"><input type="checkbox" id="im-acento" ${op.remover_acentos ? 'checked' : ''}> Remover acentos</label>
        <label class="check"><input type="checkbox" id="im-maiusc" ${op.maiusculas ? 'checked' : ''}> Texto em MAIÚSCULAS</label></div>
      <div class="linha-form" style="margin-top:12px">
        <div class="campo"><label for="im-modelo">Modelo de mapeamento salvo</label><select id="im-modelo"><option value="">— ${modelos.length ? 'escolha para carregar' : 'nenhum salvo'} —</option>
          ${modelos.map((m) => `<option value="${m.id}">${esc(m.nome)}</option>`).join('')}</select></div>
        <div class="fixo acoes"><button class="botao sec" id="im-salvar-modelo" type="button">${ico('salvar')}Salvar modelo</button>
          ${modelos.length ? '<button class="botao perigo peq" id="im-exc-modelo" type="button" title="Excluir modelo selecionado">✕</button>' : ''}</div>
      </div>
    </div>
  </div>
  <h3 style="margin-top:18px">3. Mapeamento dos campos</h3>
  <p class="sutil">Para cada campo do layout, diga de onde vem o valor: uma coluna do Excel, um valor fixo ou um valor automático (sequencial, quantidade, soma, data).</p>
  <div id="im-regs"></div>
  <div class="acoes" style="margin-top:16px"><button class="botao grande" id="im-gerar" type="button">${ico('checar')}Validar e gerar arquivo</button>
    <button class="botao sec" id="im-resugerir" type="button" ${I.plan ? '' : 'disabled'}>${ico('recarregar')}Refazer sugestão automática</button></div>
  <div id="im-res"></div>`;

  $('#im-zona').appendChild(zonaEnvio({ titulo: 'Selecionar Excel', dica: '.xlsx, .xls ou .csv — primeira linha com os nomes das colunas', aceitar: '.xlsx,.xlsm,.xls,.csv,.txt', atual: I.plan,
    aoCarregar: async (info) => { I.plan = info; I.abaPlan = info.abas[0].nome; I.res = null; await sugerirMapa(true); abaGerar(); } }));
  if (I.plan && I.plan.abas.length > 1) {
    $('#im-abas-plan').innerHTML = `<div class="campo" style="margin-top:10px"><label>Aba</label><select id="im-aba-plan">${I.plan.abas.map((a) => `<option ${a.nome === I.abaPlan ? 'selected' : ''}>${esc(a.nome)}</option>`).join('')}</select></div>`;
    $('#im-aba-plan').onchange = async (e) => { I.abaPlan = e.target.value; await sugerirMapa(true); abaGerar(); };
  }
  $('#im-enc').value = op.encoding; $('#im-quebra').value = op.quebra;
  $('#im-comp').onchange = (e) => { op.competencia = e.target.value; if (!op.nome_editado) { op.nome_arquivo = ''; $('#im-nome').value = nomeArquivoPadrao(); } };
  $('#im-nome').oninput = (e) => { op.nome_arquivo = e.target.value; op.nome_editado = true; };
  $('#im-enc').onchange = (e) => { op.encoding = e.target.value; };
  $('#im-quebra').onchange = (e) => { op.quebra = e.target.value; };
  $('#im-acento').onchange = (e) => { op.remover_acentos = e.target.checked; };
  $('#im-maiusc').onchange = (e) => { op.maiusculas = e.target.checked; };
  $('#im-modelo').onchange = async (e) => {
    if (!e.target.value) return;
    try {
      const m = await api(`/api/modelos/${e.target.value}`);
      I.config.mapa = m.config.mapa || {}; I.config.incluir = m.config.incluir || {};
      Object.assign(I.config.opcoes, m.config.opcoes || {}, { competencia: I.config.opcoes.competencia });
      toast(`Modelo “${m.nome}” carregado.`);
      const sel = e.target.value; abaGerar(); $('#im-modelo').value = sel;
    } catch (er) { falha(er); }
  };
  $('#im-salvar-modelo').onclick = async () => {
    const nome = await pedirTexto('Salvar modelo de mapeamento', 'Nome do modelo (ex.: planilha padrão do cliente)');
    if (!nome) return;
    try {
      await api('/api/modelos', { method: 'POST', body: { layout_id: I.sel.id, nome, config: I.config } });
      I.sel = await api(`/api/layouts/${encodeURIComponent(I.sel.id)}`);
      toast('Modelo salvo.'); abaGerar();
    } catch (er) { falha(er); }
  };
  const exc = $('#im-exc-modelo');
  if (exc) exc.onclick = async () => {
    const id = $('#im-modelo').value;
    if (!id) { toast('Escolha o modelo a excluir.'); return; }
    if (!(await confirmar('Excluir modelo', 'O modelo selecionado será excluído.'))) return;
    await api(`/api/modelos/${id}`, { method: 'DELETE' });
    I.sel = await api(`/api/layouts/${encodeURIComponent(I.sel.id)}`);
    abaGerar();
  };
  $('#im-resugerir').onclick = async () => { await sugerirMapa(false); abaGerar(); toast('Mapeamento sugerido novamente.'); };
  $('#im-gerar').onclick = gerarArquivo;
  desenharRegistros();
  if (I.res) desenharResultadoGerar();
}

function desenharRegistros() {
  const cont = $('#im-regs');
  const regs = I.sel.registros;
  cont.innerHTML = regs.map((r, ri) => {
    const inc = !!I.config.incluir[ri];
    return `<div class="registro ${inc ? '' : 'desligado'}" data-ri="${ri}">
      <div class="registro-topo"><label class="check"><input type="checkbox" class="inc" ${inc ? 'checked' : ''}> Incluir</label>
        <span class="selo ${r.papel === 'detalhe' ? 'azul' : ''}">${PAPEIS[r.papel] || r.papel}</span>
        <strong>${esc(r.nome)}</strong><small class="sutil">${r.campos.length} campos${r.papel === 'detalhe' ? ' · 1 linha por linha do Excel' : ' · 1 linha no arquivo'}</small></div>
      <div class="registro-corpo">${inc ? tabelaMapa(ri) : ''}</div></div>`;
  }).join('');
  $$('.registro', cont).forEach((div) => {
    const ri = +div.dataset.ri;
    $('.inc', div).onchange = (e) => { I.config.incluir[ri] = e.target.checked; desenharRegistros(); };
    ligarMapa(div, ri);
  });
}

function descTipo(c) {
  const t = c.tipo === 'numerico' ? 'Num' : c.tipo === 'data' ? 'Data' : 'Texto';
  const extra = c.decimais ? ` ${c.decimais} dec` : c.formato_data ? ` ${c.formato_data}` : '';
  return `${t}${c.tamanho ? ` (${c.tamanho})` : ''}${extra}`;
}
const posCampo = (c) => (c.inicio && c.fim ? `${c.inicio}–${c.fim}` : (c.inicio || '—'));

function tabelaMapa(ri) {
  const reg = I.sel.registros[ri];
  const delim = I.sel.formato === 'delimitado';
  const linhas = reg.campos.map((c, ci) => {
    if (c.delimitador) return '';
    return `<tr data-ci="${ci}"><td class="nowrap num">${posCampo(c)}</td>
      <td class="desc" title="${esc(c.descricao)}"><span>${esc(c.descricao)}</span></td>
      <td class="nowrap sutil">${descTipo(c)}${c.decimais_inferido ? ' <span class="selo alerta" title="Decimais deduzidos pela descrição do campo. Confira no layout.">?</span>' : ''}</td>
      <td class="origem">${seletorOrigem(ri, ci)}</td><td class="valor-cel">${controleValor(ri, ci)}</td>
      <td class="amostra">${esc(amostraCampo(ri, ci))}</td></tr>`;
  }).join('');
  return `<div class="tabela-wrap mapa" style="border:0;border-radius:0;max-height:none"><table>
    <thead><tr><th>Posição</th><th>Campo do layout</th><th>Tipo</th><th>Origem</th><th>Valor</th><th>Exemplo (1ª linha)</th></tr></thead>
    <tbody>${linhas}</tbody></table></div>${delim ? `<p class="sutil" style="padding:8px 14px;margin:0">Separador “${esc(I.sel.separador)}” incluído automaticamente entre os campos.</p>` : ''}`;
}

function mapaDe(ri, ci) { return I.config.mapa[`${ri}.${ci}`] || { origem: 'vazio', valor: '' }; }

function seletorOrigem(ri, ci) {
  const m = mapaDe(ri, ci);
  const op = [['coluna', 'Coluna do Excel'], ['fixo', 'Valor fixo'], ['especial', 'Automático'], ['vazio', 'Vazio']];
  return `<select class="org">${op.map(([k, v]) => `<option value="${k}" ${m.origem === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
}

function camposSomaveis() {
  const lista = [];
  I.sel.registros.forEach((r, ri) => {
    if (r.papel !== 'detalhe') return;
    r.campos.forEach((c, ci) => { if (c.tipo === 'numerico' && !c.delimitador) lista.push([`${ri}.${ci}`, `${posCampo(c)} ${c.descricao.slice(0, 50)}`]); });
  });
  return lista;
}

function controleValor(ri, ci) {
  const m = mapaDe(ri, ci);
  if (m.origem === 'coluna') {
    const cols = colunasPlan();
    if (!cols.length) return `<input type="text" class="val" placeholder="Nome da coluna" value="${esc(m.valor)}">`;
    return `<select class="val"><option value="">— escolha a coluna —</option>${cols.map((c) => `<option ${c === m.valor ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`;
  }
  if (m.origem === 'fixo') return `<input type="text" class="val" value="${esc(m.valor)}" placeholder="Valor fixo">`;
  if (m.origem === 'especial') {
    const base = (m.valor || '').split(':')[0];
    let html = `<select class="val">${Object.entries(I.especiais).map(([k, v]) => `<option value="${k}" ${k === base ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
    if (base === 'SOMA') {
      const alvo = (m.valor || '').split(':')[1] || '';
      html += `<select class="val2" style="margin-top:4px"><option value="">— campo a somar —</option>${camposSomaveis().map(([k, v]) => `<option value="${k}" ${k === alvo ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
    }
    return html;
  }
  return '<span class="sutil">—</span>';
}

function amostraCampo(ri, ci) {
  const m = mapaDe(ri, ci);
  if (m.origem === 'coluna') { const a = amostraPlan(); return a ? (a[m.valor] ?? '') : ''; }
  if (m.origem === 'fixo') return m.valor;
  return '';
}

function ligarMapa(div, ri) {
  $$('tr[data-ci]', div).forEach((tr) => {
    const ci = +tr.dataset.ci;
    const k = `${ri}.${ci}`;
    const redesenhar = () => {
      tr.querySelector('.valor-cel').innerHTML = controleValor(ri, ci);
      tr.querySelector('.amostra').textContent = amostraCampo(ri, ci);
      ligarValor();
    };
    const ligarValor = () => {
      const v = $('.val', tr), v2 = $('.val2', tr);
      if (v) v[v.tagName === 'SELECT' ? 'onchange' : 'oninput'] = () => {
        const m = mapaDe(ri, ci);
        m.valor = m.origem === 'especial' && v.value === 'SOMA' ? `SOMA:${(camposSomaveis()[0] || [''])[0]}` : v.value;
        I.config.mapa[k] = m;
        if (m.origem !== 'fixo') redesenhar(); else tr.querySelector('.amostra').textContent = m.valor;
      };
      if (v2) v2.onchange = () => { I.config.mapa[k] = { origem: 'especial', valor: `SOMA:${v2.value}` }; };
    };
    $('.org', tr).onchange = (e) => {
      const c = I.sel.registros[ri].campos[ci];
      const org = e.target.value;
      const valor = org === 'fixo' ? (c.fixo || '') : org === 'especial' ? 'SEQUENCIAL' : '';
      I.config.mapa[k] = { origem: org, valor };
      redesenhar();
    };
    ligarValor();
  });
}

async function gerarArquivo() {
  const b = $('#im-gerar');
  const regsInc = Object.entries(I.config.incluir).filter(([, v]) => v).map(([k]) => I.sel.registros[+k]);
  if (regsInc.some((r) => r.papel === 'detalhe') && !I.plan) { toast('Envie a planilha com os dados.', 'erro'); return; }
  b.disabled = true; b.innerHTML = '<span class="carregando"></span> Gerando…';
  try {
    const cfg = JSON.parse(JSON.stringify(I.config));
    cfg.opcoes.nome_arquivo = $('#im-nome').value;
    I.res = await api('/api/importacao/gerar', { method: 'POST', body: { layout_id: I.sel.id, token: I.plan && I.plan.token, aba: I.abaPlan, config: cfg } });
    desenharResultadoGerar();
    $('#im-res').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { falha(e); }
  b.disabled = false; b.innerHTML = `${ico('checar')}Validar e gerar arquivo`;
}

function regua(largura) {
  let dez = '', uni = '';
  for (let i = 1; i <= largura; i++) { dez += i % 10 === 0 ? String((i / 10) % 10) : ' '; uni += String(i % 10); }
  return `${dez}\n${uni}`;
}

function desenharResultadoGerar() {
  const r = I.res;
  const larg = Math.max(0, ...r.previa.map((l) => l.length));
  const posicional = I.sel.formato !== 'delimitado';
  $('#im-res').innerHTML = `
  <div class="cartao" style="margin-top:18px;box-shadow:none">
    <div class="cartao-titulo"><h3>Arquivo gerado: ${esc(r.arquivo)}</h3>
      <div class="acoes"><button class="botao" id="im-baixar" type="button">${ico('baixar')}Baixar arquivo</button>
      ${r.download_avisos ? `<button class="botao sec" id="im-baixar-av" type="button">${ico('baixar')}Avisos em Excel</button>` : ''}</div></div>
    <div class="stats">${stat(r.linhas, 'linhas no arquivo')}${stat(r.detalhes, 'registros de detalhe', 'ok')}
      ${stat(r.total_avisos, 'avisos', r.total_avisos ? 'alerta' : 'ok')}
      ${posicional ? `<div class="stat ${r.larguras.length > 1 ? 'alerta' : ''}"><b>${r.larguras.join(' / ') || 0}</b><span>caracteres por linha</span></div>` : ''}</div>
    ${r.total_avisos ? '' : '<div class="aviso ok">Nenhum problema encontrado nos dados.</div>'}
    <h4>Prévia (primeiras ${r.previa.length} linhas)</h4>
    <div class="previa-arquivo">${posicional ? `<span class="regua">${regua(Math.min(larg, 400))}</span>\n` : ''}${esc(r.previa.join('\n'))}</div>
    ${r.avisos.length ? `<h4 style="margin-top:14px">Avisos${r.total_avisos > r.avisos.length ? ` (primeiros ${r.avisos.length} de ${fmtN(r.total_avisos)})` : ''}</h4>
      ${tabelaHtml(['Linha do Excel', 'Registro', 'Campo', 'Posição', 'Aviso'], r.avisos.map((a) => [a.linha_planilha, a.registro, a.campo, a.posicao, a.aviso]))}` : ''}
  </div>`;
  $('#im-baixar').onclick = () => baixar(r.download);
  const av = $('#im-baixar-av'); if (av) av.onclick = () => baixar(r.download_avisos);
}

// ---------- aba ler
function abaLer() {
  const alvo = $('#im-aba');
  alvo.innerHTML = `
  <p class="sutil">Envie um arquivo neste layout (TXT, CSV, retorno bancário…). O sistema separa os campos, identifica header/detalhe/trailer e aponta o que estiver fora do padrão.</p>
  <div class="linha-form"><div id="im-zona-ler" style="flex:3 1 320px"></div>
    <div class="campo" style="flex:1 1 180px"><label for="im-enc-ler">Codificação</label><select id="im-enc-ler"><option value="cp1252">Windows (ANSI / WIN1252)</option><option value="utf-8">UTF-8</option></select></div>
    <div class="fixo campo"><button class="botao grande" id="im-ler" type="button" ${I.arqLer ? '' : 'disabled'}>${ico('docbusca')}Ler arquivo</button></div></div>
  <div id="im-res-ler"></div>`;
  $('#im-zona-ler').appendChild(zonaEnvio({ titulo: 'Selecionar arquivo', dica: 'Arquivo no formato do layout selecionado', planilha: false, atual: I.arqLer,
    aoCarregar: (info) => { I.arqLer = info; I.ler = null; $('#im-ler').disabled = false; } }));
  $('#im-ler').onclick = async () => {
    const b = $('#im-ler');
    b.disabled = true; b.innerHTML = '<span class="carregando"></span> Lendo…';
    try {
      I.ler = await api('/api/importacao/ler', { method: 'POST', body: { layout_id: I.sel.id, token: I.arqLer.token, encoding: $('#im-enc-ler').value } });
      I.abaLer = Object.keys(I.ler.previa)[0];
      desenharLeitura();
    } catch (e) { falha(e); }
    b.disabled = false; b.innerHTML = `${ico('docbusca')}Ler arquivo`;
  };
  if (I.ler) desenharLeitura();
}

function desenharLeitura() {
  const r = I.ler;
  const abas = Object.keys(r.previa);
  const p = r.previa[I.abaLer] || r.previa[abas[0]];
  $('#im-res-ler').innerHTML = `
  <div class="cartao" style="margin-top:16px;box-shadow:none">
    <div class="cartao-titulo"><h3>Leitura concluída</h3><button class="botao" id="im-baixar-ler" type="button">${ico('baixar')}Baixar Excel</button></div>
    <div class="stats">${stat(r.linhas, 'linhas lidas')}${Object.entries(r.por_registro).map(([k, v]) => stat(v, k)).join('')}
      ${stat(r.total_avisos, 'avisos', r.total_avisos ? 'alerta' : 'ok')}</div>
    ${r.total_avisos ? '' : '<div class="aviso ok">Arquivo compatível com o layout.</div>'}
    <div class="chips" style="margin-bottom:10px">${abas.map((a) => `<button type="button" class="chip ${a === I.abaLer ? 'ativo' : ''}" data-a="${esc(a)}">${esc(a)}</button>`).join('')}</div>
    ${tabelaHtml(p.colunas, p.linhas)}
    ${p.linhas.length >= 50 ? '<p class="sutil" style="margin-top:8px">Prévia das 50 primeiras linhas. O Excel tem todas.</p>' : ''}
  </div>`;
  $('#im-baixar-ler').onclick = () => baixar(r.download);
  $$('#im-res-ler .chip').forEach((c) => { c.onclick = () => { I.abaLer = c.dataset.a; desenharLeitura(); }; });
}

// ---------- aba campos
function abaCampos() {
  $('#im-aba').innerHTML = I.sel.registros.map((r) => `
    <div class="registro"><div class="registro-topo"><span class="selo ${r.papel === 'detalhe' ? 'azul' : ''}">${PAPEIS[r.papel] || r.papel}</span><strong>${esc(r.nome)}</strong></div>
    ${tabelaHtml(['Início', 'Fim', 'Tam.', 'Tipo', 'Formato', 'Dec.', 'Fixo', 'Descrição'],
      r.campos.map((c) => [c.inicio ?? '', c.fim ?? '', c.tamanho ?? '', c.tipo, c.formato || c.formato_data || '', c.decimais || '', c.fixo ?? '', c.descricao]))}</div>`).join('');
}

// ============================================================ 3. AJUDA
const A = { q: '', res: null, det: null, sel: null, procs: null };
const EXEMPLOS = ['Como cadastrar um boleto?', 'Importar mensalidades descontadas em folha', 'Débito automático em conta', 'Desfiliar sócios em atraso', 'Como cruzar duas planilhas?'];

function telaAjuda(params) {
  app.innerHTML = `
  <div class="cabecalho-pagina"><div><h1>Como podemos ajudar?</h1><p>Encontre orientações nos procedimentos, nas páginas de ajuda e nos layouts.</p></div></div>
  <div class="cartao">
    <label for="aj-q" style="font-size:1.05rem;margin-bottom:12px">Descreva sua dúvida</label>
    <form class="busca-ajuda" id="aj-form"><div class="com-icone">${ico('busca')}<input type="search" id="aj-q" placeholder="Digite sua dúvida…" value="${esc(A.q)}" autocomplete="off"></div>
      <button class="botao grande" type="submit">Buscar</button></form>
    <span class="rotulo-sug">Sugestões de busca</span>
    <div class="chips sugestoes" style="margin:0">${EXEMPLOS.map((e) => `<button type="button" class="chip" data-q="${esc(e)}">${esc(e)}</button>`).join('')}</div>
  </div>
  <div id="aj-corpo"></div>`;
  $('#aj-form').onsubmit = (e) => { e.preventDefault(); buscarAjuda($('#aj-q').value); };
  $$('.sugestoes .chip').forEach((c) => { c.onclick = () => { $('#aj-q').value = c.dataset.q; buscarAjuda(c.dataset.q); }; });
  if (params && params[0] === 'procedimento' && params[1]) { abrirItemAjuda('procedimento', params[1]); return; }
  if (A.res) desenharAjuda(); else inicioAjuda();
  setTimeout(() => $('#aj-q') && $('#aj-q').focus(), 30);
}

async function inicioAjuda() {
  try {
    A.procs = await api('/api/procedimentos');
    const porCat = {};
    A.procs.forEach((p) => { (porCat[p.categoria || 'Geral'] = porCat[p.categoria || 'Geral'] || []).push(p); });
    const icCat = (c) => (/config/i.test(semAcento(c)) ? 'engrenagem' : 'livro');
    const sub = (p) => { const l = String(p.procedimento || p.palavras_chave || '').split('\n').map((x) => x.trim()).find(Boolean) || ''; return l.length > 90 ? `${l.slice(0, 88)}…` : l; };
    $('#aj-corpo').innerHTML = `
      <div class="secao-titulo"><h2>Procedimentos cadastrados</h2><span class="contagem azul">${fmtN(A.procs.length)} procedimento${A.procs.length === 1 ? '' : 's'}</span></div>
      ${A.procs.length ? `<div class="grupos-proc">${Object.entries(porCat).sort((a, b) => (icCat(a[0]) === 'engrenagem') - (icCat(b[0]) === 'engrenagem')).map(([cat, ps]) => `<div class="cartao grupo-proc"><div class="cab">${ico(icCat(cat))}<h3>${esc(cat)}</h3></div>
        ${ps.map((p) => `<button type="button" class="item-lista" data-id="${p.id}"><span class="bolinha">${ico('documento')}</span>
          <span class="txt"><strong>${esc(p.titulo)}</strong>${sub(p) ? `<small>${esc(sub(p))}</small>` : ''}</span>${ico('seta', 'seta')}</button>`).join('')}</div>`).join('')}</div>`
        : '<div class="cartao vazio">Nenhum procedimento cadastrado. Cadastre em Configurações.</div>'}`;
    $$('#aj-corpo .item-lista').forEach((b) => { b.onclick = () => abrirItemAjuda('procedimento', b.dataset.id); });
  } catch (e) { falha(e); }
}

async function buscarAjuda(q) {
  A.q = q.trim();
  if (!A.q) { A.res = null; inicioAjuda(); return; }
  $('#aj-corpo').innerHTML = '<div class="cartao" style="margin-top:18px"><span class="carregando"></span> Procurando…</div>';
  try {
    A.res = await api(`/api/ajuda/buscar?q=${encodeURIComponent(A.q)}`);
    A.det = A.res.melhor; A.sel = A.res.resultados[0] ? `${A.res.resultados[0].tipo}:${A.res.resultados[0].ref}` : null;
    desenharAjuda();
  } catch (e) { falha(e); }
}

async function abrirItemAjuda(tipo, ref) {
  try {
    A.det = await api(`/api/ajuda/${tipo}/${encodeURIComponent(ref)}`);
    A.sel = `${tipo}:${ref}`;
    if (!A.res) A.res = { resultados: [], termos: [] };
    desenharAjuda();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) { falha(e); }
}

function realce(texto, termos) {
  let h = esc(texto);
  (termos || []).filter((t) => t.length > 2).forEach((t) => {
    const raiz = semAcento(t).slice(0, Math.max(4, t.length - 2));
    const padrao = raiz.split('').map((ch) => ({ a: '[aáàâã]', e: '[eéê]', i: '[ií]', o: '[oóôõ]', u: '[uúü]', c: '[cç]' }[ch] || ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('');
    h = h.replace(new RegExp(`(^|[^\\wÀ-ú])(${padrao}[\\wÀ-ú]*)`, 'gi'), '$1<mark>$2</mark>');
  });
  return h;
}

function linhasLista(texto) { return (texto || '').split('\n').map((s) => s.trim().replace(/^[-•]\s*/, '')).filter(Boolean); }

function htmlDetalheAjuda(d, termos) {
  if (!d) return '<div class="vazio"><span class="emoji">🔎</span>Nada encontrado. Tente outras palavras.</div>';
  if (d.tipo === 'procedimento') {
    return `<div class="resposta"><span class="selo ok">Procedimento</span> ${d.categoria ? `<span class="selo">${esc(d.categoria)}</span>` : ''}
      <h2 style="margin-top:8px">${esc(d.titulo)}</h2>
      ${d.passos.length ? `<div class="secao-ajuda"><h3>📌 Procedimento</h3><ol>${d.passos.map((p) => `<li>${realce(p, termos)}</li>`).join('')}</ol></div>` : ''}
      ${d.atencao ? `<div class="secao-ajuda atencao"><h3>⚠️ Atenção</h3><ul>${linhasLista(d.atencao).map((p) => `<li>${realce(p, termos)}</li>`).join('')}</ul></div>` : ''}
      ${d.solucao ? `<div class="secao-ajuda solucao"><h3>🔧 Solução de problemas</h3><ul>${linhasLista(d.solucao).map((p) => `<li>${realce(p, termos)}</li>`).join('')}</ul></div>` : ''}
      <p style="margin-top:16px"><a class="botao sec peq" href="#config/proc/${d.id}">${ico('lapis')}Editar procedimento</a></p></div>`;
  }
  if (d.tipo === 'pagina') {
    const corte = d.blocos.findIndex((b) => /^(in[ií]cio|campo|seq\.?)$/i.test(b.trim()));
    const blocos = corte > 0 ? d.blocos.slice(0, corte) : d.blocos.slice(0, 60);
    const resto = corte > 0 ? d.blocos.length - corte : Math.max(0, d.blocos.length - 60);
    return `<div class="resposta"><span class="selo azul">Página de ajuda</span> <span class="selo">${esc(d.modulo)}</span>
      <h2 style="margin-top:8px">${esc(d.titulo)}</h2>
      <div class="texto-pagina">${blocos.map((b) => `<p>${realce(b, termos)}</p>`).join('')}</div>
      ${d.layout ? `<div class="aviso info">Esta página descreve um layout de arquivo. <a href="#importacao/${encodeURIComponent(d.ref)}"><strong>Abrir o layout na Importação de dados →</strong></a></div>` : ''}
      ${resto && !d.layout ? `<details class="detalhes-obs"><summary>Mostrar o restante da página</summary><div>${esc((corte > 0 ? d.blocos.slice(corte) : d.blocos.slice(60)).join('\n'))}</div></details>` : ''}</div>`;
  }
  return `<div class="resposta"><span class="selo">Layout</span><h2 style="margin-top:8px">${esc(d.titulo)}</h2>
    <p style="white-space:pre-wrap">${realce(d.observacao || '', termos)}</p>
    <a class="botao" href="#importacao/${encodeURIComponent(d.ref)}">Abrir na Importação de dados →</a></div>`;
}

function desenharAjuda() {
  const r = A.res;
  const termos = r.termos || [];
  const tipos = { procedimento: ['ok', 'Procedimento'], pagina: ['azul', 'Ajuda'], layout: ['', 'Layout'] };
  $('#aj-corpo').innerHTML = `
  <div class="layout-ajuda">
    <div class="cartao">${htmlDetalheAjuda(A.det, termos)}</div>
    <aside class="cartao"><div class="cartao-titulo" style="margin-bottom:6px"><h3>${r.resultados.length ? `${r.resultados.length} resultado(s)` : A.q ? 'Sem resultados' : 'Resultados'}</h3>
      <button type="button" class="botao sec peq" id="aj-voltar">${ico('voltar')}Procedimentos</button></div>
      ${r.resultados.map((x) => `<button type="button" class="resultado ${A.sel === `${x.tipo}:${x.ref}` ? 'ativo' : ''}" data-t="${x.tipo}" data-r="${esc(x.ref)}">
        <strong>${esc(x.titulo)}</strong><small><span class="selo ${tipos[x.tipo][0]}">${tipos[x.tipo][1]}</span>${x.tem_layout && x.tipo !== 'layout' ? ' <span class="selo">tem layout</span>' : ''} ${esc(x.trecho || '').replace(/\[\[\[/g, '<mark>').replace(/\]\]\]/g, '</mark>')}</small></button>`).join('')
        || '<p class="sutil">Tente outras palavras ou <a href="#config/proc/novo">cadastre um procedimento</a>.</p>'}
    </aside>
  </div>`;
  $$('#aj-corpo .resultado').forEach((b) => { b.onclick = () => abrirItemAjuda(b.dataset.t, b.dataset.r); });
  $('#aj-voltar').onclick = () => { A.q = ''; A.res = null; A.det = null; $('#aj-q').value = ''; inicioAjuda(); };
}

// ============================================================ 4. RELATÓRIOS
const R = { q: '', campos: false, sistema: '', tipo: '', assunto: '', res: null, sel: null, det: null, cfg: null, editando: false, aba: 'visao' };
const EXEMPLOS_REL = ['Sócios por sexo', 'Sócios por cidade com endereço', 'Empresas com contribuição em atraso', 'Aniversariantes com telefone', 'Lançamentos de convênio por empresa'];

async function telaRelatorios(params) {
  try { R.cfg = await api('/api/relatorios/_config'); } catch (e) { falha(e); return; }
  const sists = Object.keys(R.cfg.sistemas || {});
  if (R.sistema === '' && sists.length === 1 && !R.sistemaEscolhido) R.sistema = sists[0];
  app.innerHTML = `
  <div class="cabecalho-pagina"><div><h1>Encontre o relatório certo</h1>
    <p>Busque pela necessidade e confira os campos, os filtros e o caminho no sistema.</p></div>
    <span class="contagem">${fmtN(R.cfg.total)} relatórios</span></div>
  <div class="cartao">
    <form class="busca-ajuda" id="rl-form"><div class="com-icone">${ico('busca')}<input type="search" id="rl-q" placeholder="Ex.: sócios em atraso com CPF e telefone" value="${esc(R.q)}" autocomplete="off"></div>
      <button class="botao grande" type="submit">Buscar</button></form>
    <div class="linha-form" style="margin-top:16px">
      <div class="campo" style="margin:0"><label for="rl-sistema">Sistema</label><select id="rl-sistema"><option value="">Todos</option>
        ${Object.entries(R.cfg.sistemas).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `<option value="${esc(k)}" ${R.sistema === k ? 'selected' : ''}>${esc(k)} (${fmtN(v)})</option>`).join('')}</select></div>
      <div class="campo" style="margin:0"><label for="rl-assunto">Assunto</label><select id="rl-assunto"><option value="">Todos</option>
        ${Object.entries(R.cfg.assuntos).sort((a, b) => a[0].localeCompare(b[0])).map(([k]) => `<option ${R.assunto === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
    </div>
    <div class="chips sugestoes" style="margin-top:14px">${EXEMPLOS_REL.map((e) => `<button type="button" class="chip peq" data-q="${esc(e)}">${esc(e)}</button>`).join('')}</div>
  </div>
  <div class="layout-ajuda rel" id="rl-corpo"><aside class="cartao painel-rel" id="rl-lista"></aside><div class="cartao" id="rl-det"></div></div>`;
  $('#rl-form').onsubmit = (e) => { e.preventDefault(); R.q = $('#rl-q').value; R.campos = false; buscarRel(); };
  $('#rl-sistema').onchange = (e) => { R.sistema = e.target.value; R.sistemaEscolhido = true; buscarRel(); };
  $('#rl-assunto').onchange = (e) => { R.assunto = e.target.value; buscarRel(); };
  $$('.sugestoes .chip').forEach((c) => { c.onclick = () => { $('#rl-q').value = c.dataset.q; R.q = c.dataset.q; R.campos = false; buscarRel(); }; });
  const alvo = params && params[0];
  if (alvo) { R.sel = alvo; }
  await buscarRel(!!alvo);
  setTimeout(() => $('#rl-q') && $('#rl-q').focus(), 30);
}

async function buscarRel(manterSel) {
  try {
    R.res = await api(`/api/relatorios?q=${encodeURIComponent(R.q)}&campos=${R.campos ? 1 : 0}&sistema=${encodeURIComponent(R.sistema)}&assunto=${encodeURIComponent(R.assunto)}`);
    if (!manterSel) R.sel = R.res.resultados[0] ? R.res.resultados[0].id : null;
    desenharListaRel();
    if (R.sel) abrirRel(R.sel); else $('#rl-det').innerHTML = `<div class="vazio"><span class="tile g">${ico('docbusca')}</span><h3>Nenhum relatório encontrado</h3><p>Tente outras palavras.</p></div>`;
  } catch (e) { falha(e); }
}

function trilhaMenu(m) {
  if (!m || !m.caminho) return 'Caminho no menu não identificado';
  let seg = m.caminho.split(' > ').map((x) => x.trim()).filter(Boolean);
  if (seg.length > 1 && seg[0] === 'Relatórios') seg = seg.slice(1);
  if (seg.length > 1 && m.fonte !== 'provavel') seg = seg.slice(0, -1);
  return seg.join(' · ') + (m.fonte === 'provavel' ? ' (provável)' : '');
}

function desenharListaRel() {
  const r = R.res;
  $('#rl-lista').innerHTML = `<div class="cab"><h3>${fmtN(r.total)} ${R.q ? (r.total === 1 ? 'resultado' : 'resultados') : 'relatórios'}</h3>${r.resultados.length < r.total ? `<small class="sutil">mostrando ${r.resultados.length}</small>` : ''}</div>
    ${r.parcial ? '<div class="aviso">Nenhum relatório tem todos os termos. Mostrando os mais próximos.</div>' : ''}
    <div class="itens">${r.resultados.map((x) => `<button type="button" class="item-lista rl-item ${R.sel === x.id ? 'ativo' : ''}" data-id="${esc(x.id)}">${ico('documento')}
      <span class="txt"><strong>${esc(x.titulo)}</strong><small>${esc(trilhaMenu(x.menu))}</small>
      ${x.campos_encontrados && x.campos_encontrados.length ? `<small>Campos: ${x.campos_encontrados.map((c) => `<mark>${esc(c)}</mark>`).join(', ')}</small>` : ''}</span>${ico('seta', 'seta')}</button>`).join('') || '<p class="sutil" style="padding:0 20px 16px">Nada encontrado.</p>'}</div>
    ${r.outros_por_campos ? `<div class="rodape"><button type="button" class="botao sec" id="rl-mais-campos">${ico('mais')}${fmtN(r.outros_por_campos)} relatório${r.outros_por_campos === 1 ? '' : 's'} com os mesmos campos</button></div>` : ''}`;
  const mc = $('#rl-mais-campos'); if (mc) mc.onclick = () => { R.campos = true; buscarRel(true); };
  $$('#rl-lista .rl-item').forEach((b) => { b.onclick = () => { R.sel = b.dataset.id; R.editando = false; $$('#rl-lista .rl-item').forEach((x) => x.classList.toggle('ativo', x === b)); abrirRel(b.dataset.id); }; });
}

async function abrirRel(id) {
  try { R.det = await api(`/api/relatorios/${encodeURIComponent(id)}`); desenharDetRel(); } catch (e) { falha(e); }
}

function seloMenu(f) {
  return { confirmado: '<span class="selo ok" title="Informado manualmente">confirmado</span>',
    menu: '<span class="selo ok" title="Pelo print do menu do sistema">pelo menu</span>',
    provavel: '<span class="selo alerta" title="Deduzido pelo nome do arquivo; confira">provável</span>' }[f] || '';
}

function copiar(texto) {
  const ok = () => toast('Copiado.');
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(texto).then(ok, () => copiarAntigo(texto, ok));
  else copiarAntigo(texto, ok);
}
function copiarAntigo(texto, ok) {
  const t = document.createElement('textarea'); t.value = texto; document.body.appendChild(t); t.select();
  try { document.execCommand('copy'); ok(); } catch { toast('Não foi possível copiar.', 'erro'); }
  t.remove();
}

function chipsCampos(campos, nomeCampo) {
  // ordem do relatório; colunas numeradas do mesmo grupo viram "Meses (01 a 12)"
  const cs = [...campos].sort((a, b) => ((a.y ?? 1e9) - (b.y ?? 1e9)) || ((a.x ?? 0) - (b.x ?? 0)));
  const grupos = {}; const out = [];
  cs.forEach((c) => {
    const r = String(c.rotulo || '').trim();
    if (c.grupo && /^\d{1,2}$/.test(r)) {
      if (!grupos[c.grupo]) { grupos[c.grupo] = []; out.push({ g: c.grupo }); }
      grupos[c.grupo].push(r); return;
    }
    out.push({ n: nomeCampo(c) });
  });
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  return [...new Set(out.map((o) => {
    if (o.n) return o.n;
    const v = grupos[o.g].sort(); return `${cap(o.g)} (${v.length > 1 ? `${v[0]} a ${v[v.length - 1]}` : v[0]})`;
  }))];
}

function desenharDetRel() {
  const d = R.det;
  const pv = d.previa;
  const nomeCampo = (c) => { const b = String(c.rotulo || '').trim(); const r = b.replace(/[:.]+$/, ''); if (r.length < 2 || (/\./.test(b) && r.length <= 8)) return c.descricao; return r[0] + r.slice(1).toLowerCase(); };
  const descAgr = (a) => String((a && a.descricao) || (d.campos.find((c) => c.codigo === String(a).toUpperCase()) || {}).descricao || a).replace(/^(Código|Número|Descrição|Nome) de /, '').replace(/^./, (x) => x.toUpperCase());
  const filtros = d.filtros || [];
  const opcoesRel = d.opcoes || [];
  const totais = d.totais_resumo && d.totais_resumo.length ? d.totais_resumo : (d.totais || []).map((t) => (/count\(\s*\)/i.test(t) ? 'Quantidade de registros' : t).replace(/\[?[A-Za-z0-9_]+\."([^"]+)"\]?/g, (m0, f) => descAgr(f)).replace(/\[(SUM|COUNT)\((.*?)\)\]/gi, (m0, fn, a) => `${fn.toUpperCase() === 'SUM' ? 'soma' : 'quantidade'}${a ? ` de ${a}` : ''}`));
  const agrup = [...new Set((d.agrupamentos || []).map(descAgr))];
  const nFiltros = filtros.length + (opcoesRel.length ? 1 : 0);
  const num = (v) => /^-?[\d.]+(,\d+)?$/.test(v || '');
  const abas = [['visao', 'Visão geral'], ['filtros', `Filtros e opções${nFiltros ? ` (${nFiltros})` : ''}`], ['tecnico', 'Detalhes técnicos']];
  if (!abas.some(([k]) => k === R.aba)) R.aba = 'visao';

  const htmlPrevia = pv && pv.colunas.length ? `<div class="bloco"><div class="cab"><h3>${ico('documento')}Prévia do relatório</h3><small class="sutil">Dados de exemplo</small></div>
      <div class="previa-rel ${pv.colunas.length > 10 ? 'compacta' : ''}">
        ${pv.titulo ? `<div class="previa-titulo">${esc(pv.titulo)}</div>` : ''}
        ${pv.grupo.map((g) => `<div class="previa-grupo">${esc(g.texto)}</div>`).join('')}
        <div class="tabela-wrap" style="max-height:none"><table><thead>
          ${pv.sobre ? `<tr class="previa-sobre">${pv.sobre.map((g) => `<th colspan="${g.span}">${esc(g.texto)}</th>`).join('')}</tr>` : ''}
          <tr>${pv.colunas.map((c, j) => `<th class="${pv.linhas.some((l) => num(l.valores[j])) ? 'num' : ''}">${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${pv.linhas.map((l) => `<tr class="${l.inicio && pv.subs > 1 ? 'previa-novo' : ''}">${l.valores.map((v) => `<td class="${num(v) ? 'num' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('')}
        ${(pv.totais || []).map((l) => `<tr class="previa-total">${l.map((v) => `<td class="${num(v) ? 'num' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      </div></div>` : '';
  const htmlInfo = `<div class="bloco"><div class="cab"><h3>${ico('tabela')}Informações que o relatório traz</h3></div>
      <div class="corpo"><div class="chips">${chipsCampos(d.campos, nomeCampo).map((n) => `<span class="selo campo">${esc(n)}</span>`).join('') || '<span class="sutil">Nenhum campo identificado.</span>'}</div></div>
      ${agrup.length || totais.length ? `<div class="duas-colunas" style="${agrup.length && totais.length ? '' : 'grid-template-columns:1fr'}">
        ${agrup.length ? `<div><small>Agrupado por</small><strong>${esc(agrup.join(', '))}</strong></div>` : ''}
        ${totais.length ? `<div><small>Totais</small><strong>${esc(totais.join(' · '))}</strong></div>` : ''}</div>` : ''}
      ${nFiltros ? `<div class="nota">${ico('info')}<span>Consulte as opções disponíveis em <a href="#" id="rl-ir-filtros">Filtros e opções</a>.</span></div>` : ''}
    </div>`;
  const htmlFiltros = `<div class="bloco"><div class="cab"><h3>${ico('filtro')}Filtros da tela</h3>${d.tela ? `<small class="sutil">${esc(d.tela)}</small>` : ''}</div><div class="corpo">
      ${filtros.length ? `<table class="filtros-tela"><tbody>${filtros.map((f) => `<tr><th>${esc(f.rotulo)}</th><td>${(f.opcoes || []).map((o) => `<span class="selo">${esc(o)}</span>`).join(' ') || '<span class="sutil">informar</span>'}</td></tr>`).join('')}</tbody></table>` : ''}
      ${opcoesRel.length ? `<p style="margin:${filtros.length ? '12px' : '0'} 0 0"><strong>Opções:</strong> ${opcoesRel.map((o) => `<span class="selo">${esc(o)}</span>`).join(' ')}</p>` : ''}
      ${!filtros.length && !opcoesRel.length ? '<p class="sutil" style="margin:0">Sem tela de filtro identificada.</p>' : ''}
    </div></div>`;
  const htmlTecnico = `<div class="bloco"><div class="cab"><h3>${ico('documento')}Arquivo${d.variantes.length > 1 ? 's' : ''}</h3>${d.variantes.length > 1 ? '<small class="sutil">O sistema escolhe conforme o filtro</small>' : ''}</div><div class="corpo">
        ${d.variantes.map((v) => `<p class="acoes" style="margin:0 0 6px"><span class="mono">${esc(v.caminho_arquivo)}</span>${v.principal && d.variantes.length > 1 ? '<span class="selo azul">usado na prévia</span>' : ''}<button class="botao sec peq" data-copia="${esc(v.caminho_arquivo)}" type="button">${ico('copiar')}Copiar</button></p>`).join('') || '<p class="sutil" style="margin:0">Nenhum arquivo identificado para este item.</p>'}
        ${(d.titulos || []).length ? `<p style="margin:12px 0 0"><strong>Títulos impressos:</strong> ${esc(d.titulos.join(' · '))}</p>` : ''}
        <p class="sutil" style="margin:8px 0 0">Formato: ${esc(d.formato)}</p></div></div>
      <div class="bloco"><div class="cab"><h3>${ico('tabela')}Campos (${d.campos.length})</h3></div>
        <div class="tabela-wrap" style="border:0;border-radius:0">${tabelaHtml(['Rótulo no relatório', 'Descrição', 'Tipo', 'Tabela', 'Código'], [...d.campos].sort((a, b) => ((a.y ?? 1e9) - (b.y ?? 1e9)) || ((a.x ?? 0) - (b.x ?? 0))).map((c) => [c.rotulo || '', c.descricao, c.tipo_bd || '', c.tabela || '', c.codigo])).replace('<div class="tabela-wrap">', '<div>')}</div>
        ${(d.tabelas || []).length ? `<div class="corpo" style="border-top:1px solid var(--borda)"><strong>Tabelas consultadas:</strong> <span class="mono">${esc(d.tabelas.join(', '))}</span></div>` : ''}</div>`;

  $('#rl-det').innerHTML = `
  <div class="resposta">
    <div class="det-cab"><div><h2>${esc(d.titulo)} <span class="selo azul">${esc(d.sistema)}</span>${d.tipo === 'documento' ? '<span class="selo ok">Documento/Recibo</span>' : ''}</h2>
      ${d.dica && d.dica !== d.titulo ? `<p>${esc(d.dica)}</p>` : `<p>${esc(d.assunto)}</p>`}</div>
      <button class="botao sec" id="rl-editar" type="button">${ico('lapis')}Editar informações</button></div>
    ${d.descricao ? `<p style="margin:10px 0 0">${esc(d.descricao)}</p>` : ''}
    <div id="rl-edicao"></div>
    <div class="onde">${ico(d.menu.caminho ? 'pino' : 'info')}<div class="txt"><small>${d.menu.caminho ? `Onde encontrar ${seloMenu(d.menu.fonte)}` : 'Onde encontrar no sistema'}</small>
      <strong>${d.menu.caminho ? esc(d.menu.caminho) : 'Caminho não cadastrado'}</strong></div>
      <div class="acoes">${d.menu.caminho ? `<button class="botao sec peq" id="rl-copiar" type="button">${ico('copiar')}Copiar</button>` : `<button class="botao sec peq" id="rl-informar" type="button">Informar caminho${ico('seta')}</button>`}</div></div>
    <div class="abas" role="tablist">${abas.map(([k, v]) => `<button class="aba ${R.aba === k ? 'ativa' : ''}" data-aba-rel="${k}" type="button" role="tab" aria-selected="${R.aba === k}">${esc(v)}</button>`).join('')}</div>
    <div id="rl-aba">${R.aba === 'visao' ? htmlPrevia + htmlInfo : R.aba === 'filtros' ? htmlFiltros : htmlTecnico}</div>
  </div>`;
  const corpo = $('#rl-corpo'); if (corpo) corpo.classList.toggle('largo', !!(pv && pv.colunas.length > 10));
  const cp = $('#rl-copiar'); if (cp) cp.onclick = () => copiar(d.menu.caminho);
  const inf = $('#rl-informar'); if (inf) inf.onclick = () => { R.editando = true; desenharEdicaoRel(); };
  const irf = $('#rl-ir-filtros'); if (irf) irf.onclick = (e) => { e.preventDefault(); R.aba = 'filtros'; desenharDetRel(); };
  $$('#rl-det [data-aba-rel]').forEach((b) => { b.onclick = () => { R.aba = b.dataset.abaRel; desenharDetRel(); }; });
  $$('#rl-det [data-copia]').forEach((b) => { b.onclick = () => copiar(b.dataset.copia); });
  $('#rl-editar').onclick = () => { R.editando = !R.editando; desenharEdicaoRel(); };
  if (R.editando) desenharEdicaoRel();
}

function desenharEdicaoRel() {
  const d = R.det;
  const alvo = $('#rl-edicao');
  if (!R.editando) { alvo.innerHTML = ''; return; }
  alvo.innerHTML = `<div class="secao-ajuda" style="margin-top:14px">
    <div class="campo"><label>Caminho no menu (confirmado)</label><input type="text" id="re-caminho" value="${esc(d.caminho_menu || '')}" placeholder="${esc(d.menu.caminho || 'Relatórios > Sócios > Listas > por Cidade')}"></div>
    <div class="campo"><label>Descrição (para que serve)</label><textarea id="re-desc" style="min-height:70px">${esc(d.descricao || '')}</textarea></div>
    <div class="campo"><label>Palavras-chave</label><input type="text" id="re-pal" value="${esc(d.palavras_chave || '')}" placeholder="termos que as pessoas usam para pedir este relatório"></div>
    <div class="acoes"><button class="botao" id="re-salvar" type="button">${ico('salvar')}Salvar</button><button class="botao sec" id="re-cancelar" type="button">Cancelar</button></div></div>`;
  $('#re-cancelar').onclick = () => { R.editando = false; desenharEdicaoRel(); };
  $('#re-salvar').onclick = async () => {
    try {
      const r = await api(`/api/relatorios/${encodeURIComponent(d.id)}`, { method: 'PUT', body: { caminho_menu: $('#re-caminho').value, descricao: $('#re-desc').value, palavras_chave: $('#re-pal').value } });
      R.editando = false; toast('Informações salvas.');
      R.sel = r.id;
      await abrirRel(r.id);
      R.cfg = await api('/api/relatorios/_config');
    } catch (e) { falha(e); }
  };
}

async function configRelatorios() {
  let cfg;
  try { cfg = await api('/api/relatorios/_config'); } catch (e) { falha(e); return; }
  $('#cf-corpo').innerHTML = `<div class="cartao">
    <h3>Catálogo de relatórios</h3>
    <div class="stats">${stat(cfg.total, 'itens no catálogo')}${stat(cfg.com_caminho, 'com caminho do menu', 'ok')}${stat(cfg.com_provavel, 'caminho provável', cfg.com_provavel ? 'alerta' : '')}</div>
    <div class="linha-form"><div class="campo" style="flex:3 1 320px"><label for="cr-pasta">Pasta dos reports no computador (aparece antes do nome do arquivo)</label>
      <input type="text" id="cr-pasta" value="${esc(cfg.pasta)}" placeholder="C:\\Sistema\\Reports\\"></div>
      <div class="fixo campo"><button class="botao" id="cr-salvar" type="button">Salvar pasta</button></div></div>
    <h3 style="margin-top:10px">Caminhos no menu em lote</h3>
    <ol class="sutil" style="margin-top:0">
      <li>Baixe a planilha do catálogo.</li>
      <li>Corrija a coluna <strong>caminho_menu</strong> onde precisar (e, se quiser, palavras-chave).</li>
      <li>Importe a planilha de volta (Excel ou CSV).</li></ol>
    <div class="acoes"><button class="botao sec" id="cr-csv" type="button">${ico('baixar')}Baixar planilha do catálogo</button>
      <label class="botao" style="margin:0">${ico('exportar')}Importar planilha preenchida<input type="file" id="cr-imp" accept=".xlsx,.xls,.csv,.txt" hidden></label></div>
    <div id="cr-res"></div>
  </div>`;
  $('#cr-salvar').onclick = async () => { try { await api('/api/relatorios/_config', { method: 'PUT', body: { pasta: $('#cr-pasta').value } }); toast('Pasta salva.'); configRelatorios(); } catch (e) { falha(e); } };
  $('#cr-csv').onclick = async () => { try { const r = await api('/api/relatorios/_csv'); Motor.baixarTexto('catalogo_relatorios.csv', r.csv, 'text/csv'); } catch (e) { falha(e); } };
  $('#cr-imp').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const up = await enviarArquivo(f, true);
      const r = await api('/api/relatorios/_importar', { method: 'POST', body: { token: up.token } });
      $('#cr-res').innerHTML = `<div class="aviso ${r.total_nao_encontrados ? '' : 'ok'}">${fmtN(r.atualizados)} relatório(s) atualizados.${r.total_nao_encontrados ? ` ${fmtN(r.total_nao_encontrados)} arquivo(s) não encontrados no catálogo: ${esc(r.nao_encontrados.join(', '))}` : ''}</div>`;
      toast('Planilha importada.');
    } catch (er) { falha(er); }
    e.target.value = '';
  };
}

// ============================================================ ⚙️ CONFIGURAÇÕES
const C = { aba: 'layouts', busca: '', edit: null, status: null };

async function telaConfig(params) {
  try { C.status = await api('/api/status'); } catch (e) { falha(e); return; }
  if (C.status.admin_protegido && !tokenAdmin) { telaLogin(params); return; }
  const [sub, id] = params || [];
  if (sub === 'layout') { C.aba = 'layouts'; return editorLayout(id); }
  if (sub === 'proc') { C.aba = 'procedimentos'; return editorProcedimento(id); }
  if (sub === 'procedimentos') C.aba = 'procedimentos';
  if (sub === 'backup') C.aba = 'backup';
  if (sub === 'relatorios') C.aba = 'relatorios';
  if (sub === 'banco') C.aba = 'banco';
  if (!sub) C.aba = 'layouts';
  app.innerHTML = `
  <div class="cabecalho-pagina"><div><h1>Configurações</h1><p>Gerencie layouts, procedimentos de ajuda e relatórios.</p></div>
    ${tokenAdmin && C.status.admin_protegido ? `<button class="botao sec" id="cf-sair" type="button">${ico('sair')}Sair</button>` : ''}</div>
  <div class="info-caixa simples">${ico('info')}<div class="corpo"><p>As alterações ficam neste navegador. Use <a href="#config/backup">Backup</a> para copiar seus dados.</p></div></div>
  <div class="abas"><button class="aba ${C.aba === 'layouts' ? 'ativa' : ''}" data-a="layouts" type="button">Layouts</button>
    <button class="aba ${C.aba === 'procedimentos' ? 'ativa' : ''}" data-a="procedimentos" type="button">Procedimentos de ajuda</button>
    <button class="aba ${C.aba === 'relatorios' ? 'ativa' : ''}" data-a="relatorios" type="button">Relatórios</button>
    <button class="aba ${C.aba === 'banco' ? 'ativa' : ''}" data-a="banco" type="button">Banco de dados</button>
    <button class="aba ${C.aba === 'backup' ? 'ativa' : ''}" data-a="backup" type="button">Backup</button></div>
  <div id="cf-corpo"></div>`;
  $$('.abas .aba').forEach((b) => { b.onclick = () => {
    C.aba = b.dataset.a;
    const h = b.dataset.a === 'layouts' ? 'config' : `config/${b.dataset.a}`;
    if (location.hash === `#${h}`) rotear(); else location.hash = h;
  }; });
  const sair = $('#cf-sair'); if (sair) sair.onclick = () => { tokenAdmin = ''; sessionStorageSet('tokenAdmin', ''); location.hash = 'inicio'; };
  if (C.aba === 'layouts') listaLayoutsConfig(); else if (C.aba === 'banco') configBanco(); else if (C.aba === 'backup') telaBackup(); else if (C.aba === 'relatorios') configRelatorios(); else listaProcsConfig();
}

function telaLogin(params) {
  app.innerHTML = `<div class="cartao" style="max-width:420px;margin:40px auto"><h2>Acesso às Configurações</h2>
    <form id="lg"><div class="campo"><label for="lg-s">Senha de administrador</label><input type="password" id="lg-s" autocomplete="current-password"></div>
    <button class="botao" type="submit">Entrar</button></form></div>`;
  $('#lg-s').focus();
  $('#lg').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/login', { method: 'POST', body: { senha: $('#lg-s').value } });
      tokenAdmin = r.token; sessionStorageSet('tokenAdmin', r.token); telaConfig(params);
    } catch (er) { falha(er); }
  };
}

async function listaLayoutsConfig() {
  const corpo = $('#cf-corpo');
  corpo.innerHTML = `<div class="cartao"><div class="barra-ferramentas">
      <div class="com-icone">${ico('busca')}<input type="search" id="cf-busca" placeholder="Pesquisar layout…" value="${esc(C.busca)}"></div>
      <label class="botao sec" style="margin:0">${ico('exportar')}Importar JSON<input type="file" id="cf-json" accept=".json" hidden></label>
      <a class="botao" href="#config/layout/novo">${ico('mais')}Novo layout</a></div>
    <div id="cf-tab"><span class="carregando"></span></div></div>`;
  let lista;
  try { lista = await api('/api/layouts'); I.layouts = lista; } catch (e) { falha(e); return; }
  const excluir = async (id) => {
    if (!(await confirmar('Excluir layout', `O layout “${id}” e seus modelos salvos serão excluídos.`, 'Excluir'))) return;
    try { await api(`/api/layouts/${encodeURIComponent(id)}`, { method: 'DELETE' }); lista = lista.filter((x) => x.id !== id); I.layouts = null; if (I.sel && I.sel.id === id) I.sel = null; desenhar(); toast('Layout excluído.'); } catch (e) { falha(e); }
  };
  const exportar = async (id) => {
    try { const l = await api(`/api/layouts/${encodeURIComponent(id)}`); delete l.modelos; Motor.baixarTexto(`layout_${l.id}.json`, JSON.stringify(l, null, 1)); } catch (e) { falha(e); }
  };
  const duplicar = async (id) => {
    try {
      const l = await api(`/api/layouts/${encodeURIComponent(id)}`);
      delete l.modelos; l.id = `${l.id}_copia`; l.titulo = `${l.titulo} (cópia)`; l.origem = 'manual';
      await api('/api/layouts', { method: 'POST', body: l });
      I.layouts = null; location.hash = `config/layout/${encodeURIComponent(l.id)}`;
    } catch (e) { falha(e); }
  };
  const desenhar = () => {
    const termos = semAcento(C.busca).split(/\s+/).filter(Boolean);
    const f = lista.filter((l) => termos.every((t) => semAcento(`${l.titulo} ${l.id} ${l.nome_arquivo}`).includes(t)));
    $('#cf-tab').innerHTML = `<div class="tabela-wrap tabela-lista" style="max-height:640px"><table><thead><tr><th>Layout</th><th>Categoria</th><th>Formato</th><th class="num">Campos</th><th>Origem</th><th>Ações</th></tr></thead><tbody>
      ${f.slice(0, 300).map((l) => `<tr><td><strong>${esc(tituloCurto(l.titulo))}</strong><br><small class="sutil">${esc(l.id)}</small></td>
        <td>${esc(CATEGORIAS[l.categoria] || l.categoria)}</td><td>${l.formato === 'delimitado' ? `Delimitado “${esc(l.separador)}”` : 'Posicional'}</td>
        <td class="num">${l.qtd_campos}</td><td><span class="selo ${l.origem === 'ajuda' ? '' : 'azul'}">${esc({ ajuda: 'Ajuda', editado: 'Editado', manual: 'Cadastrado' }[l.origem] || l.origem)}</span></td>
        <td class="nowrap"><div class="acoes" style="flex-wrap:nowrap"><a class="botao sec peq" href="#config/layout/${encodeURIComponent(l.id)}">${ico('lapis')}Editar</a>
          <button class="icone-btn caixa" type="button" data-menu="${esc(l.id)}" aria-haspopup="menu" aria-expanded="false" title="Mais ações">${ico('pontos')}</button></div></td></tr>`).join('')}
    </tbody></table></div><p class="sutil" style="margin:12px 0 0">${fmtN(lista.length)} layouts cadastrados${f.length > 300 ? ` · Exibindo até 300 de ${fmtN(f.length)} resultados. Refine a busca.` : termos.length ? ` · ${fmtN(f.length)} encontrados.` : '.'}</p>`;
    $$('[data-menu]', $('#cf-tab')).forEach((b) => { b.onclick = (e) => {
      e.stopPropagation();
      if (b.getAttribute('aria-expanded') === 'true') { fecharMenuSuspenso(); return; }
      const id = b.dataset.menu;
      abrirMenuSuspenso(b, [
        { icone: 'copiar', rotulo: 'Duplicar', acao: () => duplicar(id) },
        { icone: 'exportar', rotulo: 'Exportar JSON', acao: () => exportar(id) },
        '-',
        { icone: 'lixeira', rotulo: 'Excluir', perigo: true, acao: () => excluir(id) },
      ]);
    }; });
  };
  $('#cf-busca').oninput = (e) => { C.busca = e.target.value; desenhar(); };
  $('#cf-json').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const dados = JSON.parse(await f.text());
      const itens = Array.isArray(dados) ? dados : [dados];
      for (const l of itens) { delete l.modelos; await api('/api/layouts', { method: 'POST', body: { ...l, _substituir: true } }); }
      toast(`${itens.length} layout(s) importado(s).`); I.layouts = null; listaLayoutsConfig();
    } catch (er) { falha(er); }
  };
  desenhar();
}

function campoVazio() { return { inicio: null, fim: null, tamanho: 1, tipo: 'texto', decimais: 0, formato: '', descricao: '' }; }

async function editorLayout(id) {
  const novo = !id || id === 'novo';
  if (novo) {
    C.edit = { id: '', titulo: '', categoria: 'importacao', formato: 'posicional', separador: ';', nome_arquivo: '', tipo_arquivo: 'Texto - ASCII', observacao: '',
      registros: [{ nome: 'Registro', papel: 'detalhe', campos: [Object.assign(campoVazio(), { inicio: 1, fim: 1 })] }] };
  } else {
    try { C.edit = await api(`/api/layouts/${encodeURIComponent(id)}`); delete C.edit.modelos; } catch (e) { falha(e); location.hash = 'config'; return; }
  }
  const L = C.edit;
  migalha('config', novo ? 'Novo layout' : 'Editar layout');
  app.innerHTML = `
  <div class="cabecalho-pagina"><div><h1>${novo ? 'Novo layout' : 'Editar layout'}</h1><p>${novo ? 'Cadastre o layout uma vez e reutilize sempre.' : esc(L.id)}</p></div>
    <div class="acoes"><a class="botao sec" href="#config">Cancelar</a>${novo ? '' : `<a class="botao sec" href="#importacao/${encodeURIComponent(L.id)}">Usar na Importação</a>`}<button class="botao" id="le-salvar" type="button">${ico('salvar')}Salvar</button></div></div>
  <div class="cartao">
    <div class="linha-form">
      <div class="campo" style="flex:3 1 320px"><label>Título</label><input type="text" data-k="titulo" value="${esc(L.titulo)}"></div>
      <div class="campo"><label>Identificador</label><input type="text" data-k="id" value="${esc(L.id)}" ${novo ? 'placeholder="gerado pelo título"' : 'disabled'}></div>
    </div>
    <div class="linha-form">
      <div class="campo"><label>Categoria</label><select data-k="categoria">${Object.entries(CATEGORIAS).map(([k, v]) => `<option value="${k}" ${L.categoria === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="campo"><label>Formato</label><select data-k="formato"><option value="posicional" ${L.formato !== 'delimitado' ? 'selected' : ''}>Posicional (tamanho fixo)</option><option value="delimitado" ${L.formato === 'delimitado' ? 'selected' : ''}>Delimitado (CSV)</option></select></div>
      <div class="campo"><label>Separador</label><input type="text" data-k="separador" value="${esc(L.separador || ';')}" maxlength="3"></div>
      <div class="campo"><label>Nome do arquivo</label><input type="text" data-k="nome_arquivo" value="${esc(L.nome_arquivo)}" placeholder="EMPRESA_AAAAMM.TXT"></div>
      <div class="campo"><label>Tipo</label><input type="text" data-k="tipo_arquivo" value="${esc(L.tipo_arquivo)}"></div>
    </div>
    <div class="campo"><label>Observações</label><textarea data-k="observacao">${esc(L.observacao)}</textarea></div>
    <p class="sutil" style="margin:0">No nome do arquivo, AAAA, AA e MM são trocados pela competência na geração.</p>
  </div>
  <div id="le-regs"></div>
  <div class="acoes" style="margin-top:14px"><button class="botao sec" id="le-add-reg" type="button">${ico('mais')}Adicionar registro</button></div>`;
  $$('[data-k]').forEach((i) => { i.oninput = () => { L[i.dataset.k] = i.value; }; i.onchange = i.oninput; });
  $('#le-add-reg').onclick = () => { L.registros.push({ nome: 'Novo registro', papel: 'detalhe', campos: [Object.assign(campoVazio(), { inicio: 1, fim: 1 })] }); desenharRegsEditor(); };
  $('#le-salvar').onclick = salvarLayoutEditor;
  desenharRegsEditor();
}

function desenharRegsEditor() {
  const L = C.edit;
  $('#le-regs').innerHTML = L.registros.map((r, ri) => `
  <div class="cartao" data-ri="${ri}" style="margin-top:16px">
    <div class="linha-form" style="margin-bottom:10px">
      <div class="campo" style="flex:3 1 280px;margin:0"><label>Nome do registro</label><input type="text" class="r-nome" value="${esc(r.nome)}"></div>
      <div class="campo" style="margin:0"><label>Tipo de registro</label><select class="r-papel">${Object.entries(PAPEIS).map(([k, v]) => `<option value="${k}" ${r.papel === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="fixo acoes"><button class="botao sec peq r-recalc" type="button" title="Refaz início/fim em sequência a partir dos tamanhos">⇅ Recalcular posições</button>
        <button class="icone-btn r-sobe" type="button" title="Mover para cima">▲</button><button class="icone-btn r-desce" type="button" title="Mover para baixo">▼</button>
        <button class="botao perigo peq r-exc" type="button">Excluir registro</button></div>
    </div>
    <div class="tabela-wrap editor-campos" style="max-height:560px"><table><thead><tr>
      <th>#</th><th>Início</th><th>Fim</th><th>Tam.</th><th>Tipo</th><th>Dec.</th><th>Formato data</th><th>Valor fixo</th><th>Descrição</th><th title="Obrigatório">Obrig.</th><th title="Delimitador de campo">Delim.</th><th></th></tr></thead>
      <tbody>${r.campos.map((c, ci) => `<tr data-ci="${ci}"><td class="sutil num">${ci + 1}</td>
        <td><input class="n" data-f="inicio" value="${c.inicio ?? ''}"></td><td><input class="n" data-f="fim" value="${c.fim ?? ''}"></td><td><input class="n" data-f="tamanho" value="${c.tamanho ?? ''}"></td>
        <td><select data-f="tipo">${[['texto', 'Texto'], ['numerico', 'Numérico'], ['data', 'Data']].map(([k, v]) => `<option value="${k}" ${c.tipo === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
        <td><input class="n" data-f="decimais" value="${c.decimais || 0}"></td>
        <td><select data-f="formato_data"><option value="">—</option>${['DDMMAAAA', 'AAAAMMDD', 'DD/MM/AAAA', 'DDMMAA', 'AAMMDD', 'AAAAMM', 'MMAAAA', 'AAAA-MM-DD'].map((f) => `<option ${c.formato_data === f ? 'selected' : ''}>${f}</option>`).join('')}</select></td>
        <td><input class="n" style="width:90px" data-f="fixo" value="${esc(c.fixo ?? '')}"></td>
        <td><input class="desc" data-f="descricao" value="${esc(c.descricao)}"></td>
        <td style="text-align:center"><input type="checkbox" data-f="obrigatorio" ${c.obrigatorio ? 'checked' : ''}></td>
        <td style="text-align:center"><input type="checkbox" data-f="delimitador" ${c.delimitador ? 'checked' : ''}></td>
        <td class="acao"><button class="icone-btn c-sobe" type="button" title="Subir">▲</button><button class="icone-btn c-desce" type="button" title="Descer">▼</button>
          <button class="icone-btn c-dup" type="button" title="Inserir abaixo">＋</button><button class="icone-btn c-exc" type="button" title="Remover">✕</button></td></tr>`).join('')}</tbody></table></div>
    <div class="acoes" style="margin-top:10px"><button class="botao sec peq r-add" type="button">${ico('mais')}Adicionar campo</button>
      <small class="sutil">Tamanho total: ${Math.max(0, ...r.campos.map((c) => +c.fim || 0))} posições · ${r.campos.length} campos</small></div>
  </div>`).join('');

  $$('#le-regs > .cartao').forEach((card) => {
    const ri = +card.dataset.ri;
    const r = L.registros[ri];
    $('.r-nome', card).oninput = (e) => { r.nome = e.target.value; };
    $('.r-papel', card).onchange = (e) => { r.papel = e.target.value; };
    $('.r-exc', card).onclick = async () => {
      if (L.registros.length === 1) { toast('O layout precisa de ao menos um registro.', 'erro'); return; }
      if (await confirmar('Excluir registro', `O registro “${r.nome}” e seus ${r.campos.length} campos serão removidos.`, 'Excluir')) { L.registros.splice(ri, 1); desenharRegsEditor(); }
    };
    $('.r-sobe', card).onclick = () => { if (ri > 0) { [L.registros[ri - 1], L.registros[ri]] = [L.registros[ri], L.registros[ri - 1]]; desenharRegsEditor(); } };
    $('.r-desce', card).onclick = () => { if (ri < L.registros.length - 1) { [L.registros[ri + 1], L.registros[ri]] = [L.registros[ri], L.registros[ri + 1]]; desenharRegsEditor(); } };
    $('.r-add', card).onclick = () => {
      const ult = r.campos[r.campos.length - 1];
      const ini = ult && ult.fim ? +ult.fim + 1 : 1;
      r.campos.push(Object.assign(campoVazio(), { inicio: ini, fim: ini }));
      desenharRegsEditor();
    };
    $('.r-recalc', card).onclick = () => {
      let pos = 1;
      r.campos.forEach((c) => { const t = +c.tamanho || 1; c.tamanho = t; c.inicio = pos; c.fim = pos + t - 1; pos += t; });
      desenharRegsEditor(); toast('Posições recalculadas.');
    };
    $$('tr[data-ci]', card).forEach((tr) => {
      const ci = +tr.dataset.ci;
      const c = r.campos[ci];
      $$('[data-f]', tr).forEach((inp) => {
        const f = inp.dataset.f;
        const aplicar = () => {
          if (inp.type === 'checkbox') c[f] = inp.checked;
          else if (['inicio', 'fim', 'tamanho', 'decimais'].includes(f)) c[f] = inp.value === '' ? null : parseInt(inp.value, 10);
          else if (f === 'fixo') { if (inp.value === '') delete c.fixo; else c.fixo = inp.value; }
          else if (f === 'formato_data') { if (inp.value) c.formato_data = inp.value; else delete c.formato_data; }
          else c[f] = inp.value;
          if ((f === 'inicio' || f === 'tamanho') && c.inicio && c.tamanho) { c.fim = c.inicio + c.tamanho - 1; $('[data-f=fim]', tr).value = c.fim; }
          if (f === 'fim' && c.inicio && c.fim) { c.tamanho = c.fim - c.inicio + 1; $('[data-f=tamanho]', tr).value = c.tamanho; }
        };
        inp.oninput = aplicar; inp.onchange = aplicar;
      });
      $('.c-sobe', tr).onclick = () => { if (ci > 0) { [r.campos[ci - 1], r.campos[ci]] = [r.campos[ci], r.campos[ci - 1]]; desenharRegsEditor(); } };
      $('.c-desce', tr).onclick = () => { if (ci < r.campos.length - 1) { [r.campos[ci + 1], r.campos[ci]] = [r.campos[ci], r.campos[ci + 1]]; desenharRegsEditor(); } };
      $('.c-dup', tr).onclick = () => { const ini = c.fim ? +c.fim + 1 : null; r.campos.splice(ci + 1, 0, Object.assign(campoVazio(), { inicio: ini, fim: ini })); desenharRegsEditor(); };
      $('.c-exc', tr).onclick = () => { r.campos.splice(ci, 1); desenharRegsEditor(); };
    });
  });
}

async function salvarLayoutEditor() {
  const L = C.edit;
  if (!L.titulo.trim()) { toast('Informe o título do layout.', 'erro'); return; }
  const btn = $('#le-salvar'); btn.disabled = true;
  try {
    const existe = I.layouts && I.layouts.some((x) => x.id === L.id);
    let r;
    if (L.criado_em || existe) r = await api(`/api/layouts/${encodeURIComponent(L.id)}`, { method: 'PUT', body: L });
    else r = await api('/api/layouts', { method: 'POST', body: L });
    I.layouts = null; if (I.sel && I.sel.id === r.id) I.sel = null;
    toast('Layout salvo.');
    const alvo = `config/layout/${encodeURIComponent(r.id)}`;
    if (location.hash === `#${alvo}`) editorLayout(r.id); else location.hash = alvo;
  } catch (e) { falha(e); }
  btn.disabled = false;
}

function telaBackup() {
  const r = Motor.resumoAlteracoes();
  $('#cf-corpo').innerHTML = `<div class="cartao">
    <h3>Suas alterações ficam gravadas neste navegador</h3>
    <p class="sutil">Layouts editados, procedimentos, modelos de mapeamento e histórico. Para levar para outro computador ou guardar uma cópia, exporte o backup.</p>
    ${r.armazenamento ? '' : '<div class="aviso erro">O navegador está bloqueando o armazenamento local. As alterações não serão mantidas ao fechar.</div>'}
    <div class="stats">${stat(r.layouts, 'layouts criados/editados')}${stat(r.excluidos, 'layouts excluídos')}${stat(r.procedimentos, 'procedimentos')}${stat(r.modelos, 'modelos salvos')}${stat(r.relatorios, 'relatórios com caminho/ajuste')}</div>
    <div class="acoes"><button class="botao" id="bk-exp" type="button">${ico('baixar')}Exportar backup</button>
      <label class="botao sec" style="margin:0">${ico('exportar')}Importar backup<input type="file" id="bk-imp" accept=".json" hidden></label>
      <button class="botao perigo" id="bk-reset" type="button">Restaurar padrão</button></div>
  </div>`;
  $('#bk-exp').onclick = () => { const d = new Date(); Motor.baixarTexto(`backup_base_apoio_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`, Motor.exportarBackup()); };
  $('#bk-imp').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!(await confirmar('Importar backup', 'As alterações atuais deste navegador serão substituídas pelas do backup.', 'Importar', ''))) return;
    try { const x = Motor.importarBackup(await f.text()); I.layouts = null; I.sel = null; A.res = null; toast(`Backup importado: ${x.layouts} layouts, ${x.procedimentos} procedimentos, ${x.modelos} modelos.`); telaBackup(); } catch (er) { falha(er); }
  };
  $('#bk-reset').onclick = async () => {
    if (!(await confirmar('Restaurar padrão', 'Todas as alterações deste navegador serão apagadas (layouts editados, procedimentos, modelos). Exporte um backup antes, se precisar.', 'Apagar alterações'))) return;
    Motor.restaurarPadrao(); I.layouts = null; I.sel = null; A.res = null; toast('Padrão restaurado.'); telaBackup();
  };
}

async function listaProcsConfig() {
  const corpo = $('#cf-corpo');
  corpo.innerHTML = '<div class="cartao"><span class="carregando"></span></div>';
  try {
    const lista = await api('/api/procedimentos');
    corpo.innerHTML = `<div class="cartao"><div class="cartao-titulo"><h3>${lista.length} procedimento(s)</h3><a class="botao" href="#config/proc/novo">${ico('mais')}Novo procedimento</a></div>
      ${lista.length ? `<div class="tabela-wrap tabela-lista"><table><thead><tr><th>Título</th><th>Categoria</th><th>Atualizado</th><th>Ações</th></tr></thead><tbody>
      ${lista.map((p) => `<tr><td><strong>${esc(p.titulo)}</strong><br><small class="sutil">${esc(p.palavras_chave)}</small></td><td>${esc(p.categoria)}</td>
        <td class="nowrap sutil">${esc((p.atualizado_em || '').slice(0, 16))}</td>
        <td class="nowrap"><div class="acoes" style="flex-wrap:nowrap"><a class="botao sec peq" href="#config/proc/${p.id}">${ico('lapis')}Editar</a><a class="icone-btn" href="#ajuda/procedimento/${p.id}" title="Ver na Ajuda">${ico('olho')}</a>
        <button class="icone-btn" data-exc="${p.id}" title="Excluir">${ico('lixeira')}</button></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="vazio">Nenhum procedimento.</div>'}</div>`;
    $$('[data-exc]', corpo).forEach((b) => { b.onclick = async () => {
      if (!(await confirmar('Excluir procedimento', 'O procedimento será removido da Área de Ajuda.', 'Excluir'))) return;
      try { await api(`/api/procedimentos/${b.dataset.exc}`, { method: 'DELETE' }); toast('Procedimento excluído.'); listaProcsConfig(); } catch (e) { falha(e); }
    }; });
  } catch (e) { falha(e); }
}

async function editorProcedimento(id) {
  const novo = !id || id === 'novo';
  let p = { titulo: '', categoria: '', palavras_chave: '', procedimento: '', atencao: '', solucao: '' };
  if (!novo) {
    try { p = (await api('/api/procedimentos')).find((x) => String(x.id) === String(id)); } catch (e) { falha(e); }
    if (!p) { toast('Procedimento não encontrado.', 'erro'); location.hash = 'config/procedimentos'; return; }
  }
  migalha('config', novo ? 'Novo procedimento' : 'Editar procedimento');
  app.innerHTML = `
  <div class="cabecalho-pagina"><div><h1>${novo ? 'Novo procedimento' : 'Editar procedimento'}</h1><p>Um passo por linha. A prévia mostra como o cliente verá na Área de Ajuda.</p></div>
    <div class="acoes"><a class="botao sec" href="#config/procedimentos">Cancelar</a><button class="botao" id="pe-salvar" type="button">${ico('salvar')}Salvar</button></div></div>
  <div class="grade-2">
    <div class="cartao">
      <div class="campo"><label>Título (a pergunta)</label><input type="text" data-k="titulo" value="${esc(p.titulo)}" placeholder="Como cadastrar um boleto"></div>
      <div class="linha-form"><div class="campo"><label>Categoria</label><input type="text" data-k="categoria" value="${esc(p.categoria)}" placeholder="Boletos"></div>
        <div class="campo" style="flex:2 1 240px"><label>Palavras-chave</label><input type="text" data-k="palavras_chave" value="${esc(p.palavras_chave)}" placeholder="boleto bloqueto guia emitir"></div></div>
      <div class="campo"><label>📌 Procedimento — um passo por linha</label><textarea data-k="procedimento" style="min-height:190px">${esc(p.procedimento)}</textarea></div>
      <div class="campo"><label>⚠️ Atenção — um item por linha</label><textarea data-k="atencao">${esc(p.atencao)}</textarea></div>
      <div class="campo"><label>🔧 Solução de problemas — um item por linha</label><textarea data-k="solucao">${esc(p.solucao)}</textarea></div>
    </div>
    <div class="cartao"><h3 class="sutil">Prévia na Área de ajuda</h3><div id="pe-previa"></div></div>
  </div>`;
  const previa = () => {
    $('#pe-previa').innerHTML = htmlDetalheAjuda({ tipo: 'procedimento', ...p, id: p.id || 0, passos: linhasLista(p.procedimento) }, []);
    const link = $('#pe-previa a'); if (link) link.remove();
  };
  $$('[data-k]').forEach((i) => { i.oninput = () => { p[i.dataset.k] = i.value; previa(); }; });
  previa();
  $('#pe-salvar').onclick = async () => {
    if (!p.titulo.trim()) { toast('Informe o título.', 'erro'); return; }
    try {
      if (novo) await api('/api/procedimentos', { method: 'POST', body: p });
      else await api(`/api/procedimentos/${id}`, { method: 'PUT', body: p });
      toast('Procedimento salvo.'); A.res = null; location.hash = 'config/procedimentos';
    } catch (e) { falha(e); }
  };
}


// ---------- banco de dados do ProSindW (conector BaseDeApoio.exe)
async function configBanco() {
  const corpo = $('#cf-corpo');
  if (!Conector.ativo) {
    corpo.innerHTML = `<div class="cartao">
      <div class="cartao-titulo"><h2>Banco de dados do ProSindW</h2></div>
      <div class="info-caixa">${ico('info')}<div class="corpo"><strong>Abra o sistema pelo BaseDeApoio.exe</strong>
        <p>O navegador sozinho não conecta ao Firebird. Na pasta do sistema, dê dois cliques em <strong>BaseDeApoio.exe</strong>: ele abre esta tela em <span class="mono">http://127.0.0.1:8765</span> e faz a ligação com o banco.</p></div></div>
      <p class="sutil" style="margin-top:14px">O que você cadastrou aqui (layouts, procedimentos) fica neste endereço do navegador. Para levar ao novo endereço, use <a href="#config/backup">Backup</a>: exporte aqui e importe lá.</p></div>`;
    return;
  }
  corpo.innerHTML = '<div class="cartao"><span class="carregando"></span> Lendo configuração…</div>';
  let st;
  try { st = await Conector.atualizar(false); } catch (e) { falha(e); return; }
  const c = st.config || {};
  const b = c.beneficiario || {};
  corpo.innerHTML = `
  <div class="cartao">
    <div class="cartao-titulo"><h2>Conexão com o banco do ProSindW</h2>
      <span class="selo ${st.conectado ? 'ok' : st.configurado ? 'erro' : ''}">${st.conectado ? `Conectado · Firebird ${esc((st.banco || {}).versao_firebird || '')} · ${fmtN((st.banco || {}).empresas)} empresas` : st.configurado ? 'Sem conexão' : 'Não configurado'}</span></div>
    ${st.erro ? `<div class="aviso erro">${esc(st.erro)}${dicaErro(st.erro)}</div>` : ''}
    ${st.configurado ? `<table class="filtros-tela"><tbody>
      <tr><th>Servidor</th><td>${esc(c.host || '127.0.0.1')}:${esc(c.porta || 3050)}${['127.0.0.1', 'localhost', ''].includes(String(c.host || '').toLowerCase()) ? ' <span class="sutil">(este computador)</span>' : ''}</td></tr>
      <tr><th>Banco</th><td class="mono">${esc(c.caminho)}</td></tr>
      <tr><th>Usuário</th><td>${esc(c.usuario || 'SYSDBA')}${c.tem_senha ? ' · senha guardada' : ' · <span class="selo alerta">sem senha</span>'}</td></tr></tbody></table>` : '<p class="sutil">Nenhum banco configurado ainda.</p>'}
    <div class="acoes" style="margin-top:12px"><a class="botao ${st.configurado ? 'sec' : ''}" href="#conexao">${ico('banco')}${st.configurado ? 'Alterar conexão' : 'Configurar conexão'}</a></div>
  </div>
  <div class="cartao">
    <div class="cartao-titulo"><h2>Dados do ProSindW</h2>
      ${st.conectado ? `<button class="botao sec peq" id="bd-atualizar" type="button">${ico('banco')}Atualizar do banco</button>` : ''}</div>
    <p class="sutil">Lidos do banco ao conectar: beneficiário, dados bancários de cada contribuição, sequencial do nosso número e último boleto. Mude no ProSindW; aqui só é exibido.</p>
    <div id="bd-benef">${st.conectado ? '<span class="carregando"></span>' : ''}</div>
    <div id="bd-contribs">${st.conectado ? '' : '<p class="sutil">Conecte ao banco para ver os dados.</p>'}</div>
  </div>
  <div class="cartao">
    <div class="cartao-titulo"><h2>Complementos (opcional)</h2></div>
    <p class="sutil">Usados só quando o ProSindW não tiver o dado. Deixe em branco para usar o que vem do banco.</p>
    <div class="linha-form">
      <div class="campo" style="flex:2 1 280px"><label for="bd-bnome">Nome do beneficiário</label><input type="text" id="bd-bnome" value="${esc(b.nome || '')}" placeholder="Do ProSindW"></div>
      <div class="campo"><label for="bd-bdoc">CNPJ do beneficiário</label><input type="text" id="bd-bdoc" value="${esc(b.documento || '')}" placeholder="Do ProSindW"></div>
    </div>
    <div class="linha-form">
      <div class="campo" style="flex:2 1 280px"><label for="bd-bend">Endereço do beneficiário</label><input type="text" id="bd-bend" value="${esc(b.endereco || '')}" placeholder="Do ProSindW"></div>
      <div class="campo"><label for="bd-usp">Usuário do ProSindW</label><input type="text" id="bd-usp" maxlength="20" value="${esc(c.usuario_prosind || '')}"></div>
      <div class="campo"><label for="bd-contr">Contribuição padrão</label><select id="bd-contr"><option value="">Perguntar sempre</option></select></div>
    </div>
    <div class="acoes"><button class="botao" id="bd-salvar2" type="button">${ico('salvar')}Salvar</button></div>
    <p class="sutil" style="margin:12px 0 0">PDFs em <span class="mono">${esc(c.pasta_saida || 'Arquivos gerados')}</span>. Configuração em <span class="mono">${esc(c.arquivo_config || 'conector.json')}</span> (continua valendo ao trocar a pasta do sistema).</p>
  </div>`;
  const dados = () => ({ host: c.host || '127.0.0.1', porta: c.porta || 3050, caminho: c.caminho || '', usuario: c.usuario || 'SYSDBA', senha: '', wire_crypt: c.wire_crypt || '' });
  const salvar = async () => {
    try {
      await Conector.api('config', { body: { ...dados(), usuario_prosind: $('#bd-usp').value.trim(), contribuicao_padrao: $('#bd-contr').value,
        beneficiario: { nome: $('#bd-bnome').value.trim(), documento: $('#bd-bdoc').value.replace(/\D/g, ''), endereco: $('#bd-bend').value.trim() } } });
      toast('Configuração salva.'); CH.contribs = null; configBanco();
    } catch (e) { falha(e); }
  };
  $('#bd-salvar2').onclick = salvar;
  if (!st.conectado) { $('#bd-benef').innerHTML = ''; return; }
  const btA = $('#bd-atualizar'); if (btA) btA.onclick = () => dadosProsind(c, true);
  await dadosProsind(c, false);
}

function linhaBenef(x) {
  if (!x || !x.nome) return '<span class="selo alerta">Sem nome</span>';
  return `<strong>${esc(x.nome)}</strong>${x.documento ? ` · ${esc(mascaraDoc(x.documento))}` : ' · <span class="selo alerta">sem CNPJ</span>'}`;
}
function mascaraDoc(d) { d = String(d || '').replace(/\D/g, ''); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d; }

async function dadosProsind(c, manual) {
  const corpo = $('#cf-corpo');
  const bt = $('#bd-atualizar');
  if (bt) { bt.disabled = true; }
  if (manual) $('#bd-benef').innerHTML = '<p><span class="carregando"></span> Lendo o ProSindW…</p>';
  let d;
  try { d = await Conector.api('contribuicoes?detalhes=1'); } catch (e) {
    $('#bd-benef').innerHTML = `<div class="aviso erro">${esc(e.message)}</div>`; if (bt) bt.disabled = false; return;
  }
  if (bt) bt.disabled = false;
  const lst = d.itens || [];
  const sind = d.sindicato || {};
  $('#bd-benef').innerHTML = `<table class="filtros-tela"><tbody>
    <tr><th>Beneficiário</th><td>${linhaBenef(sind)}</td></tr>
    <tr><th>Endereço</th><td>${sind.endereco ? esc(sind.endereco) : '<span class="sutil">não informado</span>'}</td></tr>
    <tr><th>Origem</th><td class="sutil">${esc(sind.origem || 'não encontrado no ProSindW: preencha em Complementos')}${d.lido_em ? ` · lido em ${esc(d.lido_em)}` : ''}</td></tr>
    </tbody></table>`;
  $('#bd-contr').innerHTML = '<option value="">Perguntar sempre</option>' + lst.filter((x) => x.banco).map((x) => `<option value="${esc(x.codigo)}" ${x.codigo === c.contribuicao_padrao ? 'selected' : ''}>${esc(x.codigo)} - ${esc(x.descricao)}</option>`).join('');
  const dadosBanco = (x) => {
    if (!x.banco) return '<span class="sutil">sem banco</span>';
    const p = [x.agencia && `Ag. ${esc(x.agencia)}`, x.conta && `Conta ${esc(x.conta)}`, x.convenio && `Conv. ${esc(x.convenio)}`, x.carteira && `Cart. ${esc(x.carteira)}`].filter(Boolean);
    const k = x.contrato_remessa;
    return `<strong>${esc(x.banco)}${x.nome_banco ? ` - ${esc(x.nome_banco)}` : ''}</strong><br><small class="sutil">${esc(x.perfil)}</small>${p.length ? `<br><small>${p.join(' · ')}</small>` : ''}${k ? `<br><small class="sutil">Contrato ${esc(k.codigo)} - ${esc(k.nome)}</small>` : ''}`;
  };
  const seq = (x) => {
    const q = x.sequencial; if (!q) return '';
    if (q.erro) return `<small class="sutil">${esc(q.erro)}</small>`;
    return `<small>Último: <span class="mono">${esc(q.ultimo_nn || '—')}</span>${q.ultimo_vencimento ? ` (venc. ${esc(q.ultimo_vencimento)})` : ''}<br>Próximo: <span class="mono">${esc(q.proximo_nn || String(q.atual + 1))}</span></small>`;
  };
  const benef = (x) => (x.beneficiario && x.entidade ? `<br><small>Beneficiário: ${esc(x.beneficiario.nome)}</small>` : '');
  const situacao = (x) => {
    const au = x.conferencia_auto;
    const difer = au && au.situacao === 'divergente'
      ? `<br><small class="sutil">Boleto ${esc(au.nosso_numero)} do ProSindW:</small><br><small class="mono">${esc(au.linha_prosind)}</small><br><small class="sutil">Calculado aqui:</small><br><small class="mono">${esc(au.linha_calculada)}</small>` : '';
    if (x.conferido) {
      return `<span class="selo ok">${x.conferido_auto ? 'Conferido automaticamente' : 'Conferido'}${x.conferido_em ? ` em ${esc(x.conferido_em)}` : ''}</span>${x.conferido_por && x.conferido_por !== x.codigo ? `<br><small class="sutil">pelo banco ${esc(x.banco)} (${esc(x.conferido_por)})</small>` : ''}`
        + (difer ? `<br><span class="selo alerta">Atenção: o último boleto do ProSindW está diferente</span>${difer}` : '');
    }
    if (!x.suportado) return x.banco ? '<span class="selo">Não disponível</span>' : '';
    if (difer) return `<span class="selo erro">Diferente do ProSindW</span>${difer}<br><small>Confira os dados bancários da contribuição ${esc(au.contribuicao)} no ProSindW e clique em Atualizar do banco.</small>`;
    return `<span class="selo alerta">A conferir</span>${au && au.mensagem ? `<br><small class="sutil">${esc(au.mensagem)}</small>` : ''}`;
  };
  const au = d.conferencia_auto;
  const resumoAuto = () => {
    if (!au) return '';
    const bs = au.bancos || [];
    const n = (s) => bs.filter((b) => b.situacao === s).length;
    if (au.erro) return `<div class="aviso alerta" style="margin-top:12px">Conferência automática não concluída: ${esc(au.erro)}</div>`;
    if (!bs.length) return '';
    const partes = [`${n('conferido')} de ${bs.length} banco(s) conferido(s) com boletos gravados pelo ProSindW`];
    if (n('divergente')) partes.push(`<strong>${n('divergente')} com diferença</strong>`);
    if (n('sem_boleto')) partes.push(`${n('sem_boleto')} ainda sem boleto do ProSindW para comparar`);
    const fonte = (au.fontes || []).length ? `Linha digitável lida de <span class="mono">${esc(au.fontes.join(', '))}</span>.` : 'O banco do ProSindW não guarda a linha digitável dos boletos: para esses bancos use Conferir manualmente.';
    return `<div class="aviso ${n('divergente') ? 'erro' : n('conferido') === bs.length ? 'ok' : 'alerta'}" style="margin-top:12px"><strong>Conferência automática</strong> (${esc(au.em)}): ${partes.join(' · ')}.<br><small>${fonte}</small></div>`;
  };
  $('#bd-contribs').innerHTML = `${resumoAuto()}<div class="tabela-wrap tabela-lista sem-limite" style="margin-top:12px"><table><thead><tr><th>Contribuição</th><th>Banco e dados do boleto</th><th>Nosso número</th><th>Conferência</th><th></th></tr></thead><tbody>
    ${lst.map((x) => `<tr><td><strong>${esc(x.codigo)}</strong> - ${esc(x.descricao)}${x.situacao === 'Inativa' ? ' <span class="selo">Inativa</span>' : ''}${benef(x)}</td>
      <td>${dadosBanco(x)}</td><td>${seq(x)}</td><td>${situacao(x)}</td>
      <td>${x.suportado && x.banco !== '000' ? `<button class="botao sec peq" type="button" data-conf="${esc(x.codigo)}">${x.conferido ? 'Conferir de novo' : 'Conferir manualmente'}</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="sutil" style="margin-top:8px">Ao conectar (e em Atualizar do banco), cada banco é conferido sozinho: o cálculo é refeito para o último boleto que o ProSindW gravou e comparado com a linha digitável dele. A conferência vale para o banco: as outras contribuições do mesmo banco ficam liberadas. O botão manual só é necessário quando não há boleto do ProSindW para comparar.</p>`;
  $$('[data-conf]', corpo).forEach((bt) => { bt.onclick = () => painelConferencia(bt); });
}

// Conferência: abre logo abaixo da linha clicada, com carregamento e erro visíveis
async function painelConferencia(bt) {
  const tipo = bt.dataset.conf;
  const tr = bt.closest('tr');
  $$('tr.conf-painel').forEach((x) => x.remove());
  const linha = document.createElement('tr');
  linha.className = 'conf-painel';
  linha.innerHTML = `<td colspan="${tr.children.length}"><div class="conf-caixa"></div></td>`;
  tr.after(linha);
  const alvo = $('.conf-caixa', linha);
  const fechar = '<button class="botao sec" type="button" data-fechar-conf>Fechar</button>';
  const ligarFechar = () => { const f = $('[data-fechar-conf]', alvo); if (f) f.onclick = () => linha.remove(); };
  const erro = (msg, tipoAviso) => { alvo.innerHTML = `<div class="aviso ${tipoAviso}">${esc(msg)}</div><div class="acoes" style="margin-top:10px">${fechar}</div>`; ligarFechar(); };
  const txt = bt.innerHTML;
  $$('[data-conf]').forEach((x) => { x.disabled = true; });
  bt.innerHTML = '<span class="carregando"></span> Procurando…';
  alvo.innerHTML = `<p><span class="carregando"></span> Procurando o último boleto de ${esc(tipo)} gerado pelo ProSindW…</p>`;
  linha.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  let b;
  try { b = await Conector.api(`conferencia?contribuicao=${encodeURIComponent(tipo)}`); } catch (e) { b = { erro: e.message, falha: true }; }
  $$('[data-conf]').forEach((x) => { x.disabled = false; });
  bt.innerHTML = txt;
  if (!linha.isConnected) return;
  if (b.erro) {
    erro(b.erro, b.falha ? 'erro' : 'alerta');
    if (b.falha) toast(b.erro, 'erro');
    linha.scrollIntoView({ block: 'nearest' });
    return;
  }
  alvo.innerHTML = `<h3>${ico('docbusca')}Conferir ${esc(tipo)} · ${esc(b.perfil)}</h3>
    <p class="sutil">No ProSindW, reimprima o boleto abaixo e digite a linha digitável que sai nele.${b.origem ? ` Boleto da contribuição ${esc(b.origem)}, do mesmo banco ${esc(b.banco)}.` : ''}</p>
    <table class="filtros-tela"><tbody>
      <tr><th>Empresa</th><td>${esc(b.empresa)}</td></tr><tr><th>Referência</th><td>${esc(b.competencia)}</td></tr>
      <tr><th>Vencimento</th><td>${esc(b.vencimento)}</td></tr><tr><th>Valor</th><td>R$ ${esc(fmtMoeda(b.valor))}</td></tr>
      <tr><th>Nosso número</th><td class="mono">${esc(b.nosso_numero)}</td></tr>
      <tr><th>Calculado aqui</th><td class="mono">${esc(b.calculado.linha_digitavel)}</td></tr></tbody></table>
    <div class="linha-form" style="margin-top:10px"><div class="campo" style="flex:3 1 360px;margin:0"><label for="cf-linha">Linha digitável do boleto do ProSindW</label>
      <input type="text" id="cf-linha" class="mono" inputmode="numeric" autocomplete="off" placeholder="Digite os 47 números da linha digitável"></div>
      <div class="fixo acoes"><button class="botao" id="cf-ok" type="button">${ico('checar')}Comparar</button>${fechar}</div></div>
    <div id="cf-res"></div>`;
  ligarFechar();
  linha.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  const campo = $('#cf-linha', alvo);
  campo.focus({ preventScroll: true });
  const comparar = async () => {
    const res = $('#cf-res', alvo);
    const digitos = campo.value.replace(/\D/g, '');
    if (digitos.length !== 47) { res.innerHTML = `<div class="aviso erro" style="margin-top:10px">A linha digitável tem 47 números. Você digitou ${digitos.length}.</div>`; return; }
    const ok = $('#cf-ok', alvo); ok.disabled = true;
    res.innerHTML = '<p><span class="carregando"></span> Comparando…</p>';
    try {
      const r = await Conector.api('conferencia', { body: { contribuicao: tipo, linha: campo.value } });
      if (r.igual) { toast('Cálculo conferido. Banco liberado.'); configBanco(); return; }
      if (r.boleto && r.boleto.erro) res.innerHTML = `<div class="aviso erro" style="margin-top:10px">${esc(r.boleto.erro)}</div>`;
      else {
        res.innerHTML = `<div class="aviso erro" style="margin-top:10px">As linhas são diferentes. O banco continua bloqueado para boletos pela Base de Apoio.<br>
        <span class="mono">ProSindW: ${esc(campo.value)}</span><br><span class="mono">Calculado: ${esc(r.boleto.calculado.linha_digitavel)}</span><br>
        Confira se digitou a linha do mesmo boleto (mesmo nosso número e vencimento).</div>`;
      }
    } catch (e) { res.innerHTML = `<div class="aviso erro" style="margin-top:10px">${esc(e.message)}</div>`; }
    ok.disabled = false;
  };
  $('#cf-ok', alvo).onclick = comparar;
  campo.onkeydown = (e) => { if (e.key === 'Enter') comparar(); };
}

// ============================================================ conexão com o banco (tela própria; abre sozinha na primeira vez)
const CX = { arquivos: null };

async function telaConexao() {
  migalha('config', 'Conexão com o banco');
  if (!Conector.ativo) { location.hash = 'config/banco'; return; }
  app.innerHTML = '<div class="cartao"><span class="carregando"></span> Lendo configuração…</div>';
  let st;
  try { st = await Conector.atualizar(true); } catch (e) { falha(e); return; }
  // já configurado e Configurações protegida: pede a senha de administrador
  try { const m = await api('/api/status'); if (st.configurado && m.admin_protegido && !tokenAdmin) { telaLoginConexao(); return; } } catch { /* sem motor local */ }
  const c = st.config || {};
  const ehLocal = !c.host || ['127.0.0.1', 'localhost'].includes(String(c.host).toLowerCase());
  app.innerHTML = `
  <div class="cabecalho-pagina"><div><h1>${st.configurado ? 'Conexão com o banco' : 'Vamos conectar ao banco do ProSindW'}</h1>
    <p>${st.configurado ? 'Altere onde está o banco e o acesso ao Firebird.' : 'Três passos: onde está o banco, qual é o arquivo e o acesso ao Firebird.'}</p></div>
    ${st.configurado ? `<a class="botao sec" href="#config/banco">${ico('voltar')}Voltar</a>` : ''}</div>
  <div class="conexao">
    <section class="cartao passo-cx">
      <div class="passo-tit"><span class="num">1</span><h2>Onde fica o banco?</h2></div>
      <div class="escolhas" role="radiogroup">
        <button type="button" class="escolha ${ehLocal ? 'ativa' : ''}" data-onde="local" role="radio" aria-checked="${ehLocal}">${ico('monitor')}<strong>Neste computador</strong><small>O Firebird está instalado aqui.</small></button>
        <button type="button" class="escolha ${ehLocal ? '' : 'ativa'}" data-onde="rede" role="radio" aria-checked="${!ehLocal}">${ico('servidor')}<strong>Em um servidor da rede</strong><small>Outro computador guarda o banco.</small></button>
      </div>
      <div class="linha-form" id="cx-rede" ${ehLocal ? 'hidden' : ''}>
        <div class="campo" style="flex:3 1 220px"><label for="cx-host">IP ou nome do servidor</label><input type="text" id="cx-host" value="${esc(ehLocal ? '' : c.host || '')}" placeholder="192.168.0.10" autocomplete="off"></div>
        <div class="campo" style="flex:0 1 110px"><label for="cx-porta">Porta</label><input type="number" id="cx-porta" value="${esc(c.porta || 3050)}"></div>
      </div>
      <p class="status-fb" id="cx-fb"><span class="carregando"></span> Procurando o Firebird…</p>
    </section>

    <section class="cartao passo-cx">
      <div class="passo-tit"><span class="num">2</span><h2>Arquivo do banco</h2></div>
      <div class="campo"><label for="cx-caminho">Caminho do banco <small class="sutil" id="cx-dica-cam"></small></label>
        <div class="campo-com-botao"><input type="text" id="cx-caminho" value="${esc(c.caminho || '')}" placeholder="C:\\Sist\\ProSindW\\prosindw.fdb" autocomplete="off" spellcheck="false">
          <button type="button" class="botao sec" id="cx-procurar">${ico('pasta')}Procurar…</button></div></div>
      <div id="cx-achados"></div>
    </section>

    <section class="cartao passo-cx">
      <div class="passo-tit"><span class="num">3</span><h2>Acesso ao Firebird</h2></div>
      <div class="linha-form">
        <div class="campo"><label for="cx-usuario">Usuário</label><input type="text" id="cx-usuario" value="${esc(c.usuario || 'SYSDBA')}" autocomplete="off"></div>
        <div class="campo"><label for="cx-senha">Senha</label>
          <div class="campo-com-botao"><input type="password" id="cx-senha" placeholder="${c.tem_senha ? 'guardada (em branco = manter)' : 'senha do Firebird'}" autocomplete="new-password">
            <button type="button" class="botao sec icone-so" id="cx-ver" aria-label="Mostrar senha" title="Mostrar senha">${ico('olho')}</button></div></div>
      </div>
      <details class="avancado"><summary>Avançado</summary>
        <div class="linha-form" style="margin-top:10px">
          <div class="campo"><label for="cx-wire">Criptografia do canal</label><select id="cx-wire"><option value="">Automática</option><option value="true">Ativada</option><option value="false">Desativada</option></select></div>
          <div class="campo"><label for="cx-usp">Usuário gravado no ProSindW</label><input type="text" id="cx-usp" maxlength="20" value="${esc(c.usuario_prosind || 'BASEAPOIO')}"></div>
        </div>
      </details>
      <div class="acoes" style="margin-top:6px"><button class="botao sec" id="cx-testar" type="button">${ico('banco')}Testar conexão</button>
        <button class="botao" id="cx-salvar" type="button">${ico('checar')}Salvar e conectar</button></div>
      <div id="cx-res" aria-live="polite"></div>
      <p class="sutil" style="margin:12px 0 0">A senha fica só neste computador, protegida pelo Windows.</p>
    </section>
  </div>`;
  $('#cx-wire').value = c.wire_crypt || '';
  let onde = ehLocal ? 'local' : 'rede';
  const host = () => (onde === 'local' ? '127.0.0.1' : $('#cx-host').value.trim());
  const porta = () => (onde === 'local' ? (+$('#cx-porta').value || 3050) : (+$('#cx-porta').value || 3050));
  const dados = () => ({ host: host(), porta: porta(), caminho: $('#cx-caminho').value.trim().replace(/^"|"$/g, ''), usuario: $('#cx-usuario').value.trim() || 'SYSDBA', senha: $('#cx-senha').value, wire_crypt: $('#cx-wire').value });
  const dicaCaminho = () => {
    $('#cx-dica-cam').textContent = onde === 'local' ? '— clique em Procurar ou escolha um dos encontrados' : '— como o servidor enxerga o arquivo (não use unidade mapeada)';
    $('#cx-procurar').hidden = onde !== 'local';
  };
  let seq = 0;
  const verificar = async (comArquivos) => {
    const meu = ++seq;
    const el = $('#cx-fb');
    if (onde === 'rede' && !host()) { el.className = 'status-fb'; el.innerHTML = `${ico('info')} Informe o IP ou nome do servidor.`; $('#cx-achados').innerHTML = ''; return; }
    el.className = 'status-fb'; el.innerHTML = '<span class="carregando"></span> Procurando o Firebird…';
    let d;
    try { d = await Conector.api(`detectar?host=${encodeURIComponent(host())}&porta=${porta()}${comArquivos ? '&arquivos=1' : ''}`); } catch (e) { if (meu === seq) { el.className = 'status-fb erro'; el.textContent = e.message; } return; }
    if (meu !== seq) return;
    el.className = `status-fb ${d.firebird ? 'ok' : 'erro'}`;
    el.innerHTML = `${ico(d.firebird ? 'ok' : 'alerta')} ${esc(d.firebird_msg)}${!d.firebird && onde === 'local' ? ' Confira se o serviço "Firebird Server" está iniciado no Windows.' : ''}`;
    if (comArquivos) { CX.arquivos = d.arquivos || []; desenharAchados(); }
  };
  const desenharAchados = () => {
    const box = $('#cx-achados');
    if (onde !== 'local') { box.innerHTML = ''; return; }
    const lst = CX.arquivos || [];
    const atual = $('#cx-caminho').value.trim().toLowerCase();
    box.innerHTML = lst.length ? `<p class="sutil" style="margin:4px 0 8px">Encontrados neste computador:</p>
      <div class="achados">${lst.map((a, i) => `<button type="button" class="achado ${a.caminho.toLowerCase() === atual ? 'ativo' : ''}" data-i="${i}">
        ${ico('banco')}<span><strong class="mono">${esc(a.caminho)}</strong><small>${esc(fmtTamanho(a.tamanho))} · alterado em ${esc(a.modificado)}${a.alias ? ` · alias “${esc(a.alias)}” do Firebird` : ''}</small></span></button>`).join('')}</div>`
      : '<p class="sutil" style="margin:4px 0 0">Nenhum .fdb encontrado nas pastas usuais. Use Procurar… ou digite o caminho.</p>';
    $$('.achado', box).forEach((b) => { b.onclick = () => { $('#cx-caminho').value = lst[+b.dataset.i].caminho; desenharAchados(); $('#cx-res').innerHTML = ''; }; });
  };
  $$('.escolha').forEach((b) => { b.onclick = () => {
    onde = b.dataset.onde;
    $$('.escolha').forEach((x) => { x.classList.toggle('ativa', x === b); x.setAttribute('aria-checked', x === b); });
    $('#cx-rede').hidden = onde === 'local';
    dicaCaminho(); verificar(onde === 'local' && !CX.arquivos); desenharAchados();
    if (onde === 'rede') $('#cx-host').focus();
  }; });
  let tm;
  $('#cx-host').oninput = () => { clearTimeout(tm); tm = setTimeout(() => verificar(false), 700); };
  $('#cx-porta').oninput = () => { clearTimeout(tm); tm = setTimeout(() => verificar(false), 700); };
  $('#cx-caminho').oninput = () => desenharAchados();
  $('#cx-ver').onclick = () => { const i = $('#cx-senha'); i.type = i.type === 'password' ? 'text' : 'password'; };
  $('#cx-procurar').onclick = async () => {
    const bt = $('#cx-procurar'); bt.disabled = true; const txt = bt.innerHTML; bt.innerHTML = '<span class="carregando"></span> Janela aberta…';
    try {
      const r = await Conector.api('procurar', { body: { inicial: $('#cx-caminho').value.trim() } });
      if (r.escolhido) { $('#cx-caminho').value = r.caminho; desenharAchados(); $('#cx-res').innerHTML = ''; }
    } catch (e) { toast(e.message, 'erro'); }
    bt.disabled = false; bt.innerHTML = txt;
  };
  const validar = () => {
    const d = dados();
    if (onde === 'rede' && !d.host) return 'Informe o IP ou nome do servidor.';
    if (!d.caminho) return 'Informe o caminho do banco (passo 2).';
    if (!/\.(fdb|gdb)$/i.test(d.caminho) && !/^[\w-]+$/.test(d.caminho)) return 'O caminho deve terminar em .fdb (ou ser um alias do Firebird).';
    if (/^\\\\/.test(d.caminho)) return 'Use o caminho como o servidor enxerga (ex.: C:\\Sist\\ProSindW\\prosindw.fdb), não um caminho de rede \\\\servidor\\pasta.';
    return '';
  };
  const mostrar = (html) => { $('#cx-res').innerHTML = html; $('#cx-res').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
  const testar = async () => {
    const erro = validar(); if (erro) { mostrar(`<div class="aviso erro">${esc(erro)}</div>`); return null; }
    mostrar('<p><span class="carregando"></span> Conectando…</p>');
    try {
      const r = await Conector.api('testar', { body: dados() });
      if (!r.ok) { mostrar(`<div class="aviso erro"><strong>Não conectou.</strong> ${esc(r.erro)}${dicaErro(r.erro)}</div>`); return null; }
      return r;
    } catch (e) { mostrar(`<div class="aviso erro">${esc(e.message)}</div>`); return null; }
  };
  $('#cx-testar').onclick = async () => {
    const b = $('#cx-testar'); b.disabled = true;
    const r = await testar();
    if (r) mostrar(`<div class="aviso ok">${ico('ok')} Conexão OK · Firebird ${esc(r.versao_firebird || '')} · ${fmtN(r.empresas)} empresas. Clique em <strong>Salvar e conectar</strong>.</div>`);
    b.disabled = false;
  };
  $('#cx-salvar').onclick = async () => {
    const b = $('#cx-salvar'); b.disabled = true;
    const r = await testar();
    if (r) {
      try {
        await Conector.api('config', { body: { ...dados(), usuario_prosind: $('#cx-usp').value.trim() } });
        await Conector.atualizar(false);
        mostrar(`<div class="conectado">${ico('ok')}<div><strong>Conectado ao ProSindW</strong><p>Firebird ${esc(r.versao_firebird || '')} · ${fmtN(r.empresas)} empresas. O cálculo dos boletos de cada banco está sendo conferido sozinho com os boletos do ProSindW.</p>
          <div class="acoes"><a class="botao" href="#config/banco">${ico('banco')}Ver dados do ProSindW</a><a class="botao sec" href="#assistente">${ico('chat')}Abrir o Assistente</a></div></div></div>`);
        toast('Conexão salva.');
      } catch (e) { mostrar(`<div class="aviso erro">${esc(e.message)}</div>`); }
    }
    b.disabled = false;
  };
  $('#cx-senha').onkeydown = (e) => { if (e.key === 'Enter') $('#cx-salvar').click(); };
  if (st.erro && st.configurado) mostrar(`<div class="aviso erro"><strong>A conexão salva não está funcionando.</strong> ${esc(st.erro)}${dicaErro(st.erro)}</div>`);
  dicaCaminho();
  verificar(onde === 'local');
  if (!c.caminho) setTimeout(() => (onde === 'local' ? $('#cx-caminho') : $('#cx-host')).focus(), 50);
}

function dicaErro(msg) {
  const m = nrm(msg || '');
  if (/usuario ou senha|password|login/.test(m)) return '<br><small>Confira usuário e senha do Firebird. O padrão costuma ser SYSDBA.</small>';
  if (/arquivo|not found|no such file|i\/o error|cannot find/.test(m)) return '<br><small>Confira o caminho. Ele deve ser como o servidor enxerga o arquivo, não uma unidade mapeada.</small>';
  if (/recusou|refused|nao respondeu|timeout|rede/.test(m)) return '<br><small>Confira o IP, a porta 3050 e o firewall do servidor.</small>';
  if (/auth|plugin|srp|legacy/.test(m)) return '<br><small>No firebird.conf do servidor use AuthServer = Srp256, Srp, Legacy_Auth.</small>';
  return '';
}

function fmtTamanho(b) {
  if (!b) return '0 KB';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0; let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: i >= 2 ? 1 : 0 })} ${u[i]}`;
}

function telaLoginConexao() {
  app.innerHTML = `<div class="cartao" style="max-width:420px;margin:40px auto"><h2>Acesso às Configurações</h2>
    <form id="lg"><div class="campo"><label for="lg-s">Senha de administrador</label><input type="password" id="lg-s" autocomplete="current-password"></div>
    <button class="botao" type="submit">Entrar</button></form></div>`;
  $('#lg-s').focus();
  $('#lg').onsubmit = async (e) => {
    e.preventDefault();
    try { const r = await api('/api/login', { method: 'POST', body: { senha: $('#lg-s').value } }); tokenAdmin = r.token; sessionStorageSet('tokenAdmin', r.token); telaConexao(); } catch (er) { falha(er); }
  };
}

// ============================================================ início
pintarIcones();
marcarTema();
$$('.tema button').forEach((b) => { b.onclick = () => aplicarTema(b.dataset.tema); });
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', marcarTema); } catch { /* navegador antigo */ }
Conector.atualizar(true).then(async (s) => {
  const inicial = !location.hash || location.hash === '#' || location.hash === '#inicio';
  if (s && Conector.ativo && !s.configurado) { if (location.hash !== '#conexao') location.hash = 'conexao'; return; }
  if (s && s.configurado) {
    const t = await Conector.atualizar(false);
    if (t && t.configurado && !t.conectado && inicial) location.hash = 'conexao';
  }
});
$('#abre-menu').onclick = () => document.body.classList.toggle('menu-aberto');
$('#fundo-menu').onclick = () => document.body.classList.remove('menu-aberto');
window.addEventListener('resize', fecharMenuSuspenso);
rotear();
