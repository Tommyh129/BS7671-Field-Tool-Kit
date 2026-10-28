export {
  quotePdf,
  materialsPdf,
  snapshotPdf,
  clientTechnicalData,
} from "./documents";

export async function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(blob);
  });
}
