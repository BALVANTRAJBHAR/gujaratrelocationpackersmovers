-- Prevent duplicate Aadhaar numbers across different users

-- Remove duplicate document_number rows before adding unique constraint
-- Keep only the earliest row for each duplicate document_number
delete from public.user_documents
where id in (
  select id from (
    select id, row_number() over (partition by document_number order by created_at asc) as rn
    from public.user_documents
    where document_number is not null
  ) dup
  where dup.rn > 1
);

-- Add a unique constraint on document_number for aadhaar documents
-- This prevents the same Aadhaar from being registered by multiple accounts
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_documents'::regclass
    and conname = 'user_documents_document_number_key'
  ) then
    alter table public.user_documents
      add constraint user_documents_document_number_key
      unique (document_number);
  end if;
end $$;
