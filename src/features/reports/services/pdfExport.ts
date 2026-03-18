import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export async function exportElementToPdf(element: HTMLElement, fileName: string) {
  const canvas = await html2canvas(element, { scale: 2 });
  const imageData = canvas.toDataURL('image/png');

  const document = new jsPDF({
    orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [canvas.width, canvas.height],
  });

  document.addImage(imageData, 'PNG', 0, 0, canvas.width, canvas.height);
  document.save(fileName);
}
