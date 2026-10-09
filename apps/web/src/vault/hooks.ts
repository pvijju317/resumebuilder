import type {
  GapQuestionDto,
  Me,
  UploadUrlResponse,
  VaultDto,
  VaultImportDto,
} from '@tailor/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api.js';

export const vaultKeys = {
  vault: ['vault'] as const,
  latestImport: ['vault', 'import', 'latest'] as const,
  gaps: ['vault', 'gaps'] as const,
};

export function useVault() {
  return useQuery({
    queryKey: vaultKeys.vault,
    queryFn: async () => {
      try {
        return await api<VaultDto>('/vault');
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
}

/** Polls while the import is being parsed. */
export function useLatestImport() {
  return useQuery({
    queryKey: vaultKeys.latestImport,
    queryFn: () => api<VaultImportDto | null>('/vault/imports/latest'),
    refetchInterval: (q) =>
      q.state.data && ['queued', 'parsing'].includes(q.state.data.status) ? 2000 : false,
  });
}

export function useGapQuestions(enabled: boolean) {
  return useQuery({
    queryKey: vaultKeys.gaps,
    queryFn: () => api<GapQuestionDto[]>('/vault/gap-questions'),
    enabled,
  });
}

/** Any vault mutation returns the full vault; write it straight into the cache. */
export function useVaultMutation<V>(fn: (v: V) => Promise<VaultDto>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (vault) => {
      qc.setQueryData(vaultKeys.vault, vault);
      void qc.invalidateQueries({ queryKey: vaultKeys.gaps });
    },
  });
}

export async function uploadResume(file: File): Promise<string> {
  const mime =
    file.type ||
    (file.name.endsWith('.docx')
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : file.name.endsWith('.txt')
        ? 'text/plain'
        : 'application/pdf');
  const up = await api<UploadUrlResponse>('/files/upload-url', {
    method: 'POST',
    body: { fileName: file.name, mime, size: file.size },
  });
  const res = await fetch(up.url, { method: 'PUT', headers: up.headers, body: file });
  if (!res.ok)
    throw new ApiError(
      'UPLOAD_FAILED',
      'The upload did not go through. Please try again.',
      res.status,
    );
  return up.fileId;
}

export function useConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (modelImprovementOptIn: boolean) =>
      api<Me>('/me', { method: 'PATCH', body: { consent: true, modelImprovementOptIn } }),
    onSuccess: (me) => qc.setQueryData(['me'], me),
  });
}
