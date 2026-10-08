package main

// Conferência automática do cálculo do boleto, banco a banco, feita ao conectar.
// O ProSindW grava a linha digitável / código de barras dos boletos que emite. Aqui procuramos essas
// colunas no próprio banco (pelos nomes, na estrutura do Firebird), pegamos o boleto mais recente de cada
// banco e refazemos o código com os dados bancários da contribuição e o nosso número do boleto.
// Se for igual ao do ProSindW, o banco fica liberado sem ninguém precisar digitar nada.

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"regexp"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type AutoBanco struct {
	Banco          string `json:"banco"`
	Perfil         string `json:"perfil"`
	Situacao       string `json:"situacao"` // conferido | divergente | sem_boleto | sem_fonte | erro
	Contribuicao   string `json:"contribuicao,omitempty"`
	NossoNumero    string `json:"nosso_numero,omitempty"`
	LinhaProsind   string `json:"linha_prosind,omitempty"`
	LinhaCalculada string `json:"linha_calculada,omitempty"`
	Fonte          string `json:"fonte,omitempty"`
	Mensagem       string `json:"mensagem,omitempty"`
	Manual         bool   `json:"manual,omitempty"` // já havia conferência manual para o banco
}

type AutoResultado struct {
	Em     string      `json:"em"`
	Fontes []string    `json:"fontes"`
	Bancos []AutoBanco `json:"bancos"`
	Erro   string      `json:"erro,omitempty"`
}

type fonteLinha struct {
	Tabela, Coluna string
	cols           map[string]bool
}

func (f fonteLinha) nome() string { return f.Tabela + "." + f.Coluna }

var (
	autoMu       sync.Mutex // uma conferência por vez
	autoEstMu    sync.Mutex
	autoChave    string
	autoUltimo   *AutoResultado
	autoRodando  atomic.Bool
	rxColLinha   = regexp.MustCompile(`LINHA|DIGITAV|BARRA|CODBAR|IPTE`)
	rxIdentFB    = regexp.MustCompile(`^[A-Z][A-Z0-9_$]*$`)
	tabelasLinha = `(R.RDB$RELATION_NAME STARTING WITH 'PSW_BLOQUETOSEMP' OR R.RDB$RELATION_NAME = 'PSW_CONTRIBEMP'
	  OR (R.RDB$RELATION_NAME CONTAINING 'BOLET' AND R.RDB$RELATION_NAME CONTAINING 'EMP'))`
)

func chaveConexao() string {
	d := dadosDaConfig()
	return strings.ToLower(fmt.Sprintf("%s|%d|%s|%s", d.Host, d.Porta, d.Caminho, d.Usuario))
}

func ultimoAuto() *AutoResultado {
	autoEstMu.Lock()
	defer autoEstMu.Unlock()
	if autoChave != chaveConexao() {
		return nil
	}
	return autoUltimo
}

func resultadoAutoBanco(banco string) *AutoBanco {
	r := ultimoAuto()
	if r == nil {
		return nil
	}
	for i := range r.Bancos {
		if r.Bancos[i].Banco == banco {
			return &r.Bancos[i]
		}
	}
	return nil
}

// esquecerConferenciaAuto: a conexão mudou; a próxima consulta confere de novo.
func esquecerConferenciaAuto() {
	autoEstMu.Lock()
	autoChave, autoUltimo = "", nil
	autoEstMu.Unlock()
}

// iniciarConferenciaAuto roda em segundo plano (ao conectar), sem atrasar a tela.
func iniciarConferenciaAuto() {
	if ultimoAuto() != nil || autoRodando.Load() {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
		defer cancel()
		garantirConferenciaAuto(ctx)
	}()
}

// garantirConferenciaAuto confere uma vez por conexão (espera se já estiver rodando).
func garantirConferenciaAuto(ctx context.Context) *AutoResultado {
	if r := ultimoAuto(); r != nil {
		return r
	}
	return ConferirAutomatico(ctx, false)
}

