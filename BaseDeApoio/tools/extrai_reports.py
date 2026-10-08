"""Extrai o catálogo de relatórios (FastReport .frf / .fr3, consultas .sql, modelos .rtf) para a Central de Apoio.

Uso:  python tools/extrai_reports.py <pasta_Reports> <saida.js> [Sistema]
Ex.:  python tools/extrai_reports.py C:\\AgendaW\\Reports dados/relatorios_agendaw.js AgendaW
Gera um arquivo JS que acrescenta itens a window.DADOS_RELATORIOS (um arquivo por sistema;
inclua o <script> correspondente no index.html).
Substituições de nomes: tools/substituicoes.txt (mesmo formato do extrai_help.py).
"""
import json
import os
import re
import struct
import sys
import unicodedata
import xml.etree.ElementTree as ET
from collections import OrderedDict

SRC = sys.argv[1] if len(sys.argv) > 1 else 'Reports'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'relatorios.js'
SISTEMA = sys.argv[3] if len(sys.argv) > 3 else 'ProSindW'
INCLUIR_SQL = '--sql' in sys.argv  # por padrão só relatórios (.frf/.fr3)

# ---------------------------------------------------------------- substituições opcionais
REGRAS, MANTER = [], []
_arq = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'substituicoes.txt')
if os.path.exists(_arq):
    for linha in open(_arq, encoding='utf-8'):
        linha = linha.strip()
        if not linha or linha.startswith('#') or ':' not in linha:
            continue
        tipo, resto = [x.strip() for x in linha.split(':', 1)]
        if tipo == 'manter':
            MANTER.append(re.compile(resto + r'$', re.I))
        elif tipo in ('texto', 'relatorio') and '=>' in resto:
            a, b = [x.strip() for x in resto.split('=>', 1)]
            REGRAS.append((re.compile(a), b))


def san(s):
    if not isinstance(s, str):
        return s
    for rx, novo in REGRAS:
        base = s

        def troca(m, base=base, novo=novo):
            antes = base[max(0, m.start() - 20):m.start()]
            return m.group(0) if any(k.search(antes) for k in MANTER) else novo
        s = rx.sub(troca, s)
    return s


def norm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


# ---------------------------------------------------------------- descrição de campos
PREFIXOS = {'CD': 'Código', 'NM': 'Nome', 'NR': 'Número', 'DT': 'Data', 'VL': 'Valor', 'DS': 'Descrição',
            'IN': 'Indicador', 'TP': 'Tipo', 'QT': 'Quantidade', 'PC': 'Percentual', 'HR': 'Hora', 'FT': 'Foto'}
