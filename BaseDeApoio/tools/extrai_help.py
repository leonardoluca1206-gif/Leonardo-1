"""Extrai layouts e páginas de ajuda do Help HTML para a carga inicial do sistema.

Uso:  python tools/extrai_help.py <pasta_Help> [pasta_do_sistema]
Gera layouts/*.json e conhecimento/ajuda_sistema.json.
Para recarregar no banco, apague dados/sistema.db e reinicie o sistema.
Substituições de nomes: crie tools/substituicoes.txt (formato abaixo).
"""
import re, glob, html, json, os, sys, unicodedata

SRC = sys.argv[1] if len(sys.argv) > 1 else 'Help'
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

# Substituições opcionais (nomes que não devem ir para o sistema), lidas de tools/substituicoes.txt:
#   texto: <regex> => <substituição>
#   manter: <regex do texto logo antes que impede a troca>
#   id: <IdAntigo> => <IdNovo>
REGRAS, MANTER, RENOMEIA = [], [], {}
_arq_regras = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'substituicoes.txt')
if os.path.exists(_arq_regras):
    for linha in open(_arq_regras, encoding='utf-8'):
        linha = linha.strip()
        if not linha or linha.startswith('#') or ':' not in linha:
            continue
        tipo, resto = linha.split(':', 1)
        tipo, resto = tipo.strip().lower(), resto.strip()
        if tipo == 'manter':
            MANTER.append(re.compile(resto + r'$', re.I))
        elif '=>' in resto:
            a, b = [x.strip() for x in resto.split('=>', 1)]
            if tipo == 'texto':
                REGRAS.append((re.compile(a), b))
            elif tipo == 'id':
                RENOMEIA[a] = b

_EMAIL = re.compile(r'[\w.+-]+@[\w-]+(?:\.[\w-]+)+')
_FONE = re.compile(r'\(?0?x{0,2}\d{2}\)?\s*\d{3,4}[- ]\d{4}')


def san(s):
    """Aplica as substituições e remove e-mails e telefones de contato."""
    s = re.sub(r'\s*no\s+\(\d{2}\)\s*[\d-]+\s+ou\s+atrav[ée]s\s+do\s+e-mail:\s*\S+@\S+', '', s)
    for rx, novo_txt in REGRAS:
        base = s
        def troca(m, base=base, novo_txt=novo_txt):
            antes = base[max(0, m.start() - 20):m.start()]
            return m.group(0) if any(k.search(antes) for k in MANTER) else novo_txt
        s = rx.sub(troca, s)
    s = '\n'.join(l for l in s.split('\n') if not _EMAIL.search(l))
    s = _FONE.sub('', s)
    s = re.sub(r'\s*In[íi]cio\s+Voltar\s*$', '', s)
    return s


def limpar_contatos(texto):
    """Remove blocos 'Contatos:' com nomes de pessoas de terceiros."""
    linhas, saida, pular = texto.split('\n'), [], 0
    for l in linhas:
        ls = l.strip()
        if re.fullmatch(r'Contatos?\s*:', ls, re.I):
            pular = 6
            continue
        if pular:
            if not ls or re.match(r'^(\d+\s*[.)-]|Layout|Observa|Arquivo|Tipo|In[íi]cio)', ls, re.I):
                pular = 0
            else:
                pular -= 1
                continue
        saida.append(l)
    return '\n'.join(saida)


def txt(frag):
    s = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', frag, flags=re.S | re.I)
    s = re.sub(r'<br\s*/?>|</p>|</li>|</h\d>|</div>|</tr>', '\n', s, flags=re.I)
    s = html.unescape(re.sub(r'<[^>]+>', ' ', s))
    s = s.replace('\xa0', ' ')
    s = re.sub(r'[ \t\r\f\v]+', ' ', s)
    s = re.sub(r'\n\s*', '\n', s)
    return san(s.strip())

def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'\s+', ' ', s).strip()

def cells(tr):
    return [re.sub(r'\s+', ' ', txt(c)).strip() for c in re.findall(r'<t[dh][^>]*>.*?</t[dh]>', tr, re.S | re.I)]

