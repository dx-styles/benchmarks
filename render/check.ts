// Shared by every lane's ui: resolve a recipe's variant key and fail loudly on an
// unknown one, so a lane can never render unstyled elements silently.
import { DEFAULTS, RECIPE_KEYS } from "./catalog.gen";

const VALID: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(RECIPE_KEYS).map(([family, keys]) => [family, new Set(keys)]),
);

export const isRecipe = (slot: string): boolean => slot in VALID;

export const variantOf = (slot: string, variant: string | undefined): string => {
  const key = variant ?? DEFAULTS[slot]!;
  if (!VALID[slot]?.has(key)) throw new Error(`unknown variant ${slot}.${key}`);
  return key;
};
