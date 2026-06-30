-- Keeps profile rows in sync with Supabase Auth signups.
-- Safe to run without dropping triggers; existing auth.users trigger attachments are preserved.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  profile_name text;
begin
  profile_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'name', '')), '');

  insert into public.profiles (user_id, name, email, status)
  values (new.id, profile_name, new.email, 'pending')
  on conflict (user_id) do update
    set
      name = coalesce(nullif(btrim(public.profiles.name), ''), excluded.name),
      email = excluded.email
    where public.profiles.email is distinct from excluded.email
       or (
         excluded.name is not null
         and nullif(btrim(public.profiles.name), '') is null
       );

  return new;
end;
$function$;

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  profile_name text;
begin
  profile_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'name', '')), '');

  insert into public.profiles (user_id, name, email, status)
  values (new.id, profile_name, new.email, 'pending')
  on conflict (user_id) do update
    set
      name = coalesce(nullif(btrim(public.profiles.name), ''), excluded.name),
      email = excluded.email
    where public.profiles.email is distinct from excluded.email
       or (
         excluded.name is not null
         and nullif(btrim(public.profiles.name), '') is null
       );

  return new;
end;
$function$;

update public.profiles as p
set name = nullif(btrim(coalesce(u.raw_user_meta_data ->> 'name', '')), '')
from auth.users as u
where p.user_id = u.id
  and nullif(btrim(coalesce(p.name, '')), '') is null
  and nullif(btrim(coalesce(u.raw_user_meta_data ->> 'name', '')), '') is not null;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.sync_profile_email() from public, anon, authenticated;