def mapa_colunas(h):
    m = {}
    for i, c in enumerate(h):
        n = norm(c)
        if 'posicao' in n or n in ('de - ate',):
            m.setdefault('pos', i)
        elif n.startswith('inicio') or n == 'de':
            m.setdefault('ini', i)
        elif n.startswith('fim') or n in ('ate',):
            m.setdefault('fim', i)
        elif n.startswith(('total', 'tam', 'qtde')):
            m.setdefault('tam', i)
        elif n.startswith('tipo'):
            m.setdefault('tipo', i)
        elif n.startswith(('formato', 'picture')):
            m.setdefault('fmt', i)
        elif n.startswith(('descri', 'conteudo')):
            m.setdefault('desc', i) if 'desc' not in m else m.setdefault('cont', i)
        elif n.startswith('campo'):
            m.setdefault('campo', i)
        elif n.startswith('seq'):
            m.setdefault('seq', i)
    return m

def eh_tabela_layout(m):
    return ('ini' in m or 'pos' in m) and ('desc' in m or 'campo' in m or 'cont' in m)

def num(s):
    s = re.sub(r'\D', '', s or '')
    return int(s) if s else None

def tipo_campo(tipo, fmt, desc):
    t = norm(tipo + ' ' + fmt)
    d = norm(desc)
    if 'data' in t or re.search(r'\b(ddmm|aaaamm|dd/mm|ddmmaa)', norm(fmt + ' ' + desc)) and 'data' in d:
        return 'data'
    if t.startswith('num') or re.match(r'^9', norm(fmt)) or 'numer' in t:
        return 'numerico'
    return 'texto'

def decimais(row_txt, fmt):
    n = norm(row_txt)
    for rx in (r'decima(?:l|is)\s*(\d)\b', r'\b(\d)\s*(?:casas\s*)?decima', r'com\s*(\d)\s*decima'):
        m = re.search(rx, n)
        if m:
            return int(m.group(1))
    m = re.search(r'v(9+)', norm(fmt))
    if m:
        return len(m.group(1))
    m = re.search(r'v9\((\d+)\)', norm(fmt))
    return int(m.group(1)) if m else 0

Q = r'[“"”]'


def fixo(desc, conteudo, tam=None):
    for s in (conteudo, desc):
        if not s:
            continue
        m = re.match(r'^\s*(?:fixo|constante|preencher com)?\s*' + Q + r'([^“"”]{0,60})' + Q + r'\s*$', s, re.I)
        if m:
            return m.group(1).strip()
        vals = re.findall(Q + r'([^“"”]{0,60})' + Q, s)
        if len(vals) == 1 and re.search(r'\b(fixo|literal|constante|brancos?)\b', s, re.I):
            return vals[0].strip()
        if len(vals) == 1 and tam and len(vals[0].strip()) == tam and not re.search(r'\b(ou|ex|exemplo)\b', s, re.I):
            return vals[0].strip()
    return None

def formato_data(fmt, desc):
    s = (fmt + ' ' + desc).upper()
    for p in ('DDMMAAAA', 'AAAAMMDD', 'DD/MM/AAAA', 'DDMMAA', 'AAMMDD', 'AAAAMM', 'MMAAAA', 'AAAA-MM-DD'):
        if p in s.replace(' ', ''):
            return p
    return None

