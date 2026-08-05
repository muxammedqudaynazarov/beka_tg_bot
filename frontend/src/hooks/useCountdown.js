import { useEffect, useState } from 'react';
import { formatCountdown, formatCountdownDHMS } from '../constants';

export function useCountdown(endsAtIso) {
  const [label, setLabel] = useState(() => formatCountdown(endsAtIso));

  useEffect(() => {
    setLabel(formatCountdown(endsAtIso));
    const id = setInterval(() => setLabel(formatCountdown(endsAtIso)), 1000);
    return () => clearInterval(id);
  }, [endsAtIso]);

  return label;
}

// 7-band: kun:soat:daqiqa:soniya shaklida, har soniyada real-vaqtda yangilanadi
export function useCountdownDHMS(endsAtIso) {
  const [label, setLabel] = useState(() => formatCountdownDHMS(endsAtIso));

  useEffect(() => {
    setLabel(formatCountdownDHMS(endsAtIso));
    const id = setInterval(() => setLabel(formatCountdownDHMS(endsAtIso)), 1000);
    return () => clearInterval(id);
  }, [endsAtIso]);

  return label;
}
