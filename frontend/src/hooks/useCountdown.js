import { useEffect, useState } from 'react';
import { formatCountdownDHMS } from '../constants';

// Kun:soat:daqiqa:soniya (yoki qisqartirilgan) shaklida, har soniyada real-vaqtda yangilanadi
export function useCountdownDHMS(endsAtIso) {
  const [label, setLabel] = useState(() => formatCountdownDHMS(endsAtIso));

  useEffect(() => {
    setLabel(formatCountdownDHMS(endsAtIso));
    const id = setInterval(() => setLabel(formatCountdownDHMS(endsAtIso)), 1000);
    return () => clearInterval(id);
  }, [endsAtIso]);

  return label;
}
