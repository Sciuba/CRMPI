import type { EventHandler } from "@/lib/event-log/dispatcher";
import {
  IMPORTAR_HISTORICO_CONSUMER_KEY,
  importarHistoricoDaSessao,
} from "@/workers/importar-historico-worker";

export const importarHistoricoHandler: EventHandler = {
  key: IMPORTAR_HISTORICO_CONSUMER_KEY,
  events: ["whatsapp.history_import_requested"],
  handle: importarHistoricoDaSessao,
};
