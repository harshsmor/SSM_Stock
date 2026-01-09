export const DENSITY = {
    STEEL: 7.85, // g/cm3
};

export const SCRAP_TYPES = [
    'Melting_Chips',
    'Plate_Skeleton',
    'Offcuts',
] as const;

export type ScrapType = typeof SCRAP_TYPES[number];

export const MATERIAL_TYPES = [
    'MS Plate',
    'MS Circle',
    'Billet',
] as const;
