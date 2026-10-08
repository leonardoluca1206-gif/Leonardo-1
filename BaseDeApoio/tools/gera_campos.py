"""Gera dados/campos_<sistema>.js com o tipo e as tabelas de origem dos campos usados nos relatórios.

Entrada: estrutura do banco extraída com  isql -x -ch WIN1252 ... -o estrutura.sql  (sem dados).
Uso:     python tools/gera_campos.py estrutura.sql dados/relatorios_prosindw.js dados/campos_prosindw.js [ProSindW]
"""
import collections
import json
import re
import sys

ESTRUTURA, RELATORIOS, SAIDA = sys.argv[1], sys.argv[2], sys.argv[3]
SISTEMA = sys.argv[4] if len(sys.argv) > 4 else 'ProSindW'

linhas = open(ESTRUTURA, encoding='cp1252', errors='replace').read().split('\n')
dominios, checks = {}, {}
for l in linhas:
    m = re.match(r'CREATE DOMAIN (\w+) AS (.+?);?\s*$', l)
    if m:
        tipo = m.group(2)
        dominios[m.group(1)] = re.sub(r'\s+(CHARACTER SET|COLLATE|DEFAULT|NOT NULL|CHECK).*', '', tipo).strip()
        c = re.search(r'CHECK\s*\((.*)\)', tipo)
        if c:
            checks[m.group(1)] = c.group(1)

tabelas, atual = {}, None
for l in linhas:
    if l.startswith('CREATE TABLE '):
        atual = l.split()[2].strip('(')
        tabelas[atual] = []
        continue
    if atual:
        if l.startswith(');'):
            atual = None
            continue
        m = re.match(r'\s*"?(\w+)"?\s+([A-Z_0-9]+(?:\s*\(\d+(?:,\s*\d+)?\))?)', l)
        if m and m.group(1) not in ('CONSTRAINT', 'PRIMARY', 'FOREIGN', 'UNIQUE', 'CHECK'):
            tabelas[atual].append((m.group(1), m.group(2).replace(' ', '')))


def legivel(t):
    dom = t if t in dominios else None
    if dom:
        t = dominios[t]
    t = t.upper().replace(' ', '')
    m = re.match(r'(VARCHAR|CHAR)\((\d+)\)', t)
    if m:
        return f'Texto ({m.group(2)})', dom
    m = re.match(r'(NUMERIC|DECIMAL)\((\d+),(\d+)\)', t)
    if m:
        return (f'Valor ({m.group(3)} decimais)' if int(m.group(3)) > 0 else f'Número ({m.group(2)} dígitos)'), dom
    if t.startswith('DATE'):
        return 'Data', dom
    if t.startswith('TIMESTAMP'):
        return 'Data e hora', dom
    if t.startswith('TIME'):
        return 'Hora', dom
    if t.startswith(('INTEGER', 'SMALLINT', 'BIGINT')):
        return 'Número inteiro', dom
    if t.startswith(('DOUBLE', 'FLOAT')):
        return 'Número decimal', dom
    if t.startswith('BLOB'):
        return ('Imagem/arquivo' if 'IMAGEM' in (dom or '') else 'Texto longo'), dom
    return t.title(), dom


porcol = collections.defaultdict(list)
for tb, cs in tabelas.items():
    for c, tp in cs:
        porcol[c].append((tb, tp))

txt = open(RELATORIOS, encoding='utf-8').read()
dados = json.loads(txt[txt.index('concat(') + 7:].rstrip().rstrip(');'))
codigos = {c['codigo'] for d in dados for c in d['campos']}
codigos |= {(a['codigo'] if isinstance(a, dict) else a) for d in dados for a in d.get('agrupamentos', [])}

saida = {}
for c in sorted(codigos):
    if c not in porcol:
        continue
    lst = sorted(porcol[c], key=lambda x: (not x[0].startswith('PSW_'), bool(re.search(r'_AUX|_TEMP|_LOG|TEMP', x[0])), len(x[0])))
    tipo, dom = legivel(lst[0][1])
    tabs = list(dict.fromkeys(x[0] for x in lst))
    e = {'tipo': tipo, 'tabelas': tabs[:3], 'n_tabelas': len(tabs)}
    if dom:
        e['dominio'] = dom
        if dom in checks:
            e['check'] = checks[dom][:120]
    saida[c] = e

with open(SAIDA, 'w', encoding='utf-8') as f:
    f.write('/* Tipo e tabelas de origem de cada campo usado nos relatórios (estrutura do banco, sem dados). */\n'
            f'window.CAMPOS_BD = window.CAMPOS_BD || {{}};\nwindow.CAMPOS_BD.{SISTEMA} = ')
    json.dump(saida, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')
print(len(tabelas), 'tabelas;', len(saida), 'campos descritos em', SAIDA)
