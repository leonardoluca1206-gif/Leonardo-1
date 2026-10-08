package main

import (
	"strings"
	"testing"
	"time"
)

func d(a, m, dd int) time.Time { return time.Date(a, time.Month(m), dd, 0, 0, 0, 0, time.Local) }

func TestFator(t *testing.T) {
	casos := map[time.Time]string{d(2000, 7, 3): "1000", d(2025, 2, 21): "9999", d(2025, 2, 22): "1000", d(2026, 6, 10): "1473"}
	for dt, esp := range casos {
		if f, _ := FatorVencimento(dt); f != esp {
			t.Errorf("%v: %s, esperado %s", dt, f, esp)
		}
	}
}

func TestPerfis(t *testing.T) {
	p := ParamsBanco{Agencia: "1234", DigAgencia: "5", Conta: "12345", DigConta: "6", Convenio: "1234567", Carteira: "", Operacao: "", InBloqueto: "14"}
	nns := map[string]string{"001": "12345612345", "009": "12345670000000123", "104": "8200000123", "106": "14000000000000123", "237": "26000000123", "341": "12345678", "033": "1234567", "756": "26000123", "748": "26200123"}
	for banco, nn := range nns {
		p.Banco = banco
		c, err := MontarCodigo(p, nn, d(2026, 10, 15), 350.5)
		if err != nil {
			t.Fatalf("%s: %v", banco, err)
		}
		if len(c.Barras) != 44 {
			t.Fatalf("%s: barras com %d", banco, len(c.Barras))
		}
		sem := c.Barras[:4] + c.Barras[5:]
		if dv := dvGeral(sem); string(rune('0'+dv)) != c.Barras[4:5] {
			t.Errorf("%s: DV geral", banco)
		}
		if so(c.Linha) == "" || len(so(c.Linha)) != 47 {
			t.Errorf("%s: linha %q", banco, c.Linha)
		}
		if c.Barras[:3] != c.BancoReal || c.Barras[5:9] != "1600" || c.Barras[9:19] != "0000035050" {
			t.Errorf("%s: cabeçalho %s", banco, c.Barras[:19])
		}
	}
}

func TestSomenteLeitura(t *testing.T) {
	for _, q := range []string{"DELETE FROM X", "SELECT 1 FROM A; DELETE FROM A", "UPDATE A SET B=1", "SELECT GEN_ID(G,1) FROM RDB$DATABASE"} {
		if _, err := SomenteLeitura(q); err == nil {
			t.Errorf("aceitou %q", q)
		}
	}
	if _, err := SomenteLeitura("SELECT NMEMPRESA FROM PSW_EMPRESAS WHERE NMEMPRESA CONTAINING 'x;y'"); err != nil {
		t.Errorf("recusou consulta válida: %v", err)
	}
}

func TestValores(t *testing.T) {
	casos := map[string]float64{"300": 300, "300,00": 300, "1.200,50": 1200.5, "R$ 45,9": 45.9, "300 reais": 300, "99.90": 99.9}
	for s, esp := range casos {
		if v, err := lerValor(s); err != nil || v != esp {
			t.Errorf("%q: %v %v", s, v, err)
		}
	}
	if _, _, err := lerVencimento("10/09/206"); err == nil {
		t.Error("aceitou ano com 3 dígitos")
	}
	if _, _, err := lerVencimento("31/02/2026"); err == nil {
		t.Error("aceitou 31/02")
	}
}

func TestCNPJeTexto(t *testing.T) {
	if !cnpjValido("11444777000161") || cnpjValido("11444777000162") || cnpjValido("00000000000000") {
		t.Fatal("cnpjValido")
	}
	if textoLegivel([]byte{0x8F, 0x1A, 0x9C, 0x03, 0xB2}) != "" {
		t.Fatal("cifrado deveria ser ignorado")
	}
	if textoLegivel([]byte("SINDICATO DOS COMERCI\xc1RIOS")) != "SINDICATO DOS COMERCIÁRIOS" {
		t.Fatal("win1252")
	}
	if geradorDo("106") != "PSW_GEN_BLOQUETO_104" || geradorDo("104") != "PSW_GEN_BLOQUETOS_FB" {
		t.Fatal("gerador")
	}
}

func TestConferenciaAutomatica(t *testing.T) {
	p := ParamsBanco{Agencia: "1234", DigAgencia: "5", Conta: "12345", DigConta: "6", Convenio: "1234567", InBloqueto: "14"}
	nns := map[string]string{"001": "12345612345", "104": "8200000123", "106": "14000000000000123", "237": "26000000123", "341": "12345678", "033": "1234567", "756": "26000123", "748": "26200123"}
	for banco, nn := range nns {
		p.Banco = banco
		c, err := MontarCodigo(p, nn, d(2026, 10, 15), 350.5)
		if err != nil {
			t.Fatalf("%s: %v", banco, err)
		}
		// o ProSindW pode gravar a linha (com pontos e espaços) ou o código de barras
		for _, gravado := range []string{c.Linha, c.Barras} {
			b := BarrasDe(gravado)
			if b != c.Barras {
				t.Fatalf("%s: BarrasDe(%q) = %q, esperado %q", banco, gravado, b, c.Barras)
			}
			r, err := RecalcularBarras(p, nn, b)
			if err != nil || r.Barras != b || r.Linha != c.Linha {
				t.Errorf("%s: recálculo %q (%v), esperado %q", banco, r.Linha, err, c.Linha)
			}
		}
		// outro nosso número ou outra conta: tem de acusar diferença
		if r, _ := RecalcularBarras(p, nn[:len(nn)-1]+"9", c.Barras); r.Barras == c.Barras {
			t.Errorf("%s: nosso número diferente passou como igual", banco)
		}
		q := p
		q.Conta, q.Convenio = "54321", "7654321"
		if r, _ := RecalcularBarras(q, nn, c.Barras); r.Barras == c.Barras {
			t.Errorf("%s: conta diferente passou como igual", banco)
		}
	}
	if BarrasDe("123") != "" || BarrasDe("83600000001-1 23450000000-1 00000000000-0 00000000000-0") != "" {
		t.Error("aceitou o que não é boleto bancário")
	}
	l := []byte(so("00190.00009 01234.567004 00000.123455 1 16000000035050"))
	l[5] = '9' // dígito trocado: os DVs da linha não batem
	if BarrasDe(string(l)) != "" {
		t.Error("aceitou linha com dígito errado")
	}
}

func TestSQLFonte(t *testing.T) {
	f := fonteLinha{Tabela: "PSW_BLOQUETOSEMP", Coluna: "DSLINHADIGITAVEL", cols: map[string]bool{"NRNOSSONUMERO": true, "CDCONTRIBUICAO": true, "DTVENCIMENTO": true}}
	s := sqlFonte(f, 2, true)
	if !strings.Contains(s, `IN (?,?)`) || !strings.Contains(s, "DTVENCIMENTO >= ?") || !strings.Contains(s, `T."DSLINHADIGITAVEL"`) {
		t.Error(s)
	}
	g := fonteLinha{Tabela: "PSW_BLOQUETOSEMPWEB", Coluna: "CODBARRAS", cols: map[string]bool{"CDEMPRESA": true, "CDCONTRIBUICAO": true, "NRANOEXERCICIO": true, "NRMESEXERCICIO": true, "DTVENCIMENTO": true}}
	if s := sqlFonte(g, 1, false); !strings.Contains(s, "JOIN PSW_BLOQUETOSEMP B") || strings.Contains(s, ">= ?") {
		t.Error(s)
	}
}
