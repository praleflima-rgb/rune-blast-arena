-- ============================================================
-- ZERAR O RANKING DE TEMPORADA (rode no SQL Editor do Supabase)
--
-- POR QUE ISTO E NECESSARIO:
-- A limpeza automatica que o jogo faz apaga so os dados do
-- NAVEGADOR de cada jogador. As pontuacoes que aparecem no
-- ranking vem do SERVIDOR (tabela season_scores) - e so este
-- comando apaga de la.
--
-- ATENCAO: apaga todas as pontuacoes de temporada. Sem desfazer.
-- O Ranking DIARIO (sobrevivencia/pvp) NAO e afetado.
-- ============================================================

delete from public.season_scores;

-- deve retornar 0
select count(*) as participantes_restantes from public.season_scores;
