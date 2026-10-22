package main

// Gerador de PDF mínimo (sem bibliotecas externas): texto em Helvetica/Helvetica-Bold (WinAnsi),
// linhas, retângulos e barras. Suficiente para boletos e relatórios em tabela.

import (
	"bytes"
	"fmt"
	"strings"
)

type PDF struct {
	larg, alt float64
	paginas   []*bytes.Buffer
	atual     *bytes.Buffer
	fonte     string
	tam       float64
}

func NovoPDF(paisagem bool) *PDF {
	p := &PDF{larg: 595.28, alt: 841.89, fonte: "F1", tam: 10}
	if paisagem {
		p.larg, p.alt = p.alt, p.larg
	}
	p.NovaPagina()
	return p
}

func (p *PDF) NovaPagina() {
	b := &bytes.Buffer{}
	p.paginas = append(p.paginas, b)
	p.atual = b
}

func (p *PDF) Largura() float64 { return p.larg }
func (p *PDF) Altura() float64  { return p.alt }

// y medido de cima para baixo (como na tela)
func (p *PDF) yy(y float64) float64 { return p.alt - y }

func (p *PDF) Fonte(negrito bool, tam float64) {
	p.fonte = "F1"
	if negrito {
		p.fonte = "F2"
	}
	p.tam = tam
}

