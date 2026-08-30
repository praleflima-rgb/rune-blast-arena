-- ============================================================
-- RUNE BLAST ARENA — CORREÇÃO E ATIVAÇÃO DO RANKING DIÁRIO
-- Execute este script no SQL Editor do seu projeto Supabase
-- ============================================================

-- 1. Criação da tabela de Ranking Diário Compartilhado
CREATE TABLE IF NOT EXISTS public.daily_rank (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  mode           text        NOT NULL,                -- 'survival' ou 'pvp'
  cycle_date     date        NOT NULL,                -- data do ciclo (ex: '2026-08-30')
  username       text        NOT NULL,
  points         integer     NOT NULL DEFAULT 0,
  matches        integer     NOT NULL DEFAULT 0,
  best_placement integer     NOT NULL DEFAULT 5,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_rank_user_mode_cycle_key UNIQUE (user_id, mode, cycle_date)
);

-- Índices para buscas rápidas
CREATE INDEX IF NOT EXISTS daily_rank_mode_cycle_idx ON public.daily_rank (mode, cycle_date, points DESC);
CREATE INDEX IF NOT EXISTS daily_rank_username_idx ON public.daily_rank (username);

-- 2. Habilita RLS (Row Level Security)
ALTER TABLE public.daily_rank ENABLE ROW LEVEL SECURITY;

-- Leitura pública: QUALQUER jogador (mesmo anônimo/carregando) pode ver o ranking completo
DROP POLICY IF EXISTS "Qualquer um pode ler o ranking diario" ON public.daily_rank;
CREATE POLICY "Qualquer um pode ler o ranking diario"
  ON public.daily_rank FOR SELECT
  USING (true);

-- Permissões de escrita para usuários autenticados
DROP POLICY IF EXISTS "Jogador insere propria pontuacao diaria" ON public.daily_rank;
CREATE POLICY "Jogador insere propria pontuacao diaria"
  ON public.daily_rank FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Jogador atualiza propria pontuacao diaria" ON public.daily_rank;
CREATE POLICY "Jogador atualiza propria pontuacao diaria"
  ON public.daily_rank FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Permissões de tabela
GRANT ALL ON TABLE public.daily_rank TO anon, authenticated, service_role;

-- 3. Função RPC para somar pontos de forma atômica e segura
CREATE OR REPLACE FUNCTION public.add_daily_rank_points(
  p_mode text,
  p_cycle_date date,
  p_username text,
  p_points integer,
  p_placement integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Se auth.uid() não estiver no contexto, busca pelo username na tabela profiles
  IF v_uid IS NULL THEN
    SELECT id INTO v_uid FROM public.profiles WHERE LOWER(username) = LOWER(p_username) LIMIT 1;
  END IF;

  IF v_uid IS NOT NULL THEN
    INSERT INTO public.daily_rank (user_id, mode, cycle_date, username, points, matches, best_placement, updated_at)
    VALUES (v_uid, p_mode, p_cycle_date, p_username, p_points, 1, p_placement, now())
    ON CONFLICT (user_id, mode, cycle_date) DO UPDATE SET
      points = public.daily_rank.points + excluded.points,
      matches = public.daily_rank.matches + 1,
      best_placement = LEAST(public.daily_rank.best_placement, excluded.best_placement),
      username = excluded.username,
      updated_at = now();
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_daily_rank_points(text, date, text, integer, integer) TO anon, authenticated, service_role;

-- 4. Habilitar Realtime para a tabela daily_rank
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'daily_rank'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_rank;
  END IF;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 5. RESTAURAR PONTUAÇÕES DO CICLO ATUAL (Desde ontem 21h até hoje 21h)
--    Ciclo: '2026-08-30' (Evento Especial com encerramento hoje às 21h)
-- ────────────────────────────────────────────────────────────

-- Insere ou atualiza pontuação de Bts (8 pontos no modo Sobrevivência)
INSERT INTO public.daily_rank (user_id, mode, cycle_date, username, points, matches, best_placement, updated_at)
SELECT id, 'survival', '2026-08-30'::date, 'Bts', 8, 1, 1, now()
FROM public.profiles WHERE LOWER(username) = 'bts'
ON CONFLICT (user_id, mode, cycle_date) DO UPDATE SET
  points = 8,
  matches = 1,
  best_placement = 1,
  username = 'Bts',
  updated_at = now();

-- Insere ou atualiza pontuação de GMBlack (5 pontos no modo Sobrevivência)
INSERT INTO public.daily_rank (user_id, mode, cycle_date, username, points, matches, best_placement, updated_at)
SELECT id, 'survival', '2026-08-30'::date, 'GMBlack', 5, 1, 2, now()
FROM public.profiles WHERE LOWER(username) = 'gmblack'
ON CONFLICT (user_id, mode, cycle_date) DO UPDATE SET
  points = 5,
  matches = 1,
  best_placement = 2,
  username = 'GMBlack',
  updated_at = now();

-- Confirmação dos dados inseridos no ciclo de hoje
SELECT username, mode, cycle_date, points, matches, best_placement 
FROM public.daily_rank 
WHERE cycle_date = '2026-08-30'
ORDER BY points DESC;
