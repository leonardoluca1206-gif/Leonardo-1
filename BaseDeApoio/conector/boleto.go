package main

// Boleto avulso de contribuição de EMPRESA, seguindo as regras do ProSindW:
// a gravação é feita pela própria procedure do ProSindW (PSW_GERA_BLOQUETO_FB_EMP), a mesma
// usada pela tela de boletos; aqui só conferimos antes e explicamos por que não é possível.

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type PedidoBoleto struct {
	Empresa      string `json:"empresa"`
	CodEmpresa   int    `json:"cod_empresa"`
	Contribuicao string `json:"contribuicao"`
	Valor        string `json:"valor"`
	Referencia   string `json:"referencia"`
	Vencimento   string `json:"vencimento"`
	Confirmado   bool   `json:"confirmado"`
}

type Opcao struct {
	Valor  string `json:"valor"`
	Rotulo string `json:"rotulo"`
	Extra  string `json:"extra,omitempty"`
}

type Pergunta struct {
	Campo  string  `json:"campo"`
	Texto  string  `json:"texto"`
	Opcoes []Opcao `json:"opcoes,omitempty"`
}

type EmpresaInfo struct {
	Codigo     int    `json:"codigo"`
	Nome       string `json:"nome"`
	Abreviado  string `json:"abreviado"`
	CNPJ       string `json:"cnpj"`
	Situacao   string `json:"situacao"`
	InicioAtiv string `json:"inicio_atividade"`
	Endereco   string `json:"endereco"`
	Bairro     string `json:"bairro"`
	Cidade     string `json:"cidade"`
	UF         string `json:"uf"`
	CEP        string `json:"cep"`
	Bloqueio   string `json:"bloqueio"`
}

type ContribInfo struct {
	Codigo     string      `json:"codigo"`
	Descricao  string      `json:"descricao"`
	Situacao   string      `json:"situacao"`
	Banco      string      `json:"banco"`
	NomeBanco  string      `json:"nome_banco"`
	DigBanco   string      `json:"dig_banco"`
	Acrescimo  float64     `json:"acrescimo"`
	Juros      float64     `json:"juros"`
	Multa      float64     `json:"multa"`
	LocalPagto string      `json:"local_pagamento"`
	Instrucoes []string    `json:"instrucoes"`
	Entidade   int         `json:"entidade"`
	Contrato   int         `json:"contrato"`
	Agencia    string      `json:"agencia"`
	Conta      string      `json:"conta"`
	Convenio   string      `json:"convenio"`
	Carteira   string      `json:"carteira"`
	Params     ParamsBanco `json:"-"`
	TemAgencia bool        `json:"-"`
}

type BoletoExistente struct {
	NossoNumero string  `json:"nosso_numero"`
	Vencimento  string  `json:"vencimento"`
	Valor       float64 `json:"valor"`
	Remessa     string  `json:"remessa"`
}

type Resumo struct {
	Empresa    EmpresaInfo      `json:"empresa"`
	Contrib    ContribInfo      `json:"contribuicao"`
	Valor      float64          `json:"valor"`
	ValorFinal float64          `json:"valor_final"`
	Mes        int              `json:"mes"`
	Ano        int              `json:"ano"`
	Vencimento string           `json:"vencimento"`
	Perfil     string           `json:"perfil_banco"`
	Existente  *BoletoExistente `json:"existente,omitempty"`
	Benef      BeneficiarioAuto `json:"beneficiario"`
	Aceite     string           `json:"-"`
}

type Analise struct {
	Pode      bool      `json:"pode"`
	Motivos   []string  `json:"motivos"`
	Avisos    []string  `json:"avisos"`
	Confirmar []string  `json:"confirmar"`
	Pedir     *Pergunta `json:"pedir,omitempty"`
	Resumo    *Resumo   `json:"resumo,omitempty"`
	venc      time.Time
}

// ---------------------------------------------------------------- conversões

func vStr(v interface{}) string {
	switch x := v.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(x)
	case []byte:
		return strings.TrimSpace(string(x))
	case time.Time:
		return x.Format("2006-01-02")
	default:
		return strings.TrimSpace(fmt.Sprint(x))
	}
}

func vFloat(v interface{}) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case int64:
		return float64(x)
	case int:
		return float64(x)
	}
	f, _ := strconv.ParseFloat(strings.ReplaceAll(vStr(v), ",", "."), 64)
	return f
}

func vInt(v interface{}) int { return int(math.Round(vFloat(v))) }

func dataBR(iso string) string {
	if len(iso) >= 10 {
		return iso[8:10] + "/" + iso[5:7] + "/" + iso[0:4]
	}
	return iso
}

func moeda(v float64) string {
	s := fmt.Sprintf("%.2f", v)
	inteiro, dec := s[:len(s)-3], s[len(s)-2:]
	neg := strings.HasPrefix(inteiro, "-")
	inteiro = strings.TrimPrefix(inteiro, "-")
	var b strings.Builder
	for i, r := range inteiro {
		if i > 0 && (len(inteiro)-i)%3 == 0 {
			b.WriteByte('.')
		}
		b.WriteRune(r)
	}
	out := b.String() + "," + dec
	if neg {
		out = "-" + out
	}
	return out
}

func mascaraCNPJ(c string) string {
	c = so(c)
	if len(c) == 14 {
		return c[0:2] + "." + c[2:5] + "." + c[5:8] + "/" + c[8:12] + "-" + c[12:14]
	}
	if len(c) == 11 {
		return c[0:3] + "." + c[3:6] + "." + c[6:9] + "-" + c[9:11]
	}
	return c
}

var rxValor = regexp.MustCompile(`^(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$|^(?:R\$\s*)?(\d+)\.(\d{1,2})$`)

