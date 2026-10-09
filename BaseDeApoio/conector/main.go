package main

// Base de Apoio — conector local.
// Abre o sistema no navegador (http://127.0.0.1:8765) e faz a ponte com o banco Firebird do ProSindW.
// Nada é instalado: basta deixar o BaseDeApoio.exe na pasta do sistema e dar dois cliques.

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const versao = "1.5.0"

var (
	pastaApp   string
	pastaSaida string
	portaHTTP  int
)

func main() {
	semNavegador := flag.Bool("sem-navegador", false, "não abre o navegador")
	pasta := flag.String("pasta", "", "pasta do sistema (index.html)")
	porta := flag.Int("porta", 0, "porta local (padrão 8765)")
	redefinir := flag.Bool("redefinir-acesso", false, "apaga os usuários da Base de Apoio (o próximo acesso cria o administrador de novo)")
	flag.Parse()

	exe, _ := os.Executable()
	pastaApp = filepath.Dir(exe)
	if *pasta != "" {
		pastaApp = *pasta
	}
	if _, err := os.Stat(filepath.Join(pastaApp, "index.html")); err != nil {
		if _, err2 := os.Stat(filepath.Join(pastaApp, "..", "index.html")); err2 == nil {
			pastaApp = filepath.Join(pastaApp, "..")
		}
	}
	pastaApp, _ = filepath.Abs(pastaApp)
	pastaSaida = filepath.Join(pastaApp, "Arquivos gerados")
	carregarConfig(pastaApp)
	if *redefinir {
		cfg.Usuarios = nil
		if err := salvarConfig(); err != nil {
			fmt.Println("Não consegui gravar a configuração:", err)
			os.Exit(1)
		}
		fmt.Println("Usuários apagados. Abra o BaseDeApoio.exe e crie o administrador de novo.")
		return
	}
	portaHTTP = cfg.PortaHTTP
	if *porta > 0 {
		portaHTTP = *porta
	}
	endereco := fmt.Sprintf("127.0.0.1:%d", portaHTTP)
	url := "http://" + endereco + "/"

	ln, err := net.Listen("tcp", endereco)
	if err != nil {
		// já está aberto: só abre o navegador
		fmt.Println("A Base de Apoio já está aberta em", url)
		if !*semNavegador {
			abrirNavegador(url)
		}
		time.Sleep(2 * time.Second)
		return
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/auth/estado", livre(apiAuthEstado))
	mux.HandleFunc("/api/auth/primeiro", livre(apiAuthPrimeiro))
	mux.HandleFunc("/api/auth/entrar", livre(apiAuthEntrar))
	mux.HandleFunc("/api/auth/sair", livre(apiAuthSair))
	mux.HandleFunc("/api/auth/senha", livre(apiAuthSenha))
	mux.HandleFunc("/api/auth/usuarios", livre(apiAuthUsuarios))
	mux.HandleFunc("/api/db/status", guarda(apiStatus))
	mux.HandleFunc("/api/db/config", guardaAdmin(apiConfig))
	mux.HandleFunc("/api/db/testar", guardaAdmin(apiTestar))
	mux.HandleFunc("/api/db/empresas", guarda(apiEmpresas))
	mux.HandleFunc("/api/db/contribuicoes", guarda(apiContribuicoes))
	mux.HandleFunc("/api/db/boleto/analisar", guarda(apiBoletoAnalisar))
	mux.HandleFunc("/api/db/boleto/gerar", guarda(apiBoletoGerar))
	mux.HandleFunc("/api/db/conferencia", guardaAdmin(apiConferencia))
	mux.HandleFunc("/api/db/consulta", guarda(apiConsulta))
	mux.HandleFunc("/api/db/relatorio/pdf", guarda(apiRelatorioPDF))
	mux.HandleFunc("/api/db/arquivo", apiArquivo)
	mux.HandleFunc("/api/db/detectar", guardaAdmin(apiDetectar))
	mux.HandleFunc("/api/db/procurar", guardaAdmin(apiProcurar))
	mux.Handle("/", arquivosEstaticos(pastaApp))

	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	fmt.Printf("Base de Apoio %s\nSistema: %s\nEndereço: %s\nArquivos gerados: %s\nConfiguração: %s\n\nDeixe esta janela aberta enquanto usa o sistema. Para sair, feche a janela.\n", versao, pastaApp, url, pastaSaida, cfgArq)
	if !*semNavegador {
		inicio := url
		if strings.TrimSpace(cfg.Caminho) == "" { // primeira vez: abre direto na tela de conexão
			inicio = url + "#conexao"
			fmt.Println("Banco ainda não configurado: abrindo a tela de conexão.")
		}
		go func() { time.Sleep(400 * time.Millisecond); abrirNavegador(inicio) }()
	}
	log.Fatal(srv.Serve(ln))
}

func abrirNavegador(u string) {
	var c *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		c = exec.Command("rundll32", "url.dll,FileProtocolHandler", u)
	case "darwin":
		c = exec.Command("open", u)
	default:
		c = exec.Command("xdg-open", u)
	}
	_ = c.Start()
}