// ConferirAutomatico refaz a conferência de todos os bancos. forcar=false reaproveita o resultado desta conexão.
func ConferirAutomatico(ctx context.Context, forcar bool) *AutoResultado {
	autoMu.Lock()
	defer autoMu.Unlock()
	if !forcar {
		if r := ultimoAuto(); r != nil {
			return r
		}
	}
	autoRodando.Store(true)
	defer autoRodando.Store(false)
	chave := chaveConexao()
	r := conferirTodos(ctx)
	if r.Erro == "" { // erro de conexão não fica guardado: tenta de novo na próxima
		autoEstMu.Lock()
		autoChave, autoUltimo = chave, r
		autoEstMu.Unlock()
	}
	for _, b := range r.Bancos {
		log.Printf("conferência automática: banco %s %s %s", b.Banco, b.Situacao, b.Mensagem)
	}
	return r
}

func conferirTodos(ctx context.Context) *AutoResultado {
	r := &AutoResultado{Em: time.Now().Format("02/01/2006 15:04"), Fontes: []string{}, Bancos: []AutoBanco{}}
	db, err := conexao()
	if err != nil {
		r.Erro = err.Error()
		return r
	}
	contribs, err := ListarContribuicoes(ctx, db)
	if err != nil {
		r.Erro = traduzirErro(err).Error()
		return r
	}
	fontes, err := descobrirFontes(ctx, db)
	if err != nil {
		log.Printf("conferência automática: não consegui ler a estrutura do banco: %v", err)
	}
	for _, f := range fontes {
		r.Fontes = append(r.Fontes, f.nome())
	}
	porCodigo := map[string]ContribInfo{}
	porBanco := map[string][]string{}
	for _, c := range contribs {
		porCodigo[c.Codigo] = c
		if _, ok := perfis[c.Banco]; ok {
			porBanco[c.Banco] = append(porBanco[c.Banco], c.Codigo)
		}
	}
	bancos := make([]string, 0, len(porBanco))
	for b := range porBanco {
		bancos = append(bancos, b)
	}
	sort.Strings(bancos)
	for _, banco := range bancos {
		ab := conferirBanco(ctx, db, banco, porBanco[banco], porCodigo, fontes)
		gravarResultadoBanco(&ab, porCodigo)
		r.Bancos = append(r.Bancos, ab)
	}
	return r
}

// colunas que podem guardar a linha digitável ou o código de barras (texto com 44 posições ou mais)
func descobrirFontes(ctx context.Context, db *sql.DB) ([]fonteLinha, error) {
	ms, err := linhas(ctx, db, `SELECT TRIM(RF.RDB$RELATION_NAME) AS TABELA, TRIM(RF.RDB$FIELD_NAME) AS COLUNA, F.RDB$FIELD_TYPE AS TIPO,
	  COALESCE(F.RDB$CHARACTER_LENGTH, F.RDB$FIELD_LENGTH) AS TAM, F.RDB$FIELD_SUB_TYPE AS SUBTIPO
	  FROM RDB$RELATION_FIELDS RF JOIN RDB$RELATIONS R ON R.RDB$RELATION_NAME = RF.RDB$RELATION_NAME
	  JOIN RDB$FIELDS F ON F.RDB$FIELD_NAME = RF.RDB$FIELD_SOURCE
	  WHERE COALESCE(R.RDB$SYSTEM_FLAG, 0) = 0 AND R.RDB$VIEW_BLR IS NULL AND `+tabelasLinha)
	if err != nil {
		return nil, err
	}
	cols := map[string]map[string]bool{}
	type cand struct{ t, c string }
	cands := []cand{}
	for _, m := range ms {
		t, c := strings.ToUpper(vStr(m["TABELA"])), strings.ToUpper(vStr(m["COLUNA"]))
		if !rxIdentFB.MatchString(t) || !rxIdentFB.MatchString(c) {
			continue
		}
		if cols[t] == nil {
			cols[t] = map[string]bool{}
		}
		cols[t][c] = true
		tipo, tam := vInt(m["TIPO"]), vInt(m["TAM"])
		texto := tipo == 14 || tipo == 37 || (tipo == 261 && vInt(m["SUBTIPO"]) == 1)
		if texto && (tipo == 261 || tam >= 44) && rxColLinha.MatchString(c) {
			cands = append(cands, cand{t, c})
		}
	}
	out := []fonteLinha{}
	for _, k := range cands {
		cs := cols[k.t]
		direto := cs["NRNOSSONUMERO"] && cs["CDCONTRIBUICAO"]
		junta := k.t != "PSW_BLOQUETOSEMP" && cs["CDEMPRESA"] && cs["CDCONTRIBUICAO"] && cs["NRANOEXERCICIO"] && cs["NRMESEXERCICIO"] && cs["DTVENCIMENTO"]
		if direto || junta {
			out = append(out, fonteLinha{Tabela: k.t, Coluna: k.c, cols: cs})
		}
	}
	// a tabela de boletos do ProSindW primeiro; depois as demais
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].Tabela == "PSW_BLOQUETOSEMP" && out[j].Tabela != "PSW_BLOQUETOSEMP"
	})
	return out, nil
}

