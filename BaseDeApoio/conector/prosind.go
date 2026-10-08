package main

// Dados que já existem no ProSindW e são lidos ao conectar:
// beneficiário (entidade da contribuição ou cadastro do sindicato), dados bancários,
// contrato de remessa, sequencial do nosso número e último boleto emitido.

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

type BeneficiarioAuto struct {
	Beneficiario
	Origem string `json:"origem"` // de onde veio (texto para o usuário)
}

type Sequencial struct {
	Gerador    string `json:"gerador"`
	Atual      int64  `json:"atual"`
	ProximoNN  string `json:"proximo_nn"`
	UltimoNN   string `json:"ultimo_nn"`
	UltimoVenc string `json:"ultimo_vencimento"`
	Erro       string `json:"erro,omitempty"`
}

type ContratoInfo struct {
	Codigo   int    `json:"codigo"`
	Nome     string `json:"nome"`
	Carteira string `json:"carteira"`
	Convenio string `json:"convenio"`
	Especie  string `json:"especie"`
	Aceite   string `json:"aceite"`
}

// gerador do nosso número por banco, conforme PSW_GERA_NN_SEQUENCIAL
var geradorBanco = map[string]string{
	"000": "PSW_GEN_BLOQUETO_BNB", "107": "PSW_GEN_GRCSU_REGISTRADA", "106": "PSW_GEN_BLOQUETO_104", "108": "PSW_GEN_BLOQUETO_104",
	"341": "PSW_GEN_BLOQUETO_341", "009": "PSW_GEN_BLOQUETO_001", "086": "PSW_GEN_BLOQUETO_085", "070": "PSW_GEN_BLOQUETO_070",
	"071": "PSW_GEN_BLOQUETO_070", "072": "PSW_GEN_BLOQUETO_070", "760": "PSW_GEN_BLOQUETO_756", "238": "PSW_GEN_BLOQUETO_237",
	"749": "PSW_GEN_BLOQUETO_748", "021": "PSW_GEN_BLOQUETO_021", "022": "PSW_GEN_BLOQUETO_021", "034": "PSW_GEN_BLOQUETO_033",
	"041": "PSW_GEN_BLOQUETO_041", "042": "PSW_GEN_BLOQUETO_041", "043": "PSW_GEN_BLOQUETO_041", "136": "PSW_GEN_BLOQUETO_136",
	"097": "PSW_GEN_BLOQUETO_097", "133": "PSW_GEN_BLOQUETO_133", "084": "PSW_GEN_BLOQUETO_084", "422": "PSW_GEN_BLOQUETO_422",
}

func geradorDo(banco string) string {
	if g, ok := geradorBanco[banco]; ok {
		return g
	}
	return "PSW_GEN_BLOQUETOS_FB" // demais bancos
}

var identSQL = regexp.MustCompile(`^[A-Z0-9_]+$`)

// ---------------------------------------------------------------- beneficiário

var (
	sindCache   *BeneficiarioAuto
	sindCacheEm time.Time
	sindMu      sync.Mutex
)

func limparCacheProsind() {
	sindMu.Lock()
	sindCache = nil
	sindMu.Unlock()
}

// texto de BLOB (WIN1252) -> string; vazio se não parecer texto legível (o ProSindW cifra alguns campos)
func textoLegivel(v interface{}) string {
	var s string
	switch x := v.(type) {
	case nil:
		return ""
	case string:
		if utf8.ValidString(x) {
			s = x
		} else {
			s = de1252([]byte(x))
		}
	case []byte:
		if utf8.Valid(x) {
			s = string(x)
		} else {
			s = de1252(x)
		}
	default:
		s = fmt.Sprint(x)
	}
	s = strings.TrimSpace(strings.ReplaceAll(s, "\x00", ""))
	if s == "" || utf8.RuneCountInString(s) > 150 {
		return ""
	}
	letras, ruins := 0, 0
	for _, r := range s {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			letras++
		case r == ' ' || strings.ContainsRune(".,-/&()'ºª°:", r):
		default:
			ruins++
		}
	}
	if letras == 0 || ruins*10 > utf8.RuneCountInString(s) {
		return ""
	}
	return strings.Join(strings.Fields(s), " ")
}

func de1252(b []byte) string {
	esp := map[byte]rune{0x80: '€', 0x8A: 'Š', 0x8C: 'Œ', 0x8E: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x96: '–', 0x97: '—', 0x9A: 'š', 0x9C: 'œ', 0x9E: 'ž', 0x9F: 'Ÿ'}
	var sb strings.Builder
	for _, c := range b {
		if r, ok := esp[c]; ok {
			sb.WriteRune(r)
		} else if c >= 0x80 && c < 0xA0 {
			sb.WriteRune('�')
		} else {
			sb.WriteRune(rune(c))
		}
	}
	return sb.String()
}