func lerValor(s string) (float64, error) {
	t := strings.TrimSpace(strings.ToUpper(s))
	t = strings.TrimSuffix(strings.TrimSpace(strings.TrimSuffix(t, "REAIS")), " ")
	t = strings.TrimSpace(t)
	m := rxValor.FindStringSubmatch(t)
	if m == nil {
		return 0, fmt.Errorf("valor “%s” não reconhecido (use, por exemplo, 300,00)", s)
	}
	var inteiro, dec string
	if m[1] != "" {
		inteiro, dec = strings.ReplaceAll(m[1], ".", ""), m[2]
	} else {
		inteiro, dec = m[3], m[4]
	}
	if len(dec) == 1 {
		dec += "0"
	}
	if dec == "" {
		dec = "00"
	}
	f, _ := strconv.ParseFloat(inteiro+"."+dec, 64)
	return f, nil
}

var rxRef = regexp.MustCompile(`^(\d{1,2})\s*[/\-.]?\s*(\d{4})$`)

func lerReferencia(s string) (int, int, error) {
	m := rxRef.FindStringSubmatch(strings.TrimSpace(s))
	if m == nil {
		return 0, 0, fmt.Errorf("referência “%s” inválida (use mm/aaaa, ex.: 08/2026)", s)
	}
	mes, _ := strconv.Atoi(m[1])
	ano, _ := strconv.Atoi(m[2])
	if mes < 1 || mes > 13 {
		return 0, 0, fmt.Errorf("mês da referência inválido: %d (use 01 a 12, ou 13 para o 13º)", mes)
	}
	if ano < 2000 || ano > 2100 {
		return 0, 0, fmt.Errorf("ano da referência inválido: %d", ano)
	}
	return mes, ano, nil
}

var rxData = regexp.MustCompile(`^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d+)$`)

func lerVencimento(s string) (time.Time, string, error) {
	t := strings.TrimSpace(s)
	m := rxData.FindStringSubmatch(t)
	if m == nil {
		return time.Time{}, "", fmt.Errorf("vencimento “%s” inválido (use dd/mm/aaaa)", s)
	}
	d, _ := strconv.Atoi(m[1])
	mm, _ := strconv.Atoi(m[2])
	aStr := m[3]
	aviso := ""
	if len(aStr) == 2 {
		a, _ := strconv.Atoi(aStr)
		aStr = strconv.Itoa(2000 + a)
		aviso = fmt.Sprintf("ano do vencimento com 2 dígitos: entendi %s", aStr)
	} else if len(aStr) != 4 {
		return time.Time{}, "", fmt.Errorf("vencimento “%s” inválido: o ano tem %d dígitos (use dd/mm/aaaa, ex.: %02d/%02d/2026)", s, len(aStr), d, mm)
	}
	a, _ := strconv.Atoi(aStr)
	dt := time.Date(a, time.Month(mm), d, 0, 0, 0, 0, time.Local)
	if dt.Day() != d || int(dt.Month()) != mm || a < 2000 || a > 2100 {
		return time.Time{}, "", fmt.Errorf("vencimento “%s” não existe no calendário", s)
	}
	return dt, aviso, nil
}

// ---------------------------------------------------------------- leitura no banco

func linhas(ctx context.Context, q queryer, sqlTxt string, args ...interface{}) ([]map[string]interface{}, error) {
	r, err := consultar(ctx, q, 0, sqlTxt, args...)
	if err != nil {
		return nil, err
	}
	out := []map[string]interface{}{}
	for _, l := range r.Linhas {
		m := map[string]interface{}{}
		for i, c := range r.Colunas {
			m[strings.ToUpper(c)] = l[i]
		}
		out = append(out, m)
	}
	return out, nil
}

const selEmpresa = `SELECT E.CDGRUPO, E.NMEMPRESA, E.NMABREVEMP, E.NRCNPJ, E.INSITUACAO, E.DTINICIOATIV, E.NMENDERECO, E.DSCOMPLEMENTO,
  E.NMBAIRRO, E.NMCIDADE, E.CDUF, E.CDCEP, E.INBLOQUEIO, E.DSBLOQUEIO FROM PSW_EMPRESAS E `

func empresaDe(m map[string]interface{}) EmpresaInfo {
	end := vStr(m["NMENDERECO"])
	if c := vStr(m["DSCOMPLEMENTO"]); c != "" {
		end += " " + c
	}
	bl := ""
	if strings.EqualFold(vStr(m["INBLOQUEIO"]), "S") {
		bl = vStr(m["DSBLOQUEIO"])
		if bl == "" {
			bl = "bloqueada"
		}
	}
	return EmpresaInfo{Codigo: vInt(m["CDGRUPO"]), Nome: vStr(m["NMEMPRESA"]), Abreviado: vStr(m["NMABREVEMP"]), CNPJ: vStr(m["NRCNPJ"]),
		Situacao: vStr(m["INSITUACAO"]), InicioAtiv: vStr(m["DTINICIOATIV"]), Endereco: end, Bairro: vStr(m["NMBAIRRO"]),
		Cidade: vStr(m["NMCIDADE"]), UF: vStr(m["CDUF"]), CEP: vStr(m["CDCEP"]), Bloqueio: bl}
}

