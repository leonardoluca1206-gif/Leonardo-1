package main

import (
	"fmt"
	"net/url"
	"strings"
	"time"
)

type DadosBoletoPDF struct {
	Resumo        *Resumo
	Codigo        CodigoBoleto
	NossoNumero   string
	Vencimento    time.Time
	Valor         float64
	LocalPagto    string
	Instrucoes    []string
	Beneficiario  Beneficiario
	Aceite        string
	Processamento time.Time
}

func urlEsc(s string) string { return url.QueryEscape(s) }

// campo: rótulo pequeno em cima, valor embaixo, dentro de uma célula
func celula(p *PDF, x, y, w, h float64, rotulo, valor string, direita bool) {
	p.Retangulo(x, y, w, h, 0.5)
	p.Fonte(false, 5.5)
	p.Texto(x+2, y+6.5, rotulo)
	p.Fonte(true, 8.5)
	v := p.Cabe(valor, w-4)
	if direita {
		p.TextoDireita(x+w-3, y+h-3.5, v)
	} else {
		p.Texto(x+3, y+h-3.5, v)
	}
}

func cabecalhoBanco(p *PDF, x, y, w float64, d DadosBoletoPDF, direita string) {
	banco := d.Codigo.BancoReal
	dig := dvBancos[banco]
	if d.Resumo != nil && d.Resumo.Contrib.DigBanco != "" && d.Resumo.Contrib.Banco == banco {
		dig = d.Resumo.Contrib.DigBanco
	}
	nome := ""
	if d.Resumo != nil {
		nome = d.Resumo.Contrib.NomeBanco
	}
	p.Fonte(true, 11)
	p.Texto(x, y+14, p.Cabe(strings.ToUpper(nome), 150))
	p.Linha(x+155, y+2, x+155, y+19, 1.2)
	p.Fonte(true, 14)
	cod := banco
	if dig != "" {
		cod += "-" + dig
	}
	p.Texto(x+161, y+15, cod)
	p.Linha(x+208, y+2, x+208, y+19, 1.2)
	p.Fonte(true, 10)
	p.TextoDireita(x+w, y+15, direita)
	p.Linha(x, y+20, x+w, y+20, 1.2)
}