func arquivosEstaticos(dir string) http.Handler {
	fs := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		l := strings.ToLower(r.URL.Path)
		if strings.Contains(l, "conector.json") || strings.Contains(l, "/conector/") || strings.HasSuffix(l, ".exe") || strings.HasPrefix(l, "/arquivos gerados") {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		fs.ServeHTTP(w, r)
	})
}

// guarda: só aceita chamadas da própria página servida por este programa, com usuário logado.
func guarda(h http.HandlerFunc) http.HandlerFunc { return proteger(h, nivelUsuario) }

// guardaAdmin: além disso, só administradores (conexão com o banco, conferência manual).
func guardaAdmin(h http.HandlerFunc) http.HandlerFunc { return proteger(h, nivelAdmin) }

// livre: rotas de acesso (login); cada uma confere a sessão quando precisa.
func livre(h http.HandlerFunc) http.HandlerFunc { return proteger(h, nivelLivre) }

const (
	nivelLivre = iota
	nivelUsuario
	nivelAdmin
)

func proteger(h http.HandlerFunc, nivel int) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !origemOk(w, r) {
			return
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Header.Get("X-Base-Apoio") != "1" {
			http.Error(w, "cabeçalho ausente", http.StatusForbidden)
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		if nivel != nivelLivre && !exigeSessao(w, r, nivel == nivelAdmin) {
			return
		}
		defer func() {
			if e := recover(); e != nil {
				log.Printf("ERRO %s: %v", r.URL.Path, e)
				falhar(w, 500, fmt.Errorf("erro interno no conector (%v). Feche e abra o BaseDeApoio.exe; se repetir, envie esta mensagem ao suporte", e))
			}
		}()
		inicio := time.Now()
		h(w, r)
		if d := time.Since(inicio); d > 5*time.Second {
			log.Printf("%s demorou %s", r.URL.Path, d.Round(time.Millisecond))
		}
	}
}

func responder(w http.ResponseWriter, v interface{}) {
	_ = json.NewEncoder(w).Encode(v)
}

func falhar(w http.ResponseWriter, cod int, err error) {
	log.Printf("erro (%d): %v", cod, err)
	w.WriteHeader(cod)
	responder(w, map[string]string{"erro": err.Error()})
}

func lerJSON(r *http.Request, v interface{}) error {
	b, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
	if err != nil {
		return err
	}
	if len(b) == 0 {
		return nil
	}
	return json.Unmarshal(b, v)
}

func ctxReq(r *http.Request) (context.Context, context.CancelFunc) {
	return context.WithTimeout(r.Context(), 90*time.Second)
}

// ---------------------------------------------------------------- handlers

