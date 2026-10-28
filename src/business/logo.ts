export const MAX_LOGO_BYTES = 5 * 1024 * 1024;
export async function validateLogoFile(
  file: Blob
): Promise<"image/png" | "image/jpeg"> {
  if (!file.size || file.size > MAX_LOGO_BYTES)
    throw Error("Choose a PNG or JPEG logo no larger than 5 MB.");
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const type = png ? "image/png" : jpeg ? "image/jpeg" : null;
  if (!type || (file.type && file.type !== type))
    throw Error("The logo must be a valid PNG or JPEG image.");
  return type;
}
export async function optimiseLogo(file: Blob): Promise<Blob> {
  const type = await validateLogoFile(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw Error(
        "This logo could not be decoded. Choose another PNG or JPEG."
      );
    }
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 40_000_000
    )
      throw Error(
        "Logo dimensions are too large. Choose an image under 40 megapixels."
      );
    const scale = Math.min(
      1,
      1200 / Math.max(image.naturalWidth, image.naturalHeight)
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("Image processing is unavailable on this device.");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(Error("Logo optimisation failed.")),
        type,
        0.9
      )
    );
    if (result.size > MAX_LOGO_BYTES)
      throw Error("The optimised logo is too large. Choose a smaller image.");
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}
