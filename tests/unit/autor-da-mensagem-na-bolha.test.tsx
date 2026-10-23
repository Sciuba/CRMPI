import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MessageBubble } from "@/components/inbox/MessageBubble";
import type { Message } from "@/lib/types/messaging";

/** Prova o que aparece NA TELA: a bolha de uma pessoa diz o nome quando recebe `autor`. */
function msg(over: Partial<Message> = {}): Message {
  return {
    id: "m1",
    organization_id: "o1",
    conversation_id: "c1",
    channel_session_id: "s1",
    contact_id: "ct1",
    external_id: null,
    type: "text",
    direction: "outbound",
    status: "sent",
    ack: null,
    error_code: null,
    error_message: null,
    body: "Bom dia, seguimos com o registro da marca.",
    media_url: null,
    media_mime: null,
    media_size_bytes: null,
    media_storage_path: null,
    sent_via: "user",
    sent_by_user_id: "u1",
    sent_by_user_name: "Marina Alves",
    sent_at: "2026-10-23T12:00:00.000Z",
    delivered_at: null,
    read_at: null,
    metadata: {},
    edited_at: null,
    revoked_at: null,
    reply_to_message_id: null,
    created_at: "2026-10-23T12:00:00.000Z",
    ...over,
  } as Message;
}

describe("nome de quem escreveu, na bolha", () => {
  it("mostra o nome acima do texto quando recebe `autor`", () => {
    render(<MessageBubble message={msg()} autor="Marina Alves" />);
    expect(screen.getByTestId("autor-da-mensagem").textContent).toBe("Marina Alves");
    expect(screen.getByText(/seguimos com o registro/)).toBeTruthy();
  });

  it("sem `autor` não desenha rótulo nenhum", () => {
    render(<MessageBubble message={msg()} />);
    expect(screen.queryByTestId("autor-da-mensagem")).toBeNull();
  });

  it("a mensagem da IA segue com o rótulo \"IA\" e sem nome de pessoa", () => {
    render(<MessageBubble message={msg({ sent_via: "ai", sent_by_user_id: null, sent_by_user_name: null })} />);
    expect(screen.getByText("IA")).toBeTruthy();
    expect(screen.queryByTestId("autor-da-mensagem")).toBeNull();
  });
});

describe("mídia que veio do histórico do aparelho", () => {
  it("avisa que o anexo não foi importado, em vez de deixar uma bolha em branco", () => {
    render(
      <MessageBubble
        message={msg({
          type: "audio", direction: "inbound", body: null, sent_by_user_id: null, sent_by_user_name: null,
          metadata: { historico: true, midia_nao_importada: true },
        })}
      />,
    );
    expect(screen.getByTestId("midia-do-historico").textContent).toMatch(/não importada/);
  });

  it("mensagem de texto comum não ganha o aviso", () => {
    render(<MessageBubble message={msg({ metadata: { historico: true, midia_nao_importada: false } })} />);
    expect(screen.queryByTestId("midia-do-historico")).toBeNull();
  });
});
