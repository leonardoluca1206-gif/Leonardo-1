package main

// Acesso ao sistema: usuários da Base de Apoio (não são os do ProSindW nem os do Firebird).
// A senha fica só como hash PBKDF2-SHA256 com sal, no conector.json. A sessão é um cookie
// HttpOnly; sem sessão válida nenhuma rota do banco responde.

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Usuario struct {
	Login        string `json:"login"`
	Nome         string `json:"nome"`
	Perfil       string `json:"perfil"` // "admin" ou "usuario"
	Hash         string `json:"hash"`   // iterações$sal$hash (base64)
	Ativo        bool   `json:"ativo"`
	CriadoEm     string `json:"criado_em"`
	UltimoAcesso string `json:"ultimo_acesso,omitempty"`
}

type sessao struct {
	login, nome, perfil string
	expira              time.Time
}

const (
	cookieSessao   = "ba_sessao"
	duracaoSessao  = 8 * time.Hour // sem uso por 8 horas: pede login de novo
	iteracoesSenha = 120000
	maxFalhas      = 5
	esperaFalhas   = time.Minute
)

var (
	sessoes   = map[string]*sessao{}
	sessMu    sync.Mutex
	falhas    = map[string]*tentativa{}
	rxLogin   = regexp.MustCompile(`^[a-z0-9._-]{3,30}$`)
	errAcesso = errors.New("faça login para continuar")
)

type tentativa struct {
	n   int
	ate time.Time
}

// ---------------------------------------------------------------- senha

func pbkdf2SHA256(senha, sal []byte, iter, tam int) []byte {
	prf := hmac.New(sha256.New, senha)
	out := make([]byte, 0, tam)
	for bloco := uint32(1); len(out) < tam; bloco++ {
		prf.Reset()
		prf.Write(sal)
		var b [4]byte
		binary.BigEndian.PutUint32(b[:], bloco)
		prf.Write(b[:])
		u := prf.Sum(nil)
		t := append([]byte(nil), u...)
		for i := 1; i < iter; i++ {
			prf.Reset()
			prf.Write(u)
			u = prf.Sum(u[:0])
			for k := range t {
				t[k] ^= u[k]
			}
		}
		out = append(out, t...)
	}
	return out[:tam]
}

func gerarHash(senha string) (string, error) {
	sal := make([]byte, 16)
	if _, err := rand.Read(sal); err != nil {
		return "", err
	}
	h := pbkdf2SHA256([]byte(senha), sal, iteracoesSenha, 32)
	return fmt.Sprintf("%d$%s$%s", iteracoesSenha, base64.StdEncoding.EncodeToString(sal), base64.StdEncoding.EncodeToString(h)), nil
}

func conferirSenha(senha, guardado string) bool {
	p := strings.Split(guardado, "$")
	if len(p) != 3 {
		return false
	}
	iter, err := strconv.Atoi(p[0])
	if err != nil || iter < 1 {
		return false
	}
	sal, err1 := base64.StdEncoding.DecodeString(p[1])
	h, err2 := base64.StdEncoding.DecodeString(p[2])
	if err1 != nil || err2 != nil {
		return false
	}
	return subtle.ConstantTimeCompare(pbkdf2SHA256([]byte(senha), sal, iter, len(h)), h) == 1
}

func validarSenha(s string) error {
	if len([]rune(s)) < 6 {
		return errors.New("a senha precisa ter pelo menos 6 caracteres")
	}
	return nil
}

func normalizarLogin(s string) string { return strings.ToLower(strings.TrimSpace(s)) }

// ---------------------------------------------------------------- sessão

func novoToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

func sessaoDe(r *http.Request) *sessao {
	c, err := r.Cookie(cookieSessao)
	if err != nil || c.Value == "" {
		return nil
	}
	sessMu.Lock()
	defer sessMu.Unlock()
	s := sessoes[c.Value]
	if s == nil {
		return nil
	}
	if time.Now().After(s.expira) {
		delete(sessoes, c.Value)
		return nil
	}
	s.expira = time.Now().Add(duracaoSessao)
	return s
}

func abrirSessao(w http.ResponseWriter, u Usuario) {
	t := novoToken()
	sessMu.Lock()
	for k, s := range sessoes { // limpa as vencidas
		if time.Now().After(s.expira) {
			delete(sessoes, k)
		}
	}
	sessoes[t] = &sessao{login: u.Login, nome: u.Nome, perfil: u.Perfil, expira: time.Now().Add(duracaoSessao)}
	sessMu.Unlock()
	http.SetCookie(w, &http.Cookie{Name: cookieSessao, Value: t, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode})
}

