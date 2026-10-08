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

/** Точка мира (начало — центр поля) в координатах окна для окна width × height. */
export function worldToScreen(x: number, y: number, width: number, height: number, layout: Layout): { x: number; y: number } {
  const d = DESIGN[layout];
  const f = fitDesign(width, height, layout);
  return { x: f.x + (x + d.w / 2) * f.scale, y: f.y + (y + d.h / 2) * f.scale };
}

/** Обратное worldToScreen: точка окна → координаты мира. */
export function screenToWorld(sx: number, sy: number, width: number, height: number, layout: Layout): { x: number; y: number } {
  const d = DESIGN[layout];
  const f = fitDesign(width, height, layout);
  return { x: (sx - f.x) / f.scale - d.w / 2, y: (sy - f.y) / f.scale - d.h / 2 };
}

/** Полоса опыта: отступ от верхнего края поля и высота, точки дизайна (вёрстка, не баланс). */
export const XP_BAR = { top: 12, height: 28 } as const;
