// services/sync/projectSync.ts - Project serialization/deserialization for sync
// Design: Utilities for gathering project data to send and committing received data

import {
  getProject,
  getAllCards,
  getAudio,
  saveProject,
  saveCard,
  saveAudio,
  clearAllData,
} from '@/services/db';
import type { Card, Project } from '@/types';
import type { CardMetadata } from '@/types/sync';

// =============================================================================
// Types
// =============================================================================

/**
 * Project data gathered for sync transfer.
 * Contains all project metadata and card info plus audio sizes for transfer planning.
 */
export interface ProjectSyncData {
  project: Project;
  cards: Card[];
  audioSizes: Map<string, number>;
}

/**
 * Complete project data received from peer.
 * Includes reconstructed audio blobs ready for storage.
 */
export interface ReceivedProjectData {
  project: Project;
  cards: Card[];
  audioMap: Map<string, Blob>;
}

// =============================================================================
// Gather Functions (Sender Side)
// =============================================================================

/**
 * Gather all project data for sync transfer.
 *
 * Loads:
 * - Project metadata from IndexedDB
 * - All cards from IndexedDB
 * - Audio blob sizes for each card (actual blobs sent separately)
 *
 * @returns ProjectSyncData with project, cards, and audio size map
 */
export async function gatherProjectForSync(): Promise<ProjectSyncData> {
  // Load project metadata
  const project = await getProject();
  if (!project) {
    // Return default project if none exists
    return {
      project: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      cards: [],
      audioSizes: new Map(),
    };
  }

  // Load all cards
  const cards = await getAllCards();

  // Load audio sizes for each card
  const audioSizes = new Map<string, number>();
  for (const card of cards) {
    const blob = await getAudio(card.id);
    if (blob) {
      audioSizes.set(card.id, blob.size);
    }
  }

  return {
    project,
    cards,
    audioSizes,
  };
}

/**
 * Convert cards to CardMetadata array for sync_request message.
 * Adds audioSize from the audioSizes map.
 *
 * @param cards - Array of cards to convert
 * @param audioSizes - Map of cardId to audio blob size
 * @returns Array of CardMetadata
 */
export function cardsToMetadata(
  cards: Card[],
  audioSizes: Map<string, number>
): CardMetadata[] {
  return cards.map((card) => ({
    id: card.id,
    label: card.label,
    notes: card.notes,
    tags: card.tags,
    color: card.color,
    duration: card.duration,
    waveformData: card.waveformData,
    transcript: card.transcript,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    order: card.order,
    audioSize: audioSizes.get(card.id) ?? 0,
  }));
}

// =============================================================================
// Commit Functions (Receiver Side)
// =============================================================================

/**
 * Commit received project data to IndexedDB.
 *
 * Process:
 * 1. Clear existing project data (full replacement)
 * 2. Save new project metadata
 * 3. Save each card with its audio blob
 *
 * Note: This replaces the entire project. Viewer becomes a read-only copy
 * of the editor's project.
 *
 * @param data - Complete project data received from peer
 */
export async function commitReceivedProject(
  data: ReceivedProjectData
): Promise<void> {
  // Clear existing project data first (full replacement sync)
  await clearAllData();

  // Save project metadata
  await saveProject(data.project);

  // Save each card and its audio
  for (const card of data.cards) {
    await saveCard(card);

    const audio = data.audioMap.get(card.id);
    if (audio) {
      await saveAudio(card.id, audio);
    }
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get audio blob for a specific card.
 * Wrapper for convenience in sync flow.
 *
 * @param cardId - ID of the card
 * @returns Audio blob or null if not found
 */
export async function getAudioForCard(cardId: string): Promise<Blob | null> {
  return await getAudio(cardId);
}
