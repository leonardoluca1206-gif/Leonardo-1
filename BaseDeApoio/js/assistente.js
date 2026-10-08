/* Base de Apoio — Assistente (chat): boletos, relatórios com dados do ProSindW e dúvidas da Ajuda.
   Entende pedidos em português por regras (não usa internet). Os dados vêm do conector (BaseDeApoio.exe). */
'use strict';

// ============================================================ conector (BaseDeApoio.exe)
const Conector = {
  ativo: location.protocol === 'http:' && /^(127\.0\.0\.1|localhost)$/.test(location.hostname),
  status: null,
  async api(caminho, opcoes = {}) {
    if (!this.ativo) throw new Error('Abra o sistema pelo BaseDeApoio.exe para usar o banco de dados.');
    let r;
    try {
      r = await fetch(`/api/db/${caminho}`, {
        method: opcoes.method || (opcoes.body ? 'POST' : 'GET'),
        headers: { 'Content-Type': 'application/json', 'X-Base-Apoio': '1' },
        body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
      });
    } catch {
      throw new Error('O BaseDeApoio.exe não está respondendo. Abra o programa de novo.');
    }
    const j = await r.json().catch(() => ({ erro: `Resposta inválida (${r.status})` }));
    if (!r.ok) throw new Error(j.erro || r.statusText);
    return j;
  },
  async atualizar(rapido) {
    const pill = document.getElementById('pill-banco');
    if (!this.ativo) { this.status = null; if (pill) { pill.className = 'pill-banco off'; pill.innerHTML = '<i></i>Banco: abra pelo .exe'; } return null; }
    try { this.status = await this.api(`status${rapido ? '?rapido=1' : ''}`); } catch (e) { this.status = { conectado: false, erro: e.message }; }
    const s = this.status;
    if (pill) {
      const ok = s.conectado; const conf = s.configurado;
      pill.className = `pill-banco ${ok ? 'on' : conf === false ? 'off' : rapido && conf ? '' : 'erro'}`;
      pill.innerHTML = `<i></i>${ok ? 'Banco conectado' : conf === false ? 'Banco não configurado' : rapido ? 'Banco configurado' : 'Banco sem conexão'}`;
      pill.title = s.erro || (s.banco ? `Firebird ${s.banco.versao_firebird || ''} · ${s.banco.empresas} empresas` : '');
      pill.href = ok ? '#config/banco' : '#conexao';
    }
    return s;
  },
};

// ============================================================ utilidades
const nrm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const fmtData = (v) => { const s = String(v || ''); return /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : s; };
const fmtMoeda = (v) => (v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtCNPJ = (c) => { const d = String(c || '').replace(/\D/g, ''); return d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : String(c || ''); };
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dataISO = (br) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(br || ''); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };
const ultimoDia = (a, m) => new Date(a, m, 0).getDate();

// ============================================================ entendimento do texto
const RX_DATA = /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/g;
const RX_CNPJ = /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/;

function extrairBoleto(texto) {
  const t = ` ${texto} `;
  const p = {};
  let m = /\b(?:no\s+)?valor\s+(?:de\s+)?R?\$?\s*([\d.]+(?:,\d{1,2})?)/i.exec(t) || /R\$\s*([\d.]+(?:,\d{1,2})?)/i.exec(t)
    || /\b([\d.]+(?:,\d{1,2})?)\s*(?:reais|real)\b/i.exec(t) || /\bboleto\s+de\s+([\d.]+(?:,\d{1,2})?)\b(?!\s*\/)/i.exec(t);
  if (m) p.valor = m[1];
  m = /\b(?:refer[eê]ncia|compet[eê]ncia|ref\.?|m[eê]s)\s*(?:de\s+|:\s*)?(\d{1,2}\s*\/\s*\d{4})\b/i.exec(t);
  if (m) p.referencia = m[1].replace(/\s/g, '');
  m = /\bvenc(?:imento|endo|e|to)?\.?\s*(?:em|para|dia|no dia|:)?\s*(\d{1,2}\/\d{1,2}\/\d{1,4})\b/i.exec(t);
  if (m) p.vencimento = m[1];
  const datas = [...t.matchAll(RX_DATA)].map((x) => x[1]).filter((d) => d !== p.vencimento);
  if (!p.vencimento && datas.length) p.vencimento = datas[0];
  if (!p.referencia) { const r = /(?:^|[^\d/])(\d{1,2}\/\d{4})(?![\d/])/.exec(t); if (r) p.referencia = r[1]; }
  m = RX_CNPJ.exec(t);
  if (m) p.empresa = m[1];
  if (!p.empresa) {
    m = /\bempresa\s+(?:de\s+)?(?:c[oó]d(?:igo)?\.?\s*|cnpj\s*|nome\s+|n[ºo°]\.?\s*)?(.+?)(?=\s+(?:com|no valor|de valor|valor|refer|venc|compet|contribui|ref\.?|de R\$|R\$)\b|[,;]|\s*$)/i.exec(t);
    if (m) p.empresa = m[1].trim().replace(/[.]+$/, '');
  }
  m = /\bcontribui[çc][ãa]o\s+(?:de\s+|do tipo\s+|tipo\s+)?([A-Za-zÀ-ú0-9]+)/i.exec(t) || /\b(?:tipo|c[oó]digo da contribui[çc][ãa]o)\s+([A-Z0-9]{2,4})\b/.exec(t);
  if (m && !/^(com|no|de|da|do|para|referente)$/i.test(m[1])) p.contribuicao = m[1];
  return p;
}

function intencao(texto) {
  const t = nrm(texto);
  if (/\b(relatorio|relacao|listagem|lista|listar|quantos|quantas)\b/.test(t) && /\bboletos\b|\bboletos? (emitidos|gerados)\b/.test(t)) return 'relatorio';
  if (/\b(boleto|bloqueto|guia de cobranca)\b/.test(t) && !/\b(como|onde|o que|porque|por que|qual o caminho)\b/.test(t)) return 'boleto';
  if (/^\s*(como|onde|o que|oque|por que|porque|qual o caminho|pra que|para que)\b/.test(t) || /\?\s*$/.test(t) && !/\b(quantos|quantas)\b/.test(t)) return 'ajuda';
  if (/\b(relatorio|relacao|listagem|lista|listar|liste|quantos|quantas|quantidade|total de|mostre|mostrar|traga|trazer|gere|gerar|imprimir)\b/.test(t)) return 'relatorio';
  if (escolherRelatorio(texto).length) return 'relatorio';
  return 'ajuda';
}

