"""Gera dados/menu_<sistema>.js a partir do JSON do extrai_menu.py.

Uso:  python gera_menu.py menu_analise.json ../../dados/menu_prosindw.js [ProSindW]
Substituições de nomes: ../substituicoes.txt (mesmo formato do extrai_help.py).
As REGRAS (caminho provável pelo nome do arquivo) do arquivo de saída atual são mantidas.
"""
import json
import os
import re
import sys

ENTRADA, SAIDA = sys.argv[1], sys.argv[2]
SISTEMA = sys.argv[3] if len(sys.argv) > 3 else 'ProSindW'

REGRAS, MANTER = [], []
arq = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'substituicoes.txt')
if os.path.exists(arq):
    for linha in open(arq, encoding='utf-8'):
        linha = linha.strip()
        if not linha or linha.startswith('#') or ':' not in linha:
            continue
        tipo, resto = [x.strip() for x in linha.split(':', 1)]
        if tipo == 'manter':
            MANTER.append(re.compile(resto + r'$', re.I))
        elif tipo in ('texto', 'relatorio', 'menu') and '=>' in resto:
            a, b = [x.strip() for x in resto.split('=>', 1)]
            REGRAS.append((re.compile(a), b))


def san(s):
    if isinstance(s, list):
        return [san(x) for x in s]
    if isinstance(s, dict):
        return {k: san(v) for k, v in s.items()}
    if not isinstance(s, str):
        return s
    for rx, novo in REGRAS:
        base = s
        s = rx.sub(lambda m: m.group(0) if any(k.search(base[max(0, m.start() - 20):m.start()]) for k in MANTER) else novo, s)
    return s


itens = []
for r in json.load(open(ENTRADA, encoding='utf-8')):
    if r.get('visivel') is False:
        continue
    extra = {}
    if r.get('hint'):
        extra['dica'] = r['hint'].strip()
    if r.get('filtro'):
        extra['filtros'] = [f for f in r['filtro']['campos'] if f['rotulo']]
        if r['filtro'].get('titulo'):
            extra['tela'] = r['filtro']['titulo']
        if r['filtro'].get('origem') == 'formulario':
            extra['filtros_form'] = 1
    if r.get('titulos'):
        extra['titulos'] = r['titulos'][:3]
    if r.get('sql'):
        sql = r['sql']
        alias = {}
        for m in re.finditer(r'(?i)\b(?:FROM|JOIN)\s+([A-Z_][A-Z0-9_$]*)(?![\w.$])(?:\s+(?:AS\s+)?([A-Z_][A-Z0-9_]*))?', sql):
            tab, al = m.group(1).upper(), (m.group(2) or '').upper()
            if al in ('ON', 'WHERE', 'INNER', 'LEFT', 'RIGHT', 'JOIN', 'ORDER', 'GROUP', 'AND', 'OR'):
                al = ''
            alias[al or tab] = tab
            alias[tab] = tab
        tabelas = [t for t in dict.fromkeys(alias.values()) if not re.search(r'_AUX$|MULTI_AUX|_TEMP$', t)]
        if tabelas:
            extra['tabelas'] = tabelas[:12]
        campos = {}
        for m in re.finditer(r'\b([A-Z_][A-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)\b', sql.upper()):
            a, c = m.group(1), m.group(2)
            if a in alias and c not in campos:
                campos[c] = alias[a]
        if campos:
            extra['campos_tabela'] = campos
    itens.append([' > '.join(r['caminho']), r['arquivos'], extra])
itens = san(itens)

regras = '  REGRAS: [],\n'
if os.path.exists(SAIDA):
    atual = open(SAIDA, encoding='utf-8').read()
    if '  REGRAS: [' in atual:
        regras = atual[atual.index('  REGRAS: ['):atual.rindex('};')]

with open(SAIDA, 'w', encoding='utf-8') as f:
    f.write(f"""/* Menu de relatórios do {SISTEMA} — extraído do executável (árvore do menu, telas de filtro e arquivos de cada item).
   ITENS: [caminho, [arquivos], {{ dica, tela, filtros: [{{rotulo, opcoes}}], titulos }}]
   REGRAS: para arquivos que não aparecem em nenhum item, o caminho provável sai do nome do arquivo.
   Gerado por tools/menu/gera_menu.py — pode ser editado à mão. */
window.MENU_RELATORIOS = window.MENU_RELATORIOS || {{}};
window.MENU_RELATORIOS.{SISTEMA} = {{
  ITENS: {json.dumps(itens, ensure_ascii=False, indent=0)},
{regras}}};
""")
print(len(itens), 'itens gravados em', SAIDA)