PALAVRAS = {
    'INSCRICAO': 'inscrição', 'SOCIOS': 'sócios', 'SOCIO': 'sócio', 'SOC': 'sócio', 'NAOSOCIOS': 'não sócios', 'NAOSOC': 'não sócio',
    'NSOC': 'não sócio', 'EMPRESAS': 'empresas', 'EMPRESA': 'empresa', 'ABREV': 'abreviado', 'CIDADE': 'cidade', 'CNPJ': 'CNPJ',
    'CPF': 'CPF', 'CADASTRO': 'cadastro/matrícula', 'GRUPO': 'grupo', 'PAGAMENTO': 'pagamento', 'PAGTO': 'pagamento',
    'PARCELAS': 'parcelas', 'PARCELA': 'parcela', 'SITUACAO': 'situação', 'TIPO': 'tipo', 'FONE': 'telefone', 'ENDERECO': 'endereço',
    'END': 'endereço', 'CONTRIBUICAO': 'contribuição', 'CONTRIB': 'contribuição', 'CONTR': 'contribuição', 'CEP': 'CEP',
    'VENCIMENTO': 'vencimento', 'VENCTO': 'vencimento', 'ANO': 'ano', 'MES': 'mês', 'MESES': 'meses', 'EXERCICIO': 'exercício',
    'UF': 'UF', 'BAIRRO': 'bairro', 'SEQUENCIA': 'sequência', 'DEPENDENTE': 'dependente', 'DEP': 'dependente', 'TOTAL': 'total',
    'ESCRITORIO': 'escritório', 'ESC': 'escritório', 'CONVENIADA': 'conveniada', 'CONVENIO': 'convênio', 'CONV': 'convênio',
    'DESCONTO': 'desconto', 'DESCONTADO': 'descontado', 'PAGO': 'pago', 'CLASSIFICACAO': 'classificação', 'NASCIMENTO': 'nascimento',
    'NASC': 'nascimento', 'DOCUMENTO': 'documento', 'DOC': 'documento', 'EMPREGADOS': 'empregados', 'TITULO': 'título',
    'JUROS': 'juros', 'BENEFICIO': 'benefício', 'BEN': 'benefício', 'CREDITADO': 'creditado', 'CREDITO': 'crédito', 'MULTA': 'multa',
    'TARIFA': 'tarifa', 'LOCALPAGTO': 'local de pagamento', 'LOCAL': 'local', 'TRAB': 'trabalho', 'CONVENCAO': 'convenção',
    'RECIBO': 'recibo', 'CELULAR': 'celular', 'SEXO': 'sexo', 'FUNCIONARIOS': 'funcionários', 'FUN': 'funcionários', 'PLANO': 'plano',
    'RAMO': 'ramo', 'ATIVIDADE': 'atividade', 'ATIV': 'atividade', 'ATRASO': 'atraso', 'ESTABELECIMENTO': 'estabelecimento',
    'ESTAB': 'estabelecimento', 'SETOR': 'setor', 'EMAIL': 'e-mail', 'FAX': 'fax', 'FUNCAO': 'função', 'PROCEDIMENTO': 'procedimento',
    'APOSENTADOS': 'aposentados', 'OBS': 'observação', 'FORMA': 'forma', 'RECEBEDOR': 'recebedor', 'CONTATO': 'contato',
    'CAPITAL': 'capital', 'SOCIAL': 'social', 'COMPLEMENTO': 'complemento', 'LIMITE': 'limite', 'AGENCIA': 'agência',
    'SIMULACAO': 'simulação', 'PARENTESCO': 'parentesco', 'VERSO': 'verso', 'INICIO': 'início', 'USUARIO': 'usuário',
    'ALT': 'alteração', 'ABERTO': 'em aberto', 'AFASTADOS': 'afastados', 'ATUALIZADOS': 'atualizados', 'PROXIMO': 'próximo',
    'IDENTIDADE': 'identidade', 'REG': 'registro', 'PROF': 'profissional', 'ESPECIALIDADE': 'especialidade',
    'RESPONSAVEL': 'responsável', 'INSTRUCOES': 'instruções', 'ARQUIVO': 'arquivo', 'TAXA': 'taxa', 'ASSOC': 'associado',
    'REFERENCIA': 'referência', 'MOTIVO': 'motivo', 'NOSSONUMERO': 'nosso número', 'CONTABANCO': 'conta bancária',
    'CONTA': 'conta', 'BANCO': 'banco', 'CARTEIRA': 'carteira', 'SERIE': 'série', 'DIFERENCA': 'diferença', 'EXTENSO': 'por extenso',
    'SACADO': 'sacado', 'LIQUIDO': 'líquido', 'ROTEIRO': 'roteiro', 'SITE': 'site', 'VIAS': 'vias', 'MENSALIDADE': 'mensalidade',
    'MENS': 'mensalidade', 'LANC': 'lançamento', 'PIS': 'PIS', 'COFINS': 'COFINS', 'CONTRSOC': 'contribuição social',
    'ENTIDADE': 'entidade', 'FILIADOS': 'filiados', 'FEM': 'feminino', 'MASC': 'masculino', 'MASCULINOS': 'masculinos',
    'FEMININOS': 'femininos', 'DEVOLUCAO': 'devolução', 'REGISTRO': 'registro', 'AUTORIZACAO': 'autorização',
    'LIBERADO': 'liberado', 'OPERACAO': 'operação', 'DESPESA': 'despesa', 'ACORDO': 'acordo', 'MOEDA': 'moeda', 'FILTRO': 'filtro',
    'PAI': 'pai', 'MAE': 'mãe', 'CALC': 'cálculo', 'VALOR': 'valor', 'NOME': 'nome', 'DATA': 'data', 'QTDE': 'quantidade',
    'QDADE': 'quantidade', 'QUANTIDADE': 'quantidade', 'ORIGINAL': 'original', 'ACRESCIMOS': 'acréscimos', 'CORRE': 'corrigido',
    'RECOLH': 'recolhimento', 'IMPRIMIR': 'imprimir', 'OUTROS': 'outros', 'SINDICATO': 'sindicato', 'SIND': 'sindicato',
    'CABECALHO': 'cabeçalho', 'RODAPE': 'rodapé', 'DIGCADASTRO': 'dígito do cadastro', 'DIG': 'dígito', 'SEQ': 'sequência',
    'ANOEXERCICIO': 'ano de exercício', 'MESEXERCICIO': 'mês de exercício', 'ADMISSAO': 'admissão', 'CARTA': 'carta',
    'NATURALIDADE': 'naturalidade', 'NACIONALIDADE': 'nacionalidade', 'ESTCIVIL': 'estado civil', 'CIVIL': 'civil',
    'SALARIO': 'salário', 'FAIXAS': 'faixa', 'ENTE': 'ente', 'SECAO': 'seção', 'TURNO': 'turno', 'SANGUE': 'sangue',
    'CATEGORIA': 'categoria', 'CARENCIA': 'carência', 'SOCIAL_': 'social', 'PENDENCIA': 'pendência', 'ANUIDADE': 'anuidade',
    'OPO': 'oposição', 'OPOSICAO': 'oposição', 'ASSUNTOASSEMB': 'assunto da assembleia', 'ASSEMB': 'assembleia',
    'CODSINDICAL': 'código sindical', 'EXTRATO': 'extrato', 'VALIDADE': 'validade', 'HISTORICO': 'histórico', 'CNAE': 'CNAE',
    'PADRAO': 'padrão', 'SIGLA': 'sigla', 'NUMERO': 'número', 'ENDERECOCED': 'endereço (cedente)', 'CED': 'cedente',
    'PROCED': 'procedimento', 'ACUMULADO': 'acumulado', 'ATUAL': 'atual', 'ANTERIOR': 'anterior', 'SALDO': 'saldo',
    'ENTRADA': 'entrada', 'SAIDA': 'saída', 'RATEIO': 'rateio', 'PERCENTUAL': 'percentual', 'SUBTOTAL': 'subtotal',
    'UTILIZACAO': 'utilização', 'EMISSAO': 'emissão', 'RG': 'RG', 'ABERTA': 'em aberto', 'IMPRESSAO': 'impressão',
    'AFASTAMENTO': 'afastamento', 'DEMISSAO': 'demissão', 'APOSENTADORIA': 'aposentadoria', 'VOTO': 'voto', 'VOTACAO': 'votação',
}
QUALIFICADORES = {'EMP': 'da empresa', 'ESC': 'do escritório', 'DEP': 'do dependente', 'SOC': 'do sócio', 'V': '(verso)',
                  'CED': '(cedente)', 'SIND': 'do sindicato', 'LOC': 'do local', 'CONV': 'do convênio'}
SEM_PREFIXO = {'cpf', 'CNPJ', 'CPF', 'CEP', 'UF', 'telefone', 'celular', 'fax', 'PIS', 'identidade', 'endereço', 'cidade',
               'bairro', 'e-mail', 'site', 'complemento', 'CNAE'}
_CHAVES = sorted(PALAVRAS, key=len, reverse=True)


