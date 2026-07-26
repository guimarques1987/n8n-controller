
/**
 * Comprime uma imagem usando Canvas para garantir que o arquivo seja leve (JPEG).
 * @param file Arquivo original do input file
 * @param maxWidth Largura máxima para redimensionamento (default 1200px)
 * @param quality Qualidade do JPEG (0 a 1, default 0.8)
 */
export const compressImage = (file: File, maxWidth = 800, quality = 0.5): Promise<{ data: string; mimeType: string; file: File }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context not available'));

        ctx.drawImage(img, 0, 0, width, height);
        
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const base64 = dataUrl.split(',')[1];
        
        // Converte de volta para File para manter compatibilidade com FormData se necessário
        fetch(dataUrl)
          .then(res => res.blob())
          .then(blob => {
            const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            resolve({ data: base64, mimeType: 'image/jpeg', file: compressedFile });
          });
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};