// encerrarSessoesDe derruba as sessões de um usuário (desativado, excluído ou com perfil trocado)
func encerrarSessoesDe(login string) {
	sessMu.Lock()
	for k, s := range sessoes {
		if s.login == login {
			delete(sessoes, k)
		}
	}
	sessMu.Unlock()
}

func usuarioIdx(login string) int {
	for i, u := range cfg.Usuarios {
		if u.Login == login {
			return i
		}
	}
	return -1
}

func qtdAdminsAtivos(us []Usuario) int {
	n := 0
	for _, u := range us {
		if u.Perfil == "admin" && u.Ativo {
			n++
		}
	}
	return n
}

// ---------------------------------------------------------------- proteção das rotas

// origemOk: só aceita chamadas da própria página servida por este programa.
func origemOk(w http.ResponseWriter, r *http.Request) bool {
	host := r.Host
	okHost := host == fmt.Sprintf("127.0.0.1:%d", portaHTTP) || host == fmt.Sprintf("localhost:%d", portaHTTP)
	o := r.Header.Get("Origin")
	if !okHost || !(o == "" || o == "http://"+host) {
		http.Error(w, "origem não permitida", http.StatusForbidden)
		return false
	}
	return true
}

func exigeSessao(w http.ResponseWriter, r *http.Request, admin bool) bool {
	s := sessaoDe(r)
	if s == nil {
		falhar(w, http.StatusUnauthorized, errAcesso)
		return false
	}
	if admin && s.perfil != "admin" {
		falhar(w, http.StatusForbidden, errors.New("somente administradores podem fazer isso"))
		return false
	}
	return true
}

// ---------------------------------------------------------------- handlers /api/auth/

type usuarioPublico struct {
	Login        string `json:"login"`
	Nome         string `json:"nome"`
	Perfil       string `json:"perfil"`
	Ativo        bool   `json:"ativo"`
	CriadoEm     string `json:"criado_em,omitempty"`
	UltimoAcesso string `json:"ultimo_acesso,omitempty"`
}

func publicoDe(u Usuario) usuarioPublico {
	return usuarioPublico{Login: u.Login, Nome: u.Nome, Perfil: u.Perfil, Ativo: u.Ativo, CriadoEm: u.CriadoEm, UltimoAcesso: u.UltimoAcesso}
}

func apiAuthEstado(w http.ResponseWriter, r *http.Request) {
	cfgMu.Lock()
	primeiro := len(cfg.Usuarios) == 0
	cfgMu.Unlock()
	res := map[string]interface{}{"primeiro_acesso": primeiro, "logado": false}
	if s := sessaoDe(r); s != nil {
		res["logado"] = true
		res["usuario"] = usuarioPublico{Login: s.login, Nome: s.nome, Perfil: s.perfil, Ativo: true}
	}
	responder(w, res)
}

type pedidoUsuario struct {
	Login  string `json:"login"`
	Nome   string `json:"nome"`
	Senha  string `json:"senha"`
	Perfil string `json:"perfil"`
	Ativo  *bool  `json:"ativo"`
	Novo   bool   `json:"novo"`
}

// primeiro acesso: cria o administrador (só funciona enquanto não existe nenhum usuário)
func apiAuthPrimeiro(w http.ResponseWriter, r *http.Request) {
	var p pedidoUsuario
	if err := lerJSON(r, &p); err != nil {
		falhar(w, 400, err)
		return
	}
	p.Login = normalizarLogin(p.Login)
	if !rxLogin.MatchString(p.Login) {
		falhar(w, 400, errors.New("usuário: use de 3 a 30 letras minúsculas, números, ponto, hífen ou sublinhado (sem espaço)"))
		return
	}
	if err := validarSenha(p.Senha); err != nil {
		falhar(w, 400, err)
		return
	}
	h, err := gerarHash(p.Senha)
	if err != nil {
		falhar(w, 500, err)
		return
	}
	agora := time.Now().Format("02/01/2006 15:04")
	u := Usuario{Login: p.Login, Nome: strings.TrimSpace(p.Nome), Perfil: "admin", Hash: h, Ativo: true, CriadoEm: agora, UltimoAcesso: agora}
	if u.Nome == "" {
		u.Nome = u.Login
	}
	cfgMu.Lock()
	if len(cfg.Usuarios) > 0 {
		cfgMu.Unlock()
		falhar(w, 409, errors.New("o administrador já foi criado: entre com usuário e senha"))
		return
	}
	cfg.Usuarios = []Usuario{u}
	err = salvarConfig()
	cfgMu.Unlock()
	if err != nil {
		falhar(w, 500, fmt.Errorf("não consegui gravar o usuário (%s): %v", cfgArq, err))
		return
	}
	log.Printf("acesso: administrador %q criado", u.Login)
	abrirSessao(w, u)
	responder(w, map[string]interface{}{"ok": true, "usuario": publicoDe(u)})
}

