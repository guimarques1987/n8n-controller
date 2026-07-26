export async function drawImageWithLogo(
  baseImageUrl: string,
  logoUrl: string | null,
  logoPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center',
  scale: number = 1
): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas not supported'));
      return;
    }

    const baseImage = new Image();
    baseImage.crossOrigin = 'anonymous';
    
    baseImage.onload = () => {
      canvas.width = baseImage.width * scale;
      canvas.height = baseImage.height * scale;

      // Draw base image
      ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);

      if (!logoUrl) {
        resolve(canvas.toDataURL('image/jpeg', 0.9));
        return;
      }

      const logoImage = new Image();
      logoImage.crossOrigin = 'anonymous';
      
      logoImage.onload = () => {
        // Calculate logo size (max 20% of canvas width)
        const maxLogoWidth = canvas.width * 0.20;
        const logoScale = Math.min(1, maxLogoWidth / logoImage.width);
        const logoWidth = logoImage.width * logoScale;
        const logoHeight = logoImage.height * logoScale;

        const padding = canvas.width * 0.05;
        let x = padding;
        let y = padding;

        switch (logoPosition) {
          case 'top-left':
            x = padding;
            y = padding;
            break;
          case 'top-right':
            x = canvas.width - logoWidth - padding;
            y = padding;
            break;
          case 'bottom-left':
            x = padding;
            y = canvas.height - logoHeight - padding;
            break;
          case 'bottom-right':
            x = canvas.width - logoWidth - padding;
            y = canvas.height - logoHeight - padding;
            break;
          case 'center':
            x = (canvas.width - logoWidth) / 2;
            y = (canvas.height - logoHeight) / 2;
            break;
        }

        // Optional: Add a subtle shadow to the logo for better visibility
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 5;

        // Set opacity to 50%
        ctx.globalAlpha = 0.5;
        ctx.drawImage(logoImage, x, y, logoWidth, logoHeight);
        ctx.globalAlpha = 1.0; // Reset opacity
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };
      
      logoImage.onerror = () => {
        console.error('Failed to load logo, returning base image');
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };
      
      logoImage.src = logoUrl;
    };
    
    baseImage.onerror = () => {
      reject(new Error('Failed to load base image'));
    };
    
    baseImage.src = baseImageUrl;
  });
}

export function downloadImage(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
