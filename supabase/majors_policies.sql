-- Allows authenticated app users to populate profile major dropdowns.
-- Verify hosted policy state before applying because hosted Supabase is canonical.

alter table public.majors enable row level security;

drop policy if exists "Authenticated users can read majors" on public.majors;

create policy "Authenticated users can read majors"
on public.majors
for select
to authenticated
using (true);
