# Lineup Studio Supabase Setup

## 1. Create the Supabase project

1. Create a new project at `supabase.com`.
2. Open `Project Settings > API`.
3. Copy the project URL and anon/publishable key.
4. Create `.env` in this app from `.env.example`:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

Do not put the service role key in this frontend app.

## 2. Create database and storage structure

Open `SQL Editor` in Supabase and run:

```sql
-- Paste the contents of:
-- supabase/migrations/202605110001_create_projects_admin.sql
```

If you already ran the first migration before the bucket/category changes, also run:

```sql
-- Paste the contents of:
-- supabase/migrations/202605110002_update_media_bucket_and_categories.sql
```

This creates:

- `public.projects` for project metadata.
- `media` public storage bucket for generated WebP variants.
- RLS policies allowing public reads and authenticated admin writes.

## 3. Create the admin login

Open `Authentication > Users` and create the admin user with email and password.

The admin UI labels the first login field as username/email, but Supabase password auth expects an email unless you later add a custom username system.

## 4. Image output structure

Admins can upload `.webp` source images only. For each uploaded photo the app creates five exact-size WebP files:

- `blurred` at `20x15`
- `desktop` at `1600x1200`
- `tablet` at `960x720`
- `mobile` at `480x360`
- `mobile-small` at `220x165`

Storage paths follow:

```text
media/project/proj7/blurred/1.webp
media/project/proj7/desktop/1.webp
media/project/proj7/mobile/1.webp
media/project/proj7/mobile-small/1.webp
media/project/proj7/tablet/1.webp
```

The main photo is always `1.webp` inside every size folder. Gallery images continue in order as `2.webp`, `3.webp`, and so on inside the same five size folders.
Before uploading, the app lists existing `project/projN` folders and creates the next one, so if `proj1` through `proj6` already exist, the next upload uses `project/proj7`.

Project metadata stores the public URLs and dimensions in `main_image` and `gallery_images`.
