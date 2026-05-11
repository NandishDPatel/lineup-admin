create extension if not exists "pgcrypto";

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  tagline text not null,
  description text not null,
  category text not null check (category in ('retail', 'interior', 'residential', 'architecture', 'commercial')),
  categories text[] not null default array[]::text[],
  main_image jsonb not null,
  gallery_images jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;

drop policy if exists "Published projects are readable" on public.projects;
create policy "Published projects are readable"
on public.projects
for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated admins can create projects" on public.projects;
create policy "Authenticated admins can create projects"
on public.projects
for insert
to authenticated
with check ((select auth.uid()) = created_by);

drop policy if exists "Authenticated admins can update projects" on public.projects;
create policy "Authenticated admins can update projects"
on public.projects
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated admins can delete projects" on public.projects;
create policy "Authenticated admins can delete projects"
on public.projects
for delete
to authenticated
using (true);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row
execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  10485760,
  array['image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Project media is publicly readable" on storage.objects;
create policy "Project media is publicly readable"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'media');

drop policy if exists "Authenticated admins can upload project media" on storage.objects;
create policy "Authenticated admins can upload project media"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'media');

drop policy if exists "Authenticated admins can update project media" on storage.objects;
create policy "Authenticated admins can update project media"
on storage.objects
for update
to authenticated
using (bucket_id = 'media')
with check (bucket_id = 'media');

drop policy if exists "Authenticated admins can delete project media" on storage.objects;
create policy "Authenticated admins can delete project media"
on storage.objects
for delete
to authenticated
using (bucket_id = 'media');
