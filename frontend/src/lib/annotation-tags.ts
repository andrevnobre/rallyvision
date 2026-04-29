export type AnnotationTag = "tecnica" | "posicionamento" | "tatico" | "mental";

export const TAG_CFG: Record<AnnotationTag, { label: string; rgb: string }> = {
  tecnica:        { label: "Técnica",        rgb: "96,165,250"  },
  posicionamento: { label: "Posicionamento", rgb: "249,115,22"  },
  tatico:         { label: "Tático",         rgb: "168,85,247"  },
  mental:         { label: "Mental",         rgb: "34,197,94"   },
};

export const TAGS = Object.keys(TAG_CFG) as AnnotationTag[];
