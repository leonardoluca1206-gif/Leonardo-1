package main

// Código de barras e linha digitável (padrão FEBRABAN) a partir dos dados que o ProSindW grava.
// O ProSindW usa códigos de banco "variantes" (ex.: 009 = Banco do Brasil convênio 7, 106 = Caixa SIGCB);
// cada perfil abaixo diz qual é o banco real e como montar o campo livre (25 posições).

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
)

type ParamsBanco struct {
	Banco      string // código gravado no ProSindW (PSW_TPCONTRIBUICOES.CDBANCO)
	Agencia    string
	DigAgencia string
	Conta      string
	DigConta   string
	Convenio   string // CDCONVBB
	Carteira   string // CDCARTEIRA
	Operacao   string // INOPERACAO
	InBloqueto string // INBLOQUETO
}

type CodigoBoleto struct {
	BancoReal   string `json:"banco_real"`
	NomePerfil  string `json:"perfil"`
	Barras      string `json:"codigo_barras"`
	Linha       string `json:"linha_digitavel"`
	NossoNumero string `json:"nosso_numero_exibicao"`
	AgCodigo    string `json:"agencia_codigo"`
	Carteira    string `json:"carteira"`
	SemBarras   bool   `json:"sem_codigo_barras"`
}

type perfilBanco struct {
	real  string
	nome  string
	livre func(p ParamsBanco, nn string) (campoLivre, nnExib, agCod, cart string, err error)
}

var perfis = map[string]perfilBanco{
	"001": {"001", "Banco do Brasil (convênio 6 ou 7)", livreBB},
	"002": {"001", "Banco do Brasil (convênio 7)", livreBB},
	"009": {"001", "Banco do Brasil (convênio 7)", livreBB},
	"104": {"104", "Caixa (SICOB, nosso número 10)", livreCaixaSicob},
	"105": {"104", "Caixa (SIGCB, nosso número 17)", livreCaixaSigcb},
	"106": {"104", "Caixa (SIGCB, nosso número 17)", livreCaixaSigcb},
	"237": {"237", "Bradesco", livreBradesco},
	"238": {"237", "Bradesco", livreBradesco},
	"341": {"341", "Itaú", livreItau},
	"033": {"033", "Santander", livreSantander},
	"034": {"033", "Santander", livreSantander},
	"756": {"756", "Sicoob", livreSicoob},
	"760": {"756", "Sicoob", livreSicoob},
	"748": {"748", "Sicredi", livreSicredi},
	"749": {"748", "Sicredi", livreSicredi},
}

// Bancos em que o boleto é registrado on-line pela plataforma (o ProSindW gera pelo serviço do parceiro).
var bancosOnline = map[string]string{
	"999": "iugu", "998": "Somos", "997": "Safe2Pay", "996": "Cielo", "995": "FPAY", "994": "Asaas",
	"993": "Lytex", "992": "Galax Pay", "991": "HitPay", "990": "Cora", "342": "Itaú carteira 112 (API)",
}

var dvBancos = map[string]string{"001": "9", "104": "0", "237": "2", "341": "7", "033": "7", "756": "0", "748": "X"}

func BancoSuportado(banco string) (bool, string) {
	if banco == "000" {
		return true, "Bloqueto não bancário (sem código de barras)"
	}
	if n, ok := bancosOnline[banco]; ok {
		return false, fmt.Sprintf("o banco %s (%s) registra o boleto on-line pelo serviço do parceiro; gere pelo ProSindW", banco, n)
	}
	if p, ok := perfis[banco]; ok {
		return true, p.nome
	}
	return false, fmt.Sprintf("o cálculo do código de barras do banco %s ainda não está na Base de Apoio; gere pelo ProSindW", banco)
}

