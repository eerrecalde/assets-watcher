create table public.alert_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  allocation_enabled boolean not null default true,
  target_price_enabled boolean not null default true,
  score_change_enabled boolean not null default true,
  watchlist_opportunity_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alert_preferences_user_key unique (user_id)
);

create trigger set_alert_preferences_updated_at
  before update on public.alert_preferences
  for each row execute function public.set_updated_at();

create index alert_preferences_user_id_idx
  on public.alert_preferences (user_id);

alter table public.alert_preferences enable row level security;

create policy "Users can view their own alert preferences"
on public.alert_preferences
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own alert preferences"
on public.alert_preferences
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own alert preferences"
on public.alert_preferences
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own alert preferences"
on public.alert_preferences
for delete
to authenticated
using ((select auth.uid()) = user_id);

insert into public.alert_preferences (user_id)
select users.id
from public.users
on conflict (user_id) do nothing;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  default_portfolio_id uuid;
  user_email text;
begin
  user_email := coalesce(nullif(new.email, ''), new.id::text);

  insert into public.users (id, email)
  values (new.id, user_email)
  on conflict (id) do update
  set email = excluded.email;

  select portfolios.id
  into default_portfolio_id
  from public.portfolios
  where portfolios.user_id = new.id
  order by portfolios.created_at asc
  limit 1;

  if default_portfolio_id is null then
    insert into public.portfolios (user_id, name, base_currency)
    values (new.id, 'Default Portfolio', 'USD')
    returning id into default_portfolio_id;
  end if;

  insert into public.portfolio_cash (portfolio_id, amount, currency)
  values (default_portfolio_id, 0, 'USD')
  on conflict (portfolio_id, currency) do nothing;

  insert into public.user_rules (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.alert_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_auth_user()
from public, anon, authenticated;