function extrairParams(texto) {
  const t = ` ${texto} `; const n = nrm(t);
  const p = {};
  let m = /\bde\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(?:a|ate|até)\s+(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(t);
  if (m) { p.de = dataISO(m[1]); p.ate = dataISO(m[2]); }
  m = /(?:^|[^\d/])(\d{1,2})\/(\d{4})(?![\d/])/.exec(t);
  if (m) { p.mes = +m[1]; p.ano = +m[2]; }
  MESES.forEach((nome, i) => { if (new RegExp(`\\b${nome}\\b`).test(n)) { p.mes = i + 1; const a = new RegExp(`${nome}\\s+(?:de\\s+)?(\\d{4})`).exec(n); if (a) p.ano = +a[1]; } });
  if (/\b(este|esse|deste|desse) mes\b|\bmes atual\b/.test(n)) { const d = new Date(); p.mes = d.getMonth() + 1; p.ano = d.getFullYear(); }
  if (/\b(masculino|homens?)\b/.test(n)) p.sexo = 'M';
  if (/\b(feminino|mulheres?)\b/.test(n)) p.sexo = p.sexo ? '' : 'F';
  if (/\binativ/.test(n)) p.situacao = 'Inativa'; else if (/\bativ[ao]s?\b/.test(n)) p.situacao = 'Ativa';
  if (/\bafastad/.test(n)) p.situacaoSocio = 'Afastado';
  if (/\baposentad/.test(n)) p.situacaoSocio = 'Aposentado';
  if (/\bdesfiliad/.test(n)) p.situacaoSocio = 'Desfiliado';
  m = RX_CNPJ.exec(t) || /\bempresa\s+(?:c[oó]digo\s+)?(\d{1,9})\b/i.exec(t) || /\bempresa\s+([A-Za-zÀ-ú][\wÀ-ú .&-]{2,40}?)(?=\s+(?:com|de|do|da|em|no|na|por|referen|compet|contribui)\b|[,;]|\s*$)/i.exec(t);
  if (m) p.empresa = m[1].trim();
  m = /\bcontribui[çc](?:[ãa]o|[õo]es)\s+(?:de\s+|do tipo\s+)?([A-Za-zÀ-ú0-9]{2,})/i.exec(t);
  if (m && !/^(em|de|da|do|pagas?|abertas?|aberto|pendentes?|no|na|por)$/i.test(m[1])) p.contribuicao = m[1];
  return p;
}

// ============================================================ filtros de sócios (entendidos do texto)
// Monta as condições SQL a partir da frase: data de filiação/nascimento/admissão, sexo, UF, cidade,
// bairro, idade, aniversário, dependentes (com/sem, parentesco, quantidade, idade), e-mail, celular.
const UFS = { acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO', maranhao: 'MA',
  'mato grosso do sul': 'MS', 'mato grosso': 'MT', 'minas gerais': 'MG', para: 'PA', paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO' };
const SIGLAS_UF = new Set(Object.values(UFS));
const NOMES_UF = Object.keys(UFS).sort((a, b) => b.length - a.length);
const PARENTESCOS = [
  { rx: /^(filh[oa]s?)$/, like: ['FILH'], rot: 'filhos' },
  { rx: /^(conjuges?|esposas?|esposos?|maridos?|companheir\w*)$/, like: ['CONJ', 'CÔNJ', 'ESPOS', 'MARID', 'COMPANH'], rot: 'cônjuge' },
  { rx: /^(netos?|netas?)$/, like: ['NET'], rot: 'netos' },
  { rx: /^(enteados?|enteadas?)$/, like: ['ENTEAD'], rot: 'enteados' },
  { rx: /^(pais|pai|mae|maes)$/, like: ['PAI', 'MÃE', 'MAE'], rot: 'pai/mãe' },
];
const NOME_DEP = 'dependentes?|filh[oa]s?|conjuges?|esposas?|esposos?|maridos?|companheir\\w*|netos?|netas?|enteados?|enteadas?';

const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const anosAtras = (n, extraDia = 0) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); d.setDate(d.getDate() + extraDia); return isoDe(d); };
function dataCompleta(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s); if (!m) return null;
  let a = +m[3];
  if (m[3].length === 2) a += a <= new Date().getFullYear() % 100 ? 2000 : 1900;
  else if (m[3].length === 3) return null;
  const mes = +m[2]; const dia = +m[1];
  if (mes < 1 || mes > 12 || dia < 1 || dia > ultimoDia(a, mes)) return null;
  return `${a}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}
function campoDataPorContexto(ctx, padrao) {
  if (/nascid|nascimento|nasceram|aniversar/.test(ctx)) return ['DTNASCIMENTO', 'Nascimento'];
  if (/admitid|admissao|contratad/.test(ctx)) return ['DTADMISSAO', 'Admissão na empresa'];
  if (/filiad|filiac|inscri|associad|sindicaliz|cadastrad|entrad/.test(ctx)) return ['DTINSCRICAO', 'Filiação'];
  return padrao;
}

function filtrosSocios(texto, modo = 'socio', opc = {}) {
  const t = ` ${texto} `;
  const n = nrm(t);
  const w = []; const a = []; const rot = [];
  const dep = { exige: null, like: null, rotPar: '', min: 0, idade: [], sexo: null };
  const padraoData = /nascid|nascimento/.test(n) && !/filiad|filiac/.test(n) ? ['DTNASCIMENTO', 'Nascimento'] : ['DTINSCRICAO', 'Filiação'];

  // ---- datas (dd/mm/aaaa)
  let resto = t;
  const faixa = /\b(?:entre|de|do dia|desde)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(?:e|a|ate|até)\s+(?:o dia\s+)?(\d{1,2}\/\d{1,2}\/\d{2,4})/gi;
  let m;
  while ((m = faixa.exec(t))) {
    const d1 = dataCompleta(m[1]); const d2 = dataCompleta(m[2]);
    if (!d1 || !d2) continue;
    const ctx = nrm(t.slice(Math.max(0, m.index - 60), m.index));
    const [campo, nome] = campoDataPorContexto(ctx, padraoData);
    w.push(`S.${campo} BETWEEN ? AND ?`); a.push(d1, d2); rot.push(`${nome} de ${fmtData(d1)} a ${fmtData(d2)}`);
    resto = resto.replace(m[0], ' '.repeat(m[0].length));
  }
  const rxData = /(\d{1,2}\/\d{1,2}\/\d{2,4})/g;
  while ((m = rxData.exec(resto))) {
    const d = dataCompleta(m[1]); if (!d) continue;
    const antes = nrm(resto.slice(Math.max(0, m.index - 60), m.index));
    const [campo, nome] = campoDataPorContexto(antes, padraoData);
    const perto = antes.slice(-26);
    let op = '='; let txt = 'em';
    if (/(a ?partir d[eo]|desde|a contar d[eo])( o)?( dia)?\s*$/.test(perto)) { op = '>='; txt = 'a partir de'; }
    else if (/(apos|depois d[eo])( o)?( dia)?\s*$/.test(perto)) { op = '>'; txt = 'depois de'; }
    else if (/(antes d[eo])( o)?( dia)?\s*$/.test(perto)) { op = '<'; txt = 'antes de'; }
    else if (/\bate( o)?( dia)?\s*$/.test(perto)) { op = '<='; txt = 'até'; }
    w.push(`S.${campo} ${op} ?`); a.push(d); rot.push(`${nome} ${txt} ${fmtData(d)}`);
  }
  // ---- só o ano ("filiados em 2020", "nascidos antes de 1970")
  const rxAno = /\b(filiad\w*|filiacao|inscrit\w*|associad\w*|sindicalizad\w*|nascid\w*|admitid\w*)\s+(?:no\s+sindicato\s+|na\s+empresa\s+)?(em|no ano de|no ano|desde|a ?partir de|ate|antes de|apos|depois de)\s+(\d{4})\b(?!\/)/g;
  while ((m = rxAno.exec(n))) {
    const [campo, nome] = campoDataPorContexto(m[1], padraoData);
    const ano = +m[3]; const op = m[2];
    if (/^(em|no ano)/.test(op)) { w.push(`EXTRACT(YEAR FROM S.${campo}) = ?`); a.push(ano); rot.push(`${nome} em ${ano}`); }
    else if (/desde|partir/.test(op)) { w.push(`S.${campo} >= ?`); a.push(`${ano}-01-01`); rot.push(`${nome} a partir de ${ano}`); }
    else if (/apos|depois/.test(op)) { w.push(`S.${campo} > ?`); a.push(`${ano}-12-31`); rot.push(`${nome} depois de ${ano}`); }
    else if (/antes/.test(op)) { w.push(`S.${campo} < ?`); a.push(`${ano}-01-01`); rot.push(`${nome} antes de ${ano}`); }
    else { w.push(`S.${campo} <= ?`); a.push(`${ano}-12-31`); rot.push(`${nome} até ${ano}`); }
  }
  m = /\b(filiad\w*|inscrit\w*|associad\w*|sindicalizad\w*)\s+(?:n[oa]s?\s+)?ultim[oa]s\s+(\d+)\s+(dias?|mes(?:es)?|anos?)\b/.exec(n);
  if (m) {
    const d = new Date(); const q = +m[2];
    if (/^dia/.test(m[3])) d.setDate(d.getDate() - q); else if (/^mes/.test(m[3])) d.setMonth(d.getMonth() - q); else d.setFullYear(d.getFullYear() - q);
    w.push('S.DTINSCRICAO >= ?'); a.push(isoDe(d)); rot.push(`Filiação nos últimos ${q} ${m[3]}`);
  }

  // ---- sexo
  const sexoSocio = /\bsocias\b|\bsocios?\s+(?:do sexo\s+)?(?:masculino|feminino|homens?|mulheres?)\b/.test(n);
  let sexo = null;
  if (/\b(masculino|homens?|sexo m)\b/.test(n)) sexo = 'M';
  if (/\b(feminino|mulheres?|sexo f|socias)\b/.test(n)) sexo = sexo ? '' : 'F';
  if (sexo) {
    if (modo === 'dependente' && !sexoSocio) dep.sexo = sexo;
    else { w.push('S.CDSEXO = ?'); a.push(sexo); rot.push(`Sexo ${sexo === 'M' ? 'masculino' : 'feminino'}`); }
  }

  // ---- UF, cidade, bairro
  const baixo = t.toLowerCase();
  const verbo = '(?:moram|mora|residem|reside|residentes?|domiciliad[oa]s?|morando|residindo|que vivem|vivem|localizad[oa]s?)';
  const fimLocal = '(?=\\s+(?:que|com|sem|e|do sexo|sexo|filiad\\w*|nascid\\w*|tenham|possuem|da empresa|na empresa|entre|de\\s+\\d|a partir|desde)\\b|[,.;!?]|\\s*$)';
  const locais = [];
  const rxLocal = new RegExp(`(nao\\s+)?${verbo}\\s+(?:em|no|na|nos|nas|de|do|da)?\\s*(?:estado\\s+(?:de|do|da)\\s+|cidade\\s+(?:de|do|da)\\s+)?([a-zà-ÿ][a-zà-ÿ' ]{1,40}?)${fimLocal}`, 'g');
  const nb = nrm(baixo);
  while ((m = rxLocal.exec(baixo))) if (!/^fora\s/.test(m[2].trim())) locais.push({ neg: !!m[1] || /\bnao\s*$/.test(nb.slice(Math.max(0, m.index - 6), m.index)), txt: m[2].trim() });
  m = /\bfora\s+(?:do\s+estado\s+)?(?:de|do|da)\s+([a-zà-ÿ][a-zà-ÿ ]{1,30}?)(?=\s+(?:que|com|e|sem)\b|[,.;]|\s*$)/.exec(baixo);
  if (m) locais.push({ neg: true, txt: m[1].trim() });
  let uf = null; let ufNeg = false; let cidade = null;
  for (const l of locais) {
    const ln = nrm(l.txt);
    const nomeUF = NOMES_UF.find((x) => ln === x || ln === `estado de ${x}`);
    const sig = l.txt.toUpperCase();
    if (nomeUF) { uf = UFS[nomeUF]; ufNeg = l.neg; } else if (SIGLAS_UF.has(sig) && l.txt.length === 2) { uf = sig; ufNeg = l.neg; } else if (!cidade && !l.neg) cidade = l.txt;
  }
  if (!uf) { // "de Santa Catarina", "estado de SC", "UF SC" sem verbo
    const nomeUF = NOMES_UF.find((x) => x !== 'para' && new RegExp(`\\b(?:em|de|do|da|no|na|estado d[eoa])\\s+${x}\\b`).test(n));
    if (nomeUF) uf = UFS[nomeUF];
    m = /\b(?:uf|estado(?:\s+d[eoa])?)\s*[:=]?\s*([A-Za-z]{2})\b/.exec(t) || /\b(?:em|de|do|da|no|na)\s+([A-Z]{2})\b/.exec(t);
    if (!uf && m && SIGLAS_UF.has(m[1].toUpperCase())) uf = m[1].toUpperCase();
  }
  if (uf) { w.push(`S.CDUF ${ufNeg ? '<>' : '='} ?`); a.push(uf); rot.push(ufNeg ? `Fora de ${uf}` : `UF ${uf}`); }
  m = /\bcidade\s+(?:de|do|da)?\s*([a-zà-ÿ][a-zà-ÿ' ]{1,30}?)(?=\s+(?:que|com|e|sem|do sexo)\b|[,.;]|\s*$)/.exec(baixo);
  if (m) cidade = m[1].trim();
  if (!cidade) { // "sócios de Blumenau" (nome com inicial maiúscula)
    m = /\b(?:s[óo]ci[oa]s?|filiad[oa]s?|associad[oa]s?|sindicalizad[oa]s?)\s+(?:de|da|do|em)\s+([A-ZÀ-Ú][\wÀ-ú']+(?:\s+(?:d[aeo]s?\s+)?[A-ZÀ-Ú][\wÀ-ú']+)*)/.exec(t);
    if (m && !SIGLAS_UF.has(m[1]) && !/^(empresa|Empresa)/.test(m[1])) cidade = m[1];
  }
  if (cidade && NOMES_UF.includes(nrm(cidade))) cidade = null;
  const semAc = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const titulo = (x) => x.split(/\s+/).map((p, i) => (i && /^(d[aeo]s?|e)$/i.test(p) ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())).join(' ');
  const contem = (col, v) => { const u = v.toUpperCase(); const ua = semAc(u); if (u === ua) { w.push(`${col} CONTAINING ?`); a.push(u); } else { w.push(`(${col} CONTAINING ? OR ${col} CONTAINING ?)`); a.push(u, ua); } };
  if (cidade) { contem('S.NMCIDADE', cidade); rot.push(`Cidade: ${titulo(cidade)}`); }
  m = /\bbairro\s+(?:de|do|da)?\s*([a-zà-ÿ][a-zà-ÿ' ]{1,30}?)(?=\s+(?:que|com|e|sem|do sexo)\b|[,.;]|\s*$)/.exec(baixo);
  if (m) { contem('S.NMBAIRRO', m[1].trim()); rot.push(`Bairro: ${titulo(m[1].trim())}`); }

  // ---- idade (sócio ou dependente, conforme o que vem antes)
  const idades = [];
  const rxIdade = /\b(?:(?:com\s+)?idade\s+)?(entre)\s+(\d{1,3})\s+e\s+(\d{1,3})\s+anos\b|\b(maiores? de|acima de|mais de|com mais de|a partir de|de)\s+(\d{1,3})\s+anos(?:\s+ou\s+mais)?\b|\b(menores? de|abaixo de|menos de|com menos de|ate)\s+(\d{1,3})\s+anos\b/g;
  while ((m = rxIdade.exec(n))) {
    const antes = n.slice(Math.max(0, m.index - 30), m.index);
    const doDep = new RegExp(`\\b(${NOME_DEP})\\b`).test(antes) && !/\bsocios?\s*$/.test(antes);
    let cond; let r;
    if (m[1]) { cond = [['<=', anosAtras(+m[2])], ['>', anosAtras(+m[3] + 1)]]; r = `idade de ${m[2]} a ${m[3]} anos`; }
    else if (m[4]) { if (m[4] === 'de' && !/ou mais/.test(m[0])) continue; cond = [['<=', anosAtras(+m[5])]]; r = `${m[5]} anos ou mais`; }
    else { cond = [['>', anosAtras(+m[7])]]; r = `menos de ${m[7]} anos`; }
    idades.push({ doDep: doDep || (modo === 'dependente' && !/\bsocios?\b/.test(antes)), cond, r });
  }
  idades.filter((x) => !x.doDep).forEach((x) => { x.cond.forEach(([op, d]) => { w.push(`S.DTNASCIMENTO ${op} ?`); a.push(d); }); rot.push(`Sócio com ${x.r}`); });
  dep.idade = idades.filter((x) => x.doDep);

  // ---- aniversário
  if (/aniversar/.test(n) && !opc.semAniversario) {
    const mesN = MESES.findIndex((x) => new RegExp(`\\b${x}\\b`).test(n));
    if (mesN >= 0 || /\b(este|esse|deste|desse) mes\b|\bmes atual\b/.test(n)) {
      const mes = mesN >= 0 ? mesN + 1 : new Date().getMonth() + 1;
      w.push('EXTRACT(MONTH FROM S.DTNASCIMENTO) = ?'); a.push(mes); rot.push(`Aniversário em ${MESES[mes - 1].replace('marco', 'março')}`);
    }
  }

  // ---- dependentes
  const rxSem = new RegExp(`\\b(?:sem|nao\\s+(?:tem|tenham|possuem|possui|possuam|tenha))\\s+(?:nenhum\\s+|nenhuma\\s+)?(${NOME_DEP})\\b`);
  const rxCom = new RegExp(`\\b(?:com|que\\s+(?:tem|tenham|possuem|possui|possuam|tenha)|tem|tenham|possuem|possui|possuam|possuindo|tendo)\\s+(?:seus?\\s+|suas?\\s+|algum\\s+|alguma\\s+|pelo menos\\s+(\\d+)\\s+|mais de\\s+(\\d+)\\s+|(\\d+)\\s+ou mais\\s+|(\\d+)\\s+)?(${NOME_DEP})\\b`);
  let mm;
  if ((mm = rxSem.exec(n))) { dep.exige = false; dep.nome = mm[1]; }
  else if ((mm = rxCom.exec(n))) {
    dep.exige = true; dep.nome = mm[5];
    if (mm[1]) dep.min = +mm[1]; else if (mm[2]) dep.min = +mm[2] + 1; else if (mm[3]) dep.min = +mm[3]; else if (mm[4]) dep.min = +mm[4];
  } else if (modo === 'socio' && dep.idade.length) dep.exige = true;
  if (!dep.nome && modo === 'dependente') { const pm = /\b(filh[oa]s?|conjuges?|esposas?|esposos?|maridos?|companheir\w*|netos?|netas?|enteados?|enteadas?)\b/.exec(n); if (pm) dep.nome = pm[1]; }
  if (dep.nome) {
    const par = PARENTESCOS.find((x) => x.rx.test(dep.nome.replace(/\s.*/, '')));
    if (par) { dep.like = par.like; dep.rotPar = par.rot; }
  }
  const condDep = () => {
    const c = []; const ca = [];
    if (dep.like) { c.push(`(${dep.like.map(() => 'D.DSPARENTESCO CONTAINING ?').join(' OR ')})`); ca.push(...dep.like); }
    dep.idade.forEach((x) => x.cond.forEach(([op, d]) => { c.push(`D.DTNASCIMENTO ${op} ?`); ca.push(d); }));
    if (dep.sexo) { c.push('D.CDSEXO = ?'); ca.push(dep.sexo); }
    return { c, ca };
  };
  const rotDep = () => [dep.rotPar || 'dependentes', ...dep.idade.map((x) => x.r), dep.sexo ? `sexo ${dep.sexo === 'M' ? 'masculino' : 'feminino'}` : ''].filter(Boolean).join(', ');
  if (modo === 'socio' && dep.exige !== null) {
    const { c, ca } = condDep();
    const sub = `FROM PSW_DEPENDENTES D WHERE D.NRINSCRSOC = S.NRINSCRICAO${c.length ? ` AND ${c.join(' AND ')}` : ''}`;
    if (dep.exige === false) { w.push(`NOT EXISTS (SELECT 1 ${sub})`); a.push(...ca); rot.push(`Sem ${rotDep()}`); }
    else if (dep.min > 1) { w.push(`(SELECT COUNT(*) ${sub}) >= ?`); a.push(...ca, dep.min); rot.push(`Com ${dep.min} ou mais ${rotDep()}`); }
    else { w.push(`EXISTS (SELECT 1 ${sub})`); a.push(...ca); rot.push(`Com ${rotDep()}`); }
  }
  if (modo === 'dependente') {
    const { c, ca } = condDep();
    w.push(...c); a.push(...ca);
    if (c.length) rot.push(`Dependentes: ${rotDep()}`);
  }

  // ---- contato
  if (/\bsem\s+e-?mail\b/.test(n)) { w.push("COALESCE(S.NMEMAIL, '') = ''"); rot.push('Sem e-mail'); }
  else if (/\bcom\s+e-?mail\b|\bque\s+tenham\s+e-?mail\b/.test(n)) { w.push("COALESCE(S.NMEMAIL, '') <> ''"); rot.push('Com e-mail'); }
  if (/\bsem\s+celular\b/.test(n)) { w.push("COALESCE(S.NRCELULAR, '') = ''"); rot.push('Sem celular'); }
  else if (/\bcom\s+celular\b/.test(n)) { w.push("COALESCE(S.NRCELULAR, '') <> ''"); rot.push('Com celular'); }
  if (/\bwhats\s*app\b|\bwhats\b/.test(n)) { w.push("S.INWHATSAPP = 'S'"); rot.push('Com WhatsApp'); }

  let ordem = '';
  if (/\bpor sexo\b/.test(n)) ordem = 'S.CDSEXO, ';
  else if (/\bpor cidade\b/.test(n)) ordem = 'S.CDUF, S.NMCIDADE, ';
  else if (/\bpor (uf|estado)\b/.test(n)) ordem = 'S.CDUF, ';
  else if (/\bpor empresa\b/.test(n)) ordem = 'E.NMABREVEMP, ';
  else if (/\bpor (data de )?filiacao\b/.test(n)) ordem = 'S.DTINSCRICAO, ';
  return { w, a, rot, comDependentes: dep.exige === true, depCond: condDep(), ordem };
}

// condição de situação + filtros comuns
function situacaoSocio(p, w, a, rot) {
  if (p.situacaoSocio) { w.push('S.INSITUACAO = ?'); a.push(p.situacaoSocio); rot.push(`Situação: ${p.situacaoSocio}`); }
  else { w.push("S.INSITUACAO <> 'Desfiliado'"); rot.push('Situação: todos, exceto desfiliados'); }
  if (p.codEmpresa) { w.push('S.CDEMPRESA = ?'); a.push(p.codEmpresa); rot.push(`Empresa: ${p.nomeEmpresa || p.codEmpresa}`); }
}

// ============================================================ relatórios com dados do ProSindW
// cada modelo: palavras (regex no texto sem acento), montar(p) → { sql, params, subtitulo }, colunas [campo, rótulo, tipo]
const COL = (campo, rotulo, tipo = 'texto') => ({ campo, rotulo, tipo });
const RELATORIOS_BD = [
  {
    id: 'socios_situacao', titulo: 'Quantidade de sócios por situação e sexo', palavras: /\b(quantos|quantas|quantidade|total|estatistica)\b.*\b(socios?|socias|filiados?|associados?)\b|\bsocios? por situacao\b/,
    colunas: [COL('INSITUACAO', 'Situação'), COL('MASC', 'Masculino', 'int'), COL('FEM', 'Feminino', 'int'), COL('OUTROS', 'Não informado', 'int'), COL('TOTAL', 'Total', 'int')],
    totais: ['MASC', 'FEM', 'OUTROS', 'TOTAL'],
    montar(p, texto) {
      const f = filtrosSocios(texto);
      if (p.situacaoSocio) { f.w.push('S.INSITUACAO = ?'); f.a.push(p.situacaoSocio); f.rot.push(`Situação: ${p.situacaoSocio}`); }
      if (p.codEmpresa) { f.w.push('S.CDEMPRESA = ?'); f.a.push(p.codEmpresa); f.rot.push(`Empresa: ${p.nomeEmpresa || p.codEmpresa}`); }
      return { sql: `SELECT S.INSITUACAO, SUM(CASE WHEN S.CDSEXO = 'M' THEN 1 ELSE 0 END) AS MASC, SUM(CASE WHEN S.CDSEXO = 'F' THEN 1 ELSE 0 END) AS FEM,
        SUM(CASE WHEN S.CDSEXO IS NULL OR S.CDSEXO NOT IN ('M','F') THEN 1 ELSE 0 END) AS OUTROS, COUNT(*) AS TOTAL FROM PSW_SOCIOS S
        ${f.w.length ? `WHERE ${f.w.join(' AND ')}` : ''} GROUP BY S.INSITUACAO ORDER BY 5 DESC`, params: f.a, subtitulo: f.rot.join(' · ') || 'Todos os sócios cadastrados' };
    },
  },
  {
    id: 'aniversariantes', titulo: 'Aniversariantes do mês', palavras: /\baniversariantes?\b|\baniversario\b/,
    colunas: [COL('DIA', 'Dia', 'int'), COL('NMSOCIO', 'Nome'), COL('DTNASCIMENTO', 'Nascimento', 'data'), COL('EMPRESA', 'Empresa'), COL('NMCIDADE', 'Cidade'), COL('NRFONE', 'Telefone'), COL('NRCELULAR', 'Celular')],
    montar(p, texto) {
      const mes = p.mes || new Date().getMonth() + 1;
      const f = filtrosSocios(texto, 'socio', { semAniversario: true });
      const w = ['EXTRACT(MONTH FROM S.DTNASCIMENTO) = ?', ...f.w]; const a = [mes, ...f.a]; const rot = [`Mês: ${MESES[mes - 1].replace('marco', 'março')}`, ...f.rot];
      situacaoSocio(p, w, a, rot);
      return { sql: `SELECT EXTRACT(DAY FROM S.DTNASCIMENTO) AS DIA, S.NMSOCIO, S.DTNASCIMENTO, E.NMABREVEMP AS EMPRESA, S.NMCIDADE, S.NRFONE, S.NRCELULAR FROM PSW_SOCIOS S LEFT JOIN PSW_EMPRESAS E ON E.CDGRUPO = S.CDEMPRESA
        WHERE ${w.join(' AND ')} ORDER BY 1, 2`, params: a, subtitulo: rot.join(' · ') };
    },
  },
  {
    id: 'dependentes', titulo: 'Dependentes dos sócios', palavras: /\bdependentes?\b/,
    // só quando os dependentes são o assunto ("relatório de dependentes"); "sócios que tenham dependentes" vai para Sócios
    aceita: (n) => { const i = n.search(/\bdependentes?\b/); return !/\b(com|tenham|tem|tenha|possuem|possuam|possui|sem|tendo|possuindo)\s+(\w+\s+){0,3}$/.test(n.slice(Math.max(0, i - 30), i)); },
    colunas: [COL('NRINSCRSOC', 'Inscrição', 'int'), COL('NMSOCIO', 'Sócio'), COL('NMDEPENDENTE', 'Dependente'), COL('DSPARENTESCO', 'Parentesco'), COL('DTNASCIMENTO', 'Nascimento', 'data'), COL('CDSEXO', 'Sexo'), COL('CDUF', 'UF')],
    montar(p, texto) {
      const f = filtrosSocios(texto, 'dependente');
      const w = [...f.w]; const a = [...f.a]; const rot = [...f.rot];
      situacaoSocio(p, w, a, rot);
      return { sql: `SELECT D.NRINSCRSOC, S.NMSOCIO, D.NMDEPENDENTE, D.DSPARENTESCO, D.DTNASCIMENTO, D.CDSEXO, S.CDUF FROM PSW_DEPENDENTES D JOIN PSW_SOCIOS S ON S.NRINSCRICAO = D.NRINSCRSOC
        WHERE ${w.join(' AND ')} ORDER BY S.NMSOCIO, D.NMDEPENDENTE`, params: a, subtitulo: rot.join(' · ') };
    },
  },
  {
    id: 'oposicoes_emp', titulo: 'Oposições de empresas', palavras: /\boposic.*\bempresas?\b|\bempresas?\b.*\boposic/,
    colunas: [COL('CDEMPRESA', 'Código', 'int'), COL('NMEMPRESA', 'Empresa'), COL('CDCONTRIBUICAO', 'Contrib.'), COL('COMPETENCIA', 'Referência'), COL('DTCARTA', 'Carta', 'data'), COL('DSMOTIVO', 'Motivo')],
    montar(p) {
      const w = ['1 = 1']; const a = [];
      if (p.contribuicao) { w.push('O.CDCONTRIBUICAO = ?'); a.push(p.contribuicao); }
      if (p.ano) { w.push('O.NRANO = ?'); a.push(p.ano); }
      if (p.mes) { w.push('O.NRMES = ?'); a.push(p.mes); }
      return { sql: `SELECT O.CDEMPRESA, E.NMEMPRESA, O.CDCONTRIBUICAO, LPAD(O.NRMES, 2, '0') || '/' || O.NRANO AS COMPETENCIA, O.DTCARTA, M.DSMOTIVO FROM PSW_OPOSICOES_EMP O
        JOIN PSW_EMPRESAS E ON E.CDGRUPO = O.CDEMPRESA LEFT JOIN PSW_MOTIVOS_OPO M ON M.CDMOTIVO = O.CDMOTIVO WHERE ${w.join(' AND ')} ORDER BY O.NRANO DESC, O.NRMES DESC, E.NMEMPRESA`, params: a, subtitulo: filtrosTexto(p) };
    },
  },
  {
    id: 'oposicoes_soc', titulo: 'Oposições de sócios', palavras: /\boposic/,
    colunas: [COL('NRINSCRICAO', 'Inscrição', 'int'), COL('NMSOCIO', 'Sócio'), COL('EMPRESA', 'Empresa'), COL('CDCONTRIBUICAO', 'Contrib.'), COL('COMPETENCIA', 'Referência'), COL('DTCARTA', 'Carta', 'data')],
    montar(p) {
      const w = ["COALESCE(O.INREGISTRO, 'O') = 'O'"]; const a = [];
      if (p.contribuicao) { w.push('O.CDCONTRIBUICAO = ?'); a.push(p.contribuicao); }
      if (p.ano) { w.push('O.NRANO = ?'); a.push(p.ano); }
      if (p.mes) { w.push('O.NRMES = ?'); a.push(p.mes); }
      return { sql: `SELECT O.NRINSCRICAO, S.NMSOCIO, E.NMABREVEMP AS EMPRESA, O.CDCONTRIBUICAO, LPAD(O.NRMES, 2, '0') || '/' || O.NRANO AS COMPETENCIA, O.DTCARTA FROM PSW_OPOSICOES_SOC O
        JOIN PSW_SOCIOS S ON S.NRINSCRICAO = O.NRINSCRICAO LEFT JOIN PSW_EMPRESAS E ON E.CDGRUPO = S.CDEMPRESA WHERE ${w.join(' AND ')} ORDER BY O.NRANO DESC, O.NRMES DESC, S.NMSOCIO`, params: a, subtitulo: filtrosTexto(p) };
    },
  },
  {
    id: 'socios', titulo: 'Sócios', palavras: /\b(socios?|socias?|filiados?|associados?|sindicalizados?)\b/,
    colunas: [COL('NRINSCRICAO', 'Inscrição', 'int'), COL('NMSOCIO', 'Nome'), COL('CDSEXO', 'Sexo'), COL('DTINSCRICAO', 'Filiação', 'data'), COL('DTNASCIMENTO', 'Nascimento', 'data'),
      COL('NMCIDADE', 'Cidade'), COL('CDUF', 'UF'), COL('INSITUACAO', 'Situação'), COL('EMPRESA', 'Empresa'), COL('NRCELULAR', 'Celular'), COL('QTDEP', 'Dep.', 'int'), COL('DEPENDENTES', 'Dependentes')],
    montar(p, texto) {
      const f = filtrosSocios(texto);
      const w = [...f.w]; const a = [...f.a]; const rot = [...f.rot];
      situacaoSocio(p, w, a, rot);
      let extra = ''; const aSel = [];
      if (f.comDependentes) { // mostra quantos e quais dependentes atendem ao filtro
        const c = f.depCond.c.length ? ` AND ${f.depCond.c.join(' AND ')}` : '';
        extra = `, (SELECT COUNT(*) FROM PSW_DEPENDENTES D WHERE D.NRINSCRSOC = S.NRINSCRICAO${c}) AS QTDEP,
          (SELECT CAST(LIST(TRIM(D.NMDEPENDENTE) || COALESCE(' (' || TRIM(D.DSPARENTESCO) || ')', ''), ', ') AS VARCHAR(2000)) FROM PSW_DEPENDENTES D WHERE D.NRINSCRSOC = S.NRINSCRICAO${c}) AS DEPENDENTES`;
        aSel.push(...f.depCond.ca, ...f.depCond.ca);
      }
      return { sql: `SELECT S.NRINSCRICAO, S.NMSOCIO, S.CDSEXO, S.DTINSCRICAO, S.DTNASCIMENTO, S.NMCIDADE, S.CDUF, S.INSITUACAO, E.NMABREVEMP AS EMPRESA, S.NRCELULAR${extra}
        FROM PSW_SOCIOS S LEFT JOIN PSW_EMPRESAS E ON E.CDGRUPO = S.CDEMPRESA WHERE ${w.join(' AND ')} ORDER BY ${f.ordem}S.NMSOCIO`, params: [...aSel, ...a], subtitulo: rot.join(' · '),
        ocultar: f.comDependentes ? ['NRCELULAR'] : [] };
    },
  },
  {
    id: 'empresas', titulo: 'Empresas', palavras: /\bempresas?\b(?!.*\b(contribui|boleto|oposic|pag|abert|debito))/,
    colunas: [COL('CDGRUPO', 'Código', 'int'), COL('NMEMPRESA', 'Empresa'), COL('NRCNPJ', 'CNPJ', 'cnpj'), COL('NMCIDADE', 'Cidade'), COL('NRFONE', 'Telefone'), COL('NRFUNCIONARIOS', 'Funcionários', 'int'), COL('NMEMAIL', 'E-mail')],
    totais: ['NRFUNCIONARIOS'],
    montar(p) {
      const sit = p.situacao || 'Ativa';
      return { sql: 'SELECT CDGRUPO, NMEMPRESA, NRCNPJ, NMCIDADE, NRFONE, NRFUNCIONARIOS, NMEMAIL FROM PSW_EMPRESAS WHERE INSITUACAO = ? ORDER BY NMEMPRESA', params: [sit], subtitulo: `Situação: ${sit}` };
    },
  },
  {
    id: 'sem_pagamento', titulo: 'Empresas ativas sem pagamento na competência', palavras: /\bempresas?\b.*\b(sem pagamento|nao pagaram|que nao pagou|sem contribui)|\b(nao pagaram|sem pagamento)\b/, precisa: ['contribuicao', 'competencia'],
    colunas: [COL('CDGRUPO', 'Código', 'int'), COL('NMEMPRESA', 'Empresa'), COL('NRCNPJ', 'CNPJ', 'cnpj'), COL('NRFONE', 'Telefone'), COL('NMEMAIL', 'E-mail')],
    montar(p) {
      return { sql: `SELECT E.CDGRUPO, E.NMEMPRESA, E.NRCNPJ, E.NRFONE, E.NMEMAIL FROM PSW_EMPRESAS E WHERE E.INSITUACAO = 'Ativa' AND NOT EXISTS (SELECT 1 FROM PSW_CONTRIBEMP C
        WHERE C.CDEMPRESA = E.CDGRUPO AND C.CDCONTRIBUICAO = ? AND C.NRANOEXERCICIO = ? AND C.NRMESEXERCICIO = ? AND C.DTPAGAMENTO IS NOT NULL) ORDER BY E.NMEMPRESA`,
        params: [p.contribuicao, p.ano, p.mes], subtitulo: `Contribuição ${p.contribuicao} · Referência ${String(p.mes).padStart(2, '0')}/${p.ano}` };
    },
  },
  {
    id: 'contrib_abertas', titulo: 'Contribuições de empresas em aberto', palavras: /\bcontribui.*\b(abert|pendente|nao pag|atras|devendo)|\b(abert|pendente|atras|inadimpl).*\bcontribui|\bempresas?\b.*\b(em aberto|devendo|inadimpl|em atraso)\b/,
    colunas: [COL('CDEMPRESA', 'Código', 'int'), COL('NMEMPRESA', 'Empresa'), COL('CDCONTRIBUICAO', 'Contrib.'), COL('COMPETENCIA', 'Referência'), COL('DTVENCIMENTO', 'Vencimento', 'data'), COL('VLPAGAMENTO', 'Valor', 'moeda'), COL('DSDOCUMENTO', 'Nosso número')],
    totais: ['VLPAGAMENTO'],
    montar(p) {
      const w = ['C.DTPAGAMENTO IS NULL']; const a = [];
      if (p.contribuicao) { w.push('C.CDCONTRIBUICAO = ?'); a.push(p.contribuicao); }
      if (p.mes && p.ano) { w.push('C.NRMESEXERCICIO = ? AND C.NRANOEXERCICIO = ?'); a.push(p.mes, p.ano); }
      if (p.de && p.ate) { w.push('C.DTVENCIMENTO BETWEEN ? AND ?'); a.push(p.de, p.ate); }
      if (p.codEmpresa) { w.push('C.CDEMPRESA = ?'); a.push(p.codEmpresa); }
      return { sql: `SELECT C.CDEMPRESA, E.NMEMPRESA, C.CDCONTRIBUICAO, LPAD(C.NRMESEXERCICIO, 2, '0') || '/' || C.NRANOEXERCICIO AS COMPETENCIA, C.DTVENCIMENTO, C.VLPAGAMENTO, C.DSDOCUMENTO
        FROM PSW_CONTRIBEMP C JOIN PSW_EMPRESAS E ON E.CDGRUPO = C.CDEMPRESA WHERE ${w.join(' AND ')} ORDER BY C.DTVENCIMENTO, E.NMEMPRESA`, params: a, subtitulo: filtrosTexto(p) };
    },
  },
  {
    id: 'contrib_pagas', titulo: 'Contribuições de empresas pagas', palavras: /\bcontribui.*\bpag|\bpag.*\bcontribui|\brecebid|\barrecad/,
    colunas: [COL('CDEMPRESA', 'Código', 'int'), COL('NMEMPRESA', 'Empresa'), COL('CDCONTRIBUICAO', 'Contrib.'), COL('COMPETENCIA', 'Referência'), COL('DTVENCIMENTO', 'Vencimento', 'data'), COL('DTPAGAMENTO', 'Pagamento', 'data'), COL('VLPAGAMENTO', 'Valor', 'moeda')],
    totais: ['VLPAGAMENTO'],
    montar(p) {
      const w = ['C.DTPAGAMENTO IS NOT NULL']; const a = [];
      let { de, ate } = p;
      if (!de && p.mes && p.ano && !p.porCompetencia) { de = `${p.ano}-${String(p.mes).padStart(2, '0')}-01`; ate = `${p.ano}-${String(p.mes).padStart(2, '0')}-${ultimoDia(p.ano, p.mes)}`; }
      if (!de) { const d = new Date(); de = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; ate = hojeISO(); }
      w.push('C.DTPAGAMENTO BETWEEN ? AND ?'); a.push(de, ate);
      if (p.contribuicao) { w.push('C.CDCONTRIBUICAO = ?'); a.push(p.contribuicao); }
      if (p.codEmpresa) { w.push('C.CDEMPRESA = ?'); a.push(p.codEmpresa); }
      return { sql: `SELECT C.CDEMPRESA, E.NMEMPRESA, C.CDCONTRIBUICAO, LPAD(C.NRMESEXERCICIO, 2, '0') || '/' || C.NRANOEXERCICIO AS COMPETENCIA, C.DTVENCIMENTO, C.DTPAGAMENTO, C.VLPAGAMENTO
        FROM PSW_CONTRIBEMP C JOIN PSW_EMPRESAS E ON E.CDGRUPO = C.CDEMPRESA WHERE ${w.join(' AND ')} ORDER BY C.DTPAGAMENTO, E.NMEMPRESA`, params: a,
        subtitulo: `Pagamentos de ${fmtData(de)} a ${fmtData(ate)}${p.contribuicao ? ` · Contribuição ${p.contribuicao}` : ''}${p.nomeEmpresa ? ` · ${p.nomeEmpresa}` : ''}` };
    },
  },
  {
    id: 'boletos_emitidos', titulo: 'Boletos de empresas emitidos', palavras: /\bboletos?\b.*\b(emitidos|gerados|lista|relatorio|relacao)\b|\b(relatorio|lista|relacao) de boletos?\b/,
    colunas: [COL('CDEMPRESA', 'Código', 'int'), COL('NMEMPRESA', 'Empresa'), COL('CDCONTRIBUICAO', 'Contrib.'), COL('COMPETENCIA', 'Referência'), COL('DTVENCIMENTO', 'Vencimento', 'data'), COL('VLPAGAMENTO', 'Valor', 'moeda'), COL('NRNOSSONUMERO', 'Nosso número'), COL('DTPAGAMENTO', 'Pago em', 'data')],
    totais: ['VLPAGAMENTO'],
    montar(p) {
      const w = []; const a = [];
      if (p.mes && p.ano) { w.push('B.NRMESEXERCICIO = ? AND B.NRANOEXERCICIO = ?'); a.push(p.mes, p.ano); }
      if (p.de && p.ate) { w.push('B.DTVENCIMENTO BETWEEN ? AND ?'); a.push(p.de, p.ate); }
      if (p.contribuicao) { w.push('B.CDCONTRIBUICAO = ?'); a.push(p.contribuicao); }
      if (p.codEmpresa) { w.push('B.CDEMPRESA = ?'); a.push(p.codEmpresa); }
      if (!w.length) { w.push('B.DTVENCIMENTO >= ?'); const d = new Date(); d.setDate(d.getDate() - 60); a.push(d.toISOString().slice(0, 10)); }
      return { sql: `SELECT B.CDEMPRESA, E.NMEMPRESA, B.CDCONTRIBUICAO, LPAD(B.NRMESEXERCICIO, 2, '0') || '/' || B.NRANOEXERCICIO AS COMPETENCIA, B.DTVENCIMENTO, C.VLPAGAMENTO, B.NRNOSSONUMERO, C.DTPAGAMENTO
        FROM PSW_BLOQUETOSEMP B JOIN PSW_CONTRIBEMP C ON C.CDEMPRESA = B.CDEMPRESA AND C.CDCONTRIBUICAO = B.CDCONTRIBUICAO AND C.NRANOEXERCICIO = B.NRANOEXERCICIO AND C.NRMESEXERCICIO = B.NRMESEXERCICIO AND C.DTVENCIMENTO = B.DTVENCIMENTO
        JOIN PSW_EMPRESAS E ON E.CDGRUPO = B.CDEMPRESA WHERE ${w.join(' AND ')} ORDER BY B.DTVENCIMENTO, E.NMEMPRESA`, params: a, subtitulo: filtrosTexto(p) || 'Vencimentos dos últimos 60 dias em diante' };
    },
  },
];

function filtrosTexto(p) {
  const f = [];
  if (p.contribuicao) f.push(`Contribuição ${p.contribuicao}`);
  if (p.mes && p.ano) f.push(`Referência ${String(p.mes).padStart(2, '0')}/${p.ano}`);
  else if (p.ano) f.push(`Ano ${p.ano}`);
  if (p.de && p.ate) f.push(`De ${fmtData(p.de)} a ${fmtData(p.ate)}`);
  if (p.nomeEmpresa) f.push(p.nomeEmpresa);
  return f.join(' · ');
}

// assuntos que nenhum modelo cobre: vão para o catálogo de relatórios do ProSindW
const FORA_DOS_MODELOS = /\b(convenio|conveniad|beneficio|lancament|mensalidade|anuidade|agenda|homolog|votac|desconto|recibo|etiqueta|carteirinh|cheque|caixa|estoque|nao socio|nao-socio|escritorio|acordo|carne)/;
function escolherRelatorio(texto) {
  const n = nrm(texto);
  const fora = FORA_DOS_MODELOS.exec(n);
  return RELATORIOS_BD.filter((r) => r.palavras.test(n) && (!r.aceita || r.aceita(n)) && !(fora && !(r.cobre && r.cobre.test(fora[0]))));
}

// ============================================================ tela do chat
const CH = { msgs: [], pendente: null, ocupado: false, contribs: null };
const SUGESTOES_CHAT = [
  'Gere um boleto de 300 reais com referência 08/2026 vencimento 10/10/2026 para a empresa 25',
  'Sócios do sexo masculino filiados a partir de 01/01/2020 que moram em SC e têm dependentes',
  'Contribuições em aberto da referência 08/2026',
  'Empresas ativas',
  'Aniversariantes de outubro',
  'Como emitir segunda via de boleto?',
];

function telaAssistente() {
  app.innerHTML = `
  <div class="cabecalho-pagina"><div><h1>Assistente</h1>
    <p>Peça boletos e relatórios com os dados do ProSindW ou tire dúvidas de uso.</p></div>
    <a class="botao sec" href="#config/banco">${ico('engrenagem')}Banco de dados</a></div>
  <div class="cartao chat">
    <div class="chat-msgs" id="ch-msgs" aria-live="polite"></div>
    <div class="chat-sug chips" id="ch-sug"></div>
    <form class="chat-entrada" id="ch-form" autocomplete="off">
      <textarea id="ch-q" rows="1" placeholder="Ex.: gere um boleto de 300 reais, referência 08/2026, vencimento 10/10/2026, empresa 25"></textarea>
      <button class="botao" type="submit" id="ch-env" aria-label="Enviar">${ico('enviar')}Enviar</button>
    </form>
  </div>`;
  const q = $('#ch-q');
  q.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#ch-form').requestSubmit(); } };
  q.oninput = () => { q.style.height = 'auto'; q.style.height = `${Math.min(140, q.scrollHeight)}px`; };
  $('#ch-form').onsubmit = (e) => { e.preventDefault(); const t = q.value.trim(); if (!t || CH.ocupado) return; q.value = ''; q.style.height = 'auto'; receber(t); };
  $('#ch-sug').innerHTML = SUGESTOES_CHAT.map((s) => `<button type="button" class="chip peq" data-s="${esc(s)}">${esc(s)}</button>`).join('');
  $$('#ch-sug .chip').forEach((b) => { b.onclick = () => receber(b.dataset.s); });
  if (!CH.msgs.length) {
    const aviso = Conector.ativo ? '' : '<p class="aviso">Para boletos e relatórios com dados do banco, abra o sistema pelo <strong>BaseDeApoio.exe</strong>. Sem ele, respondo só dúvidas da Ajuda.</p>';
    bot(`<p>Olá! Posso <strong>gerar boletos</strong> de contribuição de empresas, <strong>montar relatórios</strong> com os dados do ProSindW e <strong>responder dúvidas</strong> da Ajuda.</p>${aviso}
      <p class="sutil">Para boleto, diga o valor, a referência, o vencimento e a empresa (código, CNPJ ou nome).</p>`);
  } else desenharMsgs();
  setTimeout(() => q.focus(), 30);
  Conector.atualizar(false);
}

function desenharMsgs() {
  const box = $('#ch-msgs'); if (!box) return;
  box.innerHTML = CH.msgs.map((m, i) => `<div class="msg ${m.de}" data-i="${i}"><div class="bolha">${m.html}</div></div>`).join('');
  CH.msgs.forEach((m, i) => {
    const el = $(`.msg[data-i="${i}"] .bolha`, box);
    if (m.expirado) { $$('button', el).forEach((b) => { b.disabled = true; }); return; }
    if (m.ligar) m.ligar(el);
  });
  box.scrollTop = box.scrollHeight;
}
function eu(texto) {
  CH.msgs.forEach((m) => { if (m.de === 'bot' && m.ligar && !m.persistente) m.expirado = true; });
  CH.msgs.push({ de: 'eu', html: esc(texto).replace(/\n/g, '<br>') }); desenharMsgs();
}
function bot(html, ligar, persistente) { CH.msgs.push({ de: 'bot', html, ligar, persistente }); desenharMsgs(); }
function pensando() { CH.msgs.push({ de: 'bot', html: '<span class="digitando"><i></i><i></i><i></i></span>', temp: true }); desenharMsgs(); }
function parar() { CH.msgs = CH.msgs.filter((m) => !m.temp); }
function desativarBotoes(el) {
  $$('button', el).forEach((b) => { b.disabled = true; });
  const m = CH.msgs[+((el.closest('.msg') || {}).dataset || {}).i]; if (m) m.expirado = true;
}

async function receber(texto) {
  eu(texto);
  CH.ocupado = true; pensando();
  try {
    const p = CH.pendente;
    const nova = /\b(boleto|bloqueto|relat[oó]rio|lista|listagem)\b/i.test(texto) && (!p || texto.split(/\s+/).length > 3);
    if (p && !nova) { CH.pendente = null; await p.responder(texto); }
    else {
      CH.pendente = null;
      const it = intencao(texto);
      if (it === 'boleto') await fluxoBoleto(extrairBoleto(texto));
      else if (it === 'relatorio') await fluxoRelatorio(texto);
      else await fluxoAjuda(texto);
    }
  } catch (e) { parar(); bot(`<p class="erro-txt">${esc(e.message || String(e))}</p>`); }
  parar(); CH.ocupado = false; desenharMsgs();
}

function exigeConector() {
  if (Conector.ativo) return true;
  parar();
  bot(`<p>Para isso preciso do banco do ProSindW.</p><p>Abra o sistema pelo <strong>BaseDeApoio.exe</strong> (na pasta do sistema). Ele abre o navegador em <span class="mono">http://127.0.0.1:8765</span> e liga ao banco.</p>`);
  return false;
}

// ============================================================ fluxo: boleto
const ROTULOS_BOLETO = { empresa: 'Empresa', contribuicao: 'Contribuição', valor: 'Valor', referencia: 'Referência', vencimento: 'Vencimento' };

async function fluxoBoleto(pedido) {
  if (!exigeConector()) return;
  const a = await Conector.api('boleto/analisar', { body: pedido });
  parar();
  if (a.pedir) {
    const pg = a.pedir;
    const opcoes = pg.opcoes || [];
    bot(`<p>${esc(pg.texto)}</p>${opcoes.length ? `<div class="opcoes-chat">${opcoes.map((o, i) => `<button type="button" class="botao sec peq" data-i="${i}">${esc(o.rotulo)}${o.extra ? `<small>${esc(o.extra)}</small>` : ''}</button>`).join('')}</div>` : ''}`,
      (el) => { $$('.opcoes-chat button', el).forEach((b) => { b.onclick = () => { desativarBotoes(el); CH.pendente = null; const o = opcoes[+b.dataset.i]; aplicarResposta(pedido, pg.campo, o.valor, o.rotulo); }; }); });
    CH.pendente = { responder: (t) => aplicarResposta(pedido, pg.campo, t, t, true) };
    return;
  }
  if (!a.pode) {
    const conf = a.motivos.some((m) => /conferid/i.test(m));
    const benef = a.motivos.some((m) => /benefici[aá]rio/i.test(m));
    bot(`<p><strong>Não é possível gerar o boleto:</strong></p><ul class="lista-motivos">${a.motivos.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
      ${a.avisos.length ? `<ul class="lista-avisos">${a.avisos.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
      ${resumoBoleto(a.resumo)}
      ${conf || benef ? `<p><a class="botao sec peq" href="#config/banco">${ico('engrenagem')}Abrir Banco de dados</a></p>` : ''}`);
    return;
  }
  const r = a.resumo;
  bot(`<p>Confira antes de gravar no ProSindW:</p>${resumoBoleto(r)}
    ${a.avisos.length ? `<ul class="lista-avisos">${a.avisos.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
    ${a.confirmar.length ? `<ul class="lista-confirmar">${a.confirmar.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
    <div class="acoes"><button type="button" class="botao" data-a="gerar">${ico('checar')}Gerar boleto</button><button type="button" class="botao sec" data-a="cancelar">Cancelar</button></div>`,
  (el) => {
    $('[data-a=cancelar]', el).onclick = () => { desativarBotoes(el); bot('<p>Cancelado. Nada foi gravado.</p>'); };
    $('[data-a=gerar]', el).onclick = async () => {
      desativarBotoes(el); CH.ocupado = true; pensando();
      try { await gerarBoleto({ ...pedido, cod_empresa: r.empresa.codigo, contribuicao: r.contribuicao.codigo, confirmado: true }); } catch (e) { parar(); bot(`<p class="erro-txt">${esc(e.message)}</p>`); }
      parar(); CH.ocupado = false; desenharMsgs();
    };
  });
  CH.pendente = { responder: async (t) => { if (/^\s*(sim|s|ok|pode|gerar|confirmo|confirma)\b/i.test(t)) await gerarBoleto({ ...pedido, cod_empresa: r.empresa.codigo, contribuicao: r.contribuicao.codigo, confirmado: true }); else { parar(); bot('<p>Cancelado. Nada foi gravado.</p>'); } } };
}

async function aplicarResposta(pedido, campo, valor, rotulo, digitado) {
  const p = { ...pedido };
  if (campo === 'empresa') {
    if (digitado) { p.empresa = valor; delete p.cod_empresa; } else { p.cod_empresa = +valor; p.empresa = rotulo; }
  } else if (campo === 'contribuicao') p.contribuicao = valor;
  else if (campo === 'valor') p.valor = (extrairBoleto(`valor ${valor}`).valor || valor).trim();
  else p[campo] = String(valor).trim();
  if (!digitado) { eu(rotulo); CH.ocupado = true; pensando(); }
  try { await fluxoBoleto(p); } catch (e) { parar(); bot(`<p class="erro-txt">${esc(e.message)}</p>`); }
  if (!digitado) { parar(); CH.ocupado = false; desenharMsgs(); }
}

function resumoBoleto(r) {
  if (!r || !r.empresa || !r.empresa.codigo) return '';
  const linhas = [
    ['Empresa', `${r.empresa.codigo} - ${r.empresa.nome}${r.empresa.cnpj ? ` · ${fmtCNPJ(r.empresa.cnpj)}` : ''}`],
    r.contribuicao && r.contribuicao.codigo ? ['Contribuição', `${r.contribuicao.codigo} - ${r.contribuicao.descricao}`] : null,
    r.mes ? ['Referência', `${String(r.mes).padStart(2, '0')}/${r.ano}`] : null,
    r.vencimento ? ['Vencimento', r.vencimento] : null,
    r.valor ? ['Valor', `R$ ${fmtMoeda(r.valor_final || r.valor)}`] : null,
    r.contribuicao && r.contribuicao.banco ? ['Banco', `${r.contribuicao.banco}${r.contribuicao.nome_banco ? ` - ${r.contribuicao.nome_banco}` : ''}${r.perfil_banco ? ` · ${r.perfil_banco}` : ''}`] : null,
    r.beneficiario && r.beneficiario.nome ? ['Beneficiário', `${r.beneficiario.nome}${r.beneficiario.documento ? ` · ${fmtCNPJ(r.beneficiario.documento)}` : ''}`] : null,
  ].filter(Boolean);
  return `<table class="resumo-chat"><tbody>${linhas.map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`;
}

async function gerarBoleto(pedido) {
  const r = await Conector.api('boleto/gerar', { body: pedido });
  parar();
  if (!r.gerado) {
    const a = r.analise || { motivos: [] };
    bot(`<p><strong>Não foi possível gerar o boleto:</strong></p><ul class="lista-motivos">${(a.motivos || []).map((m) => `<li>${esc(m)}</li>`).join('') || '<li>Motivo não informado.</li>'}</ul>`);
    return;
  }
  const b = r.boleto;
  bot(`<p class="ok-txt"><strong>${ico('ok')} Boleto gerado e gravado no ProSindW.</strong></p>${resumoBoleto(b.resumo)}
    <table class="resumo-chat"><tbody><tr><th>Nosso número</th><td class="mono">${esc(b.nosso_numero)}</td></tr>
      ${b.linha_digitavel ? `<tr><th>Linha digitável</th><td class="mono">${esc(b.linha_digitavel)}</td></tr>` : ''}
      <tr><th>Arquivo</th><td class="mono">Arquivos gerados\\${esc(b.arquivo.replace(/\//g, '\\'))}</td></tr></tbody></table>
    <div class="acoes"><a class="botao" href="${esc(b.url)}" target="_blank" rel="noopener">${ico('documento')}Abrir PDF</a>
      <a class="botao sec" href="${esc(b.url)}&baixar=1">${ico('baixar')}Baixar</a>
      ${b.linha_digitavel ? `<button type="button" class="botao sec" data-a="copiar">${ico('copiar')}Copiar linha</button>` : ''}</div>`,
  (el) => { const c = $('[data-a=copiar]', el); if (c) c.onclick = () => copiar(b.linha_digitavel); }, true);
}

// ============================================================ fluxo: relatório
async function fluxoRelatorio(texto) {
  const cands = escolherRelatorio(texto);
  if (!cands.length) {
    // procura no catálogo de relatórios do ProSindW
    const r = await Motor.api(`/api/relatorios?q=${encodeURIComponent(texto.replace(/\b(relat[óo]rio|gere|gerar|me d[êe]|quero|preciso|lista(gem)?|de|do|da|dos|das)\b/gi, ' '))}`);
    parar();
    const top = (r.resultados || []).slice(0, 3);
    bot(`<p>Ainda não gero esse relatório aqui com os dados do banco.${top.length ? ' No ProSindW ele está em:' : ''}</p>
      ${top.map((x) => `<p><a href="#relatorios/${encodeURIComponent(x.id)}"><strong>${esc(x.titulo)}</strong></a><br><small class="sutil">${esc((x.menu && x.menu.caminho) || '')}</small></p>`).join('')}
      <p class="sutil">Gero aqui: ${RELATORIOS_BD.map((x) => esc(x.titulo)).join(' · ')}.</p>`);
    return;
  }
  if (!exigeConector()) return;
  const mod = cands[0];
  const p = extrairParams(texto);
  await prepararRelatorio(mod, p, texto);
}

async function carregarContribs() {
  if (!CH.contribs) { try { CH.contribs = (await Conector.api('contribuicoes')).itens; } catch { CH.contribs = []; } }
  return CH.contribs;
}

async function prepararRelatorio(mod, p, texto) {
  // contribuição: aceita código (CAS) ou parte do nome
  if (p.contribuicao || (mod.precisa || []).includes('contribuicao')) {
    const cs = await carregarContribs();
    if (p.contribuicao) {
      const alvo = cs.find((c) => c.codigo.toUpperCase() === p.contribuicao.toUpperCase()) || cs.find((c) => nrm(c.descricao).includes(nrm(p.contribuicao)));
      if (alvo) p.contribuicao = alvo.codigo; else if (!cs.length) p.contribuicao = p.contribuicao.toUpperCase(); else delete p.contribuicao;
    }
    if (!p.contribuicao) {
      const tokens = (texto.match(/\b[A-Z]{2,4}\b/g) || []).map((x) => x.toUpperCase());
      const alvo = cs.find((c) => tokens.includes(c.codigo.toUpperCase()));
      if (alvo) p.contribuicao = alvo.codigo;
    }
    if (!p.contribuicao && (mod.precisa || []).includes('contribuicao')) {
      parar();
      perguntar('Qual contribuição?', cs.filter((c) => c.situacao !== 'Inativa').map((c) => ({ valor: c.codigo, rotulo: `${c.codigo} - ${c.descricao}` })), (v) => { p.contribuicao = v; return prepararRelatorio(mod, p, texto); });
      return;
    }
  }
  if ((mod.precisa || []).includes('competencia') && !(p.mes && p.ano)) {
    parar();
    perguntar('Qual a referência (mm/aaaa)?', [], (v) => { const m = /(\d{1,2})\/(\d{4})/.exec(v); if (m) { p.mes = +m[1]; p.ano = +m[2]; } return prepararRelatorio(mod, p, texto); });
    return;
  }
  if (p.empresa || (mod.precisa || []).includes('empresa')) {
    if (!p.empresa) { parar(); perguntar('De qual empresa? (código, CNPJ ou nome)', [], (v) => { p.empresa = v; return prepararRelatorio(mod, p, texto); }); return; }
    if (!p.codEmpresa) {
      const lst = (await Conector.api(`empresas?q=${encodeURIComponent(p.empresa)}`)).itens;
      if (!lst.length) { parar(); bot(`<p>Empresa “${esc(p.empresa)}” não encontrada no ProSindW.</p>`); return; }
      if (lst.length > 1) {
        parar();
        perguntar(`Encontrei ${lst.length} empresas com “${p.empresa}”. Qual?`, lst.slice(0, 10).map((e) => ({ valor: String(e.codigo), rotulo: `${e.codigo} - ${e.nome}`, extra: e.situacao })), (v) => { const e = lst.find((x) => String(x.codigo) === v); p.codEmpresa = e.codigo; p.nomeEmpresa = `${e.codigo} - ${e.nome}`; return prepararRelatorio(mod, p, texto); });
        return;
      }
      p.codEmpresa = lst[0].codigo; p.nomeEmpresa = `${lst[0].codigo} - ${lst[0].nome}`;
    }
  }
  const q = mod.montar(p, texto);
  const res = await Conector.api('consulta', { body: { sql: q.sql, params: q.params, limite: 20000 } });
  parar();
  mostrarRelatorio(mod, q, res);
}

function perguntar(texto, opcoes, aoResponder) {
  bot(`<p>${esc(texto)}</p>${opcoes.length ? `<div class="opcoes-chat">${opcoes.map((o, i) => `<button type="button" class="botao sec peq" data-i="${i}">${esc(o.rotulo)}${o.extra ? `<small>${esc(o.extra)}</small>` : ''}</button>`).join('')}</div>` : ''}`,
    (el) => { $$('.opcoes-chat button', el).forEach((b) => { b.onclick = async () => { desativarBotoes(el); CH.pendente = null; const o = opcoes[+b.dataset.i]; eu(o.rotulo); CH.ocupado = true; pensando(); try { await aoResponder(o.valor); } catch (e) { parar(); bot(`<p class="erro-txt">${esc(e.message)}</p>`); } parar(); CH.ocupado = false; desenharMsgs(); }; }); });
  CH.pendente = { responder: (t) => aoResponder(t.trim()) };
}

function formatarCelula(v, tipo) {
  if (v === null || v === undefined) return '';
  if (tipo === 'data') return fmtData(v);
  if (tipo === 'moeda') return fmtMoeda(v);
  if (tipo === 'cnpj' || tipo === 'cpf') return fmtCNPJ(v);
  if (tipo === 'int') return String(v);
  return String(v);
}

function mostrarRelatorio(mod, q, res) {
  const idx = Object.fromEntries(res.colunas.map((c, i) => [c.toUpperCase(), i]));
  const cols = mod.colunas.filter((c) => idx[c.campo] !== undefined && !(q.ocultar || []).includes(c.campo));
  const linhas = res.linhas.map((l) => cols.map((c) => formatarCelula(l[idx[c.campo]], c.tipo)));
  let totais = null;
  if ((mod.totais || []).length && res.linhas.length) {
    totais = cols.map((c, j) => {
      if (!(mod.totais || []).includes(c.campo)) return j === 0 ? 'TOTAL' : '';
      const s = res.linhas.reduce((a, l) => a + (Number(l[idx[c.campo]]) || 0), 0);
      return c.tipo === 'moeda' ? fmtMoeda(s) : String(Math.round(s * 100) / 100);
    });
    if (mod.totais.includes(cols[0].campo)) totais[0] = `TOTAL ${totais[0]}`;
  }
  const alinhar = cols.map((c) => (['moeda', 'int'].includes(c.tipo) ? 'd' : ''));
  const dados = { titulo: mod.titulo, subtitulo: q.subtitulo || '', colunas: cols.map((c) => c.rotulo), alinhar, linhas, totais: totais || [] };
  const prev = linhas.slice(0, 15);
  bot(`<p><strong>${esc(mod.titulo)}</strong>${q.subtitulo ? `<br><small class="sutil">${esc(q.subtitulo)}</small>` : ''}</p>
    <p>${res.total ? `${fmtN(res.total)} registro(s)${res.cortado ? ` (mostrando ${fmtN(res.linhas.length)})` : ''}.` : 'Nenhum registro encontrado com esses filtros.'}</p>
    ${res.total ? `<div class="tabela-wrap tabela-chat"><table><thead><tr>${cols.map((c, j) => `<th class="${alinhar[j] ? 'num' : ''}">${esc(c.rotulo)}</th>`).join('')}</tr></thead>
      <tbody>${prev.map((l) => `<tr>${l.map((v, j) => `<td class="${alinhar[j] ? 'num' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('')}
      ${totais ? `<tr class="linha-total">${totais.map((v, j) => `<td class="${alinhar[j] ? 'num' : ''}">${esc(v)}</td>`).join('')}</tr>` : ''}</tbody></table></div>
      ${linhas.length > prev.length ? `<p class="sutil">Prévia das ${prev.length} primeiras linhas. O PDF e o Excel têm todas.</p>` : ''}
      <div class="acoes"><button type="button" class="botao" data-a="pdf">${ico('documento')}Gerar PDF</button><button type="button" class="botao sec" data-a="xlsx">${ico('baixar')}Excel</button></div>` : ''}`,
  (el) => {
    const bp = $('[data-a=pdf]', el);
    if (bp) bp.onclick = async () => {
      bp.disabled = true;
      try {
        const r = await Conector.api('relatorio/pdf', { body: { ...dados, arquivo: mod.titulo } });
        bot(`<p class="ok-txt"><strong>${ico('ok')} PDF gerado.</strong> <span class="mono">Arquivos gerados\\${esc(r.arquivo.replace(/\//g, '\\'))}</span></p>
          <div class="acoes"><a class="botao" href="${esc(r.url)}" target="_blank" rel="noopener">${ico('documento')}Abrir PDF</a><a class="botao sec" href="${esc(r.url)}&baixar=1">${ico('baixar')}Baixar</a></div>`);
      } catch (e) { bot(`<p class="erro-txt">${esc(e.message)}</p>`); }
      bp.disabled = false;
    };
    const bx = $('[data-a=xlsx]', el);
    if (bx) bx.onclick = () => excelRelatorio(dados).catch((e) => toast(e.message, 'erro'));
  }, true);
}

async function excelRelatorio(d) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(d.titulo.slice(0, 30).replace(/[\\/?*[\]:]/g, ''));
  ws.addRow([d.titulo]).font = { bold: true, size: 13 };
  if (d.subtitulo) ws.addRow([d.subtitulo]);
  ws.addRow([]);
  const cab = ws.addRow(d.colunas);
  cab.font = { bold: true }; cab.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F1FE' } }; });
  const num = (v, j) => (d.alinhar[j] === 'd' && /^-?[\d.]+(,\d+)?$/.test(v) ? Number(v.replace(/\./g, '').replace(',', '.')) : v);
  d.linhas.forEach((l) => ws.addRow(l.map(num)));
  if (d.totais.length) ws.addRow(d.totais.map(num)).font = { bold: true };
  d.colunas.forEach((c, j) => { ws.getColumn(j + 1).width = Math.min(45, Math.max(10, c.length + 2, ...d.linhas.slice(0, 300).map((l) => String(l[j] || '').length + 1))); if (d.alinhar[j] === 'd') ws.getColumn(j + 1).numFmt = '#,##0.00'; });
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `${d.titulo.replace(/[^\wÀ-ú -]/g, '').replace(/\s+/g, '_')}.xlsx`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ============================================================ fluxo: dúvidas (Ajuda)
async function fluxoAjuda(texto) {
  const r = await Motor.api(`/api/ajuda/buscar?q=${encodeURIComponent(texto)}`);
  parar();
  const d = r.melhor;
  if (!d) {
    bot(`<p>Não encontrei isso na Ajuda. Tente com outras palavras${Conector.ativo ? ', ou peça um boleto ou relatório' : ''}.</p>`);
    return;
  }
  let corpo = '';
  if (d.tipo === 'procedimento') corpo = `<ol>${(d.passos || []).slice(0, 8).map((p) => `<li>${esc(p)}</li>`).join('')}</ol>${d.atencao ? `<p class="lista-avisos-txt">⚠️ ${esc(String(d.atencao).split('\n')[0])}</p>` : ''}`;
  else if (d.tipo === 'pagina') corpo = `<p>${esc((d.blocos || []).slice(0, 3).join(' ').slice(0, 420))}…</p>`;
  else corpo = `<p>${esc(String(d.observacao || '').slice(0, 300))}</p>`;
  const link = d.tipo === 'procedimento' ? `#ajuda/procedimento/${d.id}` : d.tipo === 'layout' ? `#importacao/${encodeURIComponent(d.ref)}` : '#ajuda';
  const outros = (r.resultados || []).slice(1, 4);
  bot(`<p><strong>${esc(d.titulo)}</strong></p>${corpo}
    <p><a class="botao sec peq" href="${link}">Abrir na Área de ajuda${ico('seta')}</a></p>
    ${outros.length ? `<p class="sutil">Veja também: ${outros.map((x) => esc(x.titulo)).join(' · ')}</p>` : ''}`,
  (el) => { if (d.tipo === 'pagina') { const a = $('a.botao', el); a.onclick = (e) => { e.preventDefault(); A.q = texto; location.hash = 'ajuda'; setTimeout(() => { $('#aj-q').value = texto; buscarAjuda(texto); }, 50); }; } }, true);
}
