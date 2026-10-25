import { optimise } from '@jsquash/oxipng';
import { optimize } from 'svgo/browser';

const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();

self.onmessage = async (event) => {
  const { id, kind, bytes, level } = event.data;
  try {
    let optimized;
    if (kind === 'png') {
      // OxiPNG lossless; do not change colors hidden beneath fully transparent pixels.
      optimized = new Uint8Array(await optimise(bytes, {
        level,
        interlace: false,
        optimiseAlpha: false
      }));
    } else if (kind === 'svg') {
      const source = decoder.decode(bytes);
      // Conservative visual optimization: preserve element attributes, text,
      // paths, numeric geometry, and rendering-sensitive SVG constructs.
      const result = optimize(source, {
        multipass: false,
        plugins: ['removeComments', 'removeDoctype', 'removeXMLProcInst']
      });
      optimized = encoder.encode(result.data);
    } else {
      throw new Error('Optimizer untuk format ini tidak tersedia.');
    }
    const buffer = optimized.buffer.slice(
      optimized.byteOffset,
      optimized.byteOffset + optimized.byteLength
    );
    self.postMessage({ id, success: true, bytes: buffer }, [buffer]);
  } catch (error) {
    self.postMessage({ id, success: false, error: error?.message || 'File tidak dapat dioptimalkan.' });
  }
};