func sqlFonte(f fonteLinha, nCodigos int, comData bool) string {
	in := strings.TrimSuffix(strings.Repeat("?,", nCodigos), ",")
	col := fmt.Sprintf(`T."%s"`, f.Coluna)
	var b strings.Builder
	if f.cols["NRNOSSONUMERO"] {
		fmt.Fprintf(&b, `SELECT FIRST 10 T.CDCONTRIBUICAO AS CT, T.NRNOSSONUMERO AS NN, %s AS LINHA FROM "%s" T
		  WHERE %s IS NOT NULL AND T.NRNOSSONUMERO IS NOT NULL AND T.CDCONTRIBUICAO IN (%s)`, col, f.Tabela, col, in)
		if f.cols["DTVENCIMENTO"] {
			if comData {
				b.WriteString(" AND T.DTVENCIMENTO >= ?")
			}
			b.WriteString(" ORDER BY T.DTVENCIMENTO DESC")
		}
		return b.String()
	}
	fmt.Fprintf(&b, `SELECT FIRST 10 T.CDCONTRIBUICAO AS CT, B.NRNOSSONUMERO AS NN, %s AS LINHA FROM "%s" T
	  JOIN PSW_BLOQUETOSEMP B ON B.CDEMPRESA = T.CDEMPRESA AND B.CDCONTRIBUICAO = T.CDCONTRIBUICAO AND B.NRANOEXERCICIO = T.NRANOEXERCICIO
	   AND B.NRMESEXERCICIO = T.NRMESEXERCICIO AND B.DTVENCIMENTO = T.DTVENCIMENTO
	  WHERE %s IS NOT NULL AND B.NRNOSSONUMERO IS NOT NULL AND T.CDCONTRIBUICAO IN (%s)`, col, f.Tabela, col, in)
	if comData {
		b.WriteString(" AND B.DTVENCIMENTO >= ?")
	}
	b.WriteString(" ORDER BY B.DTVENCIMENTO DESC")
	return b.String()
}

