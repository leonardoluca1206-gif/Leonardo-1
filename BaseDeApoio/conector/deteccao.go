package main

// Ajuda a montar a conexão: verifica se o Firebird responde e procura bancos .fdb neste computador.

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
)

type ArquivoBanco struct {
	Caminho    string `json:"caminho"`
	Tamanho    int64  `json:"tamanho"`
	Modificado string `json:"modificado"`
	Origem     string `json:"origem"` // "pasta" ou "alias do Firebird"
	Alias      string `json:"alias,omitempty"`
}

func portaAberta(host string, porta int, espera time.Duration) error {
	if strings.TrimSpace(host) == "" {
		host = "127.0.0.1"
	}
	if porta <= 0 {
		porta = 3050
	}
	c, err := net.DialTimeout("tcp", net.JoinHostPort(strings.TrimSpace(host), strconv.Itoa(porta)), espera)
	if err != nil {
		return err
	}
	c.Close()
	return nil
}

// pastas onde o ProSindW costuma ficar
func raizesBusca() []string {
	if extra := os.Getenv("BASEAPOIO_BUSCA"); extra != "" { // testes
		return filepath.SplitList(extra)
	}
	if runtime.GOOS != "windows" {
		return nil
	}
	out := []string{}
	for _, l := range "CDEFGH" {
		raiz := string(l) + `:\`
		if _, err := os.Stat(raiz); err != nil {
			continue
		}
		for _, sub := range []string{`Sist`, `ProSindW`, `ProSind`, `Sistemas`, `Dados`, `Bancos`, `Firebird`, `BD`, ``} {
			p := filepath.Join(raiz, sub)
			if _, err := os.Stat(p); err == nil {
				out = append(out, p)
			}
		}
	}
	return out
}

func procurarBancos(ctx context.Context) []ArquivoBanco {
	vistos := map[string]bool{}
	out := []ArquivoBanco{}
	add := func(caminho, origem, alias string) {
		k := strings.ToLower(filepath.Clean(caminho))
		if vistos[k] {
			return
		}
		st, err := os.Stat(caminho)
		if err != nil || st.IsDir() {
			return
		}
		vistos[k] = true
		out = append(out, ArquivoBanco{Caminho: caminho, Tamanho: st.Size(), Modificado: st.ModTime().Format("02/01/2006 15:04"), Origem: origem, Alias: alias})
	}
	for _, a := range aliasesFirebird() {
		add(a[1], "alias do Firebird", a[0])
	}
	limite := time.Now().Add(4 * time.Second)
	for _, raiz := range raizesBusca() {
		profMax := 4
		if len(filepath.Clean(raiz)) <= 3 { // raiz do disco: só o primeiro nível
			profMax = 1
		}
		base := strings.Count(filepath.Clean(raiz), string(os.PathSeparator))
		_ = filepath.WalkDir(raiz, func(p string, d os.DirEntry, err error) error {
			if err != nil || ctx.Err() != nil || time.Now().After(limite) {
				if d != nil && d.IsDir() {
					return filepath.SkipDir
				}
				return nil
			}
			if d.IsDir() {
				nome := strings.ToLower(d.Name())
				if p != raiz && (strings.HasPrefix(nome, "$") || strings.HasPrefix(nome, ".") || nome == "windows" || nome == "program files" || nome == "program files (x86)" || nome == "programdata" || nome == "users" || nome == "node_modules") {
					return filepath.SkipDir
				}
				if strings.Count(filepath.Clean(p), string(os.PathSeparator))-base >= profMax {
					return filepath.SkipDir
				}
				return nil
			}
			ext := strings.ToLower(filepath.Ext(p))
			if ext == ".fdb" || ext == ".gdb" {
				add(p, "pasta", "")
			}
			return nil
		})
		if len(out) >= 40 {
			break
		}
	}
	sort.SliceStable(out, func(i, j int) bool { // o que parece ProSindW primeiro, depois o maior
		pi, pj := strings.Contains(strings.ToLower(out[i].Caminho), "prosind"), strings.Contains(strings.ToLower(out[j].Caminho), "prosind")
		if pi != pj {
			return pi
		}
		return out[i].Tamanho > out[j].Tamanho
	})
	if len(out) > 20 {
		out = out[:20]
	}
	return out
}

// aliases em databases.conf (Firebird 3/4/5) ou aliases.conf (2.5)
func aliasesFirebird() [][2]string {
	arqs := []string{}
	if runtime.GOOS == "windows" {
		for _, pf := range []string{os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)")} {
			if pf == "" {
				continue
			}
			m, _ := filepath.Glob(filepath.Join(pf, "Firebird", "*", "databases.conf"))
			arqs = append(arqs, m...)
			m, _ = filepath.Glob(filepath.Join(pf, "Firebird", "*", "aliases.conf"))
			arqs = append(arqs, m...)
		}
	} else {
		arqs = append(arqs, "/etc/firebird/3.0/databases.conf", "/opt/firebird/databases.conf")
	}
	out := [][2]string{}
	for _, a := range arqs {
		f, err := os.Open(a)
		if err != nil {
			continue
		}
		sc := bufio.NewScanner(f)
		for sc.Scan() {
			l := strings.TrimSpace(sc.Text())
			if l == "" || strings.HasPrefix(l, "#") || strings.HasPrefix(l, "{") || strings.HasPrefix(l, "}") {
				continue
			}
			k, v, ok := strings.Cut(l, "=")
			if !ok {
				continue
			}
			k, v = strings.TrimSpace(k), strings.TrimSpace(v)
			if k == "" || v == "" || strings.Contains(k, " ") || strings.EqualFold(k, "security.db") || strings.Contains(strings.ToLower(v), "security") || strings.Contains(v, "$(") {
				continue
			}
			out = append(out, [2]string{k, v})
		}
		f.Close()
	}
	return out
}

func local(host string) bool {
	h := strings.ToLower(strings.TrimSpace(host))
	if h == "" || h == "127.0.0.1" || h == "localhost" || h == "::1" {
		return true
	}
	if nome, err := os.Hostname(); err == nil && strings.EqualFold(nome, h) {
		return true
	}
	if addrs, err := net.InterfaceAddrs(); err == nil {
		for _, a := range addrs {
			if ip, _, err := net.ParseCIDR(a.String()); err == nil && ip.String() == h {
				return true
			}
		}
	}
	return false
}

// GET /api/db/detectar?host=&porta=&arquivos=1
func apiDetectar(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	host := strings.TrimSpace(q.Get("host"))
	if host == "" {
		host = "127.0.0.1"
	}
	porta, _ := strconv.Atoi(q.Get("porta"))
	if porta <= 0 {
		porta = 3050
	}
	res := map[string]interface{}{"host": host, "porta": porta, "local": local(host), "windows": runtime.GOOS == "windows"}
	if err := portaAberta(host, porta, 1500*time.Millisecond); err != nil {
		res["firebird"] = false
		msg := "nada respondeu"
		if strings.Contains(strings.ToLower(err.Error()), "refused") || strings.Contains(err.Error(), "recus") {
			msg = "a conexão foi recusada (o Firebird não está rodando nessa porta ou o firewall bloqueou)"
		} else if strings.Contains(strings.ToLower(err.Error()), "no such host") {
			msg = "esse nome de servidor não foi encontrado na rede"
		} else if strings.Contains(strings.ToLower(err.Error()), "timeout") {
			msg = "o servidor não respondeu (desligado, IP errado ou firewall)"
		}
		res["firebird_msg"] = fmt.Sprintf("Firebird não encontrado em %s:%d: %s.", host, porta, msg)
	} else {
		res["firebird"] = true
		res["firebird_msg"] = fmt.Sprintf("Firebird respondendo em %s:%d.", host, porta)
	}
	if q.Get("arquivos") == "1" && local(host) {
		ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
		res["arquivos"] = procurarBancos(ctx)
		cancel()
	}
	responder(w, res)
}

// POST /api/db/procurar  {inicial}
func apiProcurar(w http.ResponseWriter, r *http.Request) {
	var p struct {
		Inicial string `json:"inicial"`
	}
	_ = lerJSON(r, &p)
	caminho, ok, err := escolherArquivoBanco(strings.TrimSpace(p.Inicial))
	if err != nil {
		falhar(w, 400, err)
		return
	}
	responder(w, map[string]interface{}{"caminho": caminho, "escolhido": ok})
}
