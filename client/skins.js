export const DEFAULT_SKIN_ID = "classic";

export const SKINS = [
  {
    id: "classic",
    label: "Classique",
    body: "#25d695",
    accent: "#7c5cff",
    hair: "#1f2330",
    outline: "#0b1020",
    namePlate: "#ecf3ff",
  },
  {
    id: "ember",
    label: "Braise",
    body: "#ff6b6b",
    accent: "#ffb84d",
    hair: "#4b1f1f",
    outline: "#2b0f10",
    namePlate: "#fff2ef",
  },
  {
    id: "mint",
    label: "Menthe",
    body: "#63e6be",
    accent: "#2dd4bf",
    hair: "#12352f",
    outline: "#0e1f1c",
    namePlate: "#effffb",
  },
  {
    id: "azure",
    label: "Azur",
    body: "#60a5fa",
    accent: "#a78bfa",
    hair: "#10213f",
    outline: "#0a1224",
    namePlate: "#eef5ff",
  },
  {
    id: "gold",
    label: "Or",
    body: "#f6c453",
    accent: "#f97316",
    hair: "#403013",
    outline: "#241b08",
    namePlate: "#fff9e8",
  },
  {
    id: "violet",
    label: "Violet",
    body: "#c084fc",
    accent: "#38bdf8",
    hair: "#2f1846",
    outline: "#190d24",
    namePlate: "#fbf5ff",
  },
];

export function normalizeSkinId(skinId) {
  const id = String(skinId || "").trim().toLowerCase();
  return SKINS.some((skin) => skin.id === id) ? id : DEFAULT_SKIN_ID;
}

export function defaultSkinId() {
  return DEFAULT_SKIN_ID;
}

export function skinById(skinId) {
  const id = normalizeSkinId(skinId);
  return SKINS.find((skin) => skin.id === id) || SKINS[0];
}
