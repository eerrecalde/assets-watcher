create policy "Users can view their own profile"
on public.users
for select
to authenticated
using ((select auth.uid()) = id);

create policy "Users can create their own profile"
on public.users
for insert
to authenticated
with check ((select auth.uid()) = id);

create policy "Users can update their own profile"
on public.users
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "Users can view their own portfolios"
on public.portfolios
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own portfolios"
on public.portfolios
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own portfolios"
on public.portfolios
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own portfolios"
on public.portfolios
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can view cash for their own portfolios"
on public.portfolio_cash
for select
to authenticated
using (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = portfolio_cash.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);

create policy "Users can create cash for their own portfolios"
on public.portfolio_cash
for insert
to authenticated
with check (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = portfolio_cash.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);

create policy "Users can update cash for their own portfolios"
on public.portfolio_cash
for update
to authenticated
using (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = portfolio_cash.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = portfolio_cash.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);

create policy "Users can delete cash for their own portfolios"
on public.portfolio_cash
for delete
to authenticated
using (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = portfolio_cash.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);

create policy "Market stocks are readable"
on public.stocks
for select
to anon, authenticated
using (true);

create policy "Users can view transactions for their own portfolios"
on public.transactions
for select
to authenticated
using (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = transactions.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);

create policy "Users can create transactions for their own portfolios"
on public.transactions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = transactions.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);

create policy "Users can update transactions for their own portfolios"
on public.transactions
for update
to authenticated
using (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = transactions.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = transactions.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);

create policy "Users can delete transactions for their own portfolios"
on public.transactions
for delete
to authenticated
using (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = transactions.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);

create policy "Users can view holdings for their own portfolios"
on public.holdings
for select
to authenticated
using (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = holdings.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);

create policy "Users can create holdings for their own portfolios"
on public.holdings
for insert
to authenticated
with check (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = holdings.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);

create policy "Users can update holdings for their own portfolios"
on public.holdings
for update
to authenticated
using (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = holdings.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = holdings.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);

create policy "Users can delete holdings for their own portfolios"
on public.holdings
for delete
to authenticated
using (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = holdings.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);

create policy "Users can view their own watchlist items"
on public.watchlist_items
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own watchlist items"
on public.watchlist_items
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own watchlist items"
on public.watchlist_items
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own watchlist items"
on public.watchlist_items
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Market stock prices are readable"
on public.stock_prices
for select
to anon, authenticated
using (true);

create policy "Market stock fundamentals are readable"
on public.stock_fundamentals
for select
to anon, authenticated
using (true);

create policy "Market stock scores are readable"
on public.stock_scores
for select
to anon, authenticated
using (true);

create policy "Users can view portfolio scores for their own portfolios"
on public.portfolio_stock_scores
for select
to authenticated
using (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = portfolio_stock_scores.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);

create policy "Users can view their own rules"
on public.user_rules
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own rules"
on public.user_rules
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own rules"
on public.user_rules
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own rules"
on public.user_rules
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can view their own AI takes"
on public.ai_takes
for select
to authenticated
using ((select auth.uid()) = user_id);
