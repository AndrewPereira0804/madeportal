-- Reference data only. Fictional Auth users and example records are added only
-- by the guarded local test-environment script, never by hosted migrations.
INSERT INTO public.roles (slug, name) VALUES
  ('admin', 'Admin'), ('alum', 'Alumni'), ('brother', 'Brother'),
  ('neophyte', 'Neophyte'), ('ea', 'Eminent Archon'),
  ('eda', 'Eminent Deputy Archon'), ('rec', 'Recorder'),
  ('treasurer', 'Treasurer'), ('stew', 'Steward'),
  ('social-chair', 'Social Chairman'), ('social-events', 'Social Events Chairman'),
  ('hsm', 'Health & Safety Manager'), ('hm', 'House Manager'),
  ('membered', 'Member Educator'), ('cs-chair', 'Community Service Chairman'),
  ('philo-chair', 'Philanthropy Chairman'), ('alumni-chair', 'Alumni Chairman'),
  ('rush-chair', 'Rush Chairman'), ('pr', 'PR Chairman'),
  ('scholarship', 'Scholarship Chairman'),
  ('prof-dev', 'Professional Development Chairman'),
  ('chapter-dev', 'Chapter Development'), ('dei-chair', 'DEI Chairman'),
  ('preceptor', 'Preceptor')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.majors (id, major, slug) VALUES
  (1, 'Computer Science', 'computer-science'),
  (2, 'Engineering', 'engineering'), (3, 'Business', 'business'),
  (4, 'Biology', 'biology'), (5, 'Undeclared', 'undeclared')
ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('public.majors', 'id'),
  greatest((SELECT coalesce(max(id), 1) FROM public.majors), 1));

-- seed-fixtures.mjs reserves calendar ID 1. Keep default inserts above it.
SELECT setval(pg_get_serial_sequence('public.calendars', 'id'),
  greatest((SELECT coalesce(max(id), 1) FROM public.calendars), 1));
