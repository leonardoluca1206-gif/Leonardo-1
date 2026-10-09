/* AgendaW — Atendimentos do período, SOMENTE DEPENDENTES (relatório que não existe no sistema)
   Banco: o mesmo do ProSindW (tabelas AGW_ da agenda + PSW_ de sócios e dependentes).
   Parâmetros: :DTI e :DTF (data inicial e final). No IBExpert/FlameRobin, troque por datas,
   ex.: '2026-09-01' e '2026-09-30'.

   Como o dependente é identificado: a agenda do sócio (AGW_AGENDA) guarda o número do
   dependente atendido (NRDEPENDENTE); o titular fica com 0/vazio. O INNER JOIN com
   PSW_DEPENDENTES deixa só as linhas de dependentes, como os relatórios do AgendaW fazem
   ("NOME / DEPENDENTE" preenchido).

   Antes de usar, confira os nomes das colunas da agenda no seu banco:
     SELECT TRIM(RDB$FIELD_NAME) FROM RDB$RELATION_FIELDS
      WHERE RDB$RELATION_NAME = 'AGW_AGENDA' ORDER BY RDB$FIELD_POSITION;
   Se a coluna do dependente ou da situação tiver outro nome, troque abaixo.
   (Pelo Assistente da Base de Apoio isso é automático.) */

SELECT
  A.DTDATA                AS DATA,
  A.CDHORARI              AS HORARIO,
  A.NRINSCRICAO           AS INSCRICAO,
  S.NMSOCIO               AS TITULAR,
  D.NMDEPENDENTE          AS DEPENDENTE,
  D.DSPARENTESCO          AS PARENTESCO,
  D.DTNASCIMENTO          AS NASCIMENTO_DEP,
  C.NMCONVEN              AS CONVENIO,
  ATV.DSRAMATI            AS ESPECIALIDADE,
  T.DSTRATAM              AS TRATAMENTO,
  A.SITUACAO              AS SITUACAO
FROM AGW_AGENDA A
INNER JOIN PSW_DEPENDENTES D
        ON D.NRINSCRSOC = A.NRINSCRICAO
       AND D.NRSEQUENCIADEP = A.NRDEPENDENTE
LEFT JOIN PSW_SOCIOS S        ON S.NRINSCRICAO = A.NRINSCRICAO
LEFT JOIN AGW_CONVENIOS C     ON C.CDCONVEN = A.CDCONVEN
LEFT JOIN AGW_ATIVIDADES ATV  ON ATV.CDRAMATI = C.CDRAMATI
LEFT JOIN AGW_TIPOSTRATAM T   ON T.CDTRATAM = A.CDTRATAM
WHERE A.DTDATA BETWEEN :DTI AND :DTF
  AND A.NRDEPENDENTE > 0
  /* só os atendidos (sem esta linha vêm agendados, ausências etc.): */
  AND A.SITUACAO = 'ATENDIDO'
ORDER BY A.DTDATA, A.CDHORARI, D.NMDEPENDENTE;

/* Resumo: quantos atendimentos de dependentes por convênio no período */
SELECT C.NMCONVEN AS CONVENIO, COUNT(*) AS ATENDIMENTOS, COUNT(DISTINCT A.NRINSCRICAO || '-' || A.NRDEPENDENTE) AS DEPENDENTES
FROM AGW_AGENDA A
INNER JOIN PSW_DEPENDENTES D ON D.NRINSCRSOC = A.NRINSCRICAO AND D.NRSEQUENCIADEP = A.NRDEPENDENTE
LEFT JOIN AGW_CONVENIOS C ON C.CDCONVEN = A.CDCONVEN
WHERE A.DTDATA BETWEEN :DTI AND :DTF AND A.NRDEPENDENTE > 0 AND A.SITUACAO = 'ATENDIDO'
GROUP BY C.NMCONVEN
ORDER BY 2 DESC;
