import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compositeImagesAsync, generateImageAsync, generateImageBackgroundAsync } from '@expo/image-utils';

// Export the supplied artwork without redrawing it. Expo's existing image tools
// preserve its proportions and transparency while preparing platform sizes.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, 'assets/spotit');
const source = join(output, 'brand-symbol.png');

async function exportMark(name, canvasSize, markHeight, background) {
  const markWidth = Math.round(markHeight * 473 / 553);
  const { source: foreground } = await generateImageAsync({ projectRoot: root }, {
    src: source, width: markWidth, height: markHeight, resizeMode: 'contain', backgroundColor: 'transparent',
  });
  const canvas = await generateImageBackgroundAsync({
    width: canvasSize, height: canvasSize, resizeMode: 'contain', backgroundColor: background,
  });
  const image = await compositeImagesAsync({
    foreground, background: canvas,
    x: Math.round((canvasSize - markWidth) / 2), y: Math.round((canvasSize - markHeight) / 2),
  });
  const destination = join(output, name);
  await writeFile(destination, image);
  if (background !== 'transparent') {
    // Explicit RGB output is required for iOS: compositing alone can leave
    // near-opaque alpha values along the antialiased edges.
    const { source: opaqueImage } = await generateImageAsync({ projectRoot: root }, {
      src: destination, width: canvasSize, height: canvasSize,
      resizeMode: 'contain', backgroundColor: background, removeTransparency: true,
    });
    await writeFile(destination, opaqueImage);
  }
  console.log(`${name}: ${canvasSize} x ${canvasSize}, symbol height ${markHeight}`);
}

await mkdir(output, { recursive: true });
// app-icon-1024.png is supplied as finished artwork and used as-is.
// Keep the entire mark within Android's central 66/108 safe circle.
await exportMark('adaptive-icon-foreground.png', 1024, 600, 'transparent');
await exportMark('splash-mark.png', 1024, 840, 'transparent');
await exportMark('favicon.png', 256, 224, 'transparent');
