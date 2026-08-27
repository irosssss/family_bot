import { useState, useEffect } from 'react';

interface StreakData {
  current_streak: number;
  bonus_multiplier: number;
  last_completion_date: string | null;
}

export function useStreak(userId: number) {
  const [streak, setStreak] = useState<number>(0);
  const [bonusPercent, setBonusPercent] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    const fetchStreak = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/users/${userId}/streak`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch streak data');
        }

        const data: StreakData = await response.json();
        
        setStreak(data.current_streak);
        // Конвертируем multiplier в проценты: 1.25 -> 25%
        const percent = Math.floor((data.bonus_multiplier - 1) * 100);
        setBonusPercent(percent);
        setError(null);
      } catch (err) {
        console.error('Error fetching streak:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchStreak();
  }, [userId]);

  return {
    streak,
    bonusPercent,
    isLoading,
    error,
    setStreak,
    setBonusPercent,
  };
}
