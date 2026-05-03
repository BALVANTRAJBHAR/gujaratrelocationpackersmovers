-- Allow users to manage their own documents (provider self-verification flow)

-- Ensure a stable conflict target for upserts
create unique index if not exists uq_user_documents_user_id_document_type
on public.user_documents(user_id, document_type);

alter table public.user_documents enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_documents' AND policyname = 'Users can manage own documents'
  ) THEN
    CREATE POLICY "Users can manage own documents"
    ON public.user_documents FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