func conferirBanco(ctx context.Context, db *sql.DB, banco string, codigos []string, porCodigo map[string]ContribInfo, fontes []fonteLinha) AutoBanco {
	perf := perfis[banco]
	ab := AutoBanco{Banco: banco, Perfil: perf.nome}
	if len(fontes) == 0 {
		ab.Situacao = "sem_fonte"
		ab.Mensagem = "o banco do ProSindW não guarda a linha digitável dos boletos, então não há com o que comparar sozinho."
		return ab
	}
	args := make([]interface{}, 0, len(codigos)+1)
	for _, c := range codigos {
		args = append(args, c)
	}
	erros := []string{}
	for _, f := range fontes {
		temData := f.cols["DTVENCIMENTO"] || !f.cols["NRNOSSONUMERO"]
		datas := []bool{false}
		if temData { // primeiro os boletos recentes (usa o índice de vencimento); depois qualquer data
			datas = []bool{true, false}
		}
		for _, comData := range datas {
			a := args
			if comData {
				a = append(append([]interface{}{}, args...), time.Now().AddDate(-2, 0, 0))
			}
			ms, err := linhas(ctx, db, sqlFonte(f, len(codigos), comData), a...)
			if err != nil {
				erros = append(erros, f.nome()+": "+traduzirErro(err).Error())
				break
			}
			for _, m := range ms {
				barras := BarrasDe(vStr(m["LINHA"]))
				if barras == "" || barras[:3] != perf.real {
					continue
				}
				ct, ok := porCodigo[vStr(m["CT"])]
				if !ok || ct.Banco != banco {
					continue
				}
				nn := vStr(m["NN"])
				calc, err := RecalcularBarras(ct.Params, nn, barras)
				ab.Contribuicao, ab.NossoNumero, ab.Fonte = ct.Codigo, nn, f.nome()
				ab.LinhaProsind = LinhaDigitavel(barras)
				if err != nil {
					ab.Situacao = "erro"
					ab.Mensagem = "não consegui calcular a linha do boleto " + nn + ": " + err.Error()
					return ab
				}
				ab.LinhaCalculada = calc.Linha
				// vale o boleto mais recente: é ele que reflete os dados bancários de hoje
				if calc.Barras == barras {
					ab.Situacao = "conferido"
					ab.Mensagem = fmt.Sprintf("igual ao boleto %s (contribuição %s) gravado pelo ProSindW.", nn, ct.Codigo)
				} else {
					ab.Situacao = "divergente"
					ab.Mensagem = fmt.Sprintf("diferente do boleto %s (contribuição %s) gravado pelo ProSindW.", nn, ct.Codigo)
				}
				return ab
			}
			if len(ms) > 0 {
				break // há boletos, mas nenhum comparável nesta coluna: tenta a próxima fonte
			}
		}
	}
	if len(erros) > 0 {
		ab.Situacao = "erro"
		ab.Mensagem = "não consegui ler os boletos do ProSindW (" + strings.Join(erros, "; ") + ")."
		return ab
	}
	ab.Situacao = "sem_boleto"
	ab.Mensagem = fmt.Sprintf("ainda não há boleto do banco %s com linha digitável gravada pelo ProSindW. Assim que o ProSindW emitir um, a conferência é feita sozinha na próxima conexão (ou em Atualizar do banco).", banco)
	return ab
}

// gravarResultadoBanco: conferido libera o banco; divergente tira a liberação automática (a manual fica, com aviso).
func gravarResultadoBanco(ab *AutoBanco, porCodigo map[string]ContribInfo) {
	atuais := conferidos()
	manual := false
	for _, cf := range atuais {
		if cf.Banco == ab.Banco && !cf.Auto {
			manual = true
		}
	}
	ab.Manual = manual
	switch ab.Situacao {
	case "conferido":
		if manual {
			return
		}
		ct := porCodigo[ab.Contribuicao]
		err := alterarConferidos(func(m map[string]Conferencia) {
			m[ab.Contribuicao] = Conferencia{Banco: ab.Banco, Chave: chaveBanco(ct.Params), Linha: ab.LinhaCalculada,
				Data: time.Now().Format("02/01/2006 15:04"), Auto: true, Fonte: ab.Fonte}
		})
		if err != nil {
			log.Printf("conferência automática: não consegui gravar a configuração: %v", err)
		}
	case "divergente":
		tem := false
		for _, cf := range atuais {
			if cf.Banco == ab.Banco && cf.Auto {
				tem = true
			}
		}
		if !tem {
			return
		}
		if err := alterarConferidos(func(m map[string]Conferencia) {
			for k, cf := range m {
				if cf.Banco == ab.Banco && cf.Auto {
					delete(m, k)
				}
			}
		}); err != nil {
			log.Printf("conferência automática: não consegui gravar a configuração: %v", err)
		}
	}
}
