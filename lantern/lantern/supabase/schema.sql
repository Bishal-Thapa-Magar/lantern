-- Lantern database schema for Supabase (PostgreSQL).
-- Run this whole file once in: Supabase dashboard > SQL Editor > New query > Run.
--
-- Security model
--   * Row Level Security (RLS) is ON for every table. A learner can only ever read or write their own rows.
--   * The public "anon" role has NO access to private tables.
--   * Public rating numbers are exposed through two narrow views that never include user ids.
--   * The browser never holds a privileged key. Only the public anon key is used.

-- ---------------------------------------------------------------- saved_items
create table if not exists public.saved_items (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  resource_id text not null check (char_length(resource_id) between 1 and 80),
  collection  text not null default 'Saved' check (char_length(collection) between 1 and 40),
  status      text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  snapshot    jsonb not null check (jsonb_typeof(snapshot) = 'object' and pg_column_size(snapshot) < 4096),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, resource_id)
);

-- ---------------------------------------------------------------- collections
create table if not exists public.collections (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now(),
  primary key (user_id, name)
);

-- ---------------------------------------------------------------- reviews
create table if not exists public.reviews (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  resource_id text not null check (char_length(resource_id) between 1 and 80 and resource_id ~ '^[A-Za-z0-9:._-]+$'),
  rating      smallint not null check (rating between 1 and 5),
  comment     text check (comment is null or char_length(comment) <= 500),
  hidden      boolean not null default false,  -- moderators set this from the dashboard; learners cannot
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, resource_id)
);

-- ---------------------------------------------------------------- housekeeping triggers
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists saved_items_touch on public.saved_items;
create trigger saved_items_touch before update on public.saved_items
  for each row execute function public.touch_updated_at();

drop trigger if exists reviews_touch on public.reviews;
create trigger reviews_touch before update on public.reviews
  for each row execute function public.touch_updated_at();

-- Cap how much one account can store (stops abuse of the free tier).
-- Arguments: 1) the cap, 2) the column that, together with user_id, identifies a row.
-- Updating a row that already exists (an "upsert") never counts against the cap.
create or replace function public.enforce_row_cap() returns trigger
language plpgsql set search_path = '' as $$
declare
  cap      int  := tg_argv[0]::int;
  key_col  text := tg_argv[1];
  n        int;
  existing boolean;
begin
  execute format('select exists (select 1 from %I.%I where user_id = $1 and %I::text = $2)', tg_table_schema, tg_table_name, key_col)
    into existing using new.user_id, to_jsonb(new) ->> key_col;
  if existing then
    return new;
  end if;
  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name)
    into n using new.user_id;
  if n >= cap then
    raise exception 'Limit reached (% rows)', cap using errcode = '54000';
  end if;
  return new;
end $$;

drop trigger if exists saved_items_cap on public.saved_items;
create trigger saved_items_cap before insert on public.saved_items
  for each row execute function public.enforce_row_cap(2000, 'resource_id');

drop trigger if exists collections_cap on public.collections;
create trigger collections_cap before insert on public.collections
  for each row execute function public.enforce_row_cap(30, 'name');

drop trigger if exists reviews_cap on public.reviews;
create trigger reviews_cap before insert on public.reviews
  for each row execute function public.enforce_row_cap(500, 'resource_id');

-- ---------------------------------------------------------------- Row Level Security
alter table public.saved_items enable row level security;
alter table public.collections enable row level security;
alter table public.reviews     enable row level security;

-- Start from zero access, then grant only what the app needs.
revoke all on public.saved_items, public.collections, public.reviews from anon, authenticated;

grant select, insert, update, delete on public.saved_items to authenticated;
grant select, insert, delete         on public.collections to authenticated;  -- no update: a list is just a name
-- Learners may only write these review columns (they can never set "hidden").
grant select on public.reviews to authenticated;
grant insert (user_id, resource_id, rating, comment) on public.reviews to authenticated;
-- user_id/resource_id are listed because an upsert rewrites them; Row Level Security still forces user_id = auth.uid().
grant update (user_id, resource_id, rating, comment) on public.reviews to authenticated;
grant delete on public.reviews to authenticated;

drop policy if exists "saved_items: own rows" on public.saved_items;
create policy "saved_items: own rows" on public.saved_items
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "collections: own rows" on public.collections;
create policy "collections: own rows" on public.collections
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "reviews: own rows" on public.reviews;
create policy "reviews: own rows" on public.reviews
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- public, anonymous-safe views
-- These views run with the owner's rights on purpose, so everyone can see totals without ever seeing user ids.
create or replace view public.resource_ratings with (security_invoker = false) as
  select resource_id,
         round(avg(rating)::numeric, 2) as avg_rating,
         count(*)::int                  as rating_count
  from public.reviews
  where not hidden
  group by resource_id;

create or replace view public.resource_reviews with (security_invoker = false) as
  select resource_id, rating, comment, created_at
  from public.reviews
  where not hidden and comment is not null and char_length(comment) > 0;

revoke all on public.resource_ratings, public.resource_reviews from anon, authenticated;
grant select on public.resource_ratings, public.resource_reviews to anon, authenticated;
