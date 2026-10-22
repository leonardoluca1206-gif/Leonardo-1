package main

// Últimos relatórios gerados (por usuário) e preferidos.
// Fica em %APPDATA%\BaseDeApoio\relatorios_gerados.json, ao lado do conector.json,
// para continuar valendo quando a pasta do sistema é trocada por uma versão nova.

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	maxRecentesPorUsuario   = 40  // não preferidos guardados por usuário
	maxPreferidosPorUsuario = 100 // preferidos por usuário
	maxArquivosPorItem      = 6   // PDFs/Excel lembrados por item
	maxExcelBytes           = 60 << 20
)

type ArquivoGerado struct {
	Tipo    string `json:"tipo"`    // "pdf" | "xlsx"
	Arquivo string `json:"arquivo"` // relativo a "Arquivos gerados" (ex.: Relatorios/x.pdf)
	Em      string `json:"em"`
	Existe  bool   `json:"existe"` // calculado na listagem
}

type ItemGerado struct {
	ID         string                 `json:"id"`
	Usuario    string                 `json:"-"`
	UsuarioArq string                 `json:"usuario,omitempty"` // só no arquivo
	Modulo     string                 `json:"modulo"`            // id do relatório do Assistente
	Sistema    string                 `json:"sistema,omitempty"`
	Titulo     string                 `json:"titulo"`
	Subtitulo  string                 `json:"subtitulo,omitempty"`
	Texto      string                 `json:"texto"` // frase pedida ao Assistente
	Respostas  map[string]interface{} `json:"respostas,omitempty"`
	Registros  int                    `json:"registros"`
	Vezes      int                    `json:"vezes"`
	CriadoEm   string                 `json:"criado_em"`
	GeradoEm   string                 `json:"gerado_em"`
	Favorito   bool                   `json:"favorito"`
	Apelido    string                 `json:"apelido,omitempty"`
	Arquivos   []ArquivoGerado        `json:"arquivos"`
}

var (
	geradosMu  sync.Mutex
	gerados    []*ItemGerado
	geradosOk  bool
	geradosArq string
)

func arqGerados() string {
	if geradosArq == "" {
		geradosArq = filepath.Join(filepath.Dir(cfgArq), "relatorios_gerados.json")
	}
	return geradosArq
}

// chamar com geradosMu travado
func carregarGerados() {
	if geradosOk {
		return
	}
	geradosOk = true
	b, err := os.ReadFile(arqGerados())
	if err != nil {
		return
	}
	var lst []*ItemGerado
	if json.Unmarshal(b, &lst) == nil {
		for _, it := range lst {
			it.Usuario = it.UsuarioArq
		}
		gerados = lst
	}
}

// chamar com geradosMu travado
func salvarGerados() error {
	for _, it := range gerados {
		it.UsuarioArq = it.Usuario
	}
	b, err := json.MarshalIndent(gerados, "", " ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(arqGerados()), 0700); err != nil {
		return err
	}
	tmp := arqGerados() + ".tmp"
	if err := os.WriteFile(tmp, b, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, arqGerados())
}

func novoIDGerado() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func agoraISO() string { return time.Now().Format("2006-01-02T15:04:05") }

// mesmo pedido = mesmo relatório, mesma frase e mesmas respostas
func chavePedido(modulo, texto string, resp map[string]interface{}) string {
	b, _ := json.Marshal(resp) // chaves em ordem
	return modulo + "\x00" + strings.Join(strings.Fields(strings.ToLower(texto)), " ") + "\x00" + string(b)
}

func itemDoUsuario(login, id string) *ItemGerado {
	for _, it := range gerados {
		if it.ID == id && strings.EqualFold(it.Usuario, login) {
			return it
		}
	}
	return nil
}

