export interface RenderProps {
  projectId: string;
  /** Caminho do vídeo renderizado no disco — o banco nunca guarda vídeo, só o caminho (docs/00-ARCHITECTURE.md, seção 9). */
  outputPath: string;
  /** Descrições legíveis do que cada capability decidiu alterar — é o que a UI mostra em "O que foi alterado". */
  appliedCorrections: string[];
  createdAt: Date;
}

/**
 * Resultado persistido de "Aplicar melhorias". Existe pra que o usuário
 * possa fechar o app (ou trocar de projeto) e voltar depois encontrando a
 * comparação antes/depois onde deixou — antes disso o render só vivia no
 * estado da tela e se perdia, mesmo com o arquivo ainda no disco.
 */
export class Render {
  private constructor(private props: RenderProps) {}

  static create(input: {
    projectId: string;
    outputPath: string;
    appliedCorrections: string[];
    createdAt?: Date;
  }): Render {
    return new Render({
      projectId: input.projectId,
      outputPath: input.outputPath,
      appliedCorrections: input.appliedCorrections,
      createdAt: input.createdAt ?? new Date(),
    });
  }

  static restore(props: RenderProps): Render {
    return new Render(props);
  }

  toProps(): Readonly<RenderProps> {
    return { ...this.props };
  }
}
