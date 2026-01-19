// components/HistoryProviderWrapper.tsx - Wrapper to connect History and Project contexts
/* Design: Warm Analog Tape Aesthetic - Context integration layer */

import { HistoryProvider } from '@/contexts/HistoryContext';
import { useProject } from '@/contexts/ProjectContext';
import { getAllCards } from '@/services/db';

export function HistoryProviderWrapper({ children }: { children: React.ReactNode }) {
  const { dispatch } = useProject();

  const handleCardsReload = async () => {
    // Reload cards from database and update state
    const cards = await getAllCards();
    dispatch({ type: 'SET_CARDS', payload: cards });
  };

  return (
    <HistoryProvider onCardsReload={handleCardsReload}>
      {children}
    </HistoryProvider>
  );
}