// BuscarEmpresas: código, CNPJ (com ou sem máscara) ou parte do nome.
func BuscarEmpresas(ctx context.Context, db *sql.DB, ref string, limite int) ([]EmpresaInfo, error) {
	ref = strings.TrimSpace(ref)
	d := so(ref)
	var ms []map[string]interface{}
	var err error
	if d != "" && len(d) == len(strings.Map(func(r rune) rune {
		if strings.ContainsRune(".-/ ", r) {
			return -1
		}
		return r
	}, ref)) {
		if len(d) == 14 {
			ms, err = linhas(ctx, db, selEmpresa+"WHERE E.NRCNPJ = ?", d)
		} else if len(d) <= 9 {
			n, _ := strconv.Atoi(d)
			ms, err = linhas(ctx, db, selEmpresa+"WHERE E.CDGRUPO = ?", n)
		}
		if err != nil {
			return nil, err
		}
		if len(ms) > 0 {
			out := []EmpresaInfo{}
			for _, m := range ms {
				out = append(out, empresaDe(m))
			}
			return out, nil
		}
		if len(d) == 14 || len(d) <= 9 {
			return []EmpresaInfo{}, nil
		}
	}
	ms, err = linhas(ctx, db, selEmpresa+fmt.Sprintf("WHERE E.NMEMPRESA CONTAINING ? OR E.NMABREVEMP CONTAINING ? ORDER BY CASE WHEN E.INSITUACAO = 'Ativa' THEN 0 ELSE 1 END, E.NMEMPRESA ROWS %d", limite), ref, ref)
	if err != nil {
		return nil, err
	}
	out := []EmpresaInfo{}
	for _, m := range ms {
		out = append(out, empresaDe(m))
	}
	return out, nil
}

const selContrib = `SELECT T.CDTIPO, T.DSTIPO, T.INSITUACAO, T.CDBANCO, T.CDAGENCIA, A.NRAGENCIA, A.NRDIGAGENC, T.CDCONTA, T.NRDIGONTA, T.CDCONVBB,
  T.CDCARTEIRA, T.INOPERACAO, T.INBLOQUETO, T.VLACRESCIMOS, T.VLJUROS, T.VLMULTA, T.DSLOCALPAGTO, T.DSINSTRUCOES1, T.DSINSTRUCOES2,
  T.DSINSTRUCOES3, T.DSINSTRUCOES4, T.DSINSTRUCOES5, T.DSINSTRUCOES6, T.CDENTIDADE, T.CDCONTRATO, B.NMBANCO, B.NRDIGTO
  FROM PSW_TPCONTRIBUICOES T LEFT JOIN PSW_AGENCIAS A ON A.NRAGENCIA = T.CDAGENCIA LEFT JOIN PSW_BANCOS B ON B.CDBANCO = T.CDBANCO `

func contribDe(m map[string]interface{}) ContribInfo {
	c := ContribInfo{Codigo: vStr(m["CDTIPO"]), Descricao: vStr(m["DSTIPO"]), Situacao: vStr(m["INSITUACAO"]), Banco: vStr(m["CDBANCO"]),
		NomeBanco: vStr(m["NMBANCO"]), DigBanco: vStr(m["NRDIGTO"]), Acrescimo: math.Abs(vFloat(m["VLACRESCIMOS"])), Juros: vFloat(m["VLJUROS"]),
		Multa: vFloat(m["VLMULTA"]), LocalPagto: vStr(m["DSLOCALPAGTO"]), TemAgencia: m["NRAGENCIA"] != nil}
	for i := 1; i <= 6; i++ {
		if s := vStr(m[fmt.Sprintf("DSINSTRUCOES%d", i)]); s != "" {
			c.Instrucoes = append(c.Instrucoes, s)
		}
	}
	c.Params = ParamsBanco{Banco: c.Banco, Agencia: vStr(m["CDAGENCIA"]), DigAgencia: vStr(m["NRDIGAGENC"]), Conta: vStr(m["CDCONTA"]),
		DigConta: vStr(m["NRDIGONTA"]), Convenio: vStr(m["CDCONVBB"]), Carteira: vStr(m["CDCARTEIRA"]), Operacao: vStr(m["INOPERACAO"]), InBloqueto: vStr(m["INBLOQUETO"])}
	c.Entidade, c.Contrato = vInt(m["CDENTIDADE"]), vInt(m["CDCONTRATO"])
	c.Agencia = strings.TrimSpace(c.Params.Agencia + "-" + c.Params.DigAgencia)
	c.Agencia = strings.Trim(c.Agencia, "-")
	c.Conta = strings.Trim(strings.TrimSpace(c.Params.Conta+"-"+c.Params.DigConta), "-")
	c.Convenio, c.Carteira = c.Params.Convenio, c.Params.Carteira
	return c
}

func ListarContribuicoes(ctx context.Context, db *sql.DB) ([]ContribInfo, error) {
	ms, err := linhas(ctx, db, selContrib+"ORDER BY T.CDTIPO")
	if err != nil {
		return nil, err
	}
	out := []ContribInfo{}
	for _, m := range ms {
		out = append(out, contribDe(m))
	}
	return out, nil
}

func chaveBanco(p ParamsBanco) string {
	return strings.Join([]string{p.Banco, so(p.Agencia), so(p.Conta), so(p.Convenio), strings.TrimSpace(p.Carteira), strings.TrimSpace(p.Operacao), strings.TrimSpace(p.InBloqueto)}, "|")
}

func bancoConferido(c ContribInfo) bool {
	if c.Banco == "000" {
		return true
	}
	_, cf := conferidoPor(c)
	return cf != nil
}

// ---------------------------------------------------------------- análise

func (a *Analise) motivo(f string, v ...interface{}) {
	a.Motivos = append(a.Motivos, fmt.Sprintf(f, v...))
}
func (a *Analise) aviso(f string, v ...interface{}) {
	a.Avisos = append(a.Avisos, fmt.Sprintf(f, v...))
}

