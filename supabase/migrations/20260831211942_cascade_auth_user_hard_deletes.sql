-- Make hard-deleting a Supabase Auth user fully destructive for test-account
-- cleanup. Normal member removal should continue to use profiles.status =
-- 'suspended', which removes role access while preserving chapter history.
-- Cascades from created_by/approved_by columns can remove shared records, so
-- this migration should not be treated as a normal production offboarding path.

alter table public.audit_log
  drop constraint if exists audit_log_actor_id_fkey;

alter table public.audit_log
  add constraint audit_log_actor_id_fkey
  foreign key (actor_id)
  references auth.users(id)
  on delete cascade;

alter table public.audit_log
  drop constraint if exists audit_log_target_user_id_fkey;

alter table public.audit_log
  add constraint audit_log_target_user_id_fkey
  foreign key (target_user_id)
  references auth.users(id)
  on delete cascade;

alter table public.budget_cycles
  drop constraint if exists budget_cycles_created_by_fkey;

alter table public.budget_cycles
  add constraint budget_cycles_created_by_fkey
  foreign key (created_by)
  references auth.users(id)
  on delete cascade;

alter table public.profiles
  drop constraint if exists profiles_user_id_fkey;

alter table public.profiles
  add constraint profiles_user_id_fkey
  foreign key (user_id)
  references auth.users(id)
  on delete cascade;

alter table public.user_roles
  drop constraint if exists user_roles_user_id_fkey;

alter table public.user_roles
  add constraint user_roles_user_id_fkey
  foreign key (user_id)
  references public.profiles(user_id)
  on delete cascade;

alter table public.announcement_likes
  drop constraint if exists announcement_likes_user_id_fkey;

alter table public.announcement_likes
  add constraint announcement_likes_user_id_fkey
  foreign key (user_id)
  references public.profiles(user_id)
  on delete cascade;

alter table public.announcement_likes
  drop constraint if exists announcement_likes_announcement_id_fkey;

alter table public.announcement_likes
  add constraint announcement_likes_announcement_id_fkey
  foreign key (announcement_id)
  references public.announcements(id)
  on delete cascade;

alter table public.announcements
  drop constraint if exists announcements_author_id_fkey;

alter table public.announcements
  add constraint announcements_author_id_fkey
  foreign key (author_id)
  references public.profiles(user_id)
  on update cascade
  on delete cascade;

alter table public.announcement_replies
  drop constraint if exists announcement_replies_author_id_fkey;

alter table public.announcement_replies
  add constraint announcement_replies_author_id_fkey
  foreign key (author_id)
  references public.profiles(user_id)
  on delete cascade;

alter table public.announcement_replies
  drop constraint if exists announcement_replies_announcement_id_fkey;

alter table public.announcement_replies
  add constraint announcement_replies_announcement_id_fkey
  foreign key (announcement_id)
  references public.announcements(id)
  on delete cascade;

alter table public.events
  drop constraint if exists events_created_by_fkey;

alter table public.events
  add constraint events_created_by_fkey
  foreign key (created_by)
  references public.profiles(user_id)
  on update cascade
  on delete cascade;

alter table public.transactions
  drop constraint if exists transactions_created_by_fkey;

alter table public.transactions
  add constraint transactions_created_by_fkey
  foreign key (created_by)
  references public.profiles(user_id)
  on update cascade
  on delete cascade;

alter table public.budget_accounts
  drop constraint if exists budget_accounts_created_by_fkey;

alter table public.budget_accounts
  add constraint budget_accounts_created_by_fkey
  foreign key (created_by)
  references public.profiles(user_id)
  on delete cascade;

alter table public.budget_accounts
  drop constraint if exists budget_accounts_cycle_id_fkey;

alter table public.budget_accounts
  add constraint budget_accounts_cycle_id_fkey
  foreign key (cycle_id)
  references public.budget_cycles(id)
  on delete cascade;

alter table public.budget_transactions
  drop constraint if exists budget_transactions_submitted_by_fkey;

alter table public.budget_transactions
  add constraint budget_transactions_submitted_by_fkey
  foreign key (submitted_by)
  references public.profiles(user_id)
  on delete cascade;

alter table public.budget_transactions
  drop constraint if exists budget_transactions_approved_by_fkey;

alter table public.budget_transactions
  add constraint budget_transactions_approved_by_fkey
  foreign key (approved_by)
  references public.profiles(user_id)
  on delete cascade;

alter table public.budget_transactions
  drop constraint if exists budget_transactions_budget_account_id_fkey;

alter table public.budget_transactions
  add constraint budget_transactions_budget_account_id_fkey
  foreign key (budget_account_id)
  references public.budget_accounts(id)
  on delete cascade;

alter table public.emergency_contacts
  drop constraint if exists emergency_contacts_user_id_fkey;

alter table public.emergency_contacts
  add constraint emergency_contacts_user_id_fkey
  foreign key (user_id)
  references public.profiles(user_id)
  on delete cascade;

alter table public.wait_on_schedules
  drop constraint if exists wait_on_schedules_created_by_fkey;

alter table public.wait_on_schedules
  add constraint wait_on_schedules_created_by_fkey
  foreign key (created_by)
  references public.profiles(user_id)
  on delete cascade;

alter table public.wait_on_assignments
  drop constraint if exists wait_on_assignments_schedule_id_fkey;

alter table public.wait_on_assignments
  add constraint wait_on_assignments_schedule_id_fkey
  foreign key (schedule_id)
  references public.wait_on_schedules(id)
  on delete cascade;

alter table public.wait_on_assignments
  drop constraint if exists wait_on_assignments_brother_id_fkey;

alter table public.wait_on_assignments
  add constraint wait_on_assignments_brother_id_fkey
  foreign key (brother_id)
  references public.profiles(user_id)
  on delete cascade;

notify pgrst, 'reload schema';
