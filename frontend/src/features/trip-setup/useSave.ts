import { useState } from 'react';
import type { SetupChange } from '../../state/api';
import { useTrip } from '../../state/tripContext';

/** Saves Trip setup changes and keeps the server's reason when one is refused. */
export function useSave() {
  const { setup } = useTrip();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Resolves true when saved. */
  const save = async (change: SetupChange): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      await setup(change);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { save, saving, error };
}
