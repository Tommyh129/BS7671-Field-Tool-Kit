import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function downloadFile(dataUrl: string, fileName: string, mimeType: string) {
  if (Capacitor.isNativePlatform()) {
    try {
      // Extract base64 data
      const base64Data = dataUrl.split(',')[1];
      
      // Save to temporary directory
      const savedFile = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache,
      });

      // Share the file
      await Share.share({
        title: fileName,
        url: savedFile.uri,
      });
    } catch (error) {
      console.error('Error saving/sharing file on mobile:', error);
      throw error;
    }
  } else {
    // Web fallback
    const link = document.createElement('a');
    link.download = fileName;
    link.href = dataUrl;
    link.click();
  }
}