func apiAuthEntrar(w http.ResponseWriter, r *http.Request) {
	var p pedidoUsuario
	if err := lerJSON(r, &p); err != nil {
		falhar(w, 400, err)
		return
	}
	login := normalizarLogin(p.Login)
	sessMu.Lock()
	t := falhas[login]
	if t != nil && time.Now().Before(t.ate) {
		seg := int(time.Until(t.ate).Seconds()) + 1
		sessMu.Unlock()
		falhar(w, 429, fmt.Errorf("muitas tentativas erradas. Aguarde %d segundos e tente de novo", seg))
		return
	}
	sessMu.Unlock()
	cfgMu.Lock()
	i := usuarioIdx(login)
	var u Usuario
	if i >= 0 {
		u = cfg.Usuarios[i]
	}
	cfgMu.Unlock()
	if i < 0 || !conferirSenha(p.Senha, u.Hash) {
		sessMu.Lock()
		if falhas[login] == nil {
			falhas[login] = &tentativa{}
		}
		f := falhas[login]
		f.n++
		if f.n >= maxFalhas {
			f.n, f.ate = 0, time.Now().Add(esperaFalhas)
		}
		sessMu.Unlock()
		log.Printf("acesso: senha incorreta para %q", login)
		falhar(w, 401, errors.New("usuário ou senha incorretos"))
		return
	}
	if !u.Ativo {
		falhar(w, 403, errors.New("este usuário está desativado. Fale com o administrador"))
		return
	}
	sessMu.Lock()
	delete(falhas, login)
	sessMu.Unlock()
	cfgMu.Lock()
	if j := usuarioIdx(login); j >= 0 {
		cfg.Usuarios[j].UltimoAcesso = time.Now().Format("02/01/2006 15:04")
		_ = salvarConfig()
	}
	cfgMu.Unlock()
	log.Printf("acesso: %q entrou", login)
	abrirSessao(w, u)
	responder(w, map[string]interface{}{"ok": true, "usuario": publicoDe(u)})
}

func apiAuthSair(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(cookieSessao); err == nil {
		sessMu.Lock()
		delete(sessoes, c.Value)
		sessMu.Unlock()
	}
	http.SetCookie(w, &http.Cookie{Name: cookieSessao, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteStrictMode})
	responder(w, map[string]bool{"ok": true})
}

// troca da própria senha
func apiAuthSenha(w http.ResponseWriter, r *http.Request) {
	s := sessaoDe(r)
	if s == nil {
		falhar(w, 401, errAcesso)
		return
	}
	var p struct {
		Atual string `json:"atual"`
		Nova  string `json:"nova"`
	}
	if err := lerJSON(r, &p); err != nil {
		falhar(w, 400, err)
		return
	}
	if err := validarSenha(p.Nova); err != nil {
		falhar(w, 400, err)
		return
	}
	cfgMu.Lock()
	defer cfgMu.Unlock()
	i := usuarioIdx(s.login)
	if i < 0 || !conferirSenha(p.Atual, cfg.Usuarios[i].Hash) {
		falhar(w, 400, errors.New("a senha atual não confere"))
		return
	}
	h, err := gerarHash(p.Nova)
	if err != nil {
		falhar(w, 500, err)
		return
	}
	cfg.Usuarios[i].Hash = h
	if err := salvarConfig(); err != nil {
		falhar(w, 500, err)
		return
	}
	responder(w, map[string]bool{"ok": true})
}

