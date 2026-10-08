"""Extrai do executável do sistema (Delphi) a árvore do menu de relatórios, as telas de filtro
e os arquivos .frf/.fr3 que cada item usa.

Requisitos:  pip install pefile capstone
Uso:         python extrai_menu.py ProSindW.exe menu_analise.json
Depois:      python gera_menu.py menu_analise.json ../../dados/menu_prosindw.js
"""
import sys, os, struct, re, bisect, json, time, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vmt import Bin
import dfm
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

EXE = sys.argv[1] if len(sys.argv) > 1 else 'ProSindW.exe'
SAIDA = sys.argv[2] if len(sys.argv) > 2 else 'menu_analise.json'
b = Bin(EXE)
md = Cs(CS_ARCH_X86, CS_MODE_32)

# recursos DFM (formulários) do executável
DFMS = {}
b.pe.parse_data_directories(directories=[pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_RESOURCE']])
for t in b.pe.DIRECTORY_ENTRY_RESOURCE.entries:
    if pefile.RESOURCE_TYPE.get(t.struct.Id) == 'RT_RCDATA':
        for e in t.directory.entries:
            d = e.directory.entries[0].data.struct
            DFMS[str(e.name)] = b.pe.get_data(d.OffsetToData, d.Size)
classes, metodos = {}, {}
for nome, dados in DFMS.items():
    try:
        raiz = dfm.ler(dados)
    except Exception:
        continue
    v = b.vmt(raiz['classe'])
    if not v:
        continue
    classes[raiz['classe']] = v
    for n, ad in b.metodos(v).items():
        metodos.setdefault(ad, (raiz['classe'], n))
APP_MIN = min(a for a, (c, n) in metodos.items() if c.startswith('Tf') and c not in ('TfrDesignerForm',)) - 0x200000

_fim = {}
_inicios = sorted(metodos)
def fim_rotina(a, limite=150000):
    if a in _fim: return _fim[a]
    o = b.off(a); d = b.data; i = o
    k = bisect.bisect_right(_inicios, a)
    prox = _inicios[k] if k < len(_inicios) else None
    if prox is not None:
        limite = min(limite, max(8, prox - a))
    r = b.va(o + limite)
    while i < o + limite:
        if d[i:i+4] == b'\xff\xff\xff\xff':
            ln = struct.unpack_from('<I', d, i + 4)[0]
            if 0 < ln < 1000:
                r = b.va(i); break
        i += 1
    _fim[a] = r
    return r

_dis = {}
def instrucoes(a):
    if a in _dis: return _dis[a]
    f = fim_rotina(a); o = b.off(a)
    ins = list(md.disasm(b.data[o:o + (f - a)], a))
    _dis[a] = ins
    return ins

def literais(a):
    out = []
    for ins in instrucoes(a):
        for m in re.finditer(r'0x([0-9a-f]{6,8})', ins.op_str):
            v = int(m.group(1), 16)
            s = b.literal(v)
            if s is not None:
                out.append((ins.address, s))
    return out

def chamadas(a):
    out = []
    for ins in instrucoes(a):
        if ins.mnemonic == 'call' and ins.op_str.startswith('0x'):
            t = int(ins.op_str, 16)
            if APP_MIN <= t < b.cfim:
                out.append(t)
    return out

def alcancaveis(a, prof=3):
    vistos, fila = [], [(a, 0)]
    while fila:
        x, p = fila.pop(0)
        if x in vistos: continue
        vistos.append(x)
        if p < prof:
            for t in chamadas(x):
                fila.append((t, p + 1))
    return vistos

def dispatch_formshow(a):
    """Procura 'mov al, byte ptr [esi + D]' ... 'jmp dword ptr [eax*4 + T]' no início do FormShow."""
    ins = instrucoes(a)[:400]
    res = []
    for i, x in enumerate(ins):
        if x.mnemonic == 'jmp' and '*4 + 0x' in x.op_str:
            T = int(re.search(r'\*4 \+ (0x[0-9a-f]+)', x.op_str).group(1), 16)
            D = N = fimc = None
            for y in reversed(ins[max(0, i - 8):i]):
                if y.mnemonic == 'cmp' and N is None:
                    m = re.search(r', (0x[0-9a-f]+|\d+)$', y.op_str)
                    if m: N = int(m.group(1), 0)
                if y.mnemonic == 'ja' and fimc is None:
                    fimc = int(y.op_str, 16)
                if y.mnemonic in ('mov', 'movzx') and 'byte ptr [' in y.op_str and D is None:
                    m = re.search(r'\[(\w+) \+ (0x[0-9a-f]+)\]', y.op_str)
                    if m: D = int(m.group(2), 16)
            if D is not None and N is not None:
                tab = [b.u32(T + 4 * k) for k in range(N + 1)]
                res.append({'D': D, 'N': N, 'tabela': tab, 'fim': fimc})
    return res

def literais_ramo(inicio, fim_case):
    """Literais do ramo do case: do início até o primeiro 'jmp fim_case'."""
    o = b.off(inicio); out = []
    for ins in md.disasm(b.data[o:o + 6000], inicio):
        if ins.mnemonic == 'jmp' and ins.op_str.startswith('0x') and int(ins.op_str, 16) == fim_case:
            break
        if ins.mnemonic == 'ret':
            break
        for m in re.finditer(r'0x([0-9a-f]{6,8})', ins.op_str):
            s = b.literal(int(m.group(1), 16))
            if s is not None: out.append(s)
    return out

VMT2CLASSE = {v: c for c, v in classes.items()}
CREATE = None

def filtros_form(filtros_cat, rotinas):
    """Procura criação de form de filtro (mov eax,[ref]; call ...) seguida de 'mov byte ptr [eax + D], k'."""
    achados = []
    for r in rotinas:
        ins = instrucoes(r)
        cls = None
        for i, x in enumerate(ins):
            if x.mnemonic == 'mov' and x.op_str.startswith('eax, dword ptr [0x'):
                ref = int(re.search(r'\[(0x[0-9a-f]+)\]', x.op_str).group(1), 16)
                try:
                    v = b.u32(ref)
                except Exception:
                    v = None
                if v in VMT2CLASSE:
                    cls = VMT2CLASSE[v]
                elif ref in VMT2CLASSE:
                    cls = VMT2CLASSE[ref]
            m = re.match(r'byte ptr \[(\w+) \+ (0x[0-9a-f]+)\], (0x[0-9a-f]+|\d+)$', x.op_str) if x.mnemonic == 'mov' else None
            if m and cls:
                D, k = int(m.group(2), 16), int(m.group(3), 0)
                d = filtros_cat.get((cls, D))
                if d and k <= d['N']:
                    achados.append((cls, D, k, literais_ramo(d['tabela'][k], d['fim'])))
    return achados

def estruturar_filtro(lits):
    """['Sócios por Sexo:', 'Escolha o Sexo:', 'Masculino', ...] -> titulo + [{rotulo, opcoes}]"""
    if not lits: return None
    titulo = lits[0].rstrip(':').strip()
    campos, atual = [], None
    for s in lits[1:]:
        if s.endswith(':') and len(s) <= 40:
            atual = {'rotulo': s.rstrip(':').strip(), 'opcoes': []}
            campos.append(atual)
        elif atual is not None:
            for p in s.split('\r'):
                p = p.strip()
                if p and p not in atual['opcoes']:
                    atual['opcoes'].append(p)
    return {'titulo': titulo, 'campos': campos}

def classes_criadas(rotinas):
    """Formulários criados nas rotinas (mov eax, [ref da classe]; call ...Create)."""
    out = []
    for r in rotinas:
        for x in instrucoes(r):
            if x.mnemonic == 'mov' and x.op_str.startswith('eax, dword ptr [0x'):
                ref = int(re.search(r'\[(0x[0-9a-f]+)\]', x.op_str).group(1), 16)
                try:
                    v = b.u32(ref)
                except Exception:
                    v = None
                c = VMT2CLASSE.get(v) or VMT2CLASSE.get(ref)
                if c and c not in out:
                    out.append(c)
    return out

def filtro_dfm(cls):
    """Tela de filtro sem 'case' no FormShow: lê os controles visíveis do formulário (DFM)."""
    nome = next((k for k in DFMS if k.upper() == cls.upper()), None)
    if not nome:
        return None
    try:
        raiz = dfm.ler(DFMS[nome])
    except Exception:
        return None
    ctr = []
    def andar(c, dx=0, dy=0):
        for f in c['filhos']:
            pr = f['props']
            if pr.get('Visible', True) is False:
                continue
            x, y = dx + (pr.get('Left') or 0), dy + (pr.get('Top') or 0)
            ctr.append((f['classe'], pr, x, y))
            if f['filhos']:
                andar(f, x, y)
    andar(raiz)
    lim = lambda t: (t or '').replace('&', '').strip()
    campos, opcoes = [], []
    edits = [(cl, pr, x, y) for cl, pr, x, y in ctr if re.search(r'Edit|ComboBox|DateEdit|MaskEdit|SpinEdit|DBLookup', cl)]
    for cl, pr, x, y in ctr:
        cap = lim(pr.get('Caption'))
        if cl in ('TLabel', 'TRxLabel', 'TStaticText') and cap and not re.fullmatch(r'Label\w*', cap):
            viz = [e for e in edits if abs(e[3] - y) <= 8 and e[2] > x]
            itens = []
            if viz:
                e = min(viz, key=lambda e: e[2] - x)
                itens = [lim(i) for i in (e[1].get('Items.Strings') or []) if lim(i)]
            campos.append({'rotulo': cap.rstrip(':').strip(), 'opcoes': itens, '_yx': (y // 6, x)})
        elif cl in ('TRadioGroup', 'TGroupBox') and cap:
            itens = [lim(i) for i in (pr.get('Items.Strings') or []) if lim(i)]
            if not itens:
                itens = [lim(p2.get('Caption')) for c2, p2, x2, y2 in ctr if c2 in ('TRadioButton', 'TCheckBox') and lim(p2.get('Caption'))
                         and x <= x2 <= x + (pr.get('Width') or 0) and y <= y2 <= y + (pr.get('Height') or 0)]
            campos.append({'rotulo': cap.rstrip(':').strip(), 'opcoes': itens, '_yx': (y // 6, x)})
        elif cl in ('TCheckBox', 'TRadioButton') and cap:
            opcoes.append(cap)
    campos.sort(key=lambda c: c.pop('_yx', (0, 0)))
    vistos, limpos = set(), []
    for c in campos:
        if not c['rotulo'] or re.fullmatch(r'(?i)(anos?|meses|dias?|/|%|a|e|R\$)', c['rotulo']) or c['rotulo'].lower() in vistos:
            continue
        vistos.add(c['rotulo'].lower())
        limpos.append(c)
    campos = limpos
    usados = {o for c in campos for o in c['opcoes']}
    opcoes = [o for o in opcoes if o not in usados]
    if opcoes:
        campos.append({'rotulo': 'Opções', 'opcoes': opcoes})
    campos = [c for c in campos if c['rotulo']]
    if not campos:
        return None
    tit = lim(raiz['props'].get('Caption'))
    if re.fullmatch(r'f[A-Z]\w+', tit):
        tit = ''
    return {'titulo': tit, 'campos': campos, 'origem': 'formulario'}

filtros = {}
for cl, v in classes.items():
    ms_ = b.metodos(v)
    if 'FormShow' in ms_ and cl.startswith('TfRel'):
        for d in dispatch_formshow(ms_['FormShow']): filtros[(cl, d['D'])] = d
t = dfm.ler(DFMS['TFPRINCIPAL'])
itens = []
def walk(c, path):
    if c['classe'] == 'TMenuItem':
        cap = (c['props'].get('Caption') or '').replace('&', '').strip()
        if cap == '-': return
        p = path + [cap]
        filhos = [x for x in c['filhos'] if x['classe'] == 'TMenuItem']
        itens.append({'caminho': p, 'nome': c['nome'], 'hint': c['props'].get('Hint', ''), 'onclick': c['props'].get('OnClick'),
                      'folha': not filhos, 'visivel': c['props'].get('Visible', True)})
        for x in c['filhos']: walk(x, p)
    else:
        for x in c['filhos']: walk(x, path)
walk(t, [])
ms = b.metodos(classes[[c for c in classes if c.lower() == 'tfprincipal'][0]])
res = []
t0 = time.time()
for it in itens:
    if not it['folha'] or not it['onclick'] or it['caminho'][0] not in ('Relatórios', 'Bloquetos', 'Mala Direta'): continue
    a = ms.get(it['onclick'])
    if not a: continue
    nivel = [a]; vistos = {a}; arquivos = []; rotinas = [a]; prof_achado = None
    for prof in range(5):
        achou = []
        for r in nivel:
            fr = [s for _, s in literais(r) if re.search(r'\.fr[f3]$', s, re.I)]
            if fr: achou.append((r, fr))
        if achou:
            prof_achado = prof
            for r, fr in achou:
                arquivos += [x for x in fr if x not in arquivos]
                rotinas.append(r)
            break
        prox = []
        for r in nivel:
            for c in chamadas(r):
                if c not in vistos: vistos.add(c); prox.append(c)
        if not prox or len(prox) > 40: break
        if prof == 0: rotinas += prox
        nivel = prox
    fil = filtros_form(filtros, list(dict.fromkeys(rotinas)))
    sql = []
    for r in dict.fromkeys(rotinas):
        if r == a:
            continue
        sql += [x for _, x in literais(r) if re.search(r'(?i)\b(select|from|join|where|order by|group by)\b|^\s*,|^\s*\w\.\w+', x)]
    titulos = []
    for r in set(rotinas):
        titulos += [s for _, s in literais(r) if re.match(r'(?i)^(relat[óo]rio|rela[çc][ãa]o|lista|listagem|estat)', s) and len(s) < 120]
    filtro = estruturar_filtro(fil[0][3]) if fil else None
    if not filtro:
        for cls in classes_criadas(list(dict.fromkeys(rotinas))):
            if cls.startswith('TfRel') or cls.startswith('TfFiltro') or cls.startswith('TfPeriodo'):
                filtro = filtro_dfm(cls)
                if filtro:
                    break
    res.append({**it, 'arquivos': arquivos, 'profundidade': prof_achado, 'filtro': filtro,
                'sql': ' '.join(sql)[:20000],
                'titulos': list(dict.fromkeys(titulos))[:6]})
print(round(time.time() - t0), len(res), sum(1 for r in res if r['arquivos']), sum(1 for r in res if r['filtro']))
json.dump(res, open(SAIDA, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
c = collections.Counter(); tt = collections.Counter()
for r in res:
    k = ' > '.join(r['caminho'][:2]); tt[k] += 1
    if r['arquivos']: c[k] += 1
for k, v in tt.most_common(12): print(f'{k:55s} {c[k]}/{v}')
