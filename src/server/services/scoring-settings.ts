import "server-only";
import { DEFAULT_SCORING_CONFIG, readScoringConfig, scoringSettingsSchema } from "@/lib/scoring/config";
import {
  deactivateScoringConfigs,
  getActiveScoringConfig,
  saveScoringConfig,
} from "@/server/repositories/job-analysis";

export async function getScoringSettings(userId: string) {
  const config = readScoringConfig(await getActiveScoringConfig(userId));
  return { ...config, isDefault: config.version === 0, defaults: DEFAULT_SCORING_CONFIG };
}

/** Saves the settings as a new version; Fit analyses record which version they used. */
export async function saveScoringSettings(userId: string, input: unknown) {
  const settings = scoringSettingsSchema.parse(input);
  const saved = await saveScoringConfig(userId, settings);
  return saved.version;
}

export async function resetScoringSettings(userId: string) {
  await deactivateScoringConfigs(userId);
}