func PDFBoleto(d DadosBoletoPDF) []byte {
	p := NovoPDF(false)
	x, w := 36.0, 523.0
	r := d.Resumo
	e := r.Empresa
	benef := strings.TrimSpace(d.Beneficiario.Nome)
	if doc := strings.TrimSpace(d.Beneficiario.Documento); doc != "" {
		benef += " - CNPJ " + mascaraCNPJ(doc)
	}
	pagador := fmt.Sprintf("%s - CNPJ %s", e.Nome, mascaraCNPJ(e.CNPJ))
	if e.CNPJ == "" {
		pagador = e.Nome
	}
	endPag := strings.TrimSpace(fmt.Sprintf("%s %s", e.Endereco, e.Bairro))
	cidPag := strings.TrimSpace(fmt.Sprintf("%s %s - %s  CEP %s", "", e.Cidade, e.UF, e.CEP))
	venc := d.Vencimento.Format("02/01/2006")
	valor := moeda(d.Valor)
	numDoc := fmt.Sprintf("%s %02d/%d", r.Contrib.Codigo, r.Mes, r.Ano)
	linha := d.Codigo.Linha
	if d.Codigo.SemBarras {
		linha = "Bloqueto não bancário"
	}

	// ---------------- recibo do pagador
	y := 30.0
	p.Fonte(true, 9)
	p.Texto(x, y, "RECIBO DO PAGADOR")
	y += 6
	cabecalhoBanco(p, x, y, w, d, "")
	y += 22
	celula(p, x, y, 330, 22, "Beneficiário", benef, false)
	celula(p, x+330, y, 108, 22, "Agência / Código do beneficiário", d.Codigo.AgCodigo, false)
	celula(p, x+438, y, 85, 22, "Vencimento", venc, true)
	y += 22
	celula(p, x, y, 330, 22, "Pagador", pagador, false)
	celula(p, x+330, y, 108, 22, "Nosso número", d.Codigo.NossoNumero, false)
	celula(p, x+438, y, 85, 22, "(=) Valor do documento", valor, true)
	y += 22
	celula(p, x, y, 170, 22, "Número do documento", numDoc, false)
	celula(p, x+170, y, 160, 22, "Contribuição", r.Contrib.Descricao, false)
	celula(p, x+330, y, 108, 22, "Referência", fmt.Sprintf("%02d/%d", r.Mes, r.Ano), false)
	celula(p, x+438, y, 85, 22, "(=) Valor cobrado", "", true)
	y += 30
	p.Fonte(false, 6)
	p.TextoDireita(x+w, y, "Autenticação mecânica")
	y += 26
	p.Tracejada(x, y, x+w, y)
	p.Fonte(false, 5.5)
	p.TextoDireita(x+w, y-2, "Corte na linha pontilhada")

	// ---------------- ficha de compensação
	y += 14
	cabecalhoBanco(p, x, y, w, d, linha)
	y += 22
	lw := 405.0
	rw := w - lw
	local := d.LocalPagto
	if local == "" {
		local = "Pagável em qualquer banco até o vencimento"
	}
	celula(p, x, y, lw, 22, "Local de pagamento", local, false)
	celula(p, x+lw, y, rw, 22, "Vencimento", venc, true)
	y += 22
	if end := strings.TrimSpace(d.Beneficiario.Endereco); end != "" {
		celula(p, x, y, lw, 30, "Beneficiário", "", false)
		p.Fonte(true, 8.5)
		p.Texto(x+3, y+16, p.Cabe(benef, lw-6))
		p.Fonte(false, 6.5)
		p.Texto(x+3, y+26, p.Cabe(end, lw-6))
		celula(p, x+lw, y, rw, 30, "Agência / Código do beneficiário", d.Codigo.AgCodigo, true)
		y += 30
	} else {
		celula(p, x, y, lw, 22, "Beneficiário", benef, false)
		celula(p, x+lw, y, rw, 22, "Agência / Código do beneficiário", d.Codigo.AgCodigo, true)
		y += 22
	}
	celula(p, x, y, 80, 22, "Data do documento", d.Processamento.Format("02/01/2006"), false)
	celula(p, x+80, y, 120, 22, "Número do documento", numDoc, false)
	celula(p, x+200, y, 70, 22, "Espécie doc.", "DS", false)
	aceite := strings.ToUpper(strings.TrimSpace(d.Aceite))
	if aceite != "S" && aceite != "A" {
		aceite = "N"
	} else {
		aceite = "S"
	}
	celula(p, x+270, y, 45, 22, "Aceite", aceite, false)
	celula(p, x+315, y, 90, 22, "Data processamento", d.Processamento.Format("02/01/2006"), false)
	celula(p, x+lw, y, rw, 22, "Nosso número", d.Codigo.NossoNumero, true)
	y += 22
	celula(p, x, y, 80, 22, "Uso do banco", "", false)
	celula(p, x+80, y, 60, 22, "Carteira", d.Codigo.Carteira, false)
	celula(p, x+140, y, 60, 22, "Espécie", "R$", false)
	celula(p, x+200, y, 115, 22, "Quantidade", "", false)
	celula(p, x+315, y, 90, 22, "Valor", "", false)
	celula(p, x+lw, y, rw, 22, "(=) Valor do documento", valor, true)
	y += 22
	hInst := 110.0
	p.Retangulo(x, y, lw, hInst, 0.5)
	p.Fonte(false, 5.5)
	p.Texto(x+2, y+6.5, "Instruções (texto de responsabilidade do beneficiário)")
	p.Fonte(false, 8)
	iy := y + 18
	for _, s := range d.Instrucoes {
		if strings.TrimSpace(s) == "" {
			continue
		}
		p.Texto(x+4, iy, p.Cabe(s, lw-8))
		iy += 11
	}
	p.Texto(x+4, iy, fmt.Sprintf("Referente a %s - %02d/%d.", r.Contrib.Descricao, r.Mes, r.Ano))
	for i, rot := range []string{"(-) Desconto / Abatimento", "(-) Outras deduções", "(+) Mora / Multa", "(+) Outros acréscimos", "(=) Valor cobrado"} {
		celula(p, x+lw, y+float64(i)*22, rw, 22, rot, "", true)
	}
	y += hInst
	p.Retangulo(x, y, w, 42, 0.5)
	p.Fonte(false, 5.5)
	p.Texto(x+2, y+6.5, "Pagador")
	p.Fonte(true, 8)
	p.Texto(x+40, y+11, p.Cabe(pagador, w-50))
	p.Fonte(false, 8)
	p.Texto(x+40, y+22, p.Cabe(endPag, w-50))
	p.Texto(x+40, y+32, p.Cabe(cidPag, w-50))
	p.Fonte(false, 5.5)
	p.Texto(x+2, y+40, "Sacador / Avalista")
	y += 46
	p.Fonte(false, 6)
	p.TextoDireita(x+w, y+6, "Autenticação mecânica - Ficha de Compensação")
	if !d.Codigo.SemBarras {
		p.BarrasI25(x, y+4, 36, 0.72, d.Codigo.Barras)
	} else {
		p.Fonte(true, 9)
		p.Texto(x, y+18, "Documento sem código de barras (bloqueto não bancário): pague na entidade.")
	}
	p.Fonte(false, 6)
	p.Texto(x, 820, fmt.Sprintf("Gerado pela Base de Apoio em %s. Nosso número %s.", d.Processamento.Format("02/01/2006 15:04"), d.NossoNumero))
	return p.Bytes()
}
