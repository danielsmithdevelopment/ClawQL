/** Monochrome 20×20 SVG icons (OpenAI sidebar template: currentColor, 1.33px strokes). */

function svgIcon(paths: string): { src: string; mimeType: string; sizes: string[] } {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  return {
    src: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    mimeType: "image/svg+xml",
    sizes: ["20x20"],
  };
}

export const ICONS = {
  evidence: svgIcon('<path d="M4 3.5h12v13H4z"/><path d="M7 7h6M7 10h6M7 13h4"/>'),
  console: svgIcon(
    '<rect x="3" y="4" width="14" height="12" rx="1.5"/><path d="M6 8l2 2-2 2M10 12h4"/>'
  ),
  openFile: svgIcon('<path d="M5 3.5h6l4 4V16.5H5z"/><path d="M11 3.5V8h4"/>'),
  settings: svgIcon(
    '<circle cx="10" cy="10" r="2.5"/><path d="M10 3.5v1.5M10 15v1.5M3.5 10H5M15 10h1.5M5.5 5.5l1 1M13.5 13.5l1 1M5.5 14.5l1-1M13.5 6.5l1-1"/>'
  ),
  mentions: svgIcon('<circle cx="10" cy="10" r="6"/><path d="M10 7v6M7.5 10H10"/>'),
} as const;
