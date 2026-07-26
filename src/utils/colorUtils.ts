export async function extractDominantColors(imageUrl: string, maxColors: number = 3): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve([]);

      // Scale down for performance
      const MAX_DIM = 100;
      let width = img.width;
      let height = img.height;
      
      if (width > height) {
        if (width > MAX_DIM) {
          height *= MAX_DIM / width;
          width = MAX_DIM;
        }
      } else {
        if (height > MAX_DIM) {
          width *= MAX_DIM / height;
          height = MAX_DIM;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      const imageData = ctx.getImageData(0, 0, width, height).data;
      const colorCounts: Record<string, number> = {};
      const allColorCounts: Record<string, number> = {};

      for (let i = 0; i < imageData.length; i += 4) {
        const r = imageData[i];
        const g = imageData[i + 1];
        const b = imageData[i + 2];
        const a = imageData[i + 3];

        // Skip highly transparent pixels
        if (a < 128) continue;

        // Quantize colors to group similar ones (multiples of 16)
        const qR = Math.round(r / 16) * 16;
        const qG = Math.round(g / 16) * 16;
        const qB = Math.round(b / 16) * 16;
        
        const hex = rgbToHex(Math.min(255, qR), Math.min(255, qG), Math.min(255, qB));
        allColorCounts[hex] = (allColorCounts[hex] || 0) + 1;

        // Filter out near white and near black to find the actual brand colors
        if (qR > 240 && qG > 240 && qB > 240) continue;
        if (qR < 20 && qG < 20 && qB < 20) continue;
        
        colorCounts[hex] = (colorCounts[hex] || 0) + 1;
      }

      // Sort by frequency
      let sortedColors = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]);
      
      // If no colors found (e.g., logo is purely black/white), fallback to all colors
      if (sortedColors.length === 0) {
         sortedColors = Object.entries(allColorCounts).sort((a, b) => b[1] - a[1]);
      }

      // Filter out similar colors to get distinct brand colors
      const distinctColors: string[] = [];
      for (const [hex] of sortedColors) {
        if (distinctColors.length >= maxColors) break;
        
        const isTooSimilar = distinctColors.some(existingHex => colorDistance(hex, existingHex) < 60);
        if (!isTooSimilar) {
          distinctColors.push(hex);
        }
      }

      resolve(distinctColors);
    };
    
    img.onerror = () => resolve([]);
    img.src = imageUrl;
  });
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

function colorDistance(hex1: string, hex2: string) {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  // Euclidean distance in RGB space
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) + 
    Math.pow(c1.g - c2.g, 2) + 
    Math.pow(c1.b - c2.b, 2)
  );
}
