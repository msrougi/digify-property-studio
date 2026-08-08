import { describe, expect, it } from "vitest";
import { isSupportedWebUrl } from "../WebPageCapturer.js";

describe("isSupportedWebUrl", () => {
  it.each([
    "http://exemplo.com.br",
    "https://exemplo.com.br/imovel/123",
    "https://sub.dominio.com.br/a?b=1#c",
    "  https://com-espaco.com  ",
  ])("aceita %s", (url) => {
    expect(isSupportedWebUrl(url)).toBe(true);
  });

  it.each([
    // `file://` daria à página capturada acesso de leitura ao disco do usuário.
    "file:///etc/passwd",
    "file://C:/Users/fulano/Documents",
    // `javascript:` executaria código no contexto da janela de captura.
    "javascript:alert(1)",
    "data:text/html,<script>fetch('http://x')</script>",
    // Sem esquema não é endereço — é caminho de arquivo ou texto solto.
    "exemplo.com.br",
    "/home/fulano/foto.png",
    "C:\\\\fotos\\\\sala.jpg",
    "",
    "não é url",
  ])("recusa %s", (valor) => {
    expect(isSupportedWebUrl(valor)).toBe(false);
  });
});