def segmentar(txt):
    """Quebra um código (ex.: NMABREVEMP) em palavras conhecidas."""
    out, i = [], 0
    while i < len(txt):
        for k in _CHAVES:
            if txt.startswith(k, i):
                out.append(k)
                i += len(k)
                break
        else:
            m = re.match(r'\d+', txt[i:])
            if m:
                out.append(m.group(0))
                i += len(m.group(0))
            else:
                out.append(txt[i])
                i += 1
    # junta letras soltas
    res = []
    for p in out:
        if len(p) == 1 and p.isalpha() and res and not res[-1].isdigit() and res[-1] not in PALAVRAS:
            res[-1] += p
        elif len(p) == 1 and p.isalpha() and res and res[-1] in PALAVRAS and p != 'V':
            res.append(p)
        else:
            res.append(p)
    return res


def descrever(codigo):
    c = codigo.upper().strip()
    if c in ('CABECALHO', 'RODAPE'):
        return 'Cabeçalho/rodapé do sistema'
    if '_' in c:
        partes = [p for p in c.split('_') if p]
        return ' '.join(PALAVRAS.get(p, p.lower()) for p in partes).capitalize()
    if c in PALAVRAS:
        t = PALAVRAS[c]
        return t[:1].upper() + t[1:]
    pre = c[:2] if c[:2] in PREFIXOS and len(c) > 3 else ''
    resto = c[len(pre):]
    pal = segmentar(resto) if resto else []
    palavras, qual = [], ''
    for i, p in enumerate(pal):
        if i == len(pal) - 1 and i > 0 and p in QUALIFICADORES:
            qual = QUALIFICADORES[p]
            continue
        if p.isdigit():
            palavras.append(p)
        elif p in PALAVRAS:
            palavras.append(PALAVRAS[p])
        else:
            palavras.append(p.lower())
    corpo = ' '.join(palavras)
    if pre:
        base = PREFIXOS[pre]
        if pre == 'NM' and palavras and palavras[0] == 'abreviado':
            texto = 'Nome abreviado ' + ' '.join(palavras[1:])
        elif palavras and (palavras[0] in SEM_PREFIXO):
            texto = corpo
        elif pre == 'NR' and palavras and palavras[0] in ('sócios', 'empregados', 'funcionários', 'aposentados', 'afastados',
                                                          'filiados', 'não sócios', 'dependentes'):
            texto = 'Nº de ' + corpo
        else:
            texto = f'{base} {("de " + corpo) if corpo else ""}'.strip()
    else:
        texto = corpo or c.lower()
    if qual:
        texto += ' ' + qual
    texto = re.sub(r'\s+', ' ', texto).strip()
    return texto[:1].upper() + texto[1:]


# ---------------------------------------------------------------- título e assunto pelo nome do arquivo
ABREV = {
    'soc': 'Sócios', 'socio': 'Sócio', 'socios': 'Sócios', 'nsoc': 'Não Sócios', 'naosocio': 'Não Sócio', 'emp': 'Empresas',
    'esc': 'Escritórios', 'dep': 'Dependentes', 'conv': 'Conveniadas', 'contrib': 'Contribuições', 'mens': 'Mensalidades',
    'men': 'Mensalidades', 'pag': 'Pagamentos', 'pagto': 'Pagamentos', 'est': 'Estatística', 'lanc': 'Lançamentos',
    'bloq': 'Bloquetos', 'cid': 'Cidade', 'res': 'Resumo', 'opt': 'Opção', 'dt': 'Data', 'func': 'Função', 'classif': 'Classificação',
    'cad': 'Cadastro', 'abert': 'Aberto', 'ext': 'Extrato', 'pos': 'Posição', 'loc': 'Local', 'tp': 'Tipo', 'perc': 'Percentual',
    'periodo': 'Período', 'aposent': 'Aposentados', 'obs': 'Observação', 'cla': 'Classificação', 'cidcla': 'Cidade/Classificação',
    'demonst': 'Demonstrativo', 'benef': 'Benefícios', 'opo': 'Oposições', 'relacao': 'Relação', 'estatisticas': 'Estatísticas',
    'lancamentos': 'Lançamentos', 'beneficios': 'Benefícios', 'votacao': 'Votação', 'assembleia': 'Assembleia',
    'situacao': 'Situação', 'funcao': 'Função', 'convencao': 'Convenção', 'movimentacoes': 'Movimentações', 'geral': 'Geral',
    'emdia': 'Em Dia', 'socnsoc': 'Sócios/Não Sócios', 'socdep': 'Sócio/Dependente', 'empconv': 'Empresa/Conveniada',
    'locconv': 'Local/Conveniada', 'dtpag': 'Data de Pagamento', 'usuario': 'Usuário', 'formapagto': 'Forma de Pagamento',
}
ASSUNTOS = [
    ('Etiquetas e mala direta', r'etiqueta|mala'), ('Carteirinhas', r'carteir'), ('Recibos e comprovantes', r'recibo|comprovante'),
    ('Oposições', r'opo(s|\b|_)|oposi'), ('Votação e assembleias', r'vota|assemb|elei'), ('Acordos', r'acordo'),
    ('Bloquetos, guias e carnês', r'bloq|boleto|grcs|guia|carne|protocolo|verso'), ('Benefícios', r'benef'),
    ('Lançamentos e convênios', r'lan[cç]|conv(eniada)?|credit|procedim|laudo'), ('Estatísticas', r'estat|\best\b|contag'),
    ('Mensalidades', r'mens|\bmen\b|anuid'), ('Contribuições', r'contrib|pag_aberta|demonstrativo|rateio'),
    ('Pagamentos', r'pag'), ('Atrasos', r'atraso'), ('Fichas e cadastros', r'ficha|cadgeral|confere'),
    ('Empresas e escritórios', r'emp|escrit'), ('Dependentes', r'depend'), ('Sócios e não sócios', r'soc|nsoc|aposent|afastad|lista'),
    ('Documentos e cartas', r'carta|documento|oficio|notifica|atestado|cipa|autoriza'), ('Movimentações', r'mov'),
]


