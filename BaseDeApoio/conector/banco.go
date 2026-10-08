package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"

	_ "github.com/nakagami/firebirdsql"
)

var (
	dbMu  sync.Mutex
	dbCon *sql.DB
	dbDSN string
)

type DadosConexao struct {
	Host      string `json:"host"`
	Porta     int    `json:"porta"`
	Caminho   string `json:"caminho"`
	Usuario   string `json:"usuario"`
	Senha     string `json:"senha"`
	WireCrypt string `json:"wire_crypt"`
}

func montarDSN(d DadosConexao, wire string) string {
	host := strings.TrimSpace(d.Host)
	if host == "" {
		host = "127.0.0.1"
	}
	porta := d.Porta
	if porta == 0 {
		porta = 3050
	}
	caminho := strings.ReplaceAll(strings.TrimSpace(d.Caminho), "\\", "/")
	if !strings.HasPrefix(caminho, "/") {
		caminho = "/" + caminho
	}
	q := url.Values{}
	q.Set("charset", "WIN1252")
	if wire != "" {
		q.Set("wire_crypt", wire)
	}
	u := url.URL{Scheme: "firebird", User: url.UserPassword(strings.TrimSpace(d.Usuario), d.Senha), Host: fmt.Sprintf("%s:%d", host, porta), Path: caminho, RawQuery: q.Encode()}
	return u.String()
}

// abrir tenta conectar; se o servidor recusar a criptografia do canal, tenta sem ela.
func abrir(d DadosConexao) (*sql.DB, string, error) {
	tentativas := []string{d.WireCrypt}
	if d.WireCrypt == "" {
		tentativas = []string{"", "false"}
	}
	var ultimo error
	for _, w := range tentativas {
		dsn := montarDSN(d, w)
		db, err := sql.Open("firebirdsql", dsn)
		if err != nil {
			ultimo = err
			continue
		}
		db.SetMaxOpenConns(4)
		db.SetConnMaxIdleTime(5 * time.Minute)
		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		err = db.PingContext(ctx)
		cancel()
		if err == nil {
			return db, w, nil
		}
		db.Close()
		ultimo = err
		if !strings.Contains(strings.ToLower(err.Error()), "crypt") && !strings.Contains(strings.ToLower(err.Error()), "encrypt") {
			break
		}
	}
	return nil, "", ultimo
}

func dadosDaConfig() DadosConexao {
	return DadosConexao{Host: cfg.Host, Porta: cfg.Porta, Caminho: cfg.Caminho, Usuario: cfg.Usuario, Senha: cfg.senha, WireCrypt: cfg.WireCrypt}
}

var errSemConfig = errors.New("banco de dados não configurado. Abra Configurações > Banco de dados")

func conexao() (*sql.DB, error) {
	dbMu.Lock()
	defer dbMu.Unlock()
	d := dadosDaConfig()
	if strings.TrimSpace(d.Caminho) == "" {
		return nil, errSemConfig
	}
	dsn := montarDSN(d, d.WireCrypt)
	if dbCon != nil && dsn == dbDSN {
		return dbCon, nil
	}
	if dbCon != nil {
		dbCon.Close()
		dbCon = nil
	}
	db, _, err := abrir(d)
	if err != nil {
		return nil, traduzirErro(err)
	}
	dbCon, dbDSN = db, dsn
	return db, nil
}

func fecharConexao() {
	dbMu.Lock()
	defer dbMu.Unlock()
	if dbCon != nil {
		dbCon.Close()
		dbCon = nil
	}
}

