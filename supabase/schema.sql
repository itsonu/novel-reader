-- Novel reader schema. Run in the Supabase SQL editor.
-- Design: chapters are rows of markdown. Public novels are readable by anyone
-- (RLS below), private ones only by the owner. No storage bucket needed for text.

create extension if not exists "uuid-ossp";

create table novels (
  id          uuid primary key default uuid_generate_v4(),
  owner       uuid not null references auth.users(id) on delete cascade,
  slug        text not null unique,
  title       text not null,
  author      text,
  blurb       text,
  cover_url   text,
  tags        text[] default '{}',
  language    text default 'en',
  is_public   boolean not null default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table chapters (
  id          uuid primary key default uuid_generate_v4(),
  novel_id    uuid not null references novels(id) on delete cascade,
  slug        text not null,
  title       text not null,
  ordinal     numeric not null,
  body        text not null,          -- markdown
  excerpt     text,                   -- first ~180 chars, plain text, for SEO
  word_count  int default 0,
  published_at timestamptz,           -- null = draft, hidden even on a public novel
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (novel_id, slug)
);

create index chapters_novel_ordinal on chapters (novel_id, ordinal);
create index novels_public on novels (is_public) where is_public;

-- reading position, one row per user per novel
create table progress (
  user_id    uuid not null references auth.users(id) on delete cascade,
  novel_id   uuid not null references novels(id) on delete cascade,
  chapter_id uuid references chapters(id) on delete set null,
  scroll     real default 0,
  updated_at timestamptz default now(),
  primary key (user_id, novel_id)
);

alter table novels   enable row level security;
alter table chapters enable row level security;
alter table progress enable row level security;

-- novels: world-readable when public; owner does everything
create policy novels_read_public on novels for select
  using (is_public or owner = auth.uid());
create policy novels_write_own on novels for all
  using (owner = auth.uid()) with check (owner = auth.uid());

-- chapters: readable if the parent novel is public AND the chapter is published
create policy chapters_read_public on chapters for select
  using (
    exists (
      select 1 from novels n
      where n.id = chapters.novel_id
        and (n.owner = auth.uid() or (n.is_public and chapters.published_at is not null))
    )
  );
create policy chapters_write_own on chapters for all
  using (exists (select 1 from novels n where n.id = novel_id and n.owner = auth.uid()))
  with check (exists (select 1 from novels n where n.id = novel_id and n.owner = auth.uid()));

create policy progress_own on progress for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- keep updated_at honest
create or replace function touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger novels_touch   before update on novels   for each row execute function touch();
create trigger chapters_touch before update on chapters for each row execute function touch();