def titulo_arquivo(nome):
    base = re.sub(r'\.(frf|fr3|sql|rtf)$', '', nome, flags=re.I)
    base = re.sub(r'^fr(?=[A-Z])', '', base)
    partes = []
    for p in re.split(r'[_\s]+', base):
        for q in re.findall(r'[A-ZÀ-Ú]?[a-zà-ú0-9]+|[A-ZÀ-Ú]+(?![a-zà-ú])|\d+', p) or [p]:
            partes.append(q)
    out = []
    for p in partes:
        k = norm(p).replace(' ', '')
        out.append(ABREV.get(k, p[:1].upper() + p[1:]))
    return san(' '.join(out))


def assunto(nome):
    n = norm(re.sub(r'([a-z])([A-Z])', r'\1 \2', nome)).replace(' ', '_')
    for a, rx in ASSUNTOS:
        if re.search(rx, n):
            return a
    return 'Outros'


# ---------------------------------------------------------------- .frf (FastReport 2)
FONTES = {'Arial', 'MS Sans Serif', 'Courier New', 'Times New Roman', 'Tahoma', 'Verdana', 'Calibri', 'Arial Black',
          'Arial Narrow', 'Courier', 'Microsoft Sans Serif', 'Segoe UI', 'Century Gothic', 'Lucida Console', 'Garamond',
          'Book Antiqua', 'Comic Sans MS', 'Impact', 'Georgia', 'Trebuchet MS', 'Code 128', 'Wingdings', 'Symbol'}
REF = re.compile(r'\[?([A-Za-z_][A-Za-z0-9_]*)\."([^"\]]+)"')


def strings_frf(b):
    out, i, n = [], 0, len(b)
    while i < n - 3:
        L = b[i] | (b[i + 1] << 8)
        if 1 <= L <= 8000 and i + 2 + L < n and b[i + 2 + L] in (0, 13):
            s = b[i + 2:i + 2 + L]
            if all(x >= 32 or x in (9, 10) for x in s):
                # "01 00 27 00 texto": o contador de linhas do memo parece string de 1 caractere
                if L <= 2 and i + 4 < n:
                    L2 = b[i + 2] | (b[i + 3] << 8)
                    if L2 > L and i + 4 + L2 < n and b[i + 4 + L2] in (0, 13) and \
                            all(x >= 32 or x in (9, 10) for x in b[i + 4:i + 4 + L2]):
                        i += 2
                        continue
                out.append((i, s.decode('cp1252', 'replace'), i + 3 + L))
                i += 3 + L
                continue
        i += 1
    return out


def objetos_frf(b):
    ss = strings_frf(b)
    objs = []
    atual = None
    ultimo_tipo = None
    fim_cab = -1
    for off, s, fim in ss:
        if len(s) <= 2 and off < fim_cab:
            continue  # byte de propriedade logo após as coordenadas (ex.: 'd' = 100)
        coords = None
        if re.fullmatch(r'[A-Za-zÀ-ú_][A-Za-zÀ-ú0-9_ ]{0,60}', s) and fim + 22 <= len(b) and b[fim] == 2:
            x, y, dx, dy = struct.unpack('<4i', b[fim + 2:fim + 18])
            if -2000 < x < 20000 and -2000 < y < 40000 and 0 <= dx < 20000 and 0 <= dy < 40000:
                coords = (x, y, dx, dy)
        if s.startswith('Tfr') and s.endswith(('Control', 'View', 'Object')):
            ultimo_tipo = s
            continue
        if coords:
            fim_cab = fim + 18 + 26
            gt = b[off - 6] if off >= 6 else None      # 0 memo, 1 figura, 2 banda, 4 linha, 10 extra
            atual = {'nome': s, 'x': coords[0], 'y': coords[1], 'dx': coords[2], 'dy': coords[3], 'tipo': ultimo_tipo,
                     'textos': [], 'gt': gt, 'pag': b[off - 5] if off >= 5 else 0,
                     'banda': (b[fim + 20] | (b[fim + 21] << 8)) if gt == 2 else None}
            ultimo_tipo = None
            objs.append(atual)
        elif atual is not None:
            if s in FONTES:
                continue
            atual['textos'].append(s)
        else:
            objs.append({'nome': '', 'x': 0, 'y': 0, 'dx': 0, 'dy': 0, 'tipo': None, 'textos': [s], 'gt': None, 'pag': 0,
                         'banda': None})
    return objs


def eh_script(t):
    return bool(re.match(r'^\s*(begin|end\b|if\s|else|then|var\s|//)', t, re.I)) or ':=' in t or t.strip().endswith(';') \
        or bool(re.search(r'(?i)\)\s*then\b', t))


AGREG = re.compile(r'\b(SUM|COUNT|AVG|MAX|MIN)\s*\(', re.I)
BANDA_DADOS = (5, 8, 11)          # dados mestre / detalhe / subdetalhe
BANDA_TOTAL = (1, 6, 9, 12, 17)   # sumário, rodapés mestre/detalhe/subdetalhe/grupo
BANDA_GRUPO = 16
NOMES_BANDA = ('band', 'grupo', 'rodap', 'sum', 'cabe', 'detal', 'master', 'group', 'dadosmestre', 'dadosde', 'filha')


def calculado(texto, refs):
    """[[A]+[B]] ou [SUM([A]+[B])]: uma única expressão com mais de um campo."""
    t = texto.strip()
    return len(refs) > 1 and t.startswith('[') and t.endswith(']') and bool(re.search(r'"\]\s*[-+*/]\s*\[', t)) \
        and not re.search(r'"\]\s+-\s+\[', t)


