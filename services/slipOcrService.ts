import { Platform } from 'react-native';

import type { OCRResult, SlipOCRProvider } from '@/types/finance';

class MlKitSlipOCRProvider implements SlipOCRProvider {
  async recognize(imageUri: string): Promise<OCRResult> {
    const trimmedUri = imageUri.trim();
    if (!trimmedUri) throw new Error('Choose a slip image first.');
    if (Platform.OS === 'web') {
      throw new Error('On-device slip OCR is available in the Android or iOS Yoshioka build.');
    }

    try {
      const { default: MlkitOcr } = await import('rn-mlkit-ocr');
      const result = await MlkitOcr.recognizeText(trimmedUri, 'latin');
      const text = result.text?.trim() ?? '';
      if (!text) throw new Error('No readable text was found in this slip. Try a clearer photo.');
      return {
        text,
        blocks: result.blocks?.map((block) => ({ text: block.text })),
      };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      if (/native module|not linked|cannot find|undefined|null/i.test(message)) {
        throw new Error('Slip OCR needs the latest Yoshioka APK. Expo Go and older APK builds do not contain the on-device OCR module.');
      }
      throw caught;
    }
  }
}

let provider: SlipOCRProvider | undefined;

export function getSlipOCRProvider(): SlipOCRProvider {
  provider ??= new MlKitSlipOCRProvider();
  return provider;
}