// administração de usuários (somente admin): GET lista, POST cria/altera, DELETE exclui
func apiAuthUsuarios(w http.ResponseWriter, r *http.Request) {
	if !exigeSessao(w, r, true) {
		return
	}
	eu := sessaoDe(r)
	switch r.Method {
	case http.MethodGet:
		cfgMu.Lock()
		out := []usuarioPublico{}
		for _, u := range cfg.Usuarios {
			out = append(out, publicoDe(u))
		}
		cfgMu.Unlock()
		responder(w, map[string]interface{}{"itens": out})
	case http.MethodPost:
		var p pedidoUsuario
		if err := lerJSON(r, &p); err != nil {
			falhar(w, 400, err)
			return
		}
		p.Login = normalizarLogin(p.Login)
		if p.Perfil != "admin" {
			p.Perfil = "usuario"
		}
		cfgMu.Lock()
		defer cfgMu.Unlock()
		lista := append([]Usuario(nil), cfg.Usuarios...)
		i := usuarioIdx(p.Login)
		if p.Novo {
			if !rxLogin.MatchString(p.Login) {
				falhar(w, 400, errors.New("usuário: use de 3 a 30 letras minúsculas, números, ponto, hífen ou sublinhado (sem espaço)"))
				return
			}
			if i >= 0 {
				falhar(w, 409, fmt.Errorf("já existe o usuário %q", p.Login))
				return
			}
			if err := validarSenha(p.Senha); err != nil {
				falhar(w, 400, err)
				return
			}
			lista = append(lista, Usuario{Login: p.Login, Ativo: true, CriadoEm: time.Now().Format("02/01/2006 15:04")})
			i = len(lista) - 1
		} else if i < 0 {
			falhar(w, 404, fmt.Errorf("usuário %q não encontrado", p.Login))
			return
		}
		u := &lista[i]
		if u.Login == eu.login && (p.Perfil != "admin" || (p.Ativo != nil && !*p.Ativo)) {
			falhar(w, 400, errors.New("você não pode tirar o próprio acesso de administrador nem desativar o próprio usuário"))
			return
		}
		mudouAcesso := u.Perfil != p.Perfil
		u.Nome, u.Perfil = strings.TrimSpace(p.Nome), p.Perfil
		if u.Nome == "" {
			u.Nome = u.Login
		}
		if p.Ativo != nil {
			mudouAcesso = mudouAcesso || u.Ativo != *p.Ativo
			u.Ativo = *p.Ativo
		}
		if p.Senha != "" {
			if err := validarSenha(p.Senha); err != nil {
				falhar(w, 400, err)
				return
			}
			h, err := gerarHash(p.Senha)
			if err != nil {
				falhar(w, 500, err)
				return
			}
			u.Hash = h
		}
		if qtdAdminsAtivos(lista) == 0 {
			falhar(w, 400, errors.New("precisa ficar pelo menos um administrador ativo"))
			return
		}
		cfg.Usuarios = lista
		if err := salvarConfig(); err != nil {
			falhar(w, 500, err)
			return
		}
		if mudouAcesso && u.Login != eu.login {
			encerrarSessoesDe(u.Login)
		}
		log.Printf("acesso: %q gravou o usuário %q (%s)", eu.login, u.Login, u.Perfil)
		responder(w, map[string]interface{}{"ok": true, "usuario": publicoDe(*u)})
	case http.MethodDelete:
		login := normalizarLogin(r.URL.Query().Get("login"))
		if login == eu.login {
			falhar(w, 400, errors.New("você não pode excluir o próprio usuário"))
			return
		}
		cfgMu.Lock()
		defer cfgMu.Unlock()
		i := usuarioIdx(login)
		if i < 0 {
			falhar(w, 404, fmt.Errorf("usuário %q não encontrado", login))
			return
		}
		lista := append(append([]Usuario(nil), cfg.Usuarios[:i]...), cfg.Usuarios[i+1:]...)
		if qtdAdminsAtivos(lista) == 0 {
			falhar(w, 400, errors.New("precisa ficar pelo menos um administrador ativo"))
			return
		}
		cfg.Usuarios = lista
		if err := salvarConfig(); err != nil {
			falhar(w, 500, err)
			return
		}
		encerrarSessoesDe(login)
		log.Printf("acesso: %q excluiu o usuário %q", eu.login, login)
		responder(w, map[string]bool{"ok": true})
	default:
		falhar(w, 405, errors.New("método não permitido"))
	}
}