func AnalisarBoleto(ctx context.Context, p PedidoBoleto) (*Analise, error) {
	a := &Analise{Motivos: []string{}, Avisos: []string{}, Confirmar: []string{}}
	db, err := conexao()
	if err != nil {
		return nil, err
	}
	res := &Resumo{}

	// 1. empresa
	var emp *EmpresaInfo
	if p.CodEmpresa > 0 {
		lst, err := BuscarEmpresas(ctx, db, strconv.Itoa(p.CodEmpresa), 1)
		if err != nil {
			return nil, err
		}
		if len(lst) > 0 {
			emp = &lst[0]
		}
	} else if strings.TrimSpace(p.Empresa) == "" {
		a.Pedir = &Pergunta{Campo: "empresa", Texto: "Para qual empresa? Informe o código, o CNPJ ou o nome."}
		return a, nil
	} else {
		lst, err := BuscarEmpresas(ctx, db, p.Empresa, 11)
		if err != nil {
			return nil, err
		}
		if len(lst) == 1 {
			emp = &lst[0]
		} else if len(lst) > 1 {
			ops := []Opcao{}
			for _, e := range lst[:min(10, len(lst))] {
				ops = append(ops, Opcao{Valor: strconv.Itoa(e.Codigo), Rotulo: fmt.Sprintf("%d - %s", e.Codigo, e.Nome), Extra: strings.TrimSpace(mascaraCNPJ(e.CNPJ) + " " + e.Situacao)})
			}
			t := fmt.Sprintf("Encontrei %d empresas com “%s”. Qual delas?", len(lst), p.Empresa)
			if len(lst) > 10 {
				t = fmt.Sprintf("Encontrei mais de 10 empresas com “%s”. Escolha ou informe o código/CNPJ.", p.Empresa)
			}
			a.Pedir = &Pergunta{Campo: "empresa", Texto: t, Opcoes: ops}
			return a, nil
		}
	}
	if emp == nil {
		ref := strings.TrimSpace(p.Empresa)
		if ref == "" {
			ref = strconv.Itoa(p.CodEmpresa)
		}
		a.motivo("Empresa “%s” não encontrada no ProSindW (procurei por código, CNPJ e nome).", ref)
		return a, nil
	}
	res.Empresa = *emp

	// 2. contribuição
	contribs, err := ListarContribuicoes(ctx, db)
	if err != nil {
		return nil, err
	}
	var ct *ContribInfo
	ref := strings.TrimSpace(p.Contribuicao)
	if ref == "" {
		ref = strings.TrimSpace(cfg.ContribPadrao)
	}
	if ref != "" {
		for i := range contribs {
			if strings.EqualFold(contribs[i].Codigo, ref) {
				ct = &contribs[i]
			}
		}
		if ct == nil {
			cands := []int{}
			for i := range contribs {
				if strings.Contains(semAcento(contribs[i].Descricao), semAcento(ref)) {
					cands = append(cands, i)
				}
			}
			if len(cands) == 1 {
				ct = &contribs[cands[0]]
			}
		}
		if ct == nil {
			a.motivo("Contribuição “%s” não existe no ProSindW (Tabelas > Tipos de Contribuição).", ref)
		}
	}
	if ct == nil && len(a.Motivos) == 0 {
		ops := []Opcao{}
		for _, c := range contribs {
			if strings.EqualFold(c.Situacao, "Inativa") || c.Banco == "" {
				continue
			}
			ops = append(ops, Opcao{Valor: c.Codigo, Rotulo: fmt.Sprintf("%s - %s", c.Codigo, c.Descricao), Extra: strings.TrimSpace("banco " + c.Banco + " " + c.NomeBanco)})
		}
		if len(ops) == 0 {
			a.motivo("Nenhum tipo de contribuição tem banco configurado no ProSindW.")
			return a, nil
		}
		if len(ops) == 1 {
			for i := range contribs {
				if contribs[i].Codigo == ops[0].Valor {
					ct = &contribs[i]
				}
			}
			a.aviso("Usei a contribuição %s, a única com banco configurado.", ops[0].Rotulo)
		} else {
			a.Pedir = &Pergunta{Campo: "contribuicao", Texto: "Qual contribuição vai no boleto?", Opcoes: ops}
			a.Resumo = res
			return a, nil
		}
	}
	if ct == nil {
		return a, nil
	}
	res.Contrib = *ct

	// 3. valor, referência e vencimento
	if strings.TrimSpace(p.Valor) == "" {
		a.Pedir = &Pergunta{Campo: "valor", Texto: "Qual o valor do boleto?"}
		a.Resumo = res
		return a, nil
	}
	valor, err := lerValor(p.Valor)
	if err != nil {
		a.motivo("%s", err.Error())
	} else if valor <= 0 {
		a.motivo("O valor precisa ser maior que zero.")
	}
	if strings.TrimSpace(p.Referencia) == "" {
		a.Pedir = &Pergunta{Campo: "referencia", Texto: "Qual a referência (mês/ano)?"}
		a.Resumo = res
		return a, nil
	}
	mes, ano, err := lerReferencia(p.Referencia)
	if err != nil {
		a.motivo("%s", err.Error())
	}
	if strings.TrimSpace(p.Vencimento) == "" {
		a.Pedir = &Pergunta{Campo: "vencimento", Texto: "Qual o vencimento (dd/mm/aaaa)?"}
		a.Resumo = res
		return a, nil
	}
	venc, avisoAno, err := lerVencimento(p.Vencimento)
	if err != nil {
		a.motivo("%s", err.Error())
	} else if avisoAno != "" {
		a.aviso("%s.", avisoAno)
	}
	res.Valor, res.Mes, res.Ano = valor, mes, ano
	if !venc.IsZero() {
		res.Vencimento = venc.Format("02/01/2006")
		a.venc = venc
	}
	a.Resumo = res
	if len(a.Motivos) > 0 {
		return a, nil
	}

	// 4. regras do ProSindW (PSW_GERA_BLOQUETO_FB_EMP / PSW_INSERE_BLOQQUETO_FB_EMP)
	if !strings.EqualFold(emp.Situacao, "Ativa") {
		a.motivo("A empresa %d está “%s”. O ProSindW só gera boleto de contribuição para empresas Ativas.", emp.Codigo, emp.Situacao)
	}
	if emp.InicioAtiv != "" {
		ini, _ := time.Parse("2006-01-02", emp.InicioAtiv[:10])
		refMes := mes
		if refMes == 13 {
			refMes = 12
		}
		if time.Date(ini.Year(), ini.Month(), 1, 0, 0, 0, 0, time.Local).After(time.Date(ano, time.Month(refMes), 1, 0, 0, 0, 0, time.Local)) {
			a.motivo("A empresa iniciou as atividades em %s, depois da referência %02d/%d. O ProSindW não gera boleto de competência anterior ao início.", dataBR(emp.InicioAtiv), mes, ano)
		}
	}
	if emp.Bloqueio != "" {
		a.aviso("Empresa com bloqueio no cadastro: %s.", emp.Bloqueio)
	}
	if strings.EqualFold(ct.Situacao, "Inativa") {
		a.motivo("A contribuição %s está Inativa no ProSindW.", ct.Codigo)
	}
	var grcs string
	if ms, err := linhas(ctx, db, "SELECT DSTEXT FROM PSW_TBDIVERSAS WHERE NMTABELA = 'PARSIS' AND CDACESSO = 'INGRCS'"); err == nil && len(ms) > 0 {
		grcs = vStr(ms[0]["DSTEXT"])
	}
	if grcs != "" && strings.EqualFold(grcs, ct.Codigo) {
		a.motivo("%s é a GRCSU (contribuição sindical); ela segue outro fluxo no ProSindW (Guias GRCSU).", ct.Codigo)
	}
	if ct.Banco == "" {
		a.motivo("A contribuição %s não tem banco configurado (Tabelas > Tipos de Contribuição > Dados do boleto).", ct.Codigo)
	} else {
		if ok, mot := BancoSuportado(ct.Banco); !ok {
			a.motivo("Não é possível gerar aqui: %s.", mot)
		} else {
			res.Perfil = mot
		}
		if ct.Banco != "000" && !ct.TemAgencia {
			a.motivo("A agência %s da contribuição %s não está cadastrada (Tabelas > Agências). Sem ela o ProSindW não carrega os dados bancários.", ct.Params.Agencia, ct.Codigo)
		}
	}
	if emp.CNPJ == "" {
		a.aviso("Empresa sem CNPJ no cadastro: o banco pode recusar o registro do boleto.")
	}
	res.Benef = beneficiarioDe(ctx, db, *ct)
	if k := contratoDe(ctx, db, ct.Contrato); k != nil {
		res.Aceite = k.Aceite
	}
	if strings.TrimSpace(res.Benef.Nome) == "" {
		a.motivo("Não encontrei o nome do beneficiário no ProSindW: informe a Entidade na contribuição %s (Tabelas > Tipos de Contribuição) ou digite o nome em Configurações > Banco de dados.", ct.Codigo)
	} else if res.Benef.Documento == "" {
		a.aviso("Beneficiário sem CNPJ (%s). Digite o CNPJ em Configurações > Banco de dados para sair no boleto.", res.Benef.Origem)
	}

	// oposição
	if ms, err := linhas(ctx, db, "SELECT DTCARTA, CDMOTIVO FROM PSW_OPOSICOES_EMP WHERE CDEMPRESA = ? AND CDCONTRIBUICAO = ? AND NRANO = ? AND NRMES = ?", emp.Codigo, ct.Codigo, ano, mes); err == nil && len(ms) > 0 {
		quando := ""
		if d := vStr(ms[0]["DTCARTA"]); d != "" {
			quando = " (carta de " + dataBR(d) + ")"
		}
		a.motivo("A empresa tem oposição registrada à contribuição %s em %02d/%d%s. Retire a oposição no ProSindW antes de cobrar.", ct.Codigo, mes, ano, quando)
	}

	// lançamentos da competência
	ms, err := linhas(ctx, db, `SELECT C.DTVENCIMENTO, C.DTPAGAMENTO, C.VLPAGAMENTO, C.DSDOCUMENTO, B.NRNOSSONUMERO, B.INREMESSA, B.DTREMESSA
	  FROM PSW_CONTRIBEMP C LEFT JOIN PSW_BLOQUETOSEMP B ON B.CDEMPRESA = C.CDEMPRESA AND B.CDCONTRIBUICAO = C.CDCONTRIBUICAO
	   AND B.NRANOEXERCICIO = C.NRANOEXERCICIO AND B.NRMESEXERCICIO = C.NRMESEXERCICIO AND B.DTVENCIMENTO = C.DTVENCIMENTO
	  WHERE C.CDEMPRESA = ? AND C.CDCONTRIBUICAO = ? AND C.NRANOEXERCICIO = ? AND C.NRMESEXERCICIO = ?`, emp.Codigo, ct.Codigo, ano, mes)
	if err != nil {
		return nil, err
	}
	for _, m := range ms {
		if pg := vStr(m["DTPAGAMENTO"]); pg != "" {
			a.motivo("A contribuição %s de %02d/%d dessa empresa já foi paga em %s (R$ %s). O ProSindW não gera boleto de competência paga.", ct.Codigo, mes, ano, dataBR(pg), moeda(vFloat(m["VLPAGAMENTO"])))
		}
	}
	if len(ms) >= 2 {
		a.motivo("Existem %d lançamentos da contribuição %s em %02d/%d para essa empresa. O ProSindW não gera boleto nesse caso (regra de 1 boleto por mês); ajuste no ProSindW.", len(ms), ct.Codigo, mes, ano)
	} else if len(ms) == 1 && vStr(ms[0]["DTPAGAMENTO"]) == "" {
		m := ms[0]
		if nn := vStr(m["NRNOSSONUMERO"]); nn != "" {
			ex := &BoletoExistente{NossoNumero: nn, Vencimento: dataBR(vStr(m["DTVENCIMENTO"])), Valor: vFloat(m["VLPAGAMENTO"])}
			if strings.EqualFold(vStr(m["INREMESSA"]), "S") {
				ex.Remessa = dataBR(vStr(m["DTREMESSA"]))
			}
			res.Existente = ex
			msg := fmt.Sprintf("Já existe boleto dessa competência (nosso nº %s, venc. %s, R$ %s). Gerar de novo altera o boleto existente, como no ProSindW.", nn, ex.Vencimento, moeda(ex.Valor))
			if ex.Remessa != "" {
				msg += fmt.Sprintf(" Ele já foi enviado ao banco em remessa (%s): a alteração vai como instrução na próxima remessa.", ex.Remessa)
			}
			a.Confirmar = append(a.Confirmar, msg)
		} else {
			a.aviso("Já existe lançamento da contribuição em %02d/%d (venc. %s, R$ %s) sem boleto; ele será atualizado com o novo vencimento e valor.", mes, ano, dataBR(vStr(m["DTVENCIMENTO"])), moeda(vFloat(m["VLPAGAMENTO"])))
		}
	}

	hoje := time.Now()
	hoje = time.Date(hoje.Year(), hoje.Month(), hoje.Day(), 0, 0, 0, 0, time.Local)
	if venc.Before(hoje) {
		a.Confirmar = append(a.Confirmar, fmt.Sprintf("O vencimento %s já passou. O banco pode recusar o registro.", venc.Format("02/01/2006")))
	}
	if _, err := FatorVencimento(venc); err != nil && ct.Banco != "000" {
		a.motivo("Vencimento %s: %s.", venc.Format("02/01/2006"), err.Error())
	}
	res.ValorFinal = math.Round((valor+ct.Acrescimo)*100) / 100
	if ct.Acrescimo > 0 {
		a.aviso("A contribuição %s tem acréscimo fixo de R$ %s no ProSindW: o boleto sai com R$ %s.", ct.Codigo, moeda(ct.Acrescimo), moeda(res.ValorFinal))
	}
	if ct.Banco != "" {
		if ok, _ := BancoSuportado(ct.Banco); ok && !bancoConferido(*ct) {
			garantirConferenciaAuto(ctx) // ainda não rodou nesta conexão: tenta conferir sozinho agora
		}
		if ok, _ := BancoSuportado(ct.Banco); ok && !bancoConferido(*ct) {
			if ab := resultadoAutoBanco(ct.Banco); ab != nil && ab.Situacao == "divergente" {
				a.motivo("O cálculo do boleto do banco %s não bate com o boleto %s gravado pelo ProSindW (ProSindW: %s; calculado: %s). Confira os dados bancários da contribuição %s no ProSindW.", ct.Banco, ab.NossoNumero, ab.LinhaProsind, ab.LinhaCalculada, ab.Contribuicao)
			} else {
				porque := ""
				if ab := resultadoAutoBanco(ct.Banco); ab != nil && ab.Mensagem != "" {
					porque = " Conferência automática: " + ab.Mensagem
				}
				a.motivo("O cálculo do boleto do banco %s para a contribuição %s ainda não foi conferido com um boleto do ProSindW.%s Se precisar, confira manualmente em Configurações > Banco de dados (uma vez por banco).", ct.Banco, ct.Codigo, porque)
			}
		}
	}
	a.Pode = len(a.Motivos) == 0
	return a, nil
}

