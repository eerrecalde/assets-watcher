alter type public.portfolio_fit_label add value if not exists 'Insufficient Data';

grant insert on table public.portfolio_stock_scores to authenticated;

create policy "Users can create portfolio scores for their own portfolios"
on public.portfolio_stock_scores
for insert
to authenticated
with check (
  exists (
    select 1
    from public.portfolios
    where portfolios.id = portfolio_stock_scores.portfolio_id
      and portfolios.user_id = (select auth.uid())
  )
);