// mantém os preferidos e os mais recentes de cada usuário
func podarGerados(login string) {
	var meus, outros []*ItemGerado
	for _, it := range gerados {
		if strings.EqualFold(it.Usuario, login) {
			meus = append(meus, it)
		} else {
			outros = append(outros, it)
		}
	}
	sort.SliceStable(meus, func(i, j int) bool { return meus[i].GeradoEm > meus[j].GeradoEm })
	nr, nf := 0, 0
	var ficam []*ItemGerado
	for _, it := range meus {
		if it.Favorito {
			if nf < maxPreferidosPorUsuario {
				ficam = append(ficam, it)
			}
			nf++
		} else {
			if nr < maxRecentesPorUsuario {
				ficam = append(ficam, it)
			}
			nr++
		}
	}
	gerados = append(outros, ficam...)
}

func anexarArquivo(it *ItemGerado, tipo, arquivo string) {
	it.Arquivos = append(it.Arquivos, ArquivoGerado{Tipo: tipo, Arquivo: filepath.ToSlash(arquivo), Em: agoraISO()})
	if len(it.Arquivos) > maxArquivosPorItem {
		it.Arquivos = it.Arquivos[len(it.Arquivos)-maxArquivosPorItem:]
	}
}

// registra um arquivo (PDF/Excel) no item do histórico do usuário, se houver
func anexarArquivoGerado(r *http.Request, id, tipo, arquivo string) {
	s := sessaoDe(r)
	if s == nil || id == "" {
		return
	}
	geradosMu.Lock()
	defer geradosMu.Unlock()
	carregarGerados()
	if it := itemDoUsuario(s.login, id); it != nil {
		anexarArquivo(it, tipo, arquivo)
		_ = salvarGerados()
	}
}

func limpaTexto(s string, max int) string {
	s = strings.TrimSpace(s)
	if r := []rune(s); len(r) > max {
		s = string(r[:max])
	}
	return s
}

