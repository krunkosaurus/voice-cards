// services/importProject.ts - Import project from ZIP

import JSZip from 'jszip';
import type { Card, ExportData, Settings } from '@/types';
import { saveCard, saveAudio, saveProject, saveSettings } from './db';

export async function importProject(
  file: File,
  onProgress?: (message: string) => void
): Promise<{ cards: Card[]; settings: Settings }> {
  onProgress?.('Reading ZIP file...');

  const zip = await JSZip.loadAsync(file);

  // Validate and parse project.json
  const projectFile = zip.file('project.json');
  if (!projectFile) {
    throw new Error('Invalid ZIP: missing project.json');
  }

  const projectJson = await projectFile.async('string');
  const exportData: ExportData = JSON.parse(projectJson);

  if (!exportData.cards || !Array.isArray(exportData.cards)) {
    throw new Error('Invalid project.json: missing or invalid cards array');
  }

  onProgress?.('Validating audio files...');

  // Import cards and audio
  const cards: Card[] = [];
  for (const cardData of exportData.cards) {
    const { filename, ...card } = cardData;

    // Get audio file
    const audioFile = zip.file(`cards/${filename}`);
    if (!audioFile) {
      console.warn(`Missing audio file for card ${card.id}: ${filename}`);
      continue;
    }

    const audioBlob = await audioFile.async('blob');

    // Validate audio is playable
    try {
      await validateAudioBlob(audioBlob);
    } catch (error) {
      console.warn(`Invalid audio for card ${card.id}:`, error);
      continue;
    }

    // Save to IndexedDB
    await saveCard(card);
    await saveAudio(card.id, audioBlob);

    cards.push(card);
  }

  if (cards.length === 0) {
    throw new Error('No valid cards found in ZIP');
  }

  // Save project metadata
  await saveProject(exportData.project);

  // Save settings
  const settings = exportData.settings || { theme: 'light' };
  await saveSettings(settings);

  onProgress?.('Import complete!');

  return { cards, settings };
}

async function validateAudioBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.addEventListener('loadedmetadata', () => {
      if (audio.duration > 0) {
        resolve();
      } else {
        reject(new Error('Audio duration is 0'));
      }
    });
    audio.addEventListener('error', () => {
      reject(new Error('Failed to load audio'));
    });
    audio.src = URL.createObjectURL(blob);
  });
}