def parse_tabela(tb):
    trs = re.findall(r'<tr[^>]*>.*?</tr>', tb, re.S | re.I)
    if not trs:
        return None
    h = cells(trs[0])
    m = mapa_colunas(h)
    if not eh_tabela_layout(m):
        return None
    campos = []
    g = lambda r, k: r[m[k]] if k in m and m[k] < len(r) else ''
    for tr in trs[1:]:
        r = cells(tr)
        if len(r) < 2 or not any(r):
            continue
        if 'pos' in m:
            ps = re.findall(r'\d+', g(r, 'pos'))
            ini = int(ps[0]) if ps else None
            fim = int(ps[1]) if len(ps) > 1 else ini
        else:
            ini, fim = num(g(r, 'ini')), num(g(r, 'fim'))
        tam = num(g(r, 'tam'))
        fmt = g(r, 'fmt')
        desc = g(r, 'desc')
        cont = g(r, 'cont')
        nome = g(r, 'campo')
        if nome and desc and nome != desc:
            descricao = f'{nome} — {desc}'
        else:
            descricao = nome or desc
        if cont and cont != desc:
            descricao = (descricao + ' — ' + cont) if descricao else cont
        if ini is None and not descricao:
            continue
        if ini is not None and fim is None and tam:
            fim = ini + tam - 1
        if tam is None and ini is not None and fim is not None:
            tam = fim - ini + 1
        if tam is None:
            mf = re.search(r'\((\d+)\)', fmt)
            tam = int(mf.group(1)) if mf else (len(fmt) if re.fullmatch(r'[9X]+', fmt or '') else None)
        tipo = g(r, 'tipo')
        rowt = ' '.join(r)
        c = dict(inicio=ini, fim=fim, tamanho=tam, tipo=tipo_campo(tipo, fmt, descricao),
                 formato=fmt, decimais=decimais(rowt, fmt), descricao=descricao[:500])
        nd_ = norm(descricao)
        if c['tipo'] == 'numerico' and c['decimais'] == 0 and (tam or 0) >= 9 \
                and re.match(r'^([a-z]\d{2,3}\s*[-–]\s*)?(valor|vl|vlr)\b', nd_) and not re.search(r'sem decima|inteiro', nd_):
            c['decimais'] = 2
            c['decimais_inferido'] = True
        fx = fixo(desc, cont, tam)
        if fx is not None:
            c['fixo'] = fx
        if c['tipo'] == 'data' or re.search(r'\bdata\b', norm(descricao)):
            fd = formato_data(fmt, descricao)
            if fd:
                c['tipo'] = 'data'
                c['formato_data'] = fd
        if re.search(r'\b(delimitador|separador|limitador)\b', norm(descricao)) and not re.search(r'decima', norm(descricao)) \
                and (tam in (None, 1)) and re.search(r'[;,|@]|ponto e virgula|virgula|pipe|tab', descricao + norm(descricao)):
            c['delimitador'] = True
        campos.append(c)
    return campos or None

def nome_registro(ctx):
    linhas = [l.strip() for l in ctx.split('\n') if l.strip()]
    for l in reversed(linhas[-6:]):
        if re.search(r'registro|header|trailler|trailer|detalhe|cabe[cç]alho|rodap', l, re.I) and len(l) < 160:
            return l
    return (linhas[-1][:120] if linhas else 'Registro')

def classifica(pid):
    p = pid.lower()
    if '_ret' in p or 'retdeb' in p or p.startswith('ret'):
        return 'retorno'
    if '_rem' in p or 'remdeb' in p:
        return 'remessa'
    if 'lancconf' in p or 'menconf' in p or 'conf' in p[:12] and p.startswith('mov'):
        return 'conferencia'
    if 'imp' in p and p.startswith('mov'):
        return 'importacao'
    if 'exp' in p and p.startswith('mov'):
        return 'exportacao'
    return 'outro'

MODULO = {'Mov': 'Movimentos', 'Cad': 'Cadastros', 'Blo': 'Boletos', 'Bloq': 'Boletos',
          'Conf': 'Configurações', 'Loc': 'Localizar', 'Uti': 'Utilitários', 'Menu': 'Menu',
          'Rel': 'Relatórios'}

def titulo(corpo, pid):
    m = re.findall(r'<h[1-4][^>]*>(.*?)</h[1-4]>', corpo, re.S | re.I)
    partes = [re.sub(r'\s+', ' ', txt(x)).strip() for x in m]
    partes = [x for x in partes if x and norm(x) not in ('sistema prosind',)]
    base = ' — '.join(dict.fromkeys(partes[:2])) if partes else ''
    t = txt(corpo)
    lin = [l.strip() for l in t.split('\n') if l.strip()][:15]
    extra = ''
    for i, l in enumerate(lin):
        if re.match(r'^Layout\b', l, re.I) and len(l) <= 90:
            extra = l
            if re.fullmatch(r'Layout\s*:?', l, re.I) and i + 1 < len(lin) and len(lin[i + 1]) <= 60 \
                    and not lin[i + 1].lower().startswith('observa'):
                extra = 'Layout ' + lin[i + 1]
            break
    if extra and not re.fullmatch(r'Layout\s*:?', extra, re.I) and norm(extra) not in norm(base):
        base = (base + ' — ' + extra) if base else extra
    base = re.sub(r'\s+(para|no|do) (o )?Sistema ProSind\b', '', base)
    base = base.strip().rstrip(':').strip()
    if base:
        return base[:180]
    t = re.sub(r'\s+', ' ', txt(corpo))
    t = re.sub(r'^Sistema ProSind\s*', '', t)
    return t[:90] or pid