// ---------------------------------------------------------------- geração

type BoletoGerado struct {
	Arquivo     string       `json:"arquivo"`
	URL         string       `json:"url"`
	NossoNumero string       `json:"nosso_numero"`
	Linha       string       `json:"linha_digitavel"`
	Valor       float64      `json:"valor"`
	Vencimento  string       `json:"vencimento"`
	Resumo      *Resumo      `json:"resumo"`
	Codigo      CodigoBoleto `json:"codigo"`
}

var ErrPrecisaConfirmar = errors.New("precisa confirmar")

func GerarBoleto(ctx context.Context, p PedidoBoleto, pastaSaida string) (*BoletoGerado, *Analise, error) {
	a, err := AnalisarBoleto(ctx, p)
	if err != nil {
		return nil, nil, err
	}
	if !a.Pode || a.Pedir != nil {
		return nil, a, nil
	}
	if len(a.Confirmar) > 0 && !p.Confirmado {
		return nil, a, ErrPrecisaConfirmar
	}
	db, err := conexao()
	if err != nil {
		return nil, nil, err
	}
	r := a.Resumo
	ct := r.Contrib
	us := usuarioProsind()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, nil, traduzirErro(err)
	}
	defer tx.Rollback()
	exec := func(q string, args ...interface{}) error {
		_, err := tx.ExecContext(ctx, q, args...)
		return err
	}
	if err := exec("DELETE FROM PSW_TBAUXILIAR_TEMP1 WHERE USUARIO = ?", us); err != nil {
		return nil, nil, err
	}
	if err := exec("DELETE FROM PSW_MULTI_AUX WHERE USUARIO = ?", us); err != nil {
		return nil, nil, err
	}
	if err := exec("INSERT INTO PSW_TBAUXILIAR_TEMP1 (CODIGO, USUARIO) VALUES (?, ?)", strconv.Itoa(r.Empresa.Codigo), us); err != nil {
		return nil, nil, err
	}
	if err := exec("INSERT INTO PSW_MULTI_AUX (CDMULTI, USUARIO, INTABELA, DSMULTI, CDAUX) VALUES ('USUARIO', ?, 'CONF', ?, '0')", us, us); err != nil {
		return nil, nil, err
	}
	pb := ct.Params
	agencia, _ := strconv.Atoi(so(pb.Agencia))
	instr := make([]string, 6)
	copy(instr, ct.Instrucoes)
	local := ct.LocalPagto
	if local == "" {
		if ms, err := linhas(ctx, tx, "SELECT DSTEXTR2 FROM PSW_TBDIVERSAS WHERE NMTABELA = 'PARSIS' AND CDACESSO = 'LOCALPAGTO'"); err == nil && len(ms) > 0 {
			local = vStr(ms[0]["DSTEXTR2"])
		}
	}
	venc := a.venc
	rows, err := linhas(ctx, tx, `SELECT DOCUMENTO, VENCIMENTO, VALORCONTR FROM PSW_GERA_BLOQUETO_FB_EMP(?, ?, ?, ?, ?, ?, 'N', 'T', ?, 'N', ?, ?, ?, ?, ?,
	  'N', 'N', 'N', 'N', 'N', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'N')`,
		ct.Codigo, r.Mes, r.Ano, r.Mes, r.Ano, venc, us, ct.Banco, pb.InBloqueto, pb.Convenio, fmt.Sprintf("%.2f", r.Valor), fmt.Sprintf("%.2f", ct.Acrescimo),
		agencia, pb.DigAgencia, pb.Operacao, pb.Conta, pb.DigConta, local, instr[0], instr[1], instr[2], instr[3], instr[4], instr[5])
	if err != nil {
		return nil, nil, fmt.Errorf("o ProSindW recusou a geração: %v", err)
	}
	_ = exec("DELETE FROM PSW_MULTI_AUX WHERE USUARIO = ?", us)
	_ = exec("DELETE FROM PSW_TBAUXILIAR_TEMP1 WHERE USUARIO = ?", us)
	if len(rows) == 0 || vStr(rows[0]["DOCUMENTO"]) == "" {
		a.Pode = false
		a.motivo("A procedure do ProSindW (PSW_GERA_BLOQUETO_FB_EMP) não gerou o boleto: a empresa ou a competência não atendem às regras de geração. Nada foi gravado.")
		return nil, a, nil
	}
	nn := vStr(rows[0]["DOCUMENTO"])
	vencGerado := venc
	if v := vStr(rows[0]["VENCIMENTO"]); len(v) >= 10 {
		if t, err := time.ParseInLocation("2006-01-02", v[:10], time.Local); err == nil {
			vencGerado = t
		}
	}
	valorGerado := vFloat(rows[0]["VALORCONTR"])
	if valorGerado <= 0 {
		valorGerado = r.ValorFinal
	}
	cod, err := MontarCodigo(pb, nn, vencGerado, valorGerado)
	if err != nil {
		return nil, nil, fmt.Errorf("boleto não gravado: %v", err)
	}
	pdf := PDFBoleto(DadosBoletoPDF{Resumo: r, Codigo: cod, NossoNumero: nn, Vencimento: vencGerado, Valor: valorGerado, LocalPagto: local,
		Instrucoes: ct.Instrucoes, Beneficiario: r.Benef.Beneficiario, Aceite: r.Aceite, Processamento: time.Now()})
	nome := fmt.Sprintf("Boleto_EMP%d_%s_%04d%02d_%s.pdf", r.Empresa.Codigo, ct.Codigo, r.Ano, r.Mes, so(nn))
	dir := filepath.Join(pastaSaida, "Boletos")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, nil, err
	}
	if err := os.WriteFile(filepath.Join(dir, nome), pdf, 0644); err != nil {
		return nil, nil, fmt.Errorf("não consegui salvar o PDF: %v", err)
	}
	if err := tx.Commit(); err != nil {
		os.Remove(filepath.Join(dir, nome))
		return nil, nil, traduzirErro(err)
	}
	return &BoletoGerado{Arquivo: filepath.Join("Boletos", nome), URL: "/api/db/arquivo?nome=" + urlEsc("Boletos/"+nome), NossoNumero: nn, Linha: cod.Linha,
		Valor: valorGerado, Vencimento: vencGerado.Format("02/01/2006"), Resumo: r, Codigo: cod}, a, nil
}