type configPublica struct {
	Host           string                 `json:"host"`
	Porta          int                    `json:"porta"`
	Caminho        string                 `json:"caminho"`
	Usuario        string                 `json:"usuario"`
	TemSenha       bool                   `json:"tem_senha"`
	UsuarioProsind string                 `json:"usuario_prosind"`
	WireCrypt      string                 `json:"wire_crypt"`
	Beneficiario   Beneficiario           `json:"beneficiario"`
	ContribPadrao  string                 `json:"contribuicao_padrao"`
	Conferidos     map[string]Conferencia `json:"bancos_conferidos"`
	PastaSaida     string                 `json:"pasta_saida"`
	ArquivoConfig  string                 `json:"arquivo_config"`
	Versao         string                 `json:"versao"`
}

func publica() configPublica {
	return configPublica{Host: cfg.Host, Porta: cfg.Porta, Caminho: cfg.Caminho, Usuario: cfg.Usuario, TemSenha: cfg.senha != "",
		UsuarioProsind: cfg.UsuarioProsind, WireCrypt: cfg.WireCrypt, Beneficiario: cfg.Beneficiario, ContribPadrao: cfg.ContribPadrao,
		Conferidos: conferidos(), PastaSaida: pastaSaida, ArquivoConfig: cfgArq, Versao: versao}
}

func infoBanco(ctx context.Context) (map[string]interface{}, error) {
	db, err := conexao()
	if err != nil {
		return nil, err
	}
	out := map[string]interface{}{}
	if ms, err := linhas(ctx, db, "SELECT rdb$get_context('SYSTEM','ENGINE_VERSION') AS VERSAO FROM rdb$database"); err == nil && len(ms) > 0 {
		out["versao_firebird"] = vStr(ms[0]["VERSAO"])
	}
	if ms, err := linhas(ctx, db, "SELECT COUNT(*) AS N FROM PSW_EMPRESAS"); err == nil && len(ms) > 0 {
		out["empresas"] = vInt(ms[0]["N"])
	} else if err != nil {
		return nil, fmt.Errorf("conectou, mas não é um banco do ProSindW (PSW_EMPRESAS não encontrada): %v", err)
	}
	if ms, err := linhas(ctx, db, "SELECT COUNT(*) AS N FROM PSW_SOCIOS"); err == nil && len(ms) > 0 {
		out["socios"] = vInt(ms[0]["N"])
	}
	return out, nil
}

func apiStatus(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := ctxReq(r)
	defer cancel()
	res := map[string]interface{}{"conector": true, "configurado": strings.TrimSpace(cfg.Caminho) != ""}
	if s := sessaoDe(r); s != nil && s.perfil == "admin" {
		res["config"] = publica()
	}
	if strings.TrimSpace(cfg.Caminho) != "" && r.URL.Query().Get("rapido") != "1" {
		if info, err := infoBanco(ctx); err != nil {
			res["conectado"] = false
			res["erro"] = err.Error()
		} else {
			res["conectado"] = true
			res["banco"] = info
			iniciarConferenciaAuto() // confere o cálculo dos bancos sozinho, em segundo plano
		}
	}
	res["conferencia_auto"] = ultimoAuto()
	res["conferencia_rodando"] = autoRodando.Load()
	responder(w, res)
}

type pedidoConfig struct {
	DadosConexao
	UsuarioProsind *string       `json:"usuario_prosind"`
	Beneficiario   *Beneficiario `json:"beneficiario"`
	ContribPadrao  *string       `json:"contribuicao_padrao"`
}

func apiConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		responder(w, publica())
		return
	}
	var p pedidoConfig
	if err := lerJSON(r, &p); err != nil {
		falhar(w, 400, err)
		return
	}
	cfgMu.Lock()
	cfg.Host, cfg.Porta, cfg.Caminho, cfg.Usuario, cfg.WireCrypt = strings.TrimSpace(p.Host), p.Porta, strings.TrimSpace(p.Caminho), strings.TrimSpace(p.Usuario), p.WireCrypt
	if p.Senha != "" {
		if err := definirSenha(p.Senha); err != nil {
			cfgMu.Unlock()
			falhar(w, 500, err)
			return
		}
	}
	if p.UsuarioProsind != nil {
		cfg.UsuarioProsind = strings.TrimSpace(*p.UsuarioProsind)
	}
	if p.Beneficiario != nil {
		cfg.Beneficiario = *p.Beneficiario
	}
	if p.ContribPadrao != nil {
		cfg.ContribPadrao = strings.ToUpper(strings.TrimSpace(*p.ContribPadrao))
	}
	err := salvarConfig()
	cfgMu.Unlock()
	fecharConexao()
	limparCacheProsind()
	esquecerConferenciaAuto()
	if err != nil {
		falhar(w, 500, fmt.Errorf("não consegui gravar a configuração (%s): %v", cfgArq, err))
		return
	}
	apiStatus(w, r)
}

func apiTestar(w http.ResponseWriter, r *http.Request) {
	var d DadosConexao
	if err := lerJSON(r, &d); err != nil {
		falhar(w, 400, err)
		return
	}
	if d.Senha == "" {
		d.Senha = cfg.senha
	}
	if strings.TrimSpace(d.Caminho) == "" {
		falhar(w, 400, errors.New("informe o caminho do banco"))
		return
	}
	db, wire, err := abrir(d)
	if err != nil {
		responder(w, map[string]interface{}{"ok": false, "erro": traduzirErro(err).Error()})
		return
	}
	defer db.Close()
	ctx, cancel := ctxReq(r)
	defer cancel()
	res := map[string]interface{}{"ok": true, "wire_crypt": wire}
	if ms, err := linhas(ctx, db, "SELECT rdb$get_context('SYSTEM','ENGINE_VERSION') AS VERSAO FROM rdb$database"); err == nil && len(ms) > 0 {
		res["versao_firebird"] = vStr(ms[0]["VERSAO"])
	}
	if ms, err := linhas(ctx, db, "SELECT COUNT(*) AS N FROM PSW_EMPRESAS"); err == nil && len(ms) > 0 {
		res["empresas"] = vInt(ms[0]["N"])
	} else {
		res["ok"] = false
		res["erro"] = "conectou, mas esse banco não tem a tabela PSW_EMPRESAS (não parece ser o ProSindW)"
	}
	responder(w, res)
}

func apiEmpresas(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := ctxReq(r)
	defer cancel()
	db, err := conexao()
	if err != nil {
		falhar(w, 503, err)
		return
	}
	lst, err := BuscarEmpresas(ctx, db, r.URL.Query().Get("q"), 30)
	if err != nil {
		falhar(w, 500, traduzirErro(err))
		return
	}
	responder(w, map[string]interface{}{"itens": lst})
}

