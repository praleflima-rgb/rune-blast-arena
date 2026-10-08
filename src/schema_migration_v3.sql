-- ================================================================
-- Rune Blast Arena - Migracao v3
-- Remove: anuncios, recompensas diarias (has_tournament_pass antigo)
-- Adiciona: ranked_tries, extra_tries, last_tries_update,
--           tournament_pass_active, referral_*, prize_pool_brl
-- Execute no SQL Editor do seu projeto Supabase.
-- ================================================================

-- 1. TABELA inventory (sem alteracoes de schema, apenas garantia)
create table if not exists public.inventory (
  user_id uuid references auth.users(id) on delete cascade primary key,
  items jsonb not null default '[]'::jsonb,
  equipped_weapon text default null,
  equipped_skin text default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inventory enable row level security;

drop policy if exists "Jogador le o proprio inventario" on public.inventory;
create policy "Jogador le o proprio inventario" on public.inventory for select using (auth.uid() = user_id);

drop policy if exists "Jogador insere o proprio inventario" on public.inventory;
create policy "Jogador insere o proprio inventario" on public.inventory for insert with check (auth.uid() = user_id);

drop policy if exists "Jogador atualiza o proprio inventario" on public.inventory;
create policy "Jogador atualiza o proprio inventario" on public.inventory for update using (auth.uid() = user_id);


-- 2. TABELA user_profile (v3)
create table if not exists public.user_profile (
  id uuid references auth.users(id) on delete cascade primary key,
  username text unique,

  -- Carteira
  wallet_gold integer not null default 0,
  wallet_gems integer not null default 0,

  -- VIP (R$ 30,00/mes em POL)
  is_vip boolean not null default false,
  vip_expires_at timestamptz,

  -- Tentativas Ranked (free: 3/hora, vip: ilimitado)
  ranked_tries integer not null default 3,
  extra_tries integer not null default 0,
  last_tries_update timestamptz not null default now(),

  -- Passe de Torneio (R$ 10,00 em POL — valido por 7 dias)
  tournament_pass_active boolean not null default false,
  tournament_pass_expires_at timestamptz,

  -- Sistema Indique e Ganhe
  referral_code text unique,
  referrals_count_today integer not null default 0,
  referral_date_brt date,
  referrals_total_count integer not null default 0,
  referral_discount_percent numeric(5,2) not null default 0,

  -- Premio dinamico da Temporada Principal
  prize_pool_brl numeric(10,2) not null default 100.00,

  -- Progresso da Temporada (modo historia)
  season_progress jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migrar colunas antigas se existirem (idempotente)
do 
begin
  -- ranked_tries
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='user_profile' and column_name='ranked_tries') then
    alter table public.user_profile add column ranked_tries integer not null default 3;
  end if;

  -- extra_tries
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='user_profile' and column_name='extra_tries') then
    alter table public.user_profile add column extra_tries integer not null default 0;
  end if;

  -- last_tries_update
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='user_profile' and column_name='last_tries_update') then
    alter table public.user_profile add column last_tries_update timestamptz not null default now();
  end if;

  -- tournament_pass_active (substitui has_tournament_pass com semantica identica)
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='user_profile' and column_name='tournament_pass_active') then
    alter table public.user_profile add column tournament_pass_active boolean not null default false;
  end if;

  -- Migra has_tournament_pass -> tournament_pass_active se existir
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='user_profile' and column_name='has_tournament_pass') then
    update public.user_profile set tournament_pass_active = has_tournament_pass where tournament_pass_active = false;
    alter table public.user_profile drop column if exists has_tournament_pass;
  end if;

  -- tournament_pass_expires_at
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='user_profile' and column_name='tournament_pass_expires_at') then
    alter table public.user_profile add column tournament_pass_expires_at timestamptz;
  end if;

  -- referral_code
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='user_profile' and column_name='referral_code') then
    alter table public.user_profile add column referral_code text unique;
  end if;

  -- referrals_count_today
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='user_profile' and column_name='referrals_count_today') then
    alter table public.user_profile add column referrals_count_today integer not null default 0;
  end if;

  -- referral_date_brt
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='user_profile' and column_name='referral_date_brt') then
    alter table public.user_profile add column referral_date_brt date;
  end if;

  -- referrals_total_count
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='user_profile' and column_name='referrals_total_count') then
    alter table public.user_profile add column referrals_total_count integer not null default 0;
  end if;

  -- referral_discount_percent
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='user_profile' and column_name='referral_discount_percent') then
    alter table public.user_profile add column referral_discount_percent numeric(5,2) not null default 0;
  end if;

  -- prize_pool_brl
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='user_profile' and column_name='prize_pool_brl') then
    alter table public.user_profile add column prize_pool_brl numeric(10,2) not null default 100.00;
  end if;

  -- Remove colunas descontinuadas de recompensas diarias (se existirem)
  alter table public.user_profile drop column if exists daily_reward_day;
  alter table public.user_profile drop column if exists daily_reward_last_claimed;
  alter table public.user_profile drop column if exists daily_reward_streak;
end ;


-- 3. RLS para user_profile
alter table public.user_profile enable row level security;

drop policy if exists "Jogador le o proprio perfil user_profile" on public.user_profile;
create policy "Jogador le o proprio perfil user_profile" on public.user_profile for select using (auth.uid() = id);

drop policy if exists "Jogador insere o proprio perfil user_profile" on public.user_profile;
create policy "Jogador insere o proprio perfil user_profile" on public.user_profile for insert with check (auth.uid() = id);

drop policy if exists "Jogador atualiza o proprio perfil user_profile" on public.user_profile;
create policy "Jogador atualiza o proprio perfil user_profile" on public.user_profile for update using (auth.uid() = id);


-- 4. Funcao para reset diario de referrals_count_today (opcional — pode ser chamada por Edge Function)
create or replace function public.reset_daily_referral_counts()
returns void as 
begin
  update public.user_profile
  set referrals_count_today = 0,
      referral_date_brt = current_date
  where referral_date_brt < current_date;
end;
 language plpgsql security definer;


-- 5. Trigger updated_at
create or replace function public.set_updated_at_column()
returns trigger as 
begin
  new.updated_at = now();
  return new;
end;
 language plpgsql;

drop trigger if exists trg_inventory_updated_at on public.inventory;
create trigger trg_inventory_updated_at before update on public.inventory for each row execute function public.set_updated_at_column();

drop trigger if exists trg_user_profile_updated_at on public.user_profile;
create trigger trg_user_profile_updated_at before update on public.user_profile for each row execute function public.set_updated_at_column();


-- 6. Indices de performance
create index if not exists idx_user_profile_referral_code on public.user_profile(referral_code);
create index if not exists idx_user_profile_is_vip on public.user_profile(is_vip);
create index if not exists idx_user_profile_tournament_pass on public.user_profile(tournament_pass_active);

-- Fim da migracao v3