// ---------------------------------------------------------------- conferência com um boleto do ProSindW

type BoletoConferencia struct {
	Contribuicao string       `json:"contribuicao"`
	Banco        string       `json:"banco"`
	Perfil       string       `json:"perfil"`
	Empresa      string       `json:"empresa"`
	Competencia  string       `json:"competencia"`
	NossoNumero  string       `json:"nosso_numero"`
	Vencimento   string       `json:"vencimento"`
	Valor        float64      `json:"valor"`
	Calculado    CodigoBoleto `json:"calculado"`
	Erro         string       `json:"erro,omitempty"`
	Conferido    bool         `json:"conferido"`
	Origem       string       `json:"origem,omitempty"` // contribuição do boleto usado, se for outra do mesmo banco
}

func UltimoBoletoParaConferir(ctx context.Context, tipo string) (*BoletoConferencia, error) {
	db, err := conexao()
	if err != nil {
		return nil, err
	}
	cs, err := linhas(ctx, db, selContrib+"WHERE T.CDTIPO = ?", tipo)
	if err != nil || len(cs) == 0 {
		return nil, fmt.Errorf("contribuição %s não encontrada", tipo)
	}
	ct := contribDe(cs[0])
	r := &BoletoConferencia{Contribuicao: ct.Codigo, Banco: ct.Banco, Conferido: bancoConferido(ct)}
	ok, perfil := BancoSuportado(ct.Banco)
	r.Perfil = perfil
	if !ok {
		r.Erro = perfil
		return r, nil
	}
	// primeiro os boletos recentes (usa o índice de vencimento); depois qualquer data
	selUlt := `SELECT FIRST 1 B.CDCONTRIBUICAO, B.NRNOSSONUMERO, B.DTVENCIMENTO, B.NRANOEXERCICIO, B.NRMESEXERCICIO, C.VLPAGAMENTO, E.CDGRUPO, E.NMEMPRESA
	  FROM PSW_BLOQUETOSEMP B JOIN PSW_CONTRIBEMP C ON C.CDEMPRESA = B.CDEMPRESA AND C.CDCONTRIBUICAO = B.CDCONTRIBUICAO AND C.NRANOEXERCICIO = B.NRANOEXERCICIO
	   AND C.NRMESEXERCICIO = B.NRMESEXERCICIO AND C.DTVENCIMENTO = B.DTVENCIMENTO
	  JOIN PSW_EMPRESAS E ON E.CDGRUPO = B.CDEMPRESA
	  WHERE B.CDCONTRIBUICAO = ? AND B.CDBANCO = ? AND B.NRNOSSONUMERO IS NOT NULL AND C.VLPAGAMENTO > 0 AND B.DTVENCIMENTO >= ?
	  ORDER BY B.DTVENCIMENTO DESC`
	buscar := func(filtroContrib bool) ([]map[string]interface{}, error) {
		q := selUlt
		args := []interface{}{ct.Codigo, ct.Banco}
		if !filtroContrib { // qualquer contribuição do mesmo banco
			q = strings.Replace(selUlt, "B.CDCONTRIBUICAO = ? AND ", "", 1)
			args = args[1:]
		}
		for _, desde := range []time.Time{time.Now().AddDate(-2, 0, 0), time.Date(1900, 1, 1, 0, 0, 0, 0, time.Local)} {
			ms, err := linhas(ctx, db, q, append(args, desde)...)
			if err != nil || len(ms) > 0 {
				return ms, err
			}
		}
		return nil, nil
	}
	ms, err := buscar(true)
	if err != nil {
		return nil, err
	}
	if len(ms) == 0 {
		if ms, err = buscar(false); err != nil {
			return nil, err
		}
		if len(ms) > 0 { // usa os dados bancários da contribuição daquele boleto
			outro := vStr(ms[0]["CDCONTRIBUICAO"])
			if cs, err := linhas(ctx, db, selContrib+"WHERE T.CDTIPO = ?", outro); err == nil && len(cs) > 0 {
				ct = contribDe(cs[0])
				r.Origem = outro
			} else {
				ms = nil
			}
		}
	}
	if len(ms) == 0 {
		r.Erro = fmt.Sprintf("Ainda não há boleto gerado pelo ProSindW com o banco %s (com nosso número e valor) para comparar. Gere um boleto de qualquer contribuição desse banco no ProSindW e clique em Conferir de novo.", ct.Banco)
		return r, nil
	}
	m := ms[0]
	r.NossoNumero, r.Valor = vStr(m["NRNOSSONUMERO"]), vFloat(m["VLPAGAMENTO"])
	r.Vencimento = dataBR(vStr(m["DTVENCIMENTO"]))
	r.Empresa = fmt.Sprintf("%d - %s", vInt(m["CDGRUPO"]), vStr(m["NMEMPRESA"]))
	r.Competencia = fmt.Sprintf("%02d/%d", vInt(m["NRMESEXERCICIO"]), vInt(m["NRANOEXERCICIO"]))
	venc, errV := time.ParseInLocation("2006-01-02", vStr(m["DTVENCIMENTO"]), time.Local)
	if errV != nil {
		r.Erro = "vencimento do boleto do ProSindW ilegível: " + vStr(m["DTVENCIMENTO"])
		return r, nil
	}
	cod, err := MontarCodigo(ct.Params, r.NossoNumero, venc, r.Valor)
	if err != nil {
		r.Erro = "Não consegui calcular a linha digitável: " + err.Error()
		return r, nil
	}
	r.Calculado = cod
	return r, nil
}

