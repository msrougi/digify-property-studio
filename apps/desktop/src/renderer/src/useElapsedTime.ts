import { useEffect, useRef, useState } from "react";

/**
 * Tempo decorrido real (ms) desde que `active` virou true — recalculado a
 * partir de `Date.now()` a cada tick, não incrementado por contagem (evita
 * deriva se o processo pausar por qualquer motivo). Reseta quando `active`
 * volta a `false` e liga de novo.
 */
export function useElapsedTime(active: boolean): number {
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      startedAtRef.current = null;
      setElapsedMs(0);
      return;
    }

    startedAtRef.current = Date.now();
    setElapsedMs(0);
    const intervalId = window.setInterval(() => {
      setElapsedMs(Date.now() - (startedAtRef.current as number));
    }, 200);

    return () => window.clearInterval(intervalId);
  }, [active]);

  return elapsedMs;
}
