import { getSupabaseSessionSafe, supabase } from '@/lib/supabase';

const RAW_BUCKET = 'property-uploads-raw';
const FINAL_BUCKET = 'property-uploads';

type ProcessParams = {
  propertyId: string;
  ownerUserId: string;
  rawPath: string;
  kind: 'photo' | 'video';
  blob: Blob;
};

function isEdgeUnreachableError(error: unknown): boolean {
  const msg = String((error as any)?.message ?? error ?? '').toLowerCase();
  return (
    msg.includes('failed to send a request to the edge function') ||
    msg.includes('failed to fetch') ||
    msg.includes('network request failed') ||
    msg.includes('functionsfetcherror') ||
    msg.includes('function not found') ||
    msg.includes('404')
  );
}

async function processViaEdgeFunction(params: ProcessParams): Promise<{ upload: unknown } | null> {
  const { propertyId, rawPath, kind } = params;

  const { data: sessionData } = await getSupabaseSessionSafe();
  const token = sessionData.session?.access_token ?? '';

  const { data, error } = await supabase.functions.invoke('process-property-upload', {
    body: { property_id: propertyId, raw_path: rawPath, kind },
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (error) {
    if (isEdgeUnreachableError(error)) return null;
    throw new Error(error.message);
  }

  const payload = data as { error?: string; upload?: unknown } | null;
  if (payload?.error) throw new Error(String(payload.error));
  if (!payload?.upload) throw new Error('Upload processing failed.');

  return { upload: payload.upload };
}

/** Direct upload when Edge Function is unavailable (not deployed / network). */
async function processViaClientFallback(params: ProcessParams): Promise<{ upload: unknown }> {
  const { propertyId, ownerUserId, rawPath, kind, blob } = params;

  const ext = kind === 'video' ? 'mp4' : 'jpg';
  const contentType = kind === 'video' ? 'video/mp4' : 'image/jpeg';
  const finalPath = `properties/${propertyId}/${kind === 'video' ? 'video' : 'photo'}-${Date.now()}_${Math.random()
    .toString(16)
    .slice(2)}.${ext}`;

  const { error: finalUploadError } = await supabase.storage
    .from(FINAL_BUCKET)
    .upload(finalPath, blob, { contentType, upsert: true });

  if (finalUploadError) throw new Error(finalUploadError.message);

  const { data: urlData } = supabase.storage.from(FINAL_BUCKET).getPublicUrl(finalPath);
  const fileUrl = String(urlData?.publicUrl ?? '').trim();
  if (!fileUrl) throw new Error('Failed to get public URL for upload.');

  const { data: row, error: insertError } = await supabase
    .from('property_uploads')
    .insert({
      property_id: propertyId,
      owner_user_id: ownerUserId,
      file_url: fileUrl,
      file_type: contentType,
      file_name: finalPath.split('/').pop(),
      file_size: blob.size,
      uploaded_at: new Date().toISOString(),
    })
    .select()
    .maybeSingle();

  if (insertError) throw new Error(insertError.message);
  if (!row) throw new Error('Failed to save upload record.');

  void supabase.storage.from(RAW_BUCKET).remove([rawPath]);

  return { upload: row };
}

export async function processPropertyMediaUpload(params: ProcessParams): Promise<{ upload: unknown }> {
  try {
    const edge = await processViaEdgeFunction(params);
    if (edge) return edge;
  } catch (e) {
    if (!isEdgeUnreachableError(e)) throw e;
  }

  return processViaClientFallback(params);
}
