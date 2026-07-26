
const fs = require('fs');
const path = 'c:\\Users\\guima\\Downloads\\n8n-controller\\src\\components\\ImageGeneratorPanel.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Substituir handler do Combo
const comboRegex = /<input type="file" ref=\{comboInputRef\} multiple onChange=\{\(e\) => \{[\s\S]*?\}\} className="hidden" accept="image\/\*" \/>/;
const comboReplacement = `<input type="file" ref={comboInputRef} multiple onChange={async (e) => {
                                    if (e.target.files) {
                                      const files = Array.from(e.target.files);
                                      setErrorMessage(null);
                                      try {
                                        const results = await Promise.all(files.map(async file => {
                                          const compressed = await compressImage(file);
                                          return { url: \`data:image/jpeg;base64,\${compressed.data}\`, data: compressed.data, mimeType: 'image/jpeg' };
                                        }));
                                        setComboRefImages(prev => [...prev, ...results].slice(0, 3));
                                      } catch (err) {
                                        setErrorMessage("Erro ao processar imagens.");
                                      }
                                    }
                                 }} className="hidden" accept="image/*" />`;

content = content.replace(comboRegex, comboReplacement);

// 2. Substituir handler do Logo
const logoRegex = /<input type="file" ref=\{logoInputRef\} onChange=\{\(e\) => \{[\s\S]*?\}\} className="hidden" accept="image\/\*" \/>/;
const logoReplacement = `<input type="file" ref={logoInputRef} onChange={async (e) => {
                                     const file = e.target.files?.[0];
                                     if (file) {
                                         setErrorMessage(null);
                                         try {
                                           const compressed = await compressImage(file);
                                           setLogo({ url: \`data:image/jpeg;base64,\${compressed.data}\`, data: compressed.data, mimeType: 'image/jpeg' });
                                         } catch (err) {
                                           setErrorMessage("Erro ao processar logotipo.");
                                         }
                                     }
                                 }} className="hidden" accept="image/*" />`;

content = content.replace(logoRegex, logoReplacement);

fs.writeFileSync(path, content);
console.log('Successfully updated ImageGeneratorPanel.tsx');
