import { useEffect, useState } from "react";
import { ProgressBar } from "./ProgressBar.js";
import { VideoPlayer } from "./VideoPlayer.js";
import { useElapsedTime } from "../useElapsedTime.js";

/** Só o nome do arquivo — o caminho completo estoura a largura e não ajuda. */
function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function isPdf(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

function isSite(valor: string): boolean {
  return /^https?:\/\//i.test(valor.trim());
}

/** Rótulo curto da fonte, pra caber na linha da lista. */
function rotulo(valor: string): string {
  if (!isSite(valor)) return baseName(valor);
  try {
    const url = new URL(valor);
    return url.hostname + (url.pathname === "/" ? "" : url.pathname);
  } catch {
    return valor;
  }
}

const DURACOES = [2.5, 3.5, 5] as const;

const MODOS_LOGO = [
  { id: "both", rotulo: "Abertura, fim e canto" },
  { id: "intro", rotulo: "Só abertura e fim" },
  { id: "watermark", rotulo: "Só no canto" },
] as const;

/**
 * Monta um vídeo de anúncio a partir de fotos e PDFs.
 *
 * Diferente do painel de melhorias, aqui **nada é gerado por IA** — é
 * composição determinística (movimento de câmera simulado, transição,
 * legenda). Por isso não há aviso de risco nem de demora: o resultado é
 * previsível e sai em segundos.
 */
export function SlideshowPanel(): JSX.Element {
  const [arquivos, setArquivos] = useState<string[]>([]);
  const [audio, setAudio] = useState<string | null>(null);
  const [formatos, setFormatos] = useState<SlideshowFormatDTO[]>([]);
  const [formato, setFormato] = useState<"feed" | "story" | "square">("feed");
  const [duracao, setDuracao] = useState<number>(3.5);
  const [usarTextoPdf, setUsarTextoPdf] = useState(true);
  const [urlSite, setUrlSite] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [pastaTrilhas, setPastaTrilhas] = useState<string | null>(null);
  const [trilhas, setTrilhas] = useState<MusicTrackDTO[]>([]);
  const [modoLogo, setModoLogo] = useState<"intro" | "watermark" | "both">("both");
  const [status, setStatus] = useState<"idle" | "criando" | "pronto" | "erro">("idle");
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<StageProgressDTO | null>(null);
  const elapsedMs = useElapsedTime(status === "criando");
  const [resultado, setResultado] = useState<SlideshowDTO | null>(null);
  const [salvoEm, setSalvoEm] = useState<string | null>(null);

  useEffect(() => {
    void window.digify.getSlideshowFormats().then(setFormatos);
    // Logo e pasta de trilhas ficam salvos entre execuções: reapontar o
    // próprio logo a cada vídeo seria atrito puro.
    void window.digify.getSettings().then((prefs) => {
      if (prefs.logoPath) setLogo(prefs.logoPath);
      if (prefs.logoMode) setModoLogo(prefs.logoMode);
      if (prefs.musicFolder) {
        setPastaTrilhas(prefs.musicFolder);
        void window.digify.listMusic(prefs.musicFolder).then(setTrilhas);
      }
    });
  }, []);

  /** Grava a preferência já com o valor novo — `setState` não é imediato. */
  function salvarPreferencias(mudanca: Partial<UserSettingsDTO>): void {
    void window.digify.saveSettings({
      ...(logo ? { logoPath: logo } : {}),
      logoMode: modoLogo,
      ...(pastaTrilhas ? { musicFolder: pastaTrilhas } : {}),
      ...mudanca,
    });
  }

  async function escolherPastaTrilhas(): Promise<void> {
    const pasta = await window.digify.selectMusicFolder();
    if (!pasta) return;
    setPastaTrilhas(pasta);
    setTrilhas(await window.digify.listMusic(pasta));
    salvarPreferencias({ musicFolder: pasta });
  }

  const temPdf = arquivos.some(isPdf);
  const temSite = arquivos.some(isSite);
  const urlValida = isSite(urlSite);

  async function adicionarArquivos(): Promise<void> {
    const escolhidos = await window.digify.selectSlideshowFiles();
    if (escolhidos.length === 0) return;
    // Concatena em vez de substituir: o usuário costuma escolher as fotos de
    // um cômodo por vez.
    setArquivos((atuais) => [...atuais, ...escolhidos]);
    setStatus("idle");
    setResultado(null);
  }

  function adicionarSite(): void {
    if (!urlValida) return;
    setArquivos((atuais) => [...atuais, urlSite.trim()]);
    setUrlSite("");
    setStatus("idle");
    setResultado(null);
  }

  function mover(indice: number, direcao: -1 | 1): void {
    const destino = indice + direcao;
    if (destino < 0 || destino >= arquivos.length) return;
    setArquivos((atuais) => {
      const copia = [...atuais];
      const [item] = copia.splice(indice, 1);
      copia.splice(destino, 0, item as string);
      return copia;
    });
  }

  function remover(indice: number): void {
    setArquivos((atuais) => atuais.filter((_, i) => i !== indice));
  }

  async function criar(): Promise<void> {
    setStatus("criando");
    setErro(null);
    setProgresso(null);
    setSalvoEm(null);
    try {
      const criado = await window.digify.createSlideshow(
        {
          sources: arquivos,
          format: formato,
          slideDurationSec: duracao,
          usePdfTextAsCaption: usarTextoPdf,
          ...(audio ? { audioPath: audio } : {}),
          ...(logo ? { logoPath: logo, logoMode: modoLogo } : {}),
        },
        setProgresso,
      );
      setResultado(criado);
      setStatus("pronto");
    } catch (error) {
      console.error(error);
      setErro(error instanceof Error ? error.message : "Não conseguimos montar o vídeo.");
      setStatus("erro");
    }
  }

  async function salvar(): Promise<void> {
    if (!resultado) return;
    const destino = await window.digify.saveSlideshow(resultado.outputPath);
    if (destino) setSalvoEm(destino);
  }

  return (
    <section>
      <h2 className="section-title">Criar vídeo a partir de fotos, PDF e site</h2>

      <div className="slideshow">
        <div className="render-panel__controls">
          <button className="button-primary" onClick={adicionarArquivos} disabled={status === "criando"}>
            Adicionar fotos / PDF
          </button>

          <select
            className="select"
            value={formato}
            onChange={(event) => setFormato(event.target.value as typeof formato)}
            disabled={status === "criando"}
          >
            {formatos.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>

          <select
            className="select"
            value={duracao}
            onChange={(event) => setDuracao(Number(event.target.value))}
            disabled={status === "criando"}
          >
            {DURACOES.map((segundos) => (
              <option key={segundos} value={segundos}>
                {segundos}s por imagem
              </option>
            ))}
          </select>

          <button
            className="select"
            onClick={async () => setAudio(await window.digify.selectSlideshowAudio())}
            disabled={status === "criando"}
          >
            {audio ? `♪ ${baseName(audio)}` : "Adicionar música"}
          </button>

          <div className="slideshow__trilhas">
            {trilhas.length > 0 ? (
              <select
                className="select slideshow__trilhas-lista"
                value={audio ?? ""}
                onChange={(event) => setAudio(event.target.value || null)}
                disabled={status === "criando"}
              >
                <option value="">Sem música</option>
                {trilhas.map((faixa) => (
                  <option key={faixa.path} value={faixa.path}>
                    ♪ {faixa.name}
                  </option>
                ))}
              </select>
            ) : null}
            <button className="select" onClick={escolherPastaTrilhas} disabled={status === "criando"}>
              {pastaTrilhas
                ? `Pasta: ${baseName(pastaTrilhas)} (${trilhas.length})`
                : "Escolher pasta de trilhas"}
            </button>
            <button
              className="select"
              onClick={() => void window.digify.openAudioLibrary()}
              title="Baixe faixas livres para uso comercial e salve na sua pasta"
            >
              ↗ YouTube Audio Library
            </button>
          </div>

          <button
            className="select"
            onClick={async () => {
              const escolhido = await window.digify.selectSlideshowLogo();
              if (!escolhido) return;
              setLogo(escolhido);
              salvarPreferencias({ logoPath: escolhido });
            }}
            disabled={status === "criando"}
          >
            {logo ? `◆ ${baseName(logo)}` : "Adicionar logo"}
          </button>

          {logo ? (
            <>
              <select
                className="select"
                value={modoLogo}
                onChange={(event) => {
                  const modo = event.target.value as typeof modoLogo;
                  setModoLogo(modo);
                  salvarPreferencias({ logoMode: modo });
                }}
                disabled={status === "criando"}
              >
                {MODOS_LOGO.map((modo) => (
                  <option key={modo.id} value={modo.id}>
                    Logo: {modo.rotulo}
                  </option>
                ))}
              </select>
              <button
                className="select"
                onClick={() => {
                  setLogo(null);
                  void window.digify.saveSettings({
                    logoMode: modoLogo,
                    ...(pastaTrilhas ? { musicFolder: pastaTrilhas } : {}),
                  });
                }}
                disabled={status === "criando"}
                title="Remover logo"
              >
                ✕
              </button>
            </>
          ) : null}

          {temPdf || temSite ? (
            <label className="render-panel__checkbox">
              <input
                type="checkbox"
                checked={usarTextoPdf}
                onChange={(event) => setUsarTextoPdf(event.target.checked)}
                disabled={status === "criando"}
              />
              Usar o texto do PDF/site como legenda
            </label>
          ) : null}

          <button
            className="button-primary"
            onClick={criar}
            disabled={status === "criando" || arquivos.length === 0}
          >
            {status === "criando" ? "Montando…" : "Montar vídeo"}
          </button>

          <div className="slideshow__url">
            <input
              className="select slideshow__url-input"
              type="url"
              placeholder="Cole o link da página do imóvel (https://…)"
              value={urlSite}
              onChange={(event) => setUrlSite(event.target.value)}
              // Enter é o gesto natural depois de colar um link.
              onKeyDown={(event) => {
                if (event.key === "Enter") adicionarSite();
              }}
              disabled={status === "criando"}
            />
            <button
              className="select"
              onClick={adicionarSite}
              disabled={!urlValida || status === "criando"}
            >
              Adicionar site
            </button>
          </div>
        </div>

        {arquivos.length === 0 ? (
          <p className="empty-state">
            Adicione as fotos do imóvel e, se quiser, o PDF do anúncio ou o link da página
            do imóvel. A ordem da lista é a ordem do vídeo.
          </p>
        ) : (
          <ol className="slideshow__lista">
            {arquivos.map((caminho, indice) => (
              <li key={`${caminho}-${indice}`} className="slideshow__item">
                <span className="slideshow__tipo">
                  {isSite(caminho) ? "SITE" : isPdf(caminho) ? "PDF" : "FOTO"}
                </span>
                <span className="slideshow__nome">{rotulo(caminho)}</span>
                <span className="slideshow__acoes">
                  <button
                    onClick={() => mover(indice, -1)}
                    disabled={indice === 0 || status === "criando"}
                    aria-label="Mover para cima"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => mover(indice, 1)}
                    disabled={indice === arquivos.length - 1 || status === "criando"}
                    aria-label="Mover para baixo"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => remover(indice)}
                    disabled={status === "criando"}
                    aria-label="Remover"
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}

        {status === "criando" && progresso && (
          <ProgressBar
            stage={progresso.stage}
            stageIndex={progresso.stageIndex}
            totalStages={progresso.totalStages}
            percent={progresso.percent}
            elapsedMs={elapsedMs}
          />
        )}

        {status === "erro" && <p style={{ color: "#ff6b6b" }}>{erro}</p>}

        {status === "pronto" && resultado && (
          <div className="render-panel__result">
            <p className="render-panel__result-title">Vídeo pronto</p>
            <ul>
              <li>
                {resultado.slideCount} imagem(ns)
                {resultado.pdfPageCount > 0
                  ? `, sendo ${resultado.pdfPageCount} página(s) de PDF`
                  : ""}
              </li>
              <li>{resultado.durationSec.toFixed(1)} segundos</li>
            </ul>
            <VideoPlayer filePath={resultado.outputPath} label="Vídeo montado" />
            <div className="render-panel__controls" style={{ marginTop: 12 }}>
              <button className="button-primary" onClick={salvar}>
                Salvar vídeo
              </button>
            </div>
            {salvoEm ? <p className="render-panel__result-path">Salvo em: {salvoEm}</p> : null}
          </div>
        )}
      </div>
    </section>
  );
}
