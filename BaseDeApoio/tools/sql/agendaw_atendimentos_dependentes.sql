/* AgendaW — Atendimentos do período, SOMENTE DEPENDENTES (relatório que não existe no sistema)
   Banco: o mesmo do ProSindW (tabelas AGW_ da agenda + PSW_ de sócios e dependentes).
   Período: troque as duas datas no WHERE (formato 'aaaa-mm-dd').

   Colunas conferidas na AGW_AGENDA do sindicato:
     CDDEPEND   código do dependente atendido (titular = 0/vazio)
     NMDEPEN    nome do dependente gravado na agenda (é o que os relatórios do AgendaW testam)
     DSSITUACAO situação: ATENDIDO, AGENDADO, AUSENCIA, ABERTO
     TXATEND    taxa do atendimento
     CDBENEFI   serviço/benefício
   Dependente = NMDEPEN preenchido ou CDDEPEND > 0. O cadastro (parentesco, nascimento) vem de
   PSW_DEPENDENTES por LEFT JOIN, para não perder o atendimento se o cadastro tiver mudado. */

SELECT
  A.DTDATA                                              AS DATA,
  A.CDHORARI                                            AS HORARIO,
  A.NRINSCRICAO                                         AS INSCRICAO,
  S.NMSOCIO                                             AS TITULAR,
  COALESCE(NULLIF(TRIM(A.NMDEPEN), ''), D.NMDEPENDENTE) AS DEPENDENTE,
  D.DSPARENTESCO                                        AS PARENTESCO,
  D.DTNASCIMENTO                                        AS NASCIMENTO_DEP,
  C.NMCONVEN                                            AS CONVENIO,
  ATV.DSRAMATI                                          AS ESPECIALIDADE,
  B.DSBENEFI                                            AS SERVICO,
  T.DSTRATAM                                            AS TRATAMENTO,
  A.DSSITUACAO                                          AS SITUACAO,
  A.TXATEND                                             AS TAXA
FROM AGW_AGENDA A
LEFT JOIN PSW_DEPENDENTES D   ON D.NRINSCRSOC = A.NRINSCRICAO
                             AND D.NRSEQUENCIADEP = A.CDDEPEND
LEFT JOIN PSW_SOCIOS S        ON S.NRINSCRICAO = A.NRINSCRICAO
LEFT JOIN AGW_CONVENIOS C     ON C.CDCONVEN = A.CDCONVEN
LEFT JOIN AGW_ATIVIDADES ATV  ON ATV.CDRAMATI = C.CDRAMATI
LEFT JOIN AGW_BENEFICIOS B    ON B.CDBENEFI = A.CDBENEFI
LEFT JOIN AGW_TIPOSTRATAM T   ON T.CDTRATAM = A.CDTRATAM
WHERE A.DTDATA BETWEEN '2026-10-01' AND '2026-10-09'
  AND (COALESCE(A.CDDEPEND, 0) > 0 OR COALESCE(TRIM(A.NMDEPEN), '') <> '')
  /* só os atendidos (sem esta linha vêm agendados, ausências etc.): */
  AND A.DSSITUACAO = 'ATENDIDO'
ORDER BY A.DTDATA, A.CDHORARI, 5;

/* Resumo: atendimentos de dependentes por convênio no período */
SELECT C.NMCONVEN AS CONVENIO, COUNT(*) AS ATENDIMENTOS, SUM(COALESCE(A.TXATEND, 0)) AS TAXAS
FROM AGW_AGENDA A
LEFT JOIN AGW_CONVENIOS C ON C.CDCONVEN = A.CDCONVEN
WHERE A.DTDATA BETWEEN '2026-10-01' AND '2026-10-09'
  AND (COALESCE(A.CDDEPEND, 0) > 0 OR COALESCE(TRIM(A.NMDEPEN), '') <> '')
  AND A.DSSITUACAO = 'ATENDIDO'
GROUP BY C.NMCONVEN
ORDER BY 2 DESC;
