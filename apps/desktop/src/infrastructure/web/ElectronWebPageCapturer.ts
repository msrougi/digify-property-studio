import { execFile } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { BrowserWindow, session } from "electron";
import type {
  CapturedWebPage,
  WebPageCaptureOptions,
  WebPageCapturer,
} from "../../application/WebPageCapturer.js";
import { isSupportedWebUrl } from "../../application/WebPageCapturer.js";
import { FFMPEG_PATH } from "../ffmpeg/paths.js";

const execFileAsync = promisify(execFile);

/** Página que não terminou de carregar nesse tempo é capturada como está. */
const LOAD_TIMEOUT_MS = 20_000;
/** Folga pra fontes, imagens e animação de entrada assentarem depois do `did-finish-load`. */
const SETTLE_MS = 1200;
/**
 * Teto de altura da captura. Uma página com rolagem infinita cresce sem
 * limite, e um `BrowserWindow` de 50.000px consome memória proporcional.
 */
const MAX_CAPTURE_HEIGHT = 12_000;
/**
 * Sobreposição entre fatias vizinhas. Sem ela, um corte cai no meio de uma
 * linha de texto e a frase se perde entre dois slides.
 */
const SLICE_OVERLAP_RATIO = 0.06;

/**
 * Captura uma página web usando o Chromium que já vem no Electron.
 *
 * ## Isolamento
 *
 * A página vem de uma URL digitada pelo usuário, então é conteúdo não
 * confiável rodando dentro do app. Ela é carregada numa janela invisível com
 * `sandbox`, sem integração com Node, sem preload e numa **sessão em memória
 * própria** — nada de cookie, cache ou storage sobrevive à captura, o que
 * também combina com o app ser efêmero por decisão de produto.
 *
 * ## Por que fatiar
 *
 * Um anúncio tem 5.000px de altura. Espremer isso num quadro 16:9 deixa o
 * texto ilegível — o que anula o motivo de colocar o site no vídeo. Então a
 * captura inteira é cortada em fatias na proporção do vídeo, na ordem de
 * leitura, com uma pequena sobreposição pra não partir frase ao meio.
 */
