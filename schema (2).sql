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
