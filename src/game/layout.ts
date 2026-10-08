export type Layout = 'landscape' | 'portrait';

/** Размеры поля в точках дизайна: горизонтальная и вертикальная раскладки. */
export const DESIGN: Record<Layout, { w: number; h: number }> = {
  landscape: { w: 1280, h: 720 },
  portrait: { w: 720, h: 1280 },
};

/** Раскладку выбирает соотношение сторон окна, а не тип устройства. */
export function layoutFor(width: number, height: number): Layout {
  return width >= height ? 'landscape' : 'portrait';
}

/** Масштаб и сдвиг, чтобы поле дизайна целиком вписалось в окно и стояло по центру. */
export function fitDesign(width: number, height: number, layout: Layout): { scale: number; x: number; y: number } {
  const d = DESIGN[layout];
  const scale = Math.min(width / d.w, height / d.h);
  return { scale, x: (width - d.w * scale) / 2, y: (height - d.h * scale) / 2 };
}
