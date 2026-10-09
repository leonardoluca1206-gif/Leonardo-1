package main

import (
	"encoding/hex"
	"testing"
)

func TestPBKDF2(t *testing.T) {
	// RFC 7914, seção 11
	h := pbkdf2SHA256([]byte("passwd"), []byte("salt"), 1, 64)
	esp := "55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783"
	if hex.EncodeToString(h) != esp {
		t.Fatalf("pbkdf2: %x", h)
	}
}

func TestSenha(t *testing.T) {
	h, err := gerarHash("segredo123")
	if err != nil {
		t.Fatal(err)
	}
	if !conferirSenha("segredo123", h) || conferirSenha("segredo124", h) || conferirSenha("segredo123", "lixo") {
		t.Fatal("conferência da senha")
	}
	if h2, _ := gerarHash("segredo123"); h2 == h {
		t.Fatal("sal repetido")
	}
}