func traduzirErro(err error) error {
	if err == nil {
		return nil
	}
	m := err.Error()
	l := strings.ToLower(m)
	switch {
	case strings.Contains(l, "user name and password are not defined") || strings.Contains(l, "login") && strings.Contains(l, "failed") || strings.Contains(l, "password"):
		return fmt.Errorf("usuário ou senha do Firebird incorretos (%s)", m)
	case strings.Contains(l, "i/o error") || strings.Contains(l, "no such file") || strings.Contains(l, "cannot find") || strings.Contains(l, "not found") && strings.Contains(l, "file"):
		return fmt.Errorf("o servidor não encontrou o arquivo do banco. Confira o caminho (visto pelo servidor, ex.: C:\\Sist\\ProSindW\\prosindw.fdb) (%s)", m)
	case strings.Contains(l, "connection refused"):
		return fmt.Errorf("o servidor recusou a conexão: o Firebird não está rodando nesse IP ou a porta está errada (%s)", m)
	case strings.Contains(l, "timeout") || strings.Contains(l, "i/o timeout") || strings.Contains(l, "no route"):
		return fmt.Errorf("o servidor não respondeu: confira o IP, a porta (3050) e o firewall (%s)", m)
	case strings.Contains(l, "no such host"):
		return fmt.Errorf("servidor não encontrado na rede: confira o IP ou nome (%s)", m)
	case strings.Contains(l, "authentication") || strings.Contains(l, "auth"):
		return fmt.Errorf("o servidor não aceitou o método de login. No firebird.conf do servidor use AuthServer = Srp256, Srp, Legacy_Auth (%s)", m)
	}
	return err
}

// ---------------------------------------------------------------- consultas genéricas (somente leitura)

type Resultado struct {
	Colunas []string        `json:"colunas"`
	Linhas  [][]interface{} `json:"linhas"`
	Total   int             `json:"total"`
	Cortado bool            `json:"cortado"`
}

func valorJSON(v interface{}) interface{} {
	switch x := v.(type) {
	case nil:
		return nil
	case []byte:
		return strings.TrimRight(string(x), " ")
	case string:
		return strings.TrimRight(x, " ")
	case time.Time:
		if x.Hour() == 0 && x.Minute() == 0 && x.Second() == 0 {
			return x.Format("2006-01-02")
		}
		return x.Format("2006-01-02 15:04:05")
	default:
		return x
	}
}

func consultar(ctx context.Context, q queryer, limite int, sqlTxt string, args ...interface{}) (*Resultado, error) {
	rows, err := q.QueryContext(ctx, sqlTxt, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cols, _ := rows.Columns()
	r := &Resultado{Colunas: cols, Linhas: [][]interface{}{}}
	for rows.Next() {
		vals := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		r.Total++
		if limite > 0 && len(r.Linhas) >= limite {
			r.Cortado = true
			continue
		}
		linha := make([]interface{}, len(cols))
		for i, v := range vals {
			linha[i] = valorJSON(v)
		}
		r.Linhas = append(r.Linhas, linha)
	}
	return r, rows.Err()
}

// SomenteLeitura aceita apenas uma instrução SELECT/WITH.
func SomenteLeitura(s string) (string, error) {
	t := strings.TrimSpace(s)
	t = strings.TrimRight(t, "; \n\r\t")
	sem := removerLiterais(t)
	if strings.Contains(sem, ";") {
		return "", errors.New("envie só uma consulta")
	}
	u := strings.ToUpper(strings.TrimSpace(sem))
	if !(strings.HasPrefix(u, "SELECT") || strings.HasPrefix(u, "WITH")) {
		return "", errors.New("só consultas SELECT são permitidas")
	}
	for _, p := range []string{"INSERT ", "UPDATE ", "DELETE ", "MERGE ", "EXECUTE ", "ALTER ", "DROP ", "CREATE ", "GRANT ", "REVOKE ", "RECREATE ", "SET GENERATOR", "GEN_ID"} {
		if strings.Contains(u, p) {
			return "", fmt.Errorf("a consulta não pode conter %s", strings.TrimSpace(p))
		}
	}
	return t, nil
}

func removerLiterais(s string) string {
	var b strings.Builder
	dentro := false
	for _, r := range s {
		if r == '\'' {
			dentro = !dentro
			continue
		}
		if !dentro {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// sql.Queryer não existe na biblioteca padrão; interface mínima comum a *sql.DB e *sql.Tx
type queryer interface {
	QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error)
}

var sqlTxSomenteLeitura = sql.TxOptions{ReadOnly: true}
