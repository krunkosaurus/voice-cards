// hooks/useSyncedActions.ts - Sync-wrapped action functions
// Design: Wraps ProjectContext actions to broadcast operations when connected as editor

import { useCallback } from 'react';
import { useProject } from '@/contexts/ProjectContext';
import { useSync } from '@/contexts/SyncContext';
import type { Card } from '@/types';
import {
  createCardCreateOp,
  createCardUpdateOp,
  createCardDeleteOp,
  createCardReorderOp,
  createCardAudioChangeOp,
  createChunkStart,
  createChunkComplete,
  calculateTotalChunks,
} from '@/services/webrtc/syncProtocol';

/**
 * Hook that wraps ProjectContext card actions with sync broadcasting.
 *
 * When conditions are met (connected, editor role, not applying remote), actions
 * are automatically broadcast to the connected peer via WebRTC.
 *
 * @returns Synced action functions and raw actions for non-sync cases
 */
export function useSyncedActions() {
  const { addCard, updateCard, deleteCard, reorderCards } = useProject();
  const {
    syncState,
    connectionState,
    isApplyingRemoteRef,
    getConnection,
    getAudioTransfer,
  } = useSync();

  /**
   * Determine if we should broadcast this action to the peer.
   * Conditions:
   * 1. Connected to peer
   * 2. User is editor role (only editors broadcast changes)
   * 3. Not currently applying a remote operation (prevents echo loops)
   */
  const shouldBroadcast = useCallback(() => {
    return (
      connectionState === 'connected' &&
      syncState.role === 'editor' &&
      !isApplyingRemoteRef.current
    );
  }, [connectionState, syncState.role, isApplyingRemoteRef]);

  /**
   * Add a card with sync broadcasting.
   * Broadcasts op_card_create + audio chunks if connected as editor.
   *
   * @param card - The card to add
   * @param audioBlob - Optional audio blob to transfer
   */
  const syncedAddCard = useCallback(
    async (card: Card, audioBlob?: Blob) => {
      // Apply locally first
      addCard(card);

      // Broadcast if conditions met
      if (shouldBroadcast()) {
        const connection = getConnection();
        if (!connection?.isReady()) return;

        const audioSize = audioBlob?.size ?? 0;
        const op = createCardCreateOp(card, audioSize);
        connection.sendControl(op);

        // If audio exists, send via chunk protocol
        if (audioBlob && audioBlob.size > 0) {
          const audioTransfer = getAudioTransfer();
          if (!audioTransfer) return;

          const totalChunks = calculateTotalChunks(audioSize);
          connection.sendControl(
            createChunkStart(card.id, 0, totalChunks, audioSize)
          );
          await audioTransfer.sendAudio(card.id, 0, audioBlob);
          connection.sendControl(createChunkComplete(card.id, 0));
        }
      }
    },
    [addCard, shouldBroadcast, getConnection, getAudioTransfer]
  );

  /**
   * Update a card with sync broadcasting.
   * Broadcasts op_card_update for metadata changes only.
   *
   * @param card - The full card object with updated fields
   */
  const syncedUpdateCard = useCallback(
    (card: Card) => {
      // Apply locally
      updateCard(card);

      // Broadcast if conditions met
      if (shouldBroadcast()) {
        const connection = getConnection();
        if (!connection?.isReady()) return;

        // Only send metadata fields that can change (not audio-related)
        const changes = {
          label: card.label,
          notes: card.notes,
          tags: card.tags,
          color: card.color,
        };
        connection.sendControl(createCardUpdateOp(card.id, changes));
      }
    },
    [updateCard, shouldBroadcast, getConnection]
  );

  /**
   * Delete a card with sync broadcasting.
   * Broadcasts op_card_delete.
   *
   * @param cardId - ID of the card to delete
   */
  const syncedDeleteCard = useCallback(
    (cardId: string) => {
      // Apply locally
      deleteCard(cardId);

      // Broadcast if conditions met
      if (shouldBroadcast()) {
        const connection = getConnection();
        if (!connection?.isReady()) return;

        connection.sendControl(createCardDeleteOp(cardId));
      }
    },
    [deleteCard, shouldBroadcast, getConnection]
  );

  /**
   * Reorder cards with sync broadcasting.
   * Broadcasts op_card_reorder with compact {id, order} array.
   *
   * @param cards - Array of cards in new order
   */
  const syncedReorderCards = useCallback(
    (cards: Card[]) => {
      // Apply locally
      reorderCards(cards);

      // Broadcast if conditions met
      if (shouldBroadcast()) {
        const connection = getConnection();
        if (!connection?.isReady()) return;

        const cardOrder = cards.map((card, index) => ({
          id: card.id,
          order: index,
        }));
        connection.sendControl(createCardReorderOp(cardOrder));
      }
    },
    [reorderCards, shouldBroadcast, getConnection]
  );

  /**
   * Update a card's audio with sync broadcasting.
   * Broadcasts op_card_audio_change + audio chunks.
   *
   * Use this for re-record, trim, or any audio modification operations.
   *
   * @param cardId - ID of the card being modified
   * @param updatedCard - The card with updated duration/waveform/transcript
   * @param audioBlob - The new audio blob
   */
  const syncedAudioChange = useCallback(
    async (cardId: string, updatedCard: Card, audioBlob: Blob) => {
      // Apply locally (caller updates the card, we persist it)
      updateCard(updatedCard);

      // Broadcast if conditions met
      if (shouldBroadcast()) {
        const connection = getConnection();
        const audioTransfer = getAudioTransfer();
        if (!connection?.isReady() || !audioTransfer) return;

        // Send operation message with metadata
        connection.sendControl(
          createCardAudioChangeOp(
            cardId,
            updatedCard.duration,
            audioBlob.size,
            updatedCard.waveformData,
            updatedCard.transcript
          )
        );

        // Send audio via chunk protocol
        const totalChunks = calculateTotalChunks(audioBlob.size);
        connection.sendControl(
          createChunkStart(cardId, 0, totalChunks, audioBlob.size)
        );
        await audioTransfer.sendAudio(cardId, 0, audioBlob);
        connection.sendControl(createChunkComplete(cardId, 0));
      }
    },
    [updateCard, shouldBroadcast, getConnection, getAudioTransfer]
  );

  /**
   * Broadcast card create WITHOUT adding to local state.
   * Use when you've already added the card locally and just need to broadcast.
   */
  const broadcastCardCreate = useCallback(
    async (card: Card, audioBlob?: Blob) => {
      if (!shouldBroadcast()) return;

      const connection = getConnection();
      if (!connection?.isReady()) return;

      const audioSize = audioBlob?.size ?? 0;
      const op = createCardCreateOp(card, audioSize);
      connection.sendControl(op);

      // If audio exists, send via chunk protocol
      if (audioBlob && audioBlob.size > 0) {
        const audioTransfer = getAudioTransfer();
        if (!audioTransfer) return;

        const totalChunks = calculateTotalChunks(audioSize);
        connection.sendControl(createChunkStart(card.id, 0, totalChunks, audioSize));
        await audioTransfer.sendAudio(card.id, 0, audioBlob);
        connection.sendControl(createChunkComplete(card.id, 0));
      }
    },
    [shouldBroadcast, getConnection, getAudioTransfer]
  );

  return {
    // Synced actions - broadcast to peer when conditions met
    addCard: syncedAddCard,
    updateCard: syncedUpdateCard,
    deleteCard: syncedDeleteCard,
    reorderCards: syncedReorderCards,
    audioChange: syncedAudioChange,

    // Broadcast-only - for cases where local state already updated
    broadcastCardCreate,

    // Raw actions - for cases where sync shouldn't happen
    // (e.g., applying remote operations, viewer-only operations)
    rawAddCard: addCard,
    rawUpdateCard: updateCard,
    rawDeleteCard: deleteCard,
    rawReorderCards: reorderCards,
  };
}
