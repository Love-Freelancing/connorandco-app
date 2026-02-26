create extension if not exists pgcrypto;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.users.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.users.avatar_url);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.users (id, email, full_name, avatar_url)
select
  a.id,
  a.email,
  coalesce(a.raw_user_meta_data->>'full_name', a.raw_user_meta_data->>'name') as full_name,
  a.raw_user_meta_data->>'avatar_url' as avatar_url
from auth.users a
left join public.users u on u.id = a.id
where u.id is null
on conflict (id) do nothing;

create table if not exists public.users_on_team (
  user_id uuid not null,
  team_id uuid not null,
  id uuid not null default gen_random_uuid(),
  role "teamRoles",
  created_at timestamp with time zone default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.users_on_team'::regclass
      and conname = 'members_pkey'
  ) then
    alter table public.users_on_team
      add constraint members_pkey primary key (user_id, team_id, id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.users_on_team'::regclass
      and conname = 'users_on_team_team_id_fkey'
  ) then
    alter table public.users_on_team
      add constraint users_on_team_team_id_fkey
      foreign key (team_id) references public.teams(id)
      on update cascade
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.users_on_team'::regclass
      and conname = 'users_on_team_user_id_fkey'
  ) then
    alter table public.users_on_team
      add constraint users_on_team_user_id_fkey
      foreign key (user_id) references public.users(id)
      on delete cascade;
  end if;
end
$$;

create index if not exists users_on_team_team_id_idx
  on public.users_on_team (team_id);

create index if not exists users_on_team_user_id_idx
  on public.users_on_team (user_id);

insert into public.users_on_team (user_id, team_id, id, role)
select
  u.id,
  u.team_id,
  gen_random_uuid(),
  'owner'::"teamRoles"
from public.users u
where u.team_id is not null
  and not exists (
    select 1
    from public.users_on_team uot
    where uot.user_id = u.id
      and uot.team_id = u.team_id
  );