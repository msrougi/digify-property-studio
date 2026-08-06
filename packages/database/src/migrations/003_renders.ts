// Guarda o resultado de "Aplicar melhorias" pra ele sobreviver a trocar de
// projeto e a fechar o app. Antes, o render existia só no estado do React:
// o arquivo continuava no disco, mas o app esquecia dele — o usuário
// importava, revisava e perdia a comparação antes/depois pra sempre.
//
// Um render por projeto (o caminho de saída já era determinístico:
// `rendersDir/<projectId>.mp4`), então `project_id` é a própria chave.
// Continua valendo a regra de nunca guardar vídeo no banco — só o CAMINHO
// e os metadados da decisão (docs/00-ARCHITECTURE.md, seção 9).
export const RENDERS_SQL = `
CREATE TABLE IF NOT EXISTS renders (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  output_path TEXT NOT NULL,
  applied_corrections TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;
