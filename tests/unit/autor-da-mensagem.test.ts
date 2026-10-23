import { describe, expect, it } from "vitest";

import { autorDaMensagem } from "@/components/inbox/autor-da-mensagem";
import type { Message } from "@/lib/types/messaging";

const eu = { id: "u-eu", full_name: "Eu Mesmo" };

function msg(over: Partial<Message>): Message {
  return {
    id: "m",
    organization_id: "o",
    conversation_id: "c",
    channel_session_id: "s",
    contact_id: "ct",
    external_id: null,
    type: "text",
    direction: "outbound",
    status: "sent",
    ack: null,
    error_code: null,
    error_message: null,
    body: "oi",
    media_url: null,
    media_mime: null,
    media_size_bytes: null,
    media_storage_path: null,
    sent_via: "user",
    sent_by_user_id: "u-ana",
    sent_by_user_name: "Ana",
    sent_at: "2026-10-23T10:00:00Z",
    delivered_at: null,
    read_at: null,
    metadata: {},
    edited_at: null,
    revoked_at: null,
    reply_to_message_id: null,
    created_at: "2026-10-23T10:00:00Z",
    ...over,
  } as Message;
}

describe("autorDaMensagem — o nome só aparece quando o autor muda", () => {
  it("primeira mensagem de uma pessoa mostra o nome", () => {
    expect(autorDaMensagem(msg({}), null, eu)).toBe("Ana");
  });

  it("rajada do mesmo autor: só a primeira leva o nome", () => {
    expect(autorDaMensagem(msg({}), msg({}), eu)).toBeNull();
  });

  it("quando o supervisor assume, o nome dele aparece", () => {
    const supervisor = msg({ sent_by_user_id: "u-sup", sent_by_user_name: "Supervisor" });
    expect(autorDaMensagem(supervisor, msg({}), eu)).toBe("Supervisor");
  });

  it("depois de uma mensagem do cliente, o nome volta", () => {
    const cliente = msg({ direction: "inbound", sent_via: "system", sent_by_user_id: null, sent_by_user_name: null });
    expect(autorDaMensagem(msg({}), cliente, eu)).toBe("Ana");
  });

  it("mensagem da IA e do cliente não têm autor de pessoa", () => {
    expect(autorDaMensagem(msg({ sent_via: "ai", sent_by_user_id: null, sent_by_user_name: null }), null, eu)).toBeNull();
    expect(autorDaMensagem(msg({ direction: "inbound" }), null, eu)).toBeNull();
  });

  it("sem nome gravado, não inventa rótulo", () => {
    expect(autorDaMensagem(msg({ sent_by_user_name: null }), null, eu)).toBeNull();
  });

  it("autor que já saiu (id zerado pela FK) mantém o nome gravado", () => {
    expect(autorDaMensagem(msg({ sent_by_user_id: null, sent_by_user_name: "Ex-colega" }), null, eu)).toBe("Ex-colega");
  });

  it("a otimista usa o usuário logado e não repete depois da mensagem dele", () => {
    const otimista = msg({ sent_by_user_id: null, sent_by_user_name: null, metadata: { _optimistic: true } });
    expect(autorDaMensagem(otimista, null, eu)).toBe("Eu Mesmo");
    const minha = msg({ sent_by_user_id: "u-eu", sent_by_user_name: "Eu Mesmo" });
    expect(autorDaMensagem(otimista, minha, eu)).toBeNull();
  });
});