paginas, layouts = [], []
for f in sorted(glob.glob(os.path.join(SRC, '*.htm'))):
    pid0 = os.path.splitext(os.path.basename(f))[0]
    pid = RENOMEIA.get(pid0, pid0)
    pid = re.sub(r'[^A-Za-z0-9_\-]+', '_', pid)
    raw = open(f, encoding='cp1252', errors='replace').read()
    corpo = re.sub(r'<head.*?</head>', '', raw, flags=re.S | re.I)
    texto = txt(corpo)
    texto = limpar_contatos(re.sub(r'^Sistema ProSind\s*', '', texto))
    tit = titulo(corpo, pid)
    pre = pid.split('_')[0] if '_' in pid else ''
    paginas.append(dict(id=pid, titulo=tit, modulo=MODULO.get(pre, 'Geral'), texto=texto))

    tabs = list(re.finditer(r'<table.*?</table>', corpo, re.S | re.I))
    registros, prev, ctx_extra = [], 0, ''
    for tm in tabs:
        ctx = ctx_extra + '\n' + txt(corpo[prev:tm.start()])
        prev = tm.end()
        campos = parse_tabela(tm.group(0))
        if campos is None:
            # tabela-título (ex.: DESCRIÇÃO DO REGISTRO "A")
            ctx_extra = txt(tm.group(0)) if len(re.findall(r'<tr', tm.group(0), re.I)) <= 2 else ''
            continue
        ctx_extra = ''
        delim = [c for c in campos if c.get('delimitador')]
        sem_pos = sum(1 for c in campos if c['fim'] is None or c['inicio'] is None)
        reg = dict(nome=nome_registro(ctx), campos=campos)
        if delim:
            d0 = norm(delim[0]['descricao'])
            d1 = delim[0]['descricao']
            sep = ';' if ('ponto e virgula' in d0 or ';' in d1) else '@' if '@' in d1 else '|' if '|' in d1 or 'pipe' in d0 else ',' if 'virgula' in d0 or ',' in d1 else ';'
            for c in delim:
                c['fixo'] = sep
            nao_delim_sem_pos = sum(1 for c in campos if not c.get('delimitador') and (c['fim'] is None or c['inicio'] is None))
            if nao_delim_sem_pos or re.search(r'\.csv\b|csv separado|separado por', texto, re.I):
                reg['separador'] = sep
        registros.append(reg)
    if not registros:
        continue
    arq = re.search(r'(?:O\s+)?Arquivo\s*:\s*([A-Za-z0-9_\-\.\(\)]{4,60})', texto, re.I)
    tipo_arq = re.search(r'Tipo\s*:\s*([^\n]{3,40})', texto)
    obs = re.search(r'Observa[çc][ãa]o\s*:?\s*(.{20,900}?)(?:\n(?:O\s+)?Arquivo\s*:|\nTipo\s*:|$)', texto, re.S | re.I)
    sep = next((r.get('separador') for r in registros if r.get('separador')), None)
    # tipo do registro (header/detalhe/trailer)
    for r in registros:
        n = norm(r['nome'])
        r['papel'] = 'header' if re.search(r'header|cabecalho|registro "?a"?\b|tipo 0?1\b|registro 0\b', n) else \
                     'trailer' if re.search(r'trail|rodape|registro "?z"?\b|tipo 0?9\b|totais', n) else 'detalhe'
    if len(registros) == 1:
        registros[0]['papel'] = 'detalhe'
    layouts.append(dict(
        id=pid, titulo=tit, categoria=classifica(pid), modulo=MODULO.get(pid.split('_')[0], 'Geral'),
        nome_arquivo=arq.group(1) if arq and re.search(r'[._]|AAAA|AAMM|MMAA|MMAAAA|AAAAMM', arq.group(1)) else '',
        tipo_arquivo=(tipo_arq.group(1).strip() if tipo_arq else ''),
        formato='delimitado' if sep else 'posicional', separador=sep or '',
        observacao=(obs.group(1).strip() if obs else texto[:600]).strip()[:1500],
        registros=registros, origem='ajuda'))

os.makedirs(os.path.join(OUT, 'layouts'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'conhecimento'), exist_ok=True)
json.dump(paginas, open(os.path.join(OUT, 'conhecimento', 'ajuda_sistema.json'), 'w', encoding='utf-8'), ensure_ascii=False)
for l in layouts:
    json.dump(l, open(os.path.join(OUT, 'layouts', l['id'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(paginas), 'páginas;', len(layouts), 'layouts;',
      sum(len(r['campos']) for l in layouts for r in l['registros']), 'campos')
