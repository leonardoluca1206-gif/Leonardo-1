package main

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type Beneficiario struct {
	Nome      string `json:"nome"`
	Documento string `json:"documento"`
	Endereco  string `json:"endereco"`
}

type Conferencia struct {
	Banco string `json:"banco"`
	Chave string `json:"chave"` // parâmetros bancários conferidos (se mudarem, precisa conferir de novo)
	Linha string `json:"linha"`
	Data  string `json:"data"`
	Auto  bool   `json:"auto,omitempty"`  // conferida sozinha, com a linha que o ProSindW gravou no banco
	Fonte string `json:"fonte,omitempty"` // tabela.coluna de onde veio a linha do ProSindW
}

// alterarConferidos troca o mapa inteiro (cópia), para não mexer no que outra requisição está lendo.
func alterarConferidos(f func(m map[string]Conferencia)) error {
	cfgMu.Lock()
	defer cfgMu.Unlock()
	novo := make(map[string]Conferencia, len(cfg.Conferidos)+1)
	for k, v := range cfg.Conferidos {
		novo[k] = v
	}
	f(novo)
	cfg.Conferidos = novo
	return salvarConfig()
}

func conferidos() map[string]Conferencia {
	cfgMu.Lock()
	defer cfgMu.Unlock()
	return cfg.Conferidos
}

type Config struct {
	Host           string                 `json:"host"`
	Porta          int                    `json:"porta"`
	Caminho        string                 `json:"caminho"`
	Usuario        string                 `json:"usuario"`
	SenhaCifrada   string                 `json:"senha_cifrada"`
	SenhaMetodo    string                 `json:"senha_metodo"`
	UsuarioProsind string                 `json:"usuario_prosind"`
	WireCrypt      string                 `json:"wire_crypt"` // "", "true", "false"
	Beneficiario   Beneficiario           `json:"beneficiario"`
	ContribPadrao  string                 `json:"contribuicao_padrao"`
	PortaHTTP      int                    `json:"porta_http"`
	Conferidos     map[string]Conferencia `json:"bancos_conferidos"` // por tipo de contribuição
	senha          string
}

var (
	cfg    Config
	cfgMu  sync.Mutex
	cfgArq string
)

func protegerSimples(s string) []byte {
	b := []byte(s)
	for i := range b {
		b[i] ^= 0x5A
	}
	return b
}

func abrirSimples(d []byte) (string, error) {
	b := append([]byte(nil), d...)
	for i := range b {
		b[i] ^= 0x5A
	}
	return string(b), nil
}

// A configuração fica na pasta do usuário do Windows (%APPDATA%\BaseDeApoio), e não junto do .exe:
// assim ela continua valendo quando a pasta do sistema é substituída por uma versão nova.
func localConfig(pasta string) (arq, antigo string) {
	antigo = filepath.Join(pasta, "conector.json")
	if base, err := os.UserConfigDir(); err == nil && base != "" {
		dir := filepath.Join(base, "BaseDeApoio")
		if os.MkdirAll(dir, 0700) == nil {
			return filepath.Join(dir, "conector.json"), antigo
		}
	}
	return antigo, antigo
}

func carregarConfig(pasta string) {
	var antigo string
	cfgArq, antigo = localConfig(pasta)
	cfg = Config{Host: "127.0.0.1", Porta: 3050, Usuario: "SYSDBA", UsuarioProsind: "BASEAPOIO", PortaHTTP: 8765}
	migrar := false
	if b, err := os.ReadFile(cfgArq); err == nil {
		_ = json.Unmarshal(b, &cfg)
	} else if b, err := os.ReadFile(antigo); err == nil && antigo != cfgArq { // versão anterior: traz para o novo local
		_ = json.Unmarshal(b, &cfg)
		migrar = true
	}
	defer func() {
		if migrar && salvarConfig() == nil {
			_ = os.Rename(antigo, antigo+".migrado")
		}
	}()
	if cfg.Conferidos == nil {
		cfg.Conferidos = map[string]Conferencia{}
	}
	if cfg.PortaHTTP == 0 {
		cfg.PortaHTTP = 8765
	}
	if cfg.Porta == 0 {
		cfg.Porta = 3050
	}
	if cfg.SenhaCifrada != "" {
		if d, err := base64.StdEncoding.DecodeString(cfg.SenhaCifrada); err == nil {
			cfg.senha, _ = abrirSenha(d, cfg.SenhaMetodo)
		}
	}
}

func definirSenha(s string) error {
	d, metodo, err := protegerSenha(s)
	if err != nil {
		return err
	}
	cfg.senha = s
	cfg.SenhaCifrada = base64.StdEncoding.EncodeToString(d)
	cfg.SenhaMetodo = metodo
	return nil
}

func salvarConfig() error {
	b, _ := json.MarshalIndent(cfg, "", "  ")
	tmp := cfgArq + ".tmp"
	if err := os.WriteFile(tmp, b, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, cfgArq)
}

func usuarioProsind() string {
	u := strings.ToUpper(strings.TrimSpace(cfg.UsuarioProsind))
	if u == "" {
		u = "BASEAPOIO"
	}
	if len(u) > 20 {
		u = u[:20]
	}
	return u
}
