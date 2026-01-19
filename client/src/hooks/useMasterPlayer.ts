// hooks/useMasterPlayer.ts - Master playback control for sequential card playback
import { useState, useRef, useCallback, useEffect } from 'react';
import type { Card } from '@/types';
import { getAudio } from '@/services/db';

export function useMasterPlayer(
  cards: Card[],
  onCardChange?: (cardId: string | null) => void,
  onTimeUpdate?: (globalTime: number, currentTime: number) => void
) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [globalTime, setGlobalTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isLooping, setIsLooping] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Calculate cumulative start times for each card
  const cardStartTimes = cards.reduce((acc, card, index) => {
    const prevTime = index > 0 ? acc[index - 1] + cards[index - 1].duration : 0;
    acc.push(prevTime);
    return acc;
  }, [] as number[]);

  const totalDuration = cards.reduce((sum, card) => sum + card.duration, 0);

  // Track current card progress (0-1)
  const [currentCardProgress, setCurrentCardProgress] = useState(0);

  // Update time continuously during playback
  const updateTime = useCallback(() => {
    if (!audioRef.current || !isPlaying) return;

    const currentAudio = audioRef.current;
    const cardStartTime = cardStartTimes[currentCardIndex] || 0;
    const newGlobalTime = cardStartTime + currentAudio.currentTime;

    setGlobalTime(newGlobalTime);
    
    // Calculate progress within current card
    const currentCard = cards[currentCardIndex];
    if (currentCard && currentCard.duration > 0) {
      setCurrentCardProgress(currentAudio.currentTime / currentCard.duration);
    }
    
    onTimeUpdate?.(newGlobalTime, currentAudio.currentTime);

    animationFrameRef.current = requestAnimationFrame(updateTime);
  }, [isPlaying, currentCardIndex, cardStartTimes, cards, onTimeUpdate]);

  // Play next card in sequence
  const playCard = useCallback(
    async (index: number) => {
      if (index < 0 || index >= cards.length) {
        setIsPlaying(false);
        setCurrentCardIndex(0);
        setGlobalTime(0);
        onCardChange?.(null);
        return;
      }

      const card = cards[index];
      const audioBlob = await getAudio(card.id);

      if (!audioBlob) {
        console.error('No audio found for card:', card.id);
        return;
      }

      // Create or reuse audio element
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }

      const audio = audioRef.current;
      audio.src = URL.createObjectURL(audioBlob);
      audio.playbackRate = playbackSpeed;

      audio.onended = () => {
        // Play next card
        const nextIndex = index + 1;
        if (nextIndex < cards.length) {
          playCard(nextIndex);
        } else {
          // End of sequence
          if (isLooping) {
            // Restart from beginning
            setCurrentCardIndex(0);
            setGlobalTime(0);
            playCard(0);
          } else {
            setIsPlaying(false);
            setCurrentCardIndex(0);
            setGlobalTime(0);
            onCardChange?.(null);
          }
        }
      };

      audio.onerror = (e) => {
        console.error('Audio playback error:', e);
        setIsPlaying(false);
      };

      setCurrentCardIndex(index);
      onCardChange?.(card.id);

      await audio.play();
    },
    [cards, onCardChange, isLooping, playbackSpeed]
  );

  const play = useCallback(async () => {
    if (cards.length === 0) return;

    setIsPlaying(true);
    await playCard(currentCardIndex);
  }, [cards, currentCardIndex, playCard]);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

  const seekToTime = useCallback(
    (targetGlobalTime: number) => {
      // Find which card contains this time
      let cardIndex = 0;
      for (let i = 0; i < cardStartTimes.length; i++) {
        if (targetGlobalTime >= cardStartTimes[i]) {
          cardIndex = i;
        } else {
          break;
        }
      }

      const cardStartTime = cardStartTimes[cardIndex];
      const offsetInCard = targetGlobalTime - cardStartTime;

      const wasPlaying = isPlaying;
      if (wasPlaying) {
        pause();
      }

      setCurrentCardIndex(cardIndex);
      setGlobalTime(targetGlobalTime);

      if (wasPlaying) {
        playCard(cardIndex).then(() => {
          if (audioRef.current) {
            audioRef.current.currentTime = offsetInCard;
          }
        });
      }
    },
    [cardStartTimes, isPlaying, pause, playCard]
  );

  const jumpToCard = useCallback(
    (cardId: string) => {
      const index = cards.findIndex(c => c.id === cardId);
      if (index === -1) return;

      const wasPlaying = isPlaying;
      if (wasPlaying) {
        pause();
      }

      setCurrentCardIndex(index);
      setGlobalTime(cardStartTimes[index]);

      if (wasPlaying) {
        playCard(index);
      }
    },
    [cards, isPlaying, pause, playCard, cardStartTimes]
  );

  // Start animation frame loop when playing
  useEffect(() => {
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateTime);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, updateTime]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  return {
    isPlaying,
    currentCardId: currentCardIndex >= 0 && currentCardIndex < cards.length 
      ? cards[currentCardIndex]?.id 
      : null,
    currentCardProgress,
    globalTime,
    totalDuration,
    playbackSpeed,
    isLooping,
    play,
    pause,
    seekToTime,
    jumpToCard,
    setPlaybackSpeed,
    setIsLooping,
  };
}
