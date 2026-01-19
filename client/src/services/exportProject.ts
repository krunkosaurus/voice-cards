// services/exportProject.ts - Export project as ZIP

import JSZip from 'jszip';
import type { Card, ExportData, Settings } from '@/types';
import { getAudio } from './db';
import { mergeAudioBlobs } from './audioUtils';
import { slugify } from '@/lib/utils';

export async function exportProject(
  cards: Card[],
  project: { createdAt: string; updatedAt: string },
  settings: Settings,
  onProgress?: (message: string) => void
): Promise<Blob> {
  onProgress?.('Preparing export...');

  const zip = new JSZip();

  // Create export data structure
  const exportData: ExportData = {
    version: 1,
    appName: 'Voice Cards',
    exportedAt: new Date().toISOString(),
    project,
    cards: cards.map((card, index) => {
      const paddedIndex = (index + 1).toString().padStart(3, '0');
      const slug = slugify(card.label || 'untitled');
      const filename = `${paddedIndex}-${slug}.webm`;
      return { ...card, filename };
    }),
    settings,
  };

  // Add project.json
  zip.file('project.json', JSON.stringify(exportData, null, 2));

  // Add individual audio files
  onProgress?.('Adding audio files...');
  const cardsFolder = zip.folder('cards');
  if (!cardsFolder) throw new Error('Failed to create cards folder');

  const audioBlobs: Blob[] = [];
  for (const cardData of exportData.cards) {
    const audioBlob = await getAudio(cardData.id);
    if (audioBlob) {
      cardsFolder.file(cardData.filename, audioBlob);
      audioBlobs.push(audioBlob);
    }
  }

  // Merge and add merged audio
  if (audioBlobs.length > 0) {
    onProgress?.('Merging audio...');
    try {
      const mergedBlob = await mergeAudioBlobs(audioBlobs);
      zip.file('merged.webm', mergedBlob);
    } catch (error) {
      console.error('Failed to merge audio:', error);
      // Continue without merged file
    }
  }

  // Generate ZIP
  onProgress?.('Generating ZIP...');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const zipBlob = await zip.generateAsync({ type: 'blob' });

  return zipBlob;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