func apiContribuicoes(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := ctxReq(r)
	defer cancel()
	db, err := conexao()
	if err != nil {
		falhar(w, 503, err)
		return
	}
	lst, err := ListarContribuicoes(ctx, db)
	if err != nil {
		falhar(w, 500, traduzirErro(err))
		return
	}
	type item struct {
		ContribInfo
		Suportado    bool              `json:"suportado"`
		Perfil       string            `json:"perfil"`
		Conferido    bool              `json:"conferido"`
		ConferidoPor string            `json:"conferido_por,omitempty"`
		ConferidoEm  string            `json:"conferido_em,omitempty"`
		ConferidoAut bool              `json:"conferido_auto,omitempty"`
		Auto         *AutoBanco        `json:"conferencia_auto,omitempty"`
		Benef        *BeneficiarioAuto `json:"beneficiario,omitempty"`
		ContratoInfo *ContratoInfo     `json:"contrato_remessa,omitempty"`
		Seq          *Sequencial       `json:"sequencial,omitempty"`
	}
	detalhes := r.URL.Query().Get("detalhes") == "1"
	var auto *AutoResultado
	if detalhes {
		limparCacheProsind()
		auto = ConferirAutomatico(ctx, true) // "Atualizar do banco" também refaz a conferência
	} else {
		auto = ultimoAuto()
	}
	out := []item{}
	for _, c := range lst {
		ok, perfil := false, "sem banco configurado"
		if c.Banco != "" {
			ok, perfil = BancoSuportado(c.Banco)
		}
		it := item{ContribInfo: c, Suportado: ok, Perfil: perfil, Conferido: bancoConferido(c)}
		if por, cf := conferidoPor(c); cf != nil {
			it.ConferidoPor, it.ConferidoEm, it.ConferidoAut = por, cf.Data, cf.Auto
		}
		if auto != nil {
			for i := range auto.Bancos {
				if auto.Bancos[i].Banco == c.Banco {
					it.Auto = &auto.Bancos[i]
				}
			}
		}
		if detalhes {
			b := beneficiarioDe(ctx, db, c)
			it.Benef = &b
			it.ContratoInfo = contratoDe(ctx, db, c.Contrato)
			if c.Banco != "" {
				it.Seq = sequencialDe(ctx, db, c)
			}
		}
		out = append(out, it)
	}
	res := map[string]interface{}{"itens": out, "conferencia_auto": auto}
	if detalhes {
		res["sindicato"] = beneficiarioSindicato(ctx, db)
		res["lido_em"] = time.Now().Format("02/01/2006 15:04:05")
	}
	responder(w, res)
}

func apiBoletoAnalisar(w http.ResponseWriter, r *http.Request) {
	var p PedidoBoleto
	if err := lerJSON(r, &p); err != nil {
		falhar(w, 400, err)
		return
	}
	ctx, cancel := ctxReq(r)
	defer cancel()
	a, err := AnalisarBoleto(ctx, p)
	if err != nil {
		falhar(w, 503, traduzirErro(err))
		return
	}
	responder(w, a)
}

func apiBoletoGerar(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		falhar(w, 405, errors.New("use POST"))
		return
	}
	var p PedidoBoleto
	if err := lerJSON(r, &p); err != nil {
		falhar(w, 400, err)
		return
	}
	ctx, cancel := ctxReq(r)
	defer cancel()
	b, a, err := GerarBoleto(ctx, p, pastaSaida)
	if errors.Is(err, ErrPrecisaConfirmar) {
		responder(w, map[string]interface{}{"gerado": false, "analise": a, "precisa_confirmar": true})
		return
	}
	if err != nil {
		falhar(w, 500, traduzirErro(err))
		return
	}
	if b == nil {
		responder(w, map[string]interface{}{"gerado": false, "analise": a})
		return
	}
	log.Printf("boleto gerado: empresa %d %s %02d/%d nosso número %s", b.Resumo.Empresa.Codigo, b.Resumo.Contrib.Codigo, b.Resumo.Mes, b.Resumo.Ano, b.NossoNumero)
	responder(w, map[string]interface{}{"gerado": true, "boleto": b, "analise": a})
}

func apiConferencia(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := ctxReq(r)
	defer cancel()
	if r.Method == http.MethodGet {
		b, err := UltimoBoletoParaConferir(ctx, strings.ToUpper(r.URL.Query().Get("contribuicao")))
		if err != nil {
			falhar(w, 400, traduzirErro(err))
			return
		}
		responder(w, b)
		return
	}
	var p struct {
		Contribuicao string `json:"contribuicao"`
		Linha        string `json:"linha"`
	}
	if err := lerJSON(r, &p); err != nil {
		falhar(w, 400, err)
		return
	}
	ok, b, err := ConfirmarConferencia(ctx, strings.ToUpper(p.Contribuicao), p.Linha)
	if err != nil {
		falhar(w, 500, traduzirErro(err))
		return
	}
	responder(w, map[string]interface{}{"igual": ok, "boleto": b})
}

