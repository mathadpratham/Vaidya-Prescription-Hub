// Pseudo-QR SVG generator — visually QR-like, useful for ID badges in demos.
// Not a scannable QR code; replace with a real QR lib when needed.
export function generatePseudoQrSvg(text: string, size = 140): string {
  const cell = 5;
  const cols = Math.floor(size / cell);
  const seed = text.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const rand = (i: number) =>
    ((seed * 1103515245 + i * 12345) & 0x7fffffff) % 2 === 0;

  let html = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" style="display:block;">`;
  html += `<rect width="${size}" height="${size}" fill="white"/>`;
  for (let r = 0; r < cols; r++) {
    for (let c = 0; c < cols; c++) {
      const isCorner =
        (r < 7 && c < 7) ||
        (r < 7 && c >= cols - 7) ||
        (r >= cols - 7 && c < 7);
      const isCornerInner =
        (r >= 2 && r < 5 && c >= 2 && c < 5) ||
        (r >= 2 && r < 5 && c >= cols - 5 && c < cols - 2) ||
        (r >= cols - 5 && r < cols - 2 && c >= 2 && c < 5);
      let filled = false;
      if (isCorner) filled = !(r === 1 || r === 5 || c === 1 || c === 5);
      else if (isCornerInner) filled = true;
      else filled = rand(r * cols + c + seed);
      if (filled)
        html += `<rect x="${c * cell}" y="${
          r * cell
        }" width="${cell}" height="${cell}" fill="#0F1C18"/>`;
    }
  }
  html += "</svg>";
  return html;
}

export function patientInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0]!.toUpperCase())
    .join("")
    .slice(0, 2);
}
