"use client";

import { useCallback, useEffect, useRef } from "react";

import { useActiveOrg } from "@/hooks/auth/AuthProvider";
import { useRealtimeChannel } from "@/hooks/realtime/useRealtimeChannel";
import { avisoDaCentral, resumirAvisos, type AvisoDaCentral } from "@/lib/notifications/central";
import { entregarAviso } from "@/lib/notifications/deliver";

const JANELA_MS = 1_500;

/** Aviso novo na Central → toast e notificação do sistema (aparece com o navegador em segundo plano). */
export function useCentralAlerts(): void {
  const orgId = useActiveOrg()?.orgId ?? null;
  const fila = useRef<AvisoDaCentral[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const descarregar = useCallback(() => {
    timer.current = null;
    const resumo = resumirAvisos(fila.current);
    fila.current = [];
    if (!resumo) return;
    entregarAviso({
      category: "central",
      kind: "central",
      title: resumo.title,
      body: resumo.body,
      tag: resumo.tag,
      href: "/app/ai/inbox",
    });
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onInsert = useCallback(
    (payload: unknown) => {
      const p = payload as { new?: unknown; payload?: { new?: unknown } } | null;
      const raw = p?.new ?? p?.payload?.new;
      const aviso = avisoDaCentral(raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null);
      if (!aviso) return;
      fila.current.push(aviso);
      if (!timer.current) timer.current = setTimeout(descarregar, JANELA_MS);
    },
    [descarregar],
  );

  useRealtimeChannel({
    name: orgId ? `alerts-central-${orgId}` : "alerts-central-disabled",
    postgresChanges: orgId
      ? {
          event: "INSERT",
          schema: "public",
          table: "agent_inbox_items",
          filter: `organization_id=eq.${orgId}`,
        }
      : undefined,
    onChange: onInsert,
    enabled: !!orgId,
  });
}