func ConfirmarConferencia(ctx context.Context, tipo, linhaProsind string) (bool, *BoletoConferencia, error) {
	b, err := UltimoBoletoParaConferir(ctx, tipo)
	if err != nil {
		return false, nil, err
	}
	if b.Erro != "" {
		return false, b, nil
	}
	if !CompararLinha(b.Calculado.Linha, linhaProsind) {
		return false, b, nil
	}
	db, err := conexao()
	if err != nil {
		return false, b, err
	}
	cs, err := linhas(ctx, db, selContrib+"WHERE T.CDTIPO = ?", tipo)
	if err != nil || len(cs) == 0 {
		return false, b, fmt.Errorf("contribuição %s não encontrada", tipo)
	}
	ct := contribDe(cs[0])
	err = alterarConferidos(func(m map[string]Conferencia) {
		m[tipo] = Conferencia{Banco: ct.Banco, Chave: chaveBanco(ct.Params), Linha: b.Calculado.Linha, Data: time.Now().Format("02/01/2006 15:04")}
	})
	b.Conferido = true
	return true, b, err
}

func semAcento(s string) string {
	r := strings.NewReplacer("á", "a", "à", "a", "â", "a", "ã", "a", "é", "e", "ê", "e", "í", "i", "ó", "o", "ô", "o", "õ", "o", "ú", "u", "ç", "c",
		"Á", "a", "À", "a", "Â", "a", "Ã", "a", "É", "e", "Ê", "e", "Í", "i", "Ó", "o", "Ô", "o", "Õ", "o", "Ú", "u", "Ç", "c")
	return strings.ToLower(r.Replace(s))
}
