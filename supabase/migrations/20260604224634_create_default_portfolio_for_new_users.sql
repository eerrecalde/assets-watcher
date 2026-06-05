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

  return new;
end;
$$;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

do $$
declare
  auth_user record;
  default_portfolio_id uuid;
  user_email text;
begin
  for auth_user in
    select id, email
    from auth.users
  loop
    user_email := coalesce(nullif(auth_user.email, ''), auth_user.id::text);
    default_portfolio_id := null;

    insert into public.users (id, email)
    values (auth_user.id, user_email)
    on conflict (id) do update
    set email = excluded.email;

    select portfolios.id
    into default_portfolio_id
    from public.portfolios
    where portfolios.user_id = auth_user.id
    order by portfolios.created_at asc
    limit 1;

    if default_portfolio_id is null then
      insert into public.portfolios (user_id, name, base_currency)
      values (auth_user.id, 'Default Portfolio', 'USD')
      returning id into default_portfolio_id;
    end if;

    insert into public.portfolio_cash (portfolio_id, amount, currency)
    values (default_portfolio_id, 0, 'USD')
    on conflict (portfolio_id, currency) do nothing;

    insert into public.user_rules (user_id)
    values (auth_user.id)
    on conflict (user_id) do nothing;
  end loop;
end;
$$;