def ler_frf(caminho):
    b = open(caminho, 'rb').read()
    objs = objetos_frf(b)
    campos, agrup, totais, opcoes = OrderedDict(), [], [], []
    memos_dados, memos_rot, memos_agr = [], [], []
    bandas = []
    titulo_memo = ''
    for o in objs:
        nome = o['nome']
        textos = [t for t in o['textos'] if t.strip()]
        tipo = o['tipo'] or ''
        if 'Control' in tipo:
            if 'Button' in tipo:
                continue
            for t in textos:
                if not eh_script(t) and not t.startswith('&') and len(t) < 80:
                    opcoes.append(t.strip().rstrip(':'))
            continue
        if o['gt'] == 2 or (o['gt'] is None and nome.lower().startswith(NOMES_BANDA)):
            bandas.append(o)
            for t in textos:
                for ds, f in REF.findall(t):
                    agrup.append(f)
            continue
        if o['gt'] in (1, 4):  # figura, linha
            continue
        textos = [t for t in textos if not eh_script(t)]
        if any(REF.search(t) for t in textos):  # memo de dados: descarta nomes de componentes gravados depois do texto
            textos = [t for i, t in enumerate(textos) if i == 0 or REF.search(t) or not re.fullmatch(r'\s*[A-Za-z_][\w.]*(\s+[A-Za-z_]\w*)?\s*', t)]
        texto = ' '.join(textos)
        if not texto:
            continue
        if nome.lower() == 'memotitulo' and '[' not in texto:
            titulo_memo = texto
        refs = [(ds, f) for ds, f in REF.findall(texto) if f.upper() not in ('CABECALHO', 'RODAPE')]
        if AGREG.search(texto):
            totais.append(texto[:80])
            memos_agr.append((o, texto, refs))
            for ds, f in refs:
                campos.setdefault(f.upper(), {'codigo': f.upper(), 'dataset': ds, 'rotulo': '', 'x': o['x'], 'y': o['y'], 'expr': ''})
            continue
        if refs:
            o['refs'], o['texto'] = [f.upper() for _, f in refs], texto
            o['calc'] = calculado(texto, refs)
            memos_dados.append(o)
            for ds, f in refs:
                c = campos.get(f.upper())
                if c is None or (c.get('_calc') and not o['calc']):
                    campos[f.upper()] = {'codigo': f.upper(), 'dataset': ds, 'rotulo': '', 'x': o['x'], 'y': o['y'],
                                         'expr': texto[:80] if texto.strip() != f'[{ds}."{f}"]' else '', '_calc': o['calc']}
        elif not texto.startswith('[') and 'ProSind' not in texto and len(texto) <= 60 \
                and (nome.lower().startswith(('memo', 'texto', 'label', 'titulo', 'lbl')) or 'Memo' in tipo):
            memos_rot.append((o, texto))

    def banda_de(o):
        for bd in bandas:
            if bd['pag'] == o['pag'] and bd['y'] - 2 <= o['y'] < bd['y'] + max(bd['dy'], 1) + 2:
                return bd
        return None

    def rotulo_acima(o, limite=140):
        melhor, sc, rm = None, 0, None
        for r, t in memos_rot:
            if r['pag'] != o['pag'] or r['y'] >= o['y'] or o['y'] - r['y'] > limite \
                    or not (re.search(r'[A-Za-zÀ-ú]{2}', t) or re.fullmatch(r'\d{1,2}', t.strip())):
                continue
            ov = min(o['x'] + o['dx'], r['x'] + r['dx']) - max(o['x'], r['x'])
            if ov > 0:
                s = ov / max(1, min(o['dx'], r['dx'])) - (o['y'] - r['y']) / 200
                if s > sc:
                    melhor, sc, rm = t, s, r
        grupo = ''
        if rm is not None:
            for r, t in memos_rot:  # cabeçalho de grupo acima (ex.: "MESES" sobre 01..12)
                if r is rm or r['pag'] != o['pag'] or r['y'] >= rm['y'] or rm['y'] - r['y'] > 40 or r['dx'] < rm['dx'] - 2:
                    continue
                if min(o['x'] + o['dx'], r['x'] + r['dx']) - max(o['x'], r['x']) > 0 and re.search(r'[A-Za-zÀ-ú]{2}', t):
                    grupo = t
                    break
        return melhor, grupo

    for o in memos_dados:
        rot, grupo = rotulo_acima(o)
        o['rotulo'], o['grupo'] = rot or '', grupo
        for f in o['refs']:
            c = campos[f]
            if rot and not c['rotulo'] and not (o['calc'] and not c.get('_calc')):
                c['rotulo'] = rot
                if grupo:
                    c['grupo'] = grupo
    for c in campos.values():
        c.pop('_calc', None)

    # ------------------------------------------------ layout: banda de dados, colunas, grupos e totais
    layout = None
    pdados = {}
    for o in memos_dados:
        bd = banda_de(o)
        if bd is not None:
            pdados.setdefault(id(bd), [bd, []])[1].append(o)
    if pdados:
        cand = sorted(pdados.values(), key=lambda v: (v[0]['banda'] in BANDA_DADOS, len(v[1])), reverse=True)
        bd, mems = cand[0]
        estaticos = []
        for r, t in memos_rot:
            if banda_de(r) is bd:
                r['texto'], r['refs'], r['calc'] = t, [], False
                estaticos.append(r)
        todos = sorted(mems + estaticos, key=lambda o: (o['x'], o['y']))
        ys = sorted({o['y'] for o in todos})
        faixas = []
        for y in ys:  # sub-linhas da banda (tolerância de 4 pontos)
            if not faixas or y - faixas[-1][-1] > 4:
                faixas.append([y])
            else:
                faixas[-1].append(y)
        faixas = faixas[:4]
        sub = lambda o: next((i for i, f in enumerate(faixas) if o['y'] in f), None)
        cols = []
        for o in todos:
            if sub(o) is None:
                continue
            alvo = None
            for c in cols:
                ov = min(o['x'] + o['dx'], c['x'] + c['dx']) - max(o['x'], c['x'])
                if ov > min(o['dx'], c['dx']) / 2:
                    alvo = c
                    break
            if alvo is None:
                alvo = {'x': o['x'], 'dx': o['dx'], 'mem': []}
                cols.append(alvo)
            alvo['mem'].append(o)
        cols = [c for c in cols if any(m['refs'] for m in c['mem'])] if len(cols) > 16 else cols
        cols = sorted(cols, key=lambda c: c['x'])[:16]
        colunas = []
        for c in cols:
            base = next((m for m in sorted(c['mem'], key=lambda m: m['y']) if m['refs']), sorted(c['mem'], key=lambda m: m['y'])[0])
            rot, grupo = (base.get('rotulo'), base.get('grupo')) if base['refs'] else rotulo_acima(base)
            col = {'rotulo': rot or '', 'cel': [None] * len(faixas), 'x': c['x'], 'dx': c['dx']}
            if grupo:
                col['grupo'] = grupo
            for m in c['mem']:
                i = sub(m)
                if col['cel'][i] is not None:
                    continue
                if not m['refs']:
                    col['cel'][i] = {'t': m['texto']}
                    continue
                cel = {'c': list(OrderedDict.fromkeys(m['refs']))}
                if not re.fullmatch(r'\[\w+\."\w+"\]', m['texto'].strip()):
                    cel['e'] = m['texto'][:400]
                if m['calc']:
                    ops = set(re.findall(r'"\]\s*([-+*/])\s*\[', m['texto']))
                    cel['calc'] = 'soma' if ops == {'+'} else True
                col['cel'][i] = cel
            colunas.append(col)
        # numéricos (01..12) sem cabeçalho de grupo herdam o do vizinho
        gr = next((c['grupo'] for c in colunas if c.get('grupo') and re.fullmatch(r'\d{1,2}', c['rotulo'].strip())), '')
        for c in colunas:
            if gr and not c.get('grupo') and re.fullmatch(r'\d{1,2}', c['rotulo'].strip()):
                c['grupo'] = gr
        for c in colunas:  # grupo herdado também nos campos
            for cel in c['cel']:
                if c.get('grupo') and cel and cel.get('c') and not cel.get('calc') and len(cel['c']) == 1:
                    campos[cel['c'][0]].setdefault('grupo', c['grupo'])
        # totais: agregações em bandas de rodapé/sumário alinhadas com a coluna
        tot_rot = ''
        for o, texto, refs in memos_agr:
            bt = banda_de(o)
            if bt is None or bt['pag'] != bd['pag'] or bt['y'] <= bd['y'] or (bt['banda'] is not None and bt['banda'] not in BANDA_TOTAL):
                continue
            fn = AGREG.search(texto).group(1).upper()
            for col in colunas:
                if min(o['x'] + o['dx'], col['x'] + col['dx']) - max(o['x'], col['x']) > min(o['dx'], col['dx']) / 2:
                    col.setdefault('total', fn)
                    break
            if not tot_rot:
                esq = [(r, t) for r, t in memos_rot if banda_de(r) is bt and r['x'] < o['x'] and re.search(r'[A-Za-zÀ-ú]{3}', t)]
                if esq:
                    tot_rot = sorted(esq, key=lambda z: (z[0]['y'], z[0]['x']))[0][1]
        cab = {c['rotulo'] for c in colunas} | {c.get('grupo') for c in colunas}
        grupos = []
        for g in sorted([x for x in bandas if x['banda'] == BANDA_GRUPO and x['pag'] == bd['pag'] and x['y'] < bd['y']], key=lambda x: x['y']):
            itens = [(r['y'] // 8, r['x'], {'t': t}) for r, t in memos_rot if banda_de(r) is g and t not in cab] + \
                    [(m['y'] // 8, m['x'], {'e': m['texto'][:400], 'c': m['refs']}) for m in memos_dados if banda_de(m) is g]
            if any('e' in i for _, _, i in itens):
                grupos.append([i for _, _, i in sorted(itens, key=lambda z: (z[0], z[1]))][:8])
        layout = {'colunas': colunas}
        if grupos:
            layout['grupos'] = grupos[:3]
        if tot_rot:
            layout['total_rotulo'] = tot_rot

    rotulos = list(OrderedDict.fromkeys(t for _, t in memos_rot))
    d = {
        'formato': 'FastReport 2 (.frf)', 'titulo_interno': titulo_memo,
        'campos': list(campos.values()), 'rotulos': rotulos[:60], 'agrupamentos': list(OrderedDict.fromkeys(agrup)),
        'totais': list(OrderedDict.fromkeys(totais))[:12], 'opcoes': list(OrderedDict.fromkeys(opcoes))[:30],
    }
    if layout and layout['colunas']:
        d['layout'] = layout
    return d


# ---------------------------------------------------------------- .fr3 (FastReport 4, XML)
def ler_fr3(caminho):
    raw = open(caminho, 'rb').read()
    try:
        txt = raw.decode('utf-8')
    except UnicodeDecodeError:
        txt = raw.decode('cp1252', 'replace')
    txt = re.sub(r'^<\?xml[^>]*\?>', '', txt.strip())
    try:
        raiz = ET.fromstring(txt)
    except ET.ParseError:
        return {'formato': 'FastReport 4 (.fr3)', 'campos': [], 'rotulos': [], 'agrupamentos': [], 'totais': [], 'opcoes': []}
    campos, rot_memos, dados_memos, totais, opcoes, agrup = OrderedDict(), [], [], [], [], []
    desc = raiz.get('ReportOptions.Description.Text', '') or ''
    for el in raiz.iter():
        tag = el.tag
        texto = el.get('Text', '') or el.get('Caption', '') or ''
        texto = texto.replace('&#13;&#10;', ' ').strip()
        f = lambda k: float((el.get(k) or '0').replace(',', '.') or 0)
        if tag.endswith('Control'):
            if texto and 'Button' not in tag:
                opcoes.append(texto.rstrip(':'))
            continue
        if tag == 'TfrxGroupHeader' and el.get('Condition'):
            agrup += [x[1] for x in REF.findall(el.get('Condition'))]
        if tag not in ('TfrxMemoView', 'TfrxRichView'):
            continue
        if el.get('DataField'):
            campos.setdefault(el.get('DataField').upper(), {'codigo': el.get('DataField').upper(),
                                                              'dataset': el.get('DataSetName', ''), 'rotulo': '',
                                                              'x': round(f('Left')), 'y': round(f('Top'))})
            dados_memos.append(((f('Left'), f('Top'), f('Width')), el.get('DataField').upper()))
        if not texto:
            continue
        if re.search(r'\b(SUM|COUNT)\s*\(', texto, re.I):
            totais.append(texto[:80])
        refs = REF.findall(texto)
        for ds, c in refs:
            campos.setdefault(c.upper(), {'codigo': c.upper(), 'dataset': ds, 'rotulo': '', 'x': round(f('Left')), 'y': round(f('Top'))})
            dados_memos.append(((f('Left'), f('Top'), f('Width')), c.upper()))
        if not refs and not texto.startswith('[') and len(texto) <= 60:
            rot_memos.append(((f('Left'), f('Top'), f('Width')), texto))
    for (x, y, w), c in dados_memos:
        melhor, sc = None, 0
        for (rx, ry, rw), t in rot_memos:
            if len(t) > 40 or not (re.search(r'[A-Za-zÀ-ú]{2}', t) or re.fullmatch(r'\d{1,2}', t.strip())):
                continue
            if abs(ry - y) < 3 and rx + rw <= x + 2 and x - (rx + rw) < 60:  # rótulo à esquerda na mesma linha
                s = 1000 - (x - (rx + rw))
            elif ry < y and y - ry < 60:
                ov = min(x + w, rx + rw) - max(x, rx)
                s = ov - (y - ry) / 5 if ov > 0 else 0
            else:
                s = 0
            if s > sc:
                melhor, sc = t, s
        if melhor and not campos[c]['rotulo']:
            campos[c]['rotulo'] = melhor.rstrip(':')
    return {'formato': 'FastReport 4 (.fr3)', 'titulo_interno': desc, 'campos': list(campos.values()),
            'rotulos': list(OrderedDict.fromkeys(t for _, t in rot_memos))[:60], 'agrupamentos': list(OrderedDict.fromkeys(agrup)),
            'totais': list(OrderedDict.fromkeys(totais))[:12], 'opcoes': list(OrderedDict.fromkeys(opcoes))[:30]}


# ---------------------------------------------------------------- .sql
PROIBIDOS = set()


def ler_sql(caminho):
    sql = open(caminho, 'rb').read().decode('cp1252', 'replace')
    sql = san(limpar_sql(sql, bool(re.search(r'(?i)vi[sz]ualiza', os.path.basename(caminho))), PROIBIDOS))
    sem_coment = re.sub(r'/\*.*?\*/', ' ', sql, flags=re.S)
    sem_coment = re.sub(r'--[^\n]*', ' ', sem_coment)
    campos = OrderedDict()
    for m in re.finditer(r'([A-Za-z0-9_."\'()\s,|+-]*?)\s+AS\s+"?([A-Za-z_][A-Za-z0-9_]*)"?', sem_coment, re.I):
        alias = m.group(2).upper()
        orig = re.sub(r'\s+', ' ', m.group(1)).strip().split(',')[-1].strip()
        if alias in ('INTEGER', 'VARCHAR', 'NUMERIC', 'DATE', 'CHAR', 'DOUBLE', 'SMALLINT', 'TIMESTAMP', 'BLOB'):
            continue
        orig = orig if len(orig) <= 60 else orig[:57] + '...'
        campos.setdefault(alias, {'codigo': alias, 'dataset': '', 'rotulo': '', 'origem': orig})
    tabelas = list(OrderedDict.fromkeys(t.upper() for t in re.findall(
        r'\b(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_$]*)', sem_coment, re.I)))
    params = list(OrderedDict.fromkeys(re.findall(r':([A-Za-z_][A-Za-z0-9_]*)', sem_coment)))
    return {'formato': 'Consulta SQL (.sql)', 'titulo_interno': '', 'campos': list(campos.values()), 'rotulos': [],
            'agrupamentos': [], 'totais': [], 'opcoes': [f':{p}' for p in params], 'tabelas': tabelas,
            'sql': sql.strip()[:12000]}


def ler_rtf(caminho):
    t = open(caminho, 'rb').read().decode('cp1252', 'replace')
    marcas = list(OrderedDict.fromkeys(re.findall(r'[\[<#%{]{1,2}([A-Z][A-Z0-9_]{2,40})[\]>#%}]{1,2}', t)))
    return {'formato': 'Modelo de documento (.rtf)', 'titulo_interno': '',
            'campos': [{'codigo': m, 'dataset': '', 'rotulo': ''} for m in marcas], 'rotulos': [], 'agrupamentos': [],
            'totais': [], 'opcoes': []}


# ---------------------------------------------------------------- dados reais fora
ROTULO_PROIBIDO = re.compile(r'(?i)(sindicato|federa[cç][aã]o|associa[cç][aã]o|sind\.)\s+(dos|das|de|da|do)\s+\w+|presidente|tesoureir|secret[aá]ri|diretor|@\w|\d{4,5}-\d{4}|\d{2}\.\d{3}\.\d{3}')


def rotulo_ok(t):
    if re.search(r"(?i)\bthen\b|\bbegin\b|<>|:=|''|\bcstr\d", t or ''):
        return False
    return bool(t) and bool(re.search(r'[A-Za-zÀ-ú]{2}', t)) and not ROTULO_PROIBIDO.search(t) and '\\' not in t and not re.search(r'(?i)print|deskjet|laserjet|epson|impressora| on ', t)


def limpar_sql(sql, amostra, literais_proibidos):
    """Troca dados de exemplo (nomes, endereços, contatos, documentos) por valores genéricos."""
    def lit(m):
        v = m.group(1)
        if amostra and re.search(r'[A-Za-z0-9]', v) and v.lower() not in ('now', 'today', 'yesterday', 's', 'n', 'x'):
            return "'EXEMPLO'"
        if v in literais_proibidos or re.search(r'@|\d{4,5}[- ]\d{4}|\d{2}\.\d{3}\.\d{3}|\b(rua|av\.?|avenida)\s', v, re.I):
            return "'EXEMPLO'"
        return m.group(0)
    sql = re.sub(r"'((?:[^']|'')*)'", lit, sql)
    return re.sub(r'\b\d{8,}\b', lambda m: '0' * len(m.group(0)), sql)


# ---------------------------------------------------------------- principal
def main():
    itens = []
    proibidos = PROIBIDOS
    for nome in os.listdir(SRC):
        if nome.lower().endswith('.sql') and re.search(r'(?i)vi[sz]ualiza', nome):
            t = open(os.path.join(SRC, nome), 'rb').read().decode('cp1252', 'replace')
            proibidos |= {v for v in re.findall(r"'((?:[^']|'')*)'", t) if len(v) > 3 and re.search(r'[A-Za-z]{3}', v)}
    for nome in sorted(os.listdir(SRC), key=str.lower):
        cam = os.path.join(SRC, nome)
        if not os.path.isfile(cam):
            continue
        ext = nome.rsplit('.', 1)[-1].lower()
        try:
            if ext == 'frf':
                d = ler_frf(cam)
            elif ext == 'fr3':
                d = ler_fr3(cam)
            elif ext == 'sql' and INCLUIR_SQL:
                d = ler_sql(cam)
            else:
                continue
        except Exception as e:  # arquivo ilegível não interrompe
            print('Ignorado:', nome, e)
            continue
        arquivo = san(nome)
        d['rotulos'] = [r for r in d['rotulos'] if rotulo_ok(r)]
        d['opcoes'] = [r for r in d['opcoes'] if rotulo_ok(r)]
        if not rotulo_ok(d.get('titulo_interno', '')):
            d['titulo_interno'] = ''
        lay = d.get('layout')
        if lay:
            ok = lambda t: rotulo_ok(t) or bool(re.fullmatch(r'\d{1,2}', (t or '').strip()))
            for col in lay['colunas']:
                col['rotulo'] = san(col['rotulo']) if ok(col.get('rotulo', '')) else ''
                if col.get('grupo'):
                    col['grupo'] = san(col['grupo']) if rotulo_ok(col['grupo']) else ''
                    if not col['grupo']:
                        col.pop('grupo')
                for cel in col['cel']:
                    if cel and 't' in cel:
                        cel['t'] = san(cel['t']) if len(cel['t']) <= 3 or rotulo_ok(cel['t']) else ''
                    elif cel:
                        cel['c'] = [san(x) for x in cel['c']]
                        if cel.get('e'):
                            cel['e'] = san(cel['e'])
            for g in lay.get('grupos', []):
                g[:] = [({'t': san(i['t'])} if 't' in i else {'e': san(i['e']), 'c': [san(x) for x in i['c']]})
                        for i in g if 't' not in i or rotulo_ok(i['t'])]
            lay['grupos'] = [g for g in lay.get('grupos', []) if g]
            if not lay['grupos']:
                lay.pop('grupos')
            if lay.get('total_rotulo') and not rotulo_ok(lay['total_rotulo']):
                lay.pop('total_rotulo')
        for c in d['campos']:
            c['codigo'] = san(c['codigo'])
            c['descricao'] = san(descrever(c['codigo']))
            c['rotulo'] = san(c.get('rotulo', '')) if (rotulo_ok(c.get('rotulo', '')) or re.fullmatch(r'\d{1,2}', c.get('rotulo', '').strip())) else ''
            if c.get('grupo') and not rotulo_ok(c['grupo']):
                c.pop('grupo')
            if c.get('origem'):
                c['origem'] = san(c['origem'])
        tipo = {'frf': 'relatorio', 'fr3': 'documento', 'sql': 'consulta', 'rtf': 'modelo'}[ext]
        if ext == 'frf' and re.match(r'(?i)fr(recibo|comprovante|carteir|ficha|verso|etiqueta|carta|carne|bloqueto|boleto|grcs|protocolo)', nome):
            tipo = 'documento'
        if re.search(r'(?i)vi[sz]ualiza', nome):
            tipo_extra = ' (visualização)'
        else:
            tipo_extra = ''
        itens.append({
            'id': arquivo if SISTEMA == 'ProSindW' else f'{SISTEMA}:{arquivo}', 'arquivo': arquivo, 'sistema': SISTEMA, 'tipo': tipo, 'formato': d['formato'],
            'titulo': titulo_arquivo(arquivo) + tipo_extra, 'titulo_interno': san(d.get('titulo_interno', '')),
            'assunto': assunto(arquivo), 'campos': d['campos'], 'rotulos': [san(x) for x in d['rotulos']],
            'agrupamentos': [{'codigo': san(x), 'descricao': san(descrever(x))} for x in d['agrupamentos']], 'totais': [san(x) for x in d['totais']],
            'opcoes': [san(x) for x in d['opcoes']], 'tabelas': d.get('tabelas', []),
            'sql': d.get('sql', ''),
        })
        if d.get('layout'):
            for col in d['layout']['colunas']:
                col.pop('x', None), col.pop('dx', None)
            itens[-1]['layout'] = d['layout']
    # liga documentos .fr3 às consultas .sql pelo conjunto de campos
    sqls = [i for i in itens if i['tipo'] == 'consulta']
    for i in itens:
        if i['formato'].startswith('FastReport 4'):
            cs = {c['codigo'] for c in i['campos']}
            melhor, sc = None, 0
            for q in sqls:
                qs = {c['codigo'] for c in q['campos']}
                if cs and qs:
                    s = len(cs & qs) / len(cs)
                    if s > sc:
                        melhor, sc = q, s
            if melhor and sc >= 0.6:
                i['relacionados'] = [melhor['id']]
                melhor.setdefault('relacionados', []).append(i['id'])
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(f'/* Catálogo de relatórios ({SISTEMA}) gerado por tools/extrai_reports.py */\n'
                'window.DADOS_RELATORIOS = (window.DADOS_RELATORIOS || []).concat(')
        json.dump(itens, f, ensure_ascii=False, separators=(',', ':'))
        f.write(');\n')
    from collections import Counter
    print(len(itens), 'itens', Counter(i['tipo'] for i in itens), sum(len(i['campos']) for i in itens), 'campos')


if __name__ == '__main__':
    main()
