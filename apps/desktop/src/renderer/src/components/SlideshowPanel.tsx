import { useEffect, useState } from "react";
import { ProgressBar } from "./ProgressBar.js";
import { VideoPlayer } from "./VideoPlayer.js";
import { useElapsedTime } from "../useElapsedTime.js";
import { readableError } from "../format.js";

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
  const [buscaMusica, setBuscaMusica] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [achadas, setAchadas] = useState<MusicSearchResultDTO[] | null>(null);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);
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

  async function buscarMusica(): Promise<void> {
    const texto = buscaMusica.trim();
    if (texto === "" || buscando) return;
    setBuscando(true);
    setErroBusca(null);
    try {
      setAchadas(await window.digify.searchMusic(texto));
    } catch (error) {
      // A busca é a única parte do app que depende de internet. Sem mensagem
      // clara, ficar offline pareceria "não existe música com esse nome".
      setErroBusca(readableError(error, "Não consegui buscar trilhas agora."));
      setAchadas(null);
    } finally {
      setBuscando(false);
    }
  }

  /**
   * Baixa a faixa pra pasta e já a deixa selecionada.
   *
   * Selecionar sozinho é o que o usuário quer em 100% dos casos: ele buscou,
   * ouviu e clicou em baixar — pedir pra escolher de novo numa lista logo
   * depois seria trabalho repetido.
   */
  async function baixarMusica(faixa: MusicSearchResultDTO): Promise<void> {
    setBaixando(faixa.id);
    setErroBusca(null);
    try {
      const baixada = await window.digify.downloadMusic(faixa);
      setTrilhas(pastaTrilhas ? await window.digify.listMusic(pastaTrilhas) : [baixada]);
      setAudio(baixada.path);
    } catch (error) {
      setErroBusca(readableError(error, "Não consegui baixar essa faixa."));
    } finally {
      setBaixando(null);
    }
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
      setErro(readableError(error, "Não conseguimos montar o vídeo."));
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
                {/*
                  Faixa escolhida pelo botão "Adicionar música" que não está na
                  pasta (o caso de baixar na hora). Sem esta opção o `select`
                  não acharia o valor e exibiria "Sem música" — a tela mentiria
                  enquanto o vídeo sai com trilha.
                */}
                {audio && !trilhas.some((faixa) => faixa.path === audio) ? (
                  <option value={audio}>♪ {baseName(audio)} (fora da pasta)</option>
                ) : null}
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
              title="studio.youtube.com/music — exige login no YouTube"
            >
              ↗ YouTube Audio Library
            </button>

            <div className="slideshow__busca-musica">
              <input
                className="select slideshow__url-input"
                type="search"
                value={buscaMusica}
                placeholder="Buscar trilha livre (piano, ambiente, upbeat…)"
                onChange={(event) => setBuscaMusica(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void buscarMusica();
                }}
                disabled={status === "criando"}
              />
              <button
                className="select"
                onClick={() => void buscarMusica()}
                disabled={buscando || buscaMusica.trim() === "" || status === "criando"}
              >
                {buscando ? "Buscando…" : "Buscar"}
              </button>
            </div>

            {erroBusca ? <p className="render-panel__error">{erroBusca}</p> : null}

            {achadas?.length === 0 ? (
              <p className="render-panel__hint">
                Nada encontrado para esse termo. Tente em inglês — o acervo é
                internacional, e “piano” traz mais que “piano suave”.
              </p>
            ) : null}

            {achadas && achadas.length > 0 ? (
              <ul className="slideshow__achadas">
                {achadas.map((faixa) => (
                  <li key={faixa.id} className="slideshow__achada">
                    <div>
                      <strong>{faixa.title}</strong>
                      <span className="slideshow__achada-autor"> — {faixa.creator}</span>
                      {/*
                        A licença aparece ANTES de baixar, não depois. `by`
                        obriga a creditar na descrição do post; descobrir isso
                        só depois de publicar seria descobrir tarde demais.
                      */}
                      <span className="slideshow__licenca">
                        {faixa.license === "cc0"
                          ? "CC0 · sem precisar creditar"
                          : "CC BY · precisa creditar"}
                      </span>
                    </div>
                    <div className="slideshow__achada-acoes">
                      {/*
                        Ouvir antes de baixar: trilha errada só se percebe
                        ouvindo, e baixar pra descobrir enche a pasta de lixo.
                      */}
                      <audio controls preload="none" src={faixa.downloadUrl} />
                      <button
                        className="select"
                        onClick={() => void baixarMusica(faixa)}
                        disabled={baixando !== null || !pastaTrilhas}
                        title={
                          pastaTrilhas
                            ? "Baixa para sua pasta de trilhas"
                            : "Escolha antes a pasta onde suas trilhas ficam"
                        }
                      >
                        {baixando === faixa.id ? "Baixando…" : "Usar esta"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            {achadas && achadas.length > 0 && !pastaTrilhas ? (
              <p className="render-panel__hint">
                Escolha a pasta de trilhas acima para poder baixar — é onde as
                faixas ficam guardadas para os próximos vídeos.
              </p>
            ) : null}

            {pastaTrilhas ? null : (
              // Sem isto a tela não conta duas coisas que o usuário perguntou:
              // que a biblioteca exige login, e que dá pra baixar na hora sem
              // precisar montar pasta nenhuma.
              <p className="render-panel__hint">
                A biblioteca é <strong>online e pede login no YouTube</strong>. Lá
                cada faixa tem um botão de download — todas são livres para uso
                comercial.
                <br />
                <strong>Para usar agora:</strong> baixe a faixa e clique em
                “Adicionar música”. Não precisa de pasta.
                <br />
                <strong>A pasta é só atalho:</strong> se você reusa as mesmas
                faixas, guarde todas num lugar e aponte aqui — daí é um clique
                por vídeo.
                <br />
                Se o botão não abrir a página certa, o endereço é{" "}
                <strong>studio.youtube.com/music</strong>.
              </p>
            )}
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

            {/*
              Crédito só aparece quando a licença da trilha exige (CC BY). CC0
              não exige nada, e mostrar um crédito desnecessário faria o
              corretor gastar linha da descrição do anúncio com isso.
            */}
            {resultado.creditsText ? (
              <div className="slideshow__creditos">
                <p className="render-panel__result-title">
                  Cole isto na descrição do post
                </p>
                <p className="render-panel__hint">
                  A licença desta trilha <strong>exige crédito</strong>. Publicar
                  sem ele é violação — e o arquivo abaixo também ficou salvo ao
                  lado do vídeo.
                </p>
                <pre className="slideshow__creditos-texto">{resultado.creditsText}</pre>
                <button
                  className="select"
                  onClick={() => void navigator.clipboard.writeText(resultado.creditsText ?? "")}
                >
                  Copiar crédito
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