// GET  /api/db/gerados                       -> { itens: [...] } do usuário, mais recentes primeiro
// POST /api/db/gerados {acao: "registrar", modulo, sistema, titulo, subtitulo, texto, respostas, registros}
// POST /api/db/gerados {acao: "favorito", id, favorito}
// POST /api/db/gerados {acao: "apelido", id, apelido}
// POST /api/db/gerados {acao: "excluir", id}
// POST /api/db/gerados {acao: "limpar"}       -> tira da lista os não preferidos
func apiGerados(w http.ResponseWriter, r *http.Request) {
	s := sessaoDe(r)
	if s == nil {
		falhar(w, 401, errors.New("faça login na Base de Apoio"))
		return
	}
	geradosMu.Lock()
	defer geradosMu.Unlock()
	carregarGerados()

	if r.Method == http.MethodGet {
		itens := []*ItemGerado{}
		for _, it := range gerados {
			if !strings.EqualFold(it.Usuario, s.login) {
				continue
			}
			for i := range it.Arquivos {
				_, err := os.Stat(filepath.Join(pastaSaida, filepath.FromSlash(it.Arquivos[i].Arquivo)))
				it.Arquivos[i].Existe = err == nil
			}
			itens = append(itens, it)
		}
		sort.SliceStable(itens, func(i, j int) bool { return itens[i].GeradoEm > itens[j].GeradoEm })
		responder(w, map[string]interface{}{"itens": itens, "max_recentes": maxRecentesPorUsuario})
		return
	}

	var p struct {
		Acao      string                 `json:"acao"`
		ID        string                 `json:"id"`
		Modulo    string                 `json:"modulo"`
		Sistema   string                 `json:"sistema"`
		Titulo    string                 `json:"titulo"`
		Subtitulo string                 `json:"subtitulo"`
		Texto     string                 `json:"texto"`
		Respostas map[string]interface{} `json:"respostas"`
		Registros int                    `json:"registros"`
		Favorito  bool                   `json:"favorito"`
		Apelido   string                 `json:"apelido"`
	}
	if err := lerJSON(r, &p); err != nil {
		falhar(w, 400, err)
		return
	}
	var item *ItemGerado
	switch p.Acao {
	case "registrar":
		p.Titulo = limpaTexto(p.Titulo, 160)
		p.Texto = limpaTexto(p.Texto, 600)
		if p.Titulo == "" || p.Modulo == "" {
			falhar(w, 400, errors.New("relatório sem título"))
			return
		}
		chave := chavePedido(p.Modulo, p.Texto, p.Respostas)
		for _, it := range gerados {
			if strings.EqualFold(it.Usuario, s.login) && chavePedido(it.Modulo, it.Texto, it.Respostas) == chave {
				item = it
				break
			}
		}
		if item == nil {
			item = &ItemGerado{ID: novoIDGerado(), Usuario: s.login, Modulo: limpaTexto(p.Modulo, 60), Texto: p.Texto, Respostas: p.Respostas, CriadoEm: agoraISO(), Arquivos: []ArquivoGerado{}}
			gerados = append(gerados, item)
		}
		item.Sistema = limpaTexto(p.Sistema, 30)
		item.Titulo = p.Titulo
		item.Subtitulo = limpaTexto(p.Subtitulo, 400)
		item.Registros = p.Registros
		item.Vezes++
		item.GeradoEm = agoraISO()
		podarGerados(s.login)
	case "favorito", "apelido", "excluir":
		item = itemDoUsuario(s.login, p.ID)
		if item == nil {
			falhar(w, 404, errors.New("relatório não está mais na lista"))
			return
		}
		switch p.Acao {
		case "favorito":
			item.Favorito = p.Favorito
			if !p.Favorito {
				podarGerados(s.login)
			}
		case "apelido":
			item.Apelido = limpaTexto(p.Apelido, 80)
		case "excluir":
			for i, it := range gerados {
				if it == item {
					gerados = append(gerados[:i], gerados[i+1:]...)
					break
				}
			}
		}
	case "limpar":
		var ficam []*ItemGerado
		for _, it := range gerados {
			if !strings.EqualFold(it.Usuario, s.login) || it.Favorito {
				ficam = append(ficam, it)
			}
		}
		gerados = ficam
	default:
		falhar(w, 400, fmt.Errorf("ação inválida: %q", p.Acao))
		return
	}
	if err := salvarGerados(); err != nil {
		falhar(w, 500, fmt.Errorf("não consegui gravar a lista de relatórios gerados: %v", err))
		return
	}
	responder(w, map[string]interface{}{"ok": true, "item": item})
}

// POST /api/db/relatorio/xlsx?nome=...&gerado=<id>  (corpo = o .xlsx montado no navegador)
// grava em "Arquivos gerados\Relatorios" para poder abrir de novo pela lista
func apiRelatorioXLSX(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		falhar(w, 405, errors.New("use POST"))
		return
	}
	b, err := io.ReadAll(io.LimitReader(r.Body, maxExcelBytes+1))
	if err != nil {
		falhar(w, 400, err)
		return
	}
	if len(b) > maxExcelBytes {
		falhar(w, 413, errors.New("planilha grande demais para guardar"))
		return
	}
	if len(b) < 4 || string(b[:2]) != "PK" {
		falhar(w, 400, errors.New("arquivo não é um .xlsx"))
		return
	}
	nome := nomeArquivoSeguro(r.URL.Query().Get("nome")) + "_" + time.Now().Format("20060102_150405") + ".xlsx"
	dir := filepath.Join(pastaSaida, "Relatorios")
	if err := os.MkdirAll(dir, 0755); err != nil {
		falhar(w, 500, err)
		return
	}
	if err := os.WriteFile(filepath.Join(dir, nome), b, 0644); err != nil {
		falhar(w, 500, err)
		return
	}
	rel := filepath.Join("Relatorios", nome)
	anexarArquivoGerado(r, r.URL.Query().Get("gerado"), "xlsx", rel)
	responder(w, map[string]string{"arquivo": rel, "url": "/api/db/arquivo?nome=" + urlEsc("Relatorios/"+nome)})
}