func so(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func esq(s string, n int) string { // zeros à esquerda e corta pela direita (últimos n)
	s = so(s)
	if len(s) > n {
		return s[len(s)-n:]
	}
	return strings.Repeat("0", n-len(s)) + s
}

func mod10(s string) int {
	soma, peso := 0, 2
	for i := len(s) - 1; i >= 0; i-- {
		v := int(s[i]-'0') * peso
		if v > 9 {
			v = v/10 + v%10
		}
		soma += v
		if peso == 2 {
			peso = 1
		} else {
			peso = 2
		}
	}
	return (10 - soma%10) % 10
}

// soma ponderada 2..max da direita para a esquerda
func somaMod11(s string, max int) int {
	soma, peso := 0, 2
	for i := len(s) - 1; i >= 0; i-- {
		soma += int(s[i]-'0') * peso
		peso++
		if peso > max {
			peso = 2
		}
	}
	return soma
}

func dvGeral(s43 string) int {
	r := somaMod11(s43, 9) % 11
	dv := 11 - r
	if dv == 0 || dv == 1 || dv == 10 || dv == 11 {
		return 1
	}
	return dv
}

var baseFator = time.Date(1997, 10, 7, 0, 0, 0, 0, time.UTC)

// Fator de vencimento: dias desde 07/10/1997; a partir de 22/02/2025 recomeça em 1000.
func FatorVencimento(v time.Time) (string, error) {
	d := time.Date(v.Year(), v.Month(), v.Day(), 0, 0, 0, 0, time.UTC)
	dias := int(math.Round(d.Sub(baseFator).Hours() / 24))
	if dias < 1000 {
		return "", errors.New("vencimento anterior ao permitido pela FEBRABAN")
	}
	if dias >= 10000 {
		dias -= 9000
	}
	if dias > 9999 {
		return "", errors.New("vencimento além do limite do fator FEBRABAN")
	}
	return fmt.Sprintf("%04d", dias), nil
}

func MontarCodigo(p ParamsBanco, nossoNumero string, venc time.Time, valor float64) (CodigoBoleto, error) {
	var r CodigoBoleto
	if p.Banco == "000" {
		r.BancoReal, r.NomePerfil, r.SemBarras = "000", "Bloqueto não bancário", true
		r.NossoNumero = nossoNumero
		r.AgCodigo = strings.TrimSpace(p.Agencia + " / " + p.Conta)
		return r, nil
	}
	perf, ok := perfis[p.Banco]
	if !ok {
		_, motivo := BancoSuportado(p.Banco)
		return r, errors.New(motivo)
	}
	if valor <= 0 || valor > 99999999.99 {
		return r, errors.New("valor fora do limite do código de barras")
	}
	livre, nnExib, agCod, cart, err := perf.livre(p, so(nossoNumero))
	if err != nil {
		return r, err
	}
	if len(livre) != 25 {
		return r, fmt.Errorf("campo livre com %d posições (esperado 25)", len(livre))
	}
	fator, err := FatorVencimento(venc)
	if err != nil {
		return r, err
	}
	cent := int64(math.Round(valor * 100))
	return montarComFator(perf, livre, nnExib, agCod, cart, fator, fmt.Sprintf("%010d", cent)), nil
}

// montarComFator: monta barras e linha com fator de vencimento e valor (10 posições) já prontos.
func montarComFator(perf perfilBanco, livre, nnExib, agCod, cart, fator, vl string) CodigoBoleto {
	var r CodigoBoleto
	sem := perf.real + "9" + fator + vl + livre
	dv := dvGeral(sem)
	barras := sem[:4] + strconv.Itoa(dv) + sem[4:]
	r.BancoReal, r.NomePerfil, r.Barras = perf.real, perf.nome, barras
	r.Linha = LinhaDigitavel(barras)
	r.NossoNumero, r.AgCodigo, r.Carteira = nnExib, agCod, cart
	return r
}

// RecalcularBarras refaz o código de barras com os dados bancários e o nosso número, usando o fator de
// vencimento e o valor que já estão no código informado (44 números). Assim a comparação com um boleto
// do ProSindW não depende de datas nem de arredondamento: só do cálculo do banco.
func RecalcularBarras(p ParamsBanco, nossoNumero, barras string) (CodigoBoleto, error) {
	perf, ok := perfis[p.Banco]
	if !ok {
		_, motivo := BancoSuportado(p.Banco)
		return CodigoBoleto{}, errors.New(motivo)
	}
	if len(barras) != 44 {
		return CodigoBoleto{}, errors.New("código de barras deve ter 44 números")
	}
	livre, nnExib, agCod, cart, err := perf.livre(p, so(nossoNumero))
	if err != nil {
		return CodigoBoleto{}, err
	}
	if len(livre) != 25 {
		return CodigoBoleto{}, fmt.Errorf("campo livre com %d posições (esperado 25)", len(livre))
	}
	return montarComFator(perf, livre, nnExib, agCod, cart, barras[5:9], barras[9:19]), nil
}

// BarrasDe aceita código de barras (44) ou linha digitável (47) e devolve o código de barras; "" se não for boleto bancário.
func BarrasDe(s string) string {
	d := so(s)
	switch len(d) {
	case 44:
		if d[0] == '8' { // arrecadação/concessionária
			return ""
		}
		return d
	case 47:
		b := d[0:4] + d[32:33] + d[33:47] + d[4:9] + d[10:20] + d[21:31]
		if so(LinhaDigitavel(b)) != d { // dígitos dos campos não batem: não é uma linha digitável
			return ""
		}
		return b
	}
	return ""
}

func LinhaDigitavel(b string) string {
	livre := b[19:44]
	c1 := b[0:4] + livre[0:5]
	c1 += strconv.Itoa(mod10(c1))
	c2 := livre[5:15]
	c2 += strconv.Itoa(mod10(c2))
	c3 := livre[15:25]
	c3 += strconv.Itoa(mod10(c3))
	return fmt.Sprintf("%s.%s %s.%s %s.%s %s %s", c1[:5], c1[5:], c2[:5], c2[5:], c3[:5], c3[5:], b[4:5], b[5:19])
}

// ---------------------------------------------------------------- perfis

func carteiraOu(p ParamsBanco, padrao string, n int) string {
	c := so(p.Carteira)
	if c == "" {
		c = padrao
	}
	return esq(c, n)
}

func livreBB(p ParamsBanco, nn string) (string, string, string, string, error) {
	cart := carteiraOu(p, "18", 2)
	ag := esq(p.Agencia, 4)
	agCod := fmt.Sprintf("%s-%s / %s-%s", ag, p.DigAgencia, esq(p.Conta, 8), p.DigConta)
	switch {
	case len(nn) == 17: // convênio 7 + sequencial 10
		return "000000" + nn + cart, nn, agCod, cart, nil
	case len(nn) == 11: // convênio 6 + sequencial 5
		r := somaMod11(nn, 9) % 11
		dv := "X"
		if r < 10 {
			dv = strconv.Itoa(r)
		}
		return nn + ag + esq(p.Conta, 8) + cart, nn + "-" + dv, agCod, cart, nil
	}
	return "", "", "", "", fmt.Errorf("nosso número do Banco do Brasil com %d dígitos (esperado 11 ou 17)", len(nn))
}

func livreCaixaSicob(p ParamsBanco, nn string) (string, string, string, string, error) {
	if len(nn) != 10 {
		return "", "", "", "", fmt.Errorf("nosso número da Caixa (SICOB) com %d dígitos (esperado 10)", len(nn))
	}
	ag, op, ced := esq(p.Agencia, 4), esq(p.Operacao, 3), esq(p.Conta, 8)
	dvnn := 11 - somaMod11(nn, 9)%11
	if dvnn > 9 {
		dvnn = 0
	}
	return nn + ag + op + ced, fmt.Sprintf("%s-%d", nn, dvnn), fmt.Sprintf("%s.%s.%s-%s", ag, op, ced, p.DigConta), "SR", nil
}

func livreCaixaSigcb(p ParamsBanco, nn string) (string, string, string, string, error) {
	if len(nn) != 17 {
		return "", "", "", "", fmt.Errorf("nosso número da Caixa (SIGCB) com %d dígitos (esperado 17)", len(nn))
	}
	ben := esq(p.Convenio, 6)
	if so(p.Convenio) == "" {
		ben = esq(p.Conta, 6)
	}
	dvb := 11 - somaMod11(ben, 9)%11
	if dvb > 9 {
		dvb = 0
	}
	sem := ben + strconv.Itoa(dvb) + nn[2:5] + nn[0:1] + nn[5:8] + nn[1:2] + nn[8:17]
	dv := 11 - somaMod11(sem, 9)%11
	if dv > 9 {
		dv = 0
	}
	dvnn := 11 - somaMod11(nn, 9)%11
	if dvnn > 9 {
		dvnn = 0
	}
	cart := "RG"
	if nn[0] == '2' {
		cart = "SR"
	}
	return sem + strconv.Itoa(dv), fmt.Sprintf("%s-%d", nn, dvnn), fmt.Sprintf("%s / %s-%d", esq(p.Agencia, 4), ben, dvb), cart, nil
}

func livreBradesco(p ParamsBanco, nn string) (string, string, string, string, error) {
	if len(nn) > 11 {
		return "", "", "", "", fmt.Errorf("nosso número do Bradesco com %d dígitos (máximo 11)", len(nn))
	}
	nn = esq(nn, 11)
	cart := carteiraOu(p, "09", 2)
	ag, conta := esq(p.Agencia, 4), esq(p.Conta, 7)
	s := cart + nn
	r := somaMod11(s, 7) % 11
	dv := "0"
	switch {
	case r == 1:
		dv = "P"
	case r > 1:
		dv = strconv.Itoa(11 - r)
	}
	return ag + cart + nn + conta + "0", fmt.Sprintf("%s/%s-%s", cart, nn, dv), fmt.Sprintf("%s-%s / %s-%s", ag, p.DigAgencia, conta, p.DigConta), cart, nil
}

func livreItau(p ParamsBanco, nn string) (string, string, string, string, error) {
	if len(nn) > 8 {
		return "", "", "", "", fmt.Errorf("nosso número do Itaú com %d dígitos (máximo 8)", len(nn))
	}
	nn = esq(nn, 8)
	cart := carteiraOu(p, "109", 3)
	ag, conta := esq(p.Agencia, 4), esq(p.Conta, 5)
	dac := mod10(ag + conta + cart + nn)
	dacConta := mod10(ag + conta)
	return cart + nn + strconv.Itoa(dac) + ag + conta + strconv.Itoa(dacConta) + "000",
		fmt.Sprintf("%s/%s-%d", cart, nn, dac), fmt.Sprintf("%s / %s-%d", ag, conta, dacConta), cart, nil
}

func livreSantander(p ParamsBanco, nn string) (string, string, string, string, error) {
	if len(nn) > 12 {
		return "", "", "", "", fmt.Errorf("nosso número do Santander com %d dígitos (máximo 12)", len(nn))
	}
	nn = esq(nn, 12)
	r := somaMod11(nn, 9) % 11
	dv := 0
	if r == 10 {
		dv = 1
	} else if r > 1 {
		dv = 11 - r
	}
	cod := esq(p.Convenio, 7)
	if so(p.Convenio) == "" {
		cod = esq(p.Conta, 7)
	}
	cart := carteiraOu(p, "101", 3)
	return "9" + cod + nn + strconv.Itoa(dv) + "0" + cart, fmt.Sprintf("%s-%d", nn, dv), fmt.Sprintf("%s / %s", esq(p.Agencia, 4), cod), cart, nil
}

func livreSicoob(p ParamsBanco, nn string) (string, string, string, string, error) {
	cli := esq(p.Convenio, 7)
	if so(p.Convenio) == "" {
		cli = esq(p.Conta, 7)
	}
	ag := esq(p.Agencia, 4)
	nn7 := esq(nn, 7)
	seq := ag + esq(cli, 10) + nn7
	pesos := []int{3, 1, 9, 7}
	soma := 0
	for i := range seq {
		soma += int(seq[i]-'0') * pesos[i%4]
	}
	r := soma % 11
	dv := 0
	if r > 1 {
		dv = 11 - r
	}
	cart := carteiraOu(p, "1", 1)
	mod := esq(p.Operacao, 2)
	if so(p.Operacao) == "" {
		mod = "01"
	}
	return cart + ag + mod + cli + nn7 + strconv.Itoa(dv) + "001", fmt.Sprintf("%s-%d", nn7, dv), fmt.Sprintf("%s / %s", ag, cli), cart, nil
}

func livreSicredi(p ParamsBanco, nn string) (string, string, string, string, error) {
	ag := esq(p.Agencia, 4)
	posto := esq(p.Operacao, 2)
	ben := esq(p.Convenio, 5)
	if so(p.Convenio) == "" {
		ben = esq(p.Conta, 5)
	}
	nn8 := esq(nn, 8)
	r := somaMod11(ag+posto+ben+nn8, 9) % 11
	dv := 11 - r
	if dv > 9 {
		dv = 0
	}
	nn9 := nn8 + strconv.Itoa(dv)
	sem := "1" + "1" + nn9 + ag + posto + ben + "1" + "0"
	r2 := somaMod11(sem, 9) % 11
	dv2 := 0
	if r2 > 1 {
		dv2 = 11 - r2
	}
	return sem + strconv.Itoa(dv2), fmt.Sprintf("%s/%s-%d", nn8[:2], nn8[2:], dv), fmt.Sprintf("%s.%s.%s", ag, posto, ben), "1", nil
}

// ---------------------------------------------------------------- conferência

// CompararLinha compara só os dígitos das duas linhas digitáveis.
func CompararLinha(a, b string) bool { return so(a) != "" && so(a) == so(b) }
