interface PropertyScorePanelProps {
  score: PropertyScoreDTO | null;
  objects: DetectedObjectDTO[];
}

/**
 * Mostra o Property Score real (`property.score`) e os objetos detectados
 * (`object.detect`) — sempre com a sugestão textual junto, nunca só um
 * número sem explicação (docs/reference/original-docs/02 - Product
 * Manifesto.md: "a verdade sempre vence").
 */
export function PropertyScorePanel({ score, objects }: PropertyScorePanelProps): JSX.Element {
  if (!score) {
    return <p className="empty-state">Calculando o Property Score…</p>;
  }

  const removableCount = objects.filter((object) => object.removable).length;

  return (
    <div className="property-score">
      <div className="property-score__headline">
        <span className="property-score__value">{score.score}</span>
        <span className="property-score__label">/ 100</span>
      </div>
      <div className="property-score__breakdown">
        <span>Iluminação: {score.lightingScore}</span>
        <span>Organização: {score.organizationScore}</span>
        <span>{objects.length} objeto(s) detectado(s), {removableCount} removível(is)</span>
      </div>
      {score.suggestions.length > 0 && (
        <ul className="property-score__suggestions">
          {score.suggestions.map((suggestion) => (
            <li key={suggestion}>{suggestion}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