func apiConsulta(w http.ResponseWriter, r *http.Request) {
	var p struct {
		SQL    string        `json:"sql"`
		Params []interface{} `json:"params"`
		Limite int           `json:"limite"`
	}
	if err := lerJSON(r, &p); err != nil {
		falhar(w, 400, err)
		return
	}
	q, err := SomenteLeitura(p.SQL)
	if err != nil {
		falhar(w, 400, err)
		return
	}
	db, err := conexao()
	if err != nil {
		falhar(w, 503, err)
		return
	}
	ctx, cancel := ctxReq(r)
	defer cancel()
	tx, err := db.BeginTx(ctx, &sqlTxSomenteLeitura)
	if err != nil {
		falhar(w, 500, traduzirErro(err))
		return
	}
	defer tx.Rollback()
	lim := p.Limite
	if lim <= 0 || lim > 20000 {
		lim = 5000
	}
	for i, v := range p.Params { // datas no formato ISO viram DATE
		if s, ok := v.(string); ok && len(s) == 10 && s[4] == '-' && s[7] == '-' {
			if t, err := time.ParseInLocation("2006-01-02", s, time.Local); err == nil {
				p.Params[i] = t
			}
		}
		if f, ok := v.(float64); ok && f == float64(int64(f)) {
			p.Params[i] = int64(f)
		}
	}
	res, err := consultar(ctx, tx, lim, q, p.Params...)
	if err != nil {
		falhar(w, 400, traduzirErro(err))
		return
	}
	responder(w, res)
}

func apiRelatorioPDF(w http.ResponseWriter, r *http.Request) {
	var p PedidoRelatorioPDF
	if err := lerJSON(r, &p); err != nil {
		falhar(w, 400, err)
		return
	}
	p.Entidade = strings.TrimSpace(cfg.Beneficiario.Nome)
	if p.Entidade == "" {
		if db, err := conexao(); err == nil {
			ctx, cancel := ctxReq(r)
			p.Entidade = beneficiarioSindicato(ctx, db).Nome
			cancel()
		}
	}
	pdf := PDFRelatorio(p)
	nome := p.Arquivo
	if nome == "" {
		nome = p.Titulo
	}
	nome = nomeArquivoSeguro(nome) + "_" + time.Now().Format("20060102_150405") + ".pdf"
	dir := filepath.Join(pastaSaida, "Relatorios")
	if err := os.MkdirAll(dir, 0755); err != nil {
		falhar(w, 500, err)
		return
	}
	if err := os.WriteFile(filepath.Join(dir, nome), pdf, 0644); err != nil {
		falhar(w, 500, err)
		return
	}
	responder(w, map[string]string{"arquivo": filepath.Join("Relatorios", nome), "url": "/api/db/arquivo?nome=" + urlEsc("Relatorios/"+nome)})
}

// arquivos gerados (só dentro de "Arquivos gerados")
func apiArquivo(w http.ResponseWriter, r *http.Request) {
	host := r.Host
	if host != fmt.Sprintf("127.0.0.1:%d", portaHTTP) && host != fmt.Sprintf("localhost:%d", portaHTTP) {
		http.Error(w, "origem não permitida", http.StatusForbidden)
		return
	}
	if sessaoDe(r) == nil {
		http.Error(w, "faça login na Base de Apoio para abrir este arquivo", http.StatusUnauthorized)
		return
	}
	nome := filepath.Clean("/" + r.URL.Query().Get("nome"))
	caminho := filepath.Join(pastaSaida, nome)
	rel, err := filepath.Rel(pastaSaida, caminho)
	if err != nil || strings.HasPrefix(rel, "..") {
		http.Error(w, "arquivo inválido", 400)
		return
	}
	if r.URL.Query().Get("baixar") == "1" {
		w.Header().Set("Content-Disposition", "attachment; filename=\""+filepath.Base(caminho)+"\"")
	}
	http.ServeFile(w, r, caminho)
}

var _ = strconv.Itoa
