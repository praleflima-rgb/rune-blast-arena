-- ============================================================
-- ZERAR O RANKING DE TEMPORADA
-- Rode isto UMA VEZ no SQL Editor do Supabase para comecar do
-- zero com o novo sistema (1 ponto a cada 1000 moedas).
--
-- ATENCAO: isto APAGA todas as pontuacoes de temporada atuais
-- (as antigas, infladas: 2285, 1645 etc). Nao tem como desfazer.
-- O Ranking DIARIO (survival/pvp) NAO e afetado por este comando.
-- ============================================================

delete from public.season_scores;

-- confirma que ficou vazio (deve retornar 0)
select count(*) as pontuacoes_restantes from public.season_scores;
