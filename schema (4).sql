-- ============================================================
-- Rune Blast Arena - esquema de perfil do jogador
-- Rode isso inteiro no SQL Editor do painel do Supabase (uma vez so).
-- ============================================================

-- Uma linha por jogador, ligada a conta de autenticacao (auth.users) que
-- o Supabase ja gerencia sozinho - nao guardamos e-mail/senha aqui, so os
-- dados do JOGO (carteira, VIP, passes).
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  wallet_gold integer not null default 0,
  is_vip boolean not null default false,
  vip_expires_at timestamptz,
  daily_passes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Liga Row Level Security - SEM ISSO, a chave publica (anon) do seu site
-- consegue ler/escrever a tabela INTEIRA, de todo mundo. Com RLS ligado e
-- as politicas abaixo, cada jogador so enxerga a propria linha.
alter table public.profiles enable row level security;

-- jogador pode ler APENAS o proprio perfil
create policy "Jogador le o proprio perfil"
  on public.profiles for select
  using (auth.uid() = id);

-- jogador pode criar APENAS o proprio perfil (na primeira vez que loga)
create policy "Jogador cria o proprio perfil"
  on public.profiles for insert
  with check (auth.uid() = id);

-- jogador pode atualizar APENAS o proprio perfil
create policy "Jogador atualiza o proprio perfil"
  on public.profiles for update
  using (auth.uid() = id);

-- mantem updated_at em dia sozinho a cada alteracao
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================
-- APELIDO (Username) + login por apelido
-- ============================================================

-- coluna do apelido, unica (nao pode repetir entre jogadores)
alter table public.profiles add column if not exists username text unique;

-- O Supabase Auth so faz login por E-MAIL nativamente. Esta funcao permite
-- "login por apelido": o jogo chama ela primeiro (com a chave publica, sem
-- estar logado ainda) para descobrir o e-mail ligado aquele apelido, e so
-- entao chama signInWithPassword com esse e-mail. "security definer" e
-- necessario pra funcao conseguir ler auth.users (RLS normal bloquearia).
create or replace function public.get_email_by_username(p_username text)
returns text
language sql
security definer
set search_path = public
as $$
  select au.email
  from public.profiles p
  join auth.users au on au.id = p.id
  where lower(p.username) = lower(p_username)
  limit 1;
$$;

grant execute on function public.get_email_by_username(text) to anon, authenticated;

-- ============================================================
-- RANKING DE TEMPORADA (compartilhado de verdade entre jogadores)
-- ============================================================

create table if not exists public.season_scores (
  user_id uuid references auth.users(id) on delete cascade primary key,
  username text not null,
  score integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.season_scores enable row level security;

-- QUALQUER pessoa pode LER o ranking inteiro (e o objetivo de um ranking
-- publico) - so a ESCRITA e restrita a propria linha do jogador.
create policy "Qualquer um pode ler o ranking"
  on public.season_scores for select
  using (true);

create policy "Jogador insere so a propria pontuacao"
  on public.season_scores for insert
  with check (auth.uid() = user_id);

create policy "Jogador atualiza so a propria pontuacao"
  on public.season_scores for update
  using (auth.uid() = user_id);

drop trigger if exists trg_season_scores_updated_at on public.season_scores;
create trigger trg_season_scores_updated_at
  before update on public.season_scores
  for each row execute function public.set_updated_at();

-- ============================================================
-- MATCHMAKING PvP ONLINE (via Supabase Realtime - sem servidor
-- proprio). Fila de espera + partidas criadas atomicamente.
-- ============================================================

-- Fila de quem esta procurando partida agora. Uma linha por jogador (se
-- procurar de novo, atualiza a mesma linha em vez de duplicar).
create table if not exists public.pvp_queue (
  user_id uuid references auth.users(id) on delete cascade primary key,
  username text not null,
  char_index integer not null default 0,
  joined_at timestamptz not null default now()
);
alter table public.pvp_queue enable row level security;

create policy "Jogador gerencia a propria entrada na fila"
  on public.pvp_queue for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Partidas criadas quando dois jogadores sao pareados.
create table if not exists public.pvp_matches (
  id uuid primary key default gen_random_uuid(),
  player1_id uuid references auth.users(id),
  player1_username text,
  player1_char integer,
  player2_id uuid references auth.users(id),
  player2_username text,
  player2_char integer,
  seed integer not null,
  created_at timestamptz not null default now()
);
alter table public.pvp_matches enable row level security;

-- so os 2 jogadores da propria partida podem ler a linha dela
create policy "Jogadores da partida podem ler"
  on public.pvp_matches for select
  using (auth.uid() = player1_id or auth.uid() = player2_id);

-- Funcao atomica de pareamento - chamada pelo jogo a cada poucos segundos
-- enquanto procura. "FOR UPDATE SKIP LOCKED" evita que dois jogadores
-- tentem parear com a MESMA pessoa da fila ao mesmo tempo (condicao de
-- corrida classica de matchmaking).
create or replace function public.try_match_pvp(p_username text, p_char_index integer)
returns table(match_id uuid, opponent_id uuid, opponent_username text, opponent_char integer, i_am_player1 boolean, seed integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opponent record;
  v_match_id uuid;
  v_seed integer;
begin
  -- tenta achar quem esta esperando ha mais tempo, travando a linha pra
  -- ninguem mais conseguir pegar essa mesma pessoa ao mesmo tempo
  select * into v_opponent from public.pvp_queue
    where user_id != auth.uid()
    order by joined_at asc
    limit 1
    for update skip locked;

  if v_opponent.user_id is not null then
    delete from public.pvp_queue where user_id = v_opponent.user_id;
    delete from public.pvp_queue where user_id = auth.uid();
    v_seed := floor(random()*1000000)::integer;
    insert into public.pvp_matches(player1_id, player1_username, player1_char, player2_id, player2_username, player2_char, seed)
      values (v_opponent.user_id, v_opponent.username, v_opponent.char_index, auth.uid(), p_username, p_char_index, v_seed)
      returning id into v_match_id;
    return query select v_match_id, v_opponent.user_id, v_opponent.username, v_opponent.char_index, false, v_seed;
  else
    -- ninguem esperando ainda - entra (ou atualiza a propria entrada) na fila
    insert into public.pvp_queue(user_id, username, char_index)
      values (auth.uid(), p_username, p_char_index)
      on conflict (user_id) do update set username=excluded.username, char_index=excluded.char_index, joined_at=now();
    return;
  end if;
end;
$$;

grant execute on function public.try_match_pvp(text, integer) to authenticated;

-- Ativa o Realtime na tabela de partidas - necessario para o jogo "escutar"
-- quando alguem o encontra na fila (sem isso, so quem CHAMA a funcao acima
-- fica sabendo do pareamento, e quem so ficou esperando nunca descobriria).
alter publication supabase_realtime add table public.pvp_matches;