func paraWinAnsi(s string) []byte {
	var out []byte
	for _, r := range s {
		switch {
		case r < 128:
			out = append(out, byte(r))
		case r >= 0xA0 && r <= 0xFF:
			out = append(out, byte(r))
		default:
			m := map[rune]byte{'€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '–': 0x96, '—': 0x97, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, 'º': 0xBA, 'ª': 0xAA}
			if b, ok := m[r]; ok {
				out = append(out, b)
			} else {
				out = append(out, '?')
			}
		}
	}
	return out
}

func escPDF(b []byte) string {
	var s strings.Builder
	for _, c := range b {
		switch c {
		case '(', ')', '\\':
			s.WriteByte('\\')
			s.WriteByte(c)
		default:
			if c < 32 {
				s.WriteByte(' ')
			} else {
				s.WriteByte(c)
			}
		}
	}
	return s.String()
}

// larguras Helvetica (1/1000 em), ASCII 32..126
var largHelv = []int{278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
	1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
	333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584}
var largHelvB = []int{278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
	975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
	333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584}

var baseAcento = map[rune]rune{'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'é': 'e', 'ê': 'e', 'è': 'e', 'í': 'i', 'ì': 'i', 'î': 'i', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ò': 'o', 'ö': 'o',
	'ú': 'u', 'ù': 'u', 'ü': 'u', 'ç': 'c', 'Á': 'A', 'À': 'A', 'Â': 'A', 'Ã': 'A', 'É': 'E', 'Ê': 'E', 'Í': 'I', 'Ó': 'O', 'Ô': 'O', 'Õ': 'O', 'Ú': 'U', 'Ç': 'C', 'º': 'o', 'ª': 'a'}

func (p *PDF) LarguraTexto(s string) float64 {
	tab := largHelv
	if p.fonte == "F2" {
		tab = largHelvB
	}
	t := 0
	for _, r := range s {
		if b, ok := baseAcento[r]; ok {
			r = b
		}
		if r >= 32 && r <= 126 {
			t += tab[r-32]
		} else {
			t += 556
		}
	}
	return float64(t) * p.tam / 1000
}

// Cabe corta o texto para caber na largura (com reticências).
func (p *PDF) Cabe(s string, larg float64) string {
	if p.LarguraTexto(s) <= larg {
		return s
	}
	rs := []rune(s)
	for len(rs) > 0 && p.LarguraTexto(string(rs)+"…") > larg {
		rs = rs[:len(rs)-1]
	}
	return string(rs) + "…"
}

func (p *PDF) Texto(x, y float64, s string) {
	fmt.Fprintf(p.atual, "BT /%s %.2f Tf %.2f %.2f Td (%s) Tj ET\n", p.fonte, p.tam, x, p.yy(y), escPDF(paraWinAnsi(s)))
}

func (p *PDF) TextoDireita(xDir, y float64, s string) { p.Texto(xDir-p.LarguraTexto(s), y, s) }
func (p *PDF) TextoCentro(xc, y float64, s string)    { p.Texto(xc-p.LarguraTexto(s)/2, y, s) }

func (p *PDF) Cor(r, g, b float64) {
	fmt.Fprintf(p.atual, "%.3f %.3f %.3f rg %.3f %.3f %.3f RG\n", r, g, b, r, g, b)
}

func (p *PDF) Linha(x1, y1, x2, y2, esp float64) {
	fmt.Fprintf(p.atual, "%.2f w %.2f %.2f m %.2f %.2f l S\n", esp, x1, p.yy(y1), x2, p.yy(y2))
}

func (p *PDF) Tracejada(x1, y1, x2, y2 float64) {
	fmt.Fprintf(p.atual, "[3 2] 0 d 0.5 w %.2f %.2f m %.2f %.2f l S [] 0 d\n", x1, p.yy(y1), x2, p.yy(y2))
}

func (p *PDF) Retangulo(x, y, w, h, esp float64) {
	fmt.Fprintf(p.atual, "%.2f w %.2f %.2f %.2f %.2f re S\n", esp, x, p.yy(y+h), w, h)
}

func (p *PDF) RetanguloCheio(x, y, w, h float64) {
	fmt.Fprintf(p.atual, "%.3f %.3f %.3f %.3f re f\n", x, p.yy(y+h), w, h)
}

// Interleaved 2 of 5 (código de barras do boleto). estreita = largura da barra fina em pontos.
func (p *PDF) BarrasI25(x, y, alt, estreita float64, digitos string) {
	pad := map[byte]string{'0': "nnwwn", '1': "wnnnw", '2': "nwnnw", '3': "wwnnn", '4': "nnwnw", '5': "wnwnn", '6': "nwwnn", '7': "nnnww", '8': "wnnwn", '9': "nwnwn"}
	larga := estreita * 3
	cx := x
	barra := func(w float64, preta bool) {
		if preta {
			p.RetanguloCheio(cx, y, w, alt)
		}
		cx += w
	}
	for i := 0; i < 4; i++ { // início: fina, espaço, fina, espaço
		barra(estreita, i%2 == 0)
	}
	if len(digitos)%2 == 1 {
		digitos = "0" + digitos
	}
	for i := 0; i < len(digitos); i += 2 {
		a, b := pad[digitos[i]], pad[digitos[i+1]]
		for k := 0; k < 5; k++ {
			wa, wb := estreita, estreita
			if a[k] == 'w' {
				wa = larga
			}
			if b[k] == 'w' {
				wb = larga
			}
			barra(wa, true)
			barra(wb, false)
		}
	}
	barra(larga, true) // fim: larga, espaço, fina
	barra(estreita, false)
	barra(estreita, true)
}

func (p *PDF) Bytes() []byte {
	var out bytes.Buffer
	offs := []int{}
	obj := func(conteudo string) {
		offs = append(offs, out.Len())
		fmt.Fprintf(&out, "%d 0 obj\n%s\nendobj\n", len(offs), conteudo)
	}
	out.WriteString("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")
	n := len(p.paginas)
	// 1 catálogo, 2 páginas, 3 fonte normal, 4 fonte negrito, depois (página, conteúdo) por página
	kids := []string{}
	for i := 0; i < n; i++ {
		kids = append(kids, fmt.Sprintf("%d 0 R", 5+i*2))
	}
	obj("<< /Type /Catalog /Pages 2 0 R >>")
	obj(fmt.Sprintf("<< /Type /Pages /Kids [%s] /Count %d >>", strings.Join(kids, " "), n))
	obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
	obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
	for i, pg := range p.paginas {
		obj(fmt.Sprintf("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2f %.2f] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents %d 0 R >>", p.larg, p.alt, 6+i*2))
		obj(fmt.Sprintf("<< /Length %d >>\nstream\n%sendstream", pg.Len(), pg.String()))
	}
	xref := out.Len()
	fmt.Fprintf(&out, "xref\n0 %d\n0000000000 65535 f \n", len(offs)+1)
	for _, o := range offs {
		fmt.Fprintf(&out, "%010d 00000 n \n", o)
	}
	fmt.Fprintf(&out, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(offs)+1, xref)
	return out.Bytes()
}
