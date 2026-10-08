package main

import (
	"fmt"
	"math"
	"strings"
	"time"
)

type PedidoRelatorioPDF struct {
	Titulo    string     `json:"titulo"`
	Subtitulo string     `json:"subtitulo"`
	Colunas   []string   `json:"colunas"`
	Alinhar   []string   `json:"alinhar"` // "d" = direita
	Linhas    [][]string `json:"linhas"`
	Totais    []string   `json:"totais"`
	Arquivo   string     `json:"arquivo"`
	Entidade  string     `json:"-"`
}

func PDFRelatorio(r PedidoRelatorioPDF) []byte {
	const tam = 7.5
	medir := NovoPDF(false)
	medir.Fonte(false, tam)
	larg := make([]float64, len(r.Colunas))
	for i, c := range r.Colunas {
		medir.Fonte(true, tam)
		larg[i] = medir.LarguraTexto(c) + 8
	}
	medir.Fonte(false, tam)
	for k, l := range r.Linhas {
		if k > 400 {
			break
		}
		for i := range r.Colunas {
			if i < len(l) {
				larg[i] = math.Max(larg[i], math.Min(medir.LarguraTexto(l[i])+8, 220))
			}
		}
	}
	total := 0.0
	for _, v := range larg {
		total += v
	}
	paisagem := total > 523
	p := NovoPDF(paisagem)
	margem := 36.0
	util := p.Largura() - 2*margem
	if total > util {
		f := util / total
		for i := range larg {
			larg[i] *= f
		}
	} else if total < util {
		extra := (util - total) / float64(max(1, len(larg)))
		for i := range larg {
			larg[i] += extra
		}
	}
	gerado := time.Now().Format("02/01/2006 15:04")
	pagina := 1
	y := 0.0
	cab := func() {
		y = 40
		if r.Entidade != "" {
			p.Fonte(false, 8)
			p.Texto(margem, y, r.Entidade)
			y += 14
		}
		p.Fonte(true, 13)
		p.Texto(margem, y, r.Titulo)
		y += 14
		if r.Subtitulo != "" {
			p.Fonte(false, 8.5)
			p.Texto(margem, y, p.Cabe(r.Subtitulo, util))
			y += 12
		}
		y += 4
		p.Cor(0.93, 0.95, 0.98)
		p.RetanguloCheio(margem, y, util, 16)
		p.Cor(0, 0, 0)
		p.Fonte(true, tam)
		cx := margem
		for i, c := range r.Colunas {
			t := p.Cabe(c, larg[i]-6)
			if i < len(r.Alinhar) && r.Alinhar[i] == "d" {
				p.TextoDireita(cx+larg[i]-3, y+11, t)
			} else {
				p.Texto(cx+3, y+11, t)
			}
			cx += larg[i]
		}
		y += 16
		p.Linha(margem, y, margem+util, y, 0.6)
	}
	rodape := func() {
		p.Fonte(false, 7)
		p.Linha(margem, p.Altura()-30, margem+util, p.Altura()-30, 0.4)
		p.Texto(margem, p.Altura()-20, fmt.Sprintf("Base de Apoio · gerado em %s · %d registro(s)", gerado, len(r.Linhas)))
		p.TextoDireita(margem+util, p.Altura()-20, fmt.Sprintf("Página %d", pagina))
	}
	linhaTab := func(l []string, negrito bool) {
		p.Fonte(negrito, tam)
		cx := margem
		for i := range r.Colunas {
			v := ""
			if i < len(l) {
				v = l[i]
			}
			t := p.Cabe(v, larg[i]-6)
			if i < len(r.Alinhar) && r.Alinhar[i] == "d" {
				p.TextoDireita(cx+larg[i]-3, y+10, t)
			} else {
				p.Texto(cx+3, y+10, t)
			}
			cx += larg[i]
		}
		y += 13
	}
	cab()
	for k, l := range r.Linhas {
		if y > p.Altura()-50 {
			rodape()
			p.NovaPagina()
			pagina++
			cab()
		}
		if k%2 == 1 {
			p.Cor(0.97, 0.98, 0.99)
			p.RetanguloCheio(margem, y, util, 13)
			p.Cor(0, 0, 0)
		}
		linhaTab(l, false)
	}
	if len(r.Totais) > 0 {
		if y > p.Altura()-60 {
			rodape()
			p.NovaPagina()
			pagina++
			cab()
		}
		p.Linha(margem, y+1, margem+util, y+1, 0.8)
		y += 2
		linhaTab(r.Totais, true)
	}
	if len(r.Linhas) == 0 {
		p.Fonte(false, 9)
		p.Texto(margem, y+16, "Nenhum registro encontrado com esses filtros.")
	}
	rodape()
	return p.Bytes()
}

func nomeArquivoSeguro(s string) string {
	s = semAcento(s)
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == ' ', r == '-', r == '_', r == '/':
			b.WriteRune('_')
		}
	}
	out := strings.Trim(b.String(), "_")
	for strings.Contains(out, "__") {
		out = strings.ReplaceAll(out, "__", "_")
	}
	if out == "" {
		out = "relatorio"
	}
	if len(out) > 60 {
		out = out[:60]
	}
	return out
}
