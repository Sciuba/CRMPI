"use client";
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRealtimeChannel } from "@/hooks/realtime/useRealtimeChannel";

/**
 * Subscribes to postgres_changes on `messages` (INSERT) without org_id filter —
 * platform admin sees all tenants in real-time.
 *
 * NOTE: postgres_changes requires Supabase Realtime to be enabled and the
 * `messages` table added to the `supabase_realtime` publication.
 * If Realtime is not enabled for this table, events will be silently dropped;
 * the list will still refresh on focus (staleTime = 10s).
 */
export function useAdminInboxRealtime() {
  const qc = useQueryClient();

  // Histórico importado no pareamento não é movimento novo: ignorá-lo evita uma
  // recarga da lista por mensagem importada.
  const onChange = useCallback((payload: unknown) => {
    const nova = (payload as { new?: { is_historical?: unknown } } | null)?.new;
    if (nova?.is_historical === true) return;
    void qc.invalidateQueries({ queryKey: ["admin", "inbox"] });
  }, [qc]);

  return useRealtimeChannel({
    name: "admin-inbox-realtime",
    postgresChanges: {
      event: "INSERT",
      schema: "public",
      table: "messages",
      // No filter — cross-tenant intentional for platform admin
    },
    onChange,
    enabled: true,
  });
}