func cnpjValido(s string) bool {
	d := so(s)
	if len(d) != 14 || strings.Count(d, d[:1]) == 14 {
		return false
	}
	calc := func(n int) byte {
		pesos := []int{6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2}[13-n:]
		soma := 0
		for i := 0; i < n; i++ {
			soma += int(d[i]-'0') * pesos[i]
		}
		r := soma % 11
		if r < 2 {
			return '0'
		}
		return byte('0' + 11 - r)
	}
	return calc(12) == d[12] && calc(13) == d[13]
}

func juntar(partes ...string) string {
	out := []string{}
	for _, p := range partes {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return strings.Join(out, ", ")
}

// cadastro do sindicato (Tabelas > Sindicato). Nome e CNPJ só são usados se estiverem legíveis.
func beneficiarioSindicato(ctx context.Context, q queryer) BeneficiarioAuto {
	sindMu.Lock()
	if sindCache != nil && time.Since(sindCacheEm) < 5*time.Minute {
		b := *sindCache
		sindMu.Unlock()
		return b
	}
	sindMu.Unlock()
	b := BeneficiarioAuto{}
	rows, err := q.QueryContext(ctx, `SELECT FIRST 1 NMSINDICATO, CDCNPJ, NMENDERECO, NRNUMERO, DSCOMPLEMENTO, NMBAIRRO, NMCIDADE, CDUF, CDCEP FROM PSW_SINDICATO ORDER BY CDSINDICATO`)
	if err == nil {
		if rows.Next() {
			v := make([]interface{}, 9)
			p := make([]interface{}, 9)
			for i := range v {
				p[i] = &v[i]
			}
			if rows.Scan(p...) == nil {
				b.Nome = textoLegivel(v[0])
				if c := so(textoLegivel(v[1])); cnpjValido(c) {
					b.Documento = c
				}
				t := func(i int) string { return textoLegivel(v[i]) }
				cep := so(t(8))
				if len(cep) == 8 {
					cep = "CEP " + cep[:5] + "-" + cep[5:]
				}
				rua := t(2)
				if n := t(3); n != "" {
					rua += ", " + n
				}
				cid := t(6)
				if uf := t(7); uf != "" {
					cid += " - " + uf
				}
				b.Endereco = juntar(rua, t(4), t(5), cid, cep)
			}
		}
		rows.Close()
	}
	if b.Nome == "" { // nome do sindicato no CaixaW (texto simples)
		if ms, err := linhas(ctx, q, "SELECT FIRST 1 NMSINDICATO FROM CXW_SINDICATOS WHERE NMSINDICATO IS NOT NULL ORDER BY CDSINDICATO"); err == nil && len(ms) > 0 {
			b.Nome = vStr(ms[0]["NMSINDICATO"])
			if b.Nome != "" {
				b.Origem = "cadastro do sindicato no CaixaW"
			}
		}
	} else {
		b.Origem = "cadastro do sindicato no ProSindW"
	}
	if b.Origem == "" && b.Endereco != "" {
		b.Origem = "cadastro do sindicato no ProSindW (só endereço)"
	}
	sindMu.Lock()
	sindCache, sindCacheEm = &b, time.Now()
	sindMu.Unlock()
	return b
}

// entidade informada na contribuição (Tabelas > Tipos de contribuição > Entidade)
func beneficiarioEntidade(ctx context.Context, q queryer, cd int) (BeneficiarioAuto, bool) {
	if cd <= 0 {
		return BeneficiarioAuto{}, false
	}
	ms, err := linhas(ctx, q, `SELECT NMENTIDADE, NRCNPJ, NMENDERECO, DSCOMPLEMENTO, NMBAIRRO, NMCIDADE, CDUF, CDCEP FROM PSW_ENTIDADES WHERE CDENTIDADE = ?`, cd)
	if err != nil || len(ms) == 0 {
		return BeneficiarioAuto{}, false
	}
	m := ms[0]
	cep := so(vStr(m["CDCEP"]))
	if len(cep) == 8 {
		cep = "CEP " + cep[:5] + "-" + cep[5:]
	}
	cid := vStr(m["NMCIDADE"])
	if uf := vStr(m["CDUF"]); uf != "" {
		cid += " - " + uf
	}
	return BeneficiarioAuto{Beneficiario: Beneficiario{Nome: vStr(m["NMENTIDADE"]), Documento: so(vStr(m["NRCNPJ"])),
		Endereco: juntar(vStr(m["NMENDERECO"]), vStr(m["DSCOMPLEMENTO"]), vStr(m["NMBAIRRO"]), cid, cep)},
		Origem: fmt.Sprintf("entidade %d do ProSindW (informada na contribuição)", cd)}, true
}

// Beneficiário que sai no boleto: vem do ProSindW; o que foi digitado na Base de Apoio
// só completa o que o ProSindW não tiver (nome, CNPJ ou endereço em branco).
func beneficiarioDe(ctx context.Context, q queryer, ct ContribInfo) BeneficiarioAuto {
	b, ok := beneficiarioEntidade(ctx, q, ct.Entidade)
	if !ok {
		b = beneficiarioSindicato(ctx, q)
	}
	man := cfg.Beneficiario
	completou := []string{}
	if s := strings.TrimSpace(man.Nome); s != "" && b.Nome == "" {
		b.Nome = s
		completou = append(completou, "nome")
	}
	if s := so(man.Documento); s != "" && b.Documento == "" {
		b.Documento = s
		completou = append(completou, "CNPJ")
	}
	if s := strings.TrimSpace(man.Endereco); s != "" && b.Endereco == "" {
		b.Endereco = s
		completou = append(completou, "endereço")
	}
	if len(completou) > 0 {
		txt := strings.Join(completou, ", ") + " digitado na Base de Apoio"
		if b.Origem == "" {
			b.Origem = txt
		} else {
			b.Origem += "; " + txt
		}
	}
	return b
}

// ---------------------------------------------------------------- contrato e sequencial

func contratoDe(ctx context.Context, q queryer, cd int) *ContratoInfo {
	if cd <= 0 {
		return nil
	}
	ms, err := linhas(ctx, q, `SELECT NMCONTRATO, CDCARTEIRA, CDCONVENIO, CDESPECIE, CDACEITE FROM PSW_CONTRATO_REMESSA WHERE CDCONTRATO = ?`, cd)
	if err != nil || len(ms) == 0 {
		return nil
	}
	m := ms[0]
	return &ContratoInfo{Codigo: cd, Nome: vStr(m["NMCONTRATO"]), Carteira: vStr(m["CDCARTEIRA"]), Convenio: vStr(m["CDCONVENIO"]),
		Especie: vStr(m["CDESPECIE"]), Aceite: vStr(m["CDACEITE"])}
}

func sequencialDe(ctx context.Context, q queryer, ct ContribInfo) *Sequencial {
	if ct.Banco == "" {
		return nil
	}
	s := &Sequencial{Gerador: geradorDo(ct.Banco)}
	if identSQL.MatchString(s.Gerador) {
		if ms, err := linhas(ctx, q, "SELECT GEN_ID("+s.Gerador+", 0) AS N FROM RDB$DATABASE"); err == nil && len(ms) > 0 {
			s.Atual = int64(vFloat(ms[0]["N"]))
			// mesmo cálculo do ProSindW para o próximo número
			if ns, err := linhas(ctx, q, "EXECUTE PROCEDURE PSW_GERA_NN_BANCO(?, ?, ?, ?)", ct.Banco, fmt.Sprint(s.Atual+1), ct.Params.InBloqueto, ct.Params.Convenio); err == nil && len(ns) > 0 {
				s.ProximoNN = vStr(ns[0]["DOCUMENTO"])
			}
		} else if err != nil {
			s.Erro = "não consegui ler o gerador " + s.Gerador
		}
	}
	if ms, err := linhas(ctx, q, `SELECT FIRST 1 NRNOSSONUMERO, DTVENCIMENTO FROM PSW_BLOQUETOSEMP
	  WHERE CDCONTRIBUICAO = ? AND CDBANCO = ? AND NRNOSSONUMERO IS NOT NULL AND DTVENCIMENTO >= ? ORDER BY DTVENCIMENTO DESC`,
		ct.Codigo, ct.Banco, time.Now().AddDate(-2, 0, 0)); err == nil && len(ms) > 0 {
		s.UltimoNN, s.UltimoVenc = vStr(ms[0]["NRNOSSONUMERO"]), dataBR(vStr(ms[0]["DTVENCIMENTO"]))
	}
	return s
}

// ---------------------------------------------------------------- conferência (uma vez por banco)

// devolve a contribuição cuja conferência vale para este banco
func conferidoPor(c ContribInfo) (string, *Conferencia) {
	m := conferidos()
	if cf, ok := m[c.Codigo]; ok && cf.Banco == c.Banco {
		return c.Codigo, &cf
	}
	for tipo, cf := range m {
		if cf.Banco == c.Banco && c.Banco != "" {
			cf := cf
			return tipo, &cf
		}
	}
	return "", nil
}