export class ElectronWebPageCapturer implements WebPageCapturer {
  async capture(
    url: string,
    outputDir: string,
    options: WebPageCaptureOptions,
  ): Promise<CapturedWebPage> {
    if (!isSupportedWebUrl(url)) {
      throw new Error(`Endereço inválido: ${url}. Use um link começando com http:// ou https://`);
    }

    // Sessão nova a cada captura: sem cookie herdado, sem vazar sessão de um
    // site pro outro. O nome NÃO leva o prefixo `persist:` de propósito — sem
    // ele o Electron mantém tudo só em memória, então nada é escrito no disco
    // e não há storage a limpar depois.
    const partition = `web-capture-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const captureSession = session.fromPartition(partition, { cache: false });

    const window = new BrowserWindow({
      show: false,
      width: options.viewportWidth,
      height: Math.round(options.viewportWidth / options.sliceAspectRatio),
      webPreferences: {
        session: captureSession,
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        // Sem preload: a API do app não pode estar ao alcance da página.
        javascript: true,
      },
    });

    // Página não abre janela, não navega o app pra lugar nenhum.
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

    try {
      await this.loadWithTimeout(window, url);
      await delay(SETTLE_MS);

      // Ordem importa: o aviso de cookie costuma travar a rolagem, então tem
      // que sair antes de tentar rolar a página.
      await this.dismissConsentBanners(window);
      await this.triggerLazyLoading(window);

      const title = await this.readTitle(window);
      const fullHeight = await this.readHeight(window);
      const captureHeight = Math.min(fullHeight, MAX_CAPTURE_HEIGHT);

      window.setContentSize(options.viewportWidth, captureHeight);
      // O Chromium repinta de forma assíncrona depois do resize; capturar
      // antes disso devolve o quadro antigo, do tamanho antigo.
      await delay(600);

      const image = await window.webContents.capturePage();
      const fullPath = join(outputDir, "site-completo.png");
      writeFileSync(fullPath, image.toPNG());

      const size = image.getSize();
      const imagePaths = await this.slice(fullPath, outputDir, size, options);

      return { imagePaths, title, fullHeight };
    } finally {
      // `destroy` e não `close`: `close` pode ser cancelado pela própria
      // página (`beforeunload`), e aí a janela invisível ficaria pra sempre.
      //
      // E nada de `clearStorageData()` aqui: verificado rodando no Electron
      // real, numa sessão em memória essa promessa **nunca resolve** — nem
      // cumpre, nem rejeita. Num `finally`, isso congelaria toda captura de
      // site. Também é desnecessário: a partição não é persistente, então não
      // existe storage em disco pra limpar.
      window.destroy();
    }
  }

  /**
   * Carrega com prazo. Site com rastreador que nunca termina de carregar não
   * pode travar o app — passado o prazo, vale o que já foi pintado.
   */
  private async loadWithTimeout(window: BrowserWindow, url: string): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        window.loadURL(url),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, LOAD_TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      // `ERR_ABORTED` é comum e inofensivo (redirecionamento, âncora). Se a
      // página realmente não abriu, a captura sai em branco e o usuário vê.
      const message = (error as Error).message;
      if (!message.includes("ERR_ABORTED")) {
        throw new Error(`Não consegui abrir ${url}: ${message}`);
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Fecha aviso de cookie/LGPD antes de fotografar.
   *
   * Praticamente todo site brasileiro abre com essa tarja. Sem fechá-la, o
   * vídeo do corretor mostra "Aceitar cookies" cobrindo o imóvel — e, pior,
   * muitos desses avisos travam a rolagem da página, o que impediria o
   * carregamento das fotos logo abaixo.
   *
   * Duas passadas, da mais segura pra menos: primeiro botões de plataformas
   * de consentimento conhecidas e botões cujo texto de aceite esteja dentro
   * de um container que se identifica como cookie/consentimento; depois, o
   * que sobrou de sobreposição cobrindo a tela é escondido.
   *
   * Clicar é melhor que só esconder porque muitos avisos deixam a página com
   * `overflow: hidden` até alguém responder.
   */
  private async dismissConsentBanners(window: BrowserWindow): Promise<void> {
    const script = `(() => {
      let fechados = 0;

      // 1. Plataformas de consentimento conhecidas — o seletor é exato, então
      //    não há risco de clicar em outra coisa.
      const conhecidos = [
        '#onetrust-accept-btn-handler',
        '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
        '#CybotCookiebotDialogBodyButtonAccept',
        '.osano-cm-accept-all',
        '[data-testid="cookie-policy-manage-dialog-accept-button"]',
        '[aria-label="Aceitar cookies"]',
        '#adopt-accept-all-button',
        '.cc-btn.cc-allow',
      ];
      for (const seletor of conhecidos) {
        const botao = document.querySelector(seletor);
        if (botao) { botao.click(); fechados++; }
      }

      // 2. Botão de aceite DENTRO de algo que se declara cookie/consentimento.
      //    A restrição ao container é o que impede clicar num "Aceitar" de
      //    proposta, contrato ou formulário no meio do anúncio.
      const aceite = /^(aceitar|aceito|aceitar todos|aceitar tudo|concordo|entendi|ok, entendi|permitir todos|prosseguir)$/i;
      const parecerConsentimento = (el) => {
        const marca = ((el.id || '') + ' ' + (el.className || '')).toString().toLowerCase();
        return /cookie|consent|lgpd|privac|gdpr/.test(marca);
      };
      for (const container of document.querySelectorAll('div,section,aside,dialog')) {
        if (!parecerConsentimento(container)) continue;
        for (const botao of container.querySelectorAll('button,a[role="button"],input[type="button"],input[type="submit"]')) {
          const texto = (botao.innerText || botao.value || '').trim();
          if (aceite.test(texto)) { botao.click(); fechados++; break; }
        }
      }

      return fechados;
    })()`;

    try {
      await window.webContents.executeJavaScript(script);
      // O aviso sai com animação; fotografar no meio dela pegaria meio banner.
      await delay(500);
      await this.hideBlockingOverlays(window);
    } catch {
      // Página que proíbe execução de script ainda pode ser fotografada como
      // está — melhor um vídeo com tarja que nenhum vídeo.
    }
  }

  /**
   * Esconde o que sobrou cobrindo a tela e devolve a rolagem à página.
   *
   * Deliberadamente conservador: só encosta em elemento *fixo* que cobre mais
   * de metade da tela e está numa camada alta. Um cabeçalho fino com o preço
   * do imóvel também é fixo — e não pode sumir.
   */
  private async hideBlockingOverlays(window: BrowserWindow): Promise<void> {
    const script = `(() => {
      let escondidos = 0;
      const areaTela = window.innerWidth * window.innerHeight;
      for (const el of document.querySelectorAll('body *')) {
        const estilo = getComputedStyle(el);
        if (estilo.position !== 'fixed' && estilo.position !== 'sticky') continue;
        if (estilo.display === 'none' || estilo.visibility === 'hidden') continue;
        const caixa = el.getBoundingClientRect();
        const cobertura = (caixa.width * caixa.height) / areaTela;
        const camada = parseInt(estilo.zIndex, 10) || 0;
        if (cobertura > 0.5 && camada > 100) { el.style.setProperty('display', 'none', 'important'); escondidos++; }
      }
      // Aviso de cookie costuma travar a rolagem até alguém responder.
      for (const el of [document.body, document.documentElement]) {
        el.style.setProperty('overflow', 'visible', 'important');
        el.style.setProperty('position', 'static', 'important');
      }
      return escondidos;
    })()`;
    try {
      await window.webContents.executeJavaScript(script);
    } catch {
      // idem: sem script, fotografa como está.
    }
  }

  /**
   * Rola a página inteira pra disparar o carregamento preguiçoso das fotos.
   *
   * **Isto não é polimento.** Medido numa reprodução do comportamento real de
   * portal de imóveis: sem rolar, só 3 de 10 fotos tinham carregado. O vídeo
   * sairia com retângulos cinza no lugar das fotos do imóvel — que é
   * exatamente o que se quer mostrar.
   *
   * No fim volta ao topo: a captura precisa começar do começo da página.
   */
  private async triggerLazyLoading(window: BrowserWindow): Promise<void> {
    const script = `(async () => {
      const passo = window.innerHeight;
      let anterior = -1;
      // Recalcula a altura a cada volta: página que carrega ao rolar cresce
      // enquanto se rola.
      for (let y = 0; y < document.body.scrollHeight && y !== anterior; y += passo) {
        anterior = y;
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 150));
      }
      // Folga no rodapé pra as últimas imagens terminarem.
      await new Promise((r) => setTimeout(r, 400));
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 200));
    })()`;
    try {
      await window.webContents.executeJavaScript(script);
    } catch {
      // Sem rolagem a captura ainda sai — só com menos fotos carregadas.
    }
  }

  private async readTitle(window: BrowserWindow): Promise<string> {
    const script = `(() => {
      const og = document.querySelector('meta[property="og:title"]')?.content;
      const h1 = document.querySelector('h1')?.innerText;
      return (og || document.title || h1 || '').replace(/\\s+/g, ' ').trim();
    })()`;
    try {
      return (await window.webContents.executeJavaScript(script)) as string;
    } catch {
      // Título é enfeite: falhar aqui não pode derrubar a captura.
      return "";
    }
  }

  private async readHeight(window: BrowserWindow): Promise<number> {
    const script = `Math.max(
      document.body ? document.body.scrollHeight : 0,
      document.documentElement ? document.documentElement.scrollHeight : 0
    )`;
    try {
      const height = (await window.webContents.executeJavaScript(script)) as number;
      return Number.isFinite(height) && height > 0 ? Math.round(height) : 0;
    } catch {
      return 0;
    }
  }

  /** Corta a captura em fatias na proporção do vídeo, de cima pra baixo. */
  private async slice(
    fullPath: string,
    outputDir: string,
    size: { width: number; height: number },
    options: WebPageCaptureOptions,
  ): Promise<string[]> {
    const sliceHeight = Math.round(size.width / options.sliceAspectRatio);

    // Página curta cabe inteira: nada a cortar.
    if (size.height <= sliceHeight) return [fullPath];

    const step = Math.max(1, Math.round(sliceHeight * (1 - SLICE_OVERLAP_RATIO)));
    const possiveis = Math.ceil((size.height - sliceHeight) / step) + 1;
    const total = Math.min(possiveis, options.maxSlices);

    const paths: string[] = [];
    for (let index = 0; index < total; index++) {
      // A última fatia é ancorada no rodapé pra não sobrar faixa vazia.
      const y =
        index === total - 1 && total === possiveis
          ? size.height - sliceHeight
          : Math.min(index * step, size.height - sliceHeight);

      const slicePath = join(outputDir, `site-${String(index + 1).padStart(2, "0")}.png`);
      await execFileAsync(FFMPEG_PATH, [
        "-y",
        "-i", fullPath,
        "-vf", `crop=${size.width}:${sliceHeight}:0:${Math.max(0, y)}`,
        "-frames:v", "1",
        slicePath,
      ]);
      paths.push(slicePath);
    }
    return paths;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
