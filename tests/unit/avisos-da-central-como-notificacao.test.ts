import { describe, expect, it } from "vitest";

import { avisoDaCentral, resumirAvisos } from "@/lib/notifications/central";
import { NOTIFY_KINDS } from "@/lib/notifications/kinds";
import { NOTIFY_UI_CATEGORIES, prefsPadrao } from "@/lib/notifications/prefs";

describe("avisos da Central como notificação do sistema", () => {
  it("lê a linha do realtime e ignora o que não está aberto ou não tem título", () => {
    expect(avisoDaCentral({ id: "a1", title: "Número novo", body: " corpo ", status: "open" })).toEqual({
      id: "a1",
      title: "Número novo",
      body: "corpo",
    });
    expect(avisoDaCentral({ id: "a1", title: "x", status: "resolved" })).toBeNull();
    expect(avisoDaCentral({ id: "a1", title: "  " })).toBeNull();
    expect(avisoDaCentral(null)).toBeNull();
  });

  it("um aviso vira uma notificação com o próprio título", () => {
    expect(resumirAvisos([{ id: "a1", title: "T", body: "B" }])).toEqual({ title: "T", body: "B", tag: "a1" });
    expect(resumirAvisos([])).toBeNull();
  });

  it("uma rajada vira UMA notificação resumida", () => {
    const lote = Array.from({ length: 40 }, (_, i) => ({ id: `i${i}`, title: `Aviso ${i}`, body: "" }));
    const r = resumirAvisos(lote);
    expect(r?.title).toBe("40 novos avisos na Central");
    expect(r?.tag).toBe("central-lote");
    expect(r?.body).toBe("Aviso 0 · Aviso 1 · Aviso 2");
  });

  it("a categoria existe nas preferências, ligada por padrão, e tem som próprio", () => {
    expect(NOTIFY_UI_CATEGORIES).toContain("central");
    expect(prefsPadrao().central).toEqual({ in_app: true, push: true });
    expect(NOTIFY_KINDS.central.tagPrefix).toBe("central");
  });
});
