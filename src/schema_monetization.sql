-- ============================================================
-- Rune Blast Arena - Esquema de Monetização, Inventário e VIP
-- Execute este script no SQL Editor do seu projeto Supabase.
-- ============================================================

-- 1. TABELA DE INVENTÁRIO (inventory)
-- Guarda os itens comprados pelo jogador e os slots atualmente equipados.
create table if not exists public.inventory (
  user_id uuid references auth.users(id) on delete cascade primary key,
  items jsonb not null default '[]'::jsonb,
  equipped_weapon text default null,
  equipped_skin text default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ativa Row Level Security (RLS)
alter table public.inventory enable row level security;

-- Políticas de segurança para inventory (o jogador só acessa o próprio inventário)
drop policy if exists "Jogador le o proprio inventario" on public.inventory;
create policy "Jogador le o proprio inventario"
  on public.inventory for select
  using (auth.uid() = user_id);

drop policy if exists "Jogador insere o proprio inventario" on public.inventory;
create policy "Jogador insere o proprio inventario"
  on public.inventory for insert
  with check (auth.uid() = user_id);

drop policy if exists "Jogador atualiza o proprio inventario" on public.inventory;
create policy "Jogador atualiza o proprio inventario"
  on public.inventory for update
  using (auth.uid() = user_id);


-- 2. TABELA DE PERFIL E MONETIZAÇÃO DO UTILIZADOR (user_profile)
-- Guarda moedas de ouro, gemas pagas, status VIP, passe de torneio e progresso de temporada.
create table if not exists public.user_profile (
  id uuid references auth.users(id) on delete cascade primary key,
  username text unique,
  wallet_gold integer not null default 0,
  wallet_gems integer not null default 0,
  is_vip boolean not null default false,
  vip_expires_at timestamptz,
  has_tournament_pass boolean not null default false,
  tournament_pass_expires_at timestamptz,
  season_progress jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Se a tabela 'profiles' antiga já existia, podemos migrar dados iniciais automaticamente:
do $$
begin
  if exists (select from information_schema.tables where table_schema = 'public' and table_name = 'profiles') then
    insert into public.user_profile (id, username, wallet_gold, is_vip, vip_expires_at)
    select id, username, wallet_gold, is_vip, vip_expires_at from public.profiles
    on conflict (id) do update set
      wallet_gold = excluded.wallet_gold,
      is_vip = excluded.is_vip,
      vip_expires_at = excluded.vip_expires_at;
  end if;
end $$;

-- Ativa Row Level Security (RLS)
alter table public.user_profile enable row level security;

-- Políticas de segurança para user_profile
drop policy if exists "Jogador le o proprio perfil user_profile" on public.user_profile;
create policy "Jogador le o proprio perfil user_profile"
  on public.user_profile for select
  using (auth.uid() = id);

drop policy if exists "Jogador insere o proprio perfil user_profile" on public.user_profile;
create policy "Jogador insere o proprio perfil user_profile"
  on public.user_profile for insert
  with check (auth.uid() = id);

drop policy if exists "Jogador atualiza o proprio perfil user_profile" on public.user_profile;
create policy "Jogador atualiza o proprio perfil user_profile"
  on public.user_profile for update
  using (auth.uid() = id);


-- 3. TRIGGERS PARA ATUALIZAÇÃO AUTOMÁTICA DE updated_at
create or replace function public.set_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_inventory_updated_at on public.inventory;
create trigger trg_inventory_updated_at
  before update on public.inventory
  for each row execute function public.set_updated_at_column();

drop trigger if exists trg_user_profile_updated_at on public.user_profile;
create trigger trg_user_profile_updated_at
  before update on public.user_profile
  for each row execute function public.set_updated_at_column();
