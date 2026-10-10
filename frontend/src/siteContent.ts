export type { SiteContent } from '../../backend/src/site-schema';
export const categories = ['Entradas', 'Platos Principales', 'Especialidades', 'Bebidas', 'Postres'] as const;
export function cmsImage(path: string, preview = false) { return preview ? path.replace('/api/v1/public/cms/media/', '/api/v1/admin/cms/media/') : path; }
