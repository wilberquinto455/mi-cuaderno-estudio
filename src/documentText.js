export async function extractStudyText(file) {
  if (file.size > 20 * 1024 * 1024) throw new Error('Para indexar, el archivo debe pesar menos de 20 MB.');
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'txt' || extension === 'md') return (await file.text()).slice(0, 500_000);
  if (extension !== 'pdf') throw new Error('El buscador admite PDF, TXT y MD por ahora. El archivo se puede guardar, pero no indexar.');

  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
  GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const pdf = await getDocument({ data: await file.arrayBuffer() }).promise;
  if (pdf.numPages > 250) throw new Error('El PDF supera el límite de 250 páginas para indexarlo de una vez.');
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => ('str' in item ? item.str : '')).join(' '));
  }
  const text = pages.join('\n\n').trim();
  if (!text) throw new Error('No encontré texto seleccionable. Si es un PDF escaneado como imagen, necesitará OCR.');
  return text.slice(0, 500_000);
}

export function splitIntoChunks(text, size = 1400, overlap = 180) {
  const clean = text.replace(/\u0000/g, '').replace(/\r/g, '').trim();
  const chunks = [];
  let start = 0;
  while (start < clean.length && chunks.length < 80) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      const boundary = clean.lastIndexOf(' ', end);
      if (boundary > start + size * 0.65) end = boundary;
    }
    const part = clean.slice(start, end).trim();
    if (part) chunks.push(part);
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}
