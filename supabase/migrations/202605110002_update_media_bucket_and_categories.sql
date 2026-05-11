alter table public.projects
drop constraint if exists projects_category_check;

alter table public.projects
add column if not exists categories text[] not null default array[]::text[];

update public.projects
set categories = array[category]
where cardinality(categories) = 0
  and category is not null;

update public.projects
set category = 'commercial'
where category not in ('retail', 'interior', 'residential', 'architecture', 'commercial');

alter table public.projects
add constraint projects_category_check
check (category in ('retail', 'interior', 'residential', 'architecture', 'commercial'));

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
