// Sections of the fund's framework configuration (/settings/config?section=…).
export const CONFIG_SECTIONS = [
  ["tiers", "Source tiers"],
  ["conf", "Confidence rules"],
  ["suff", "Sufficiency rule"],
  ["quick", "Quick Screen questions"],
  ["prompts", "Collection Prompts"],
  ["counter", "Counter-Case Prompts"],
  ["dims", "Evaluation dimensions"],
  ["anchors", "Score anchors"],
  ["class", "Proceed / Watch / Pass"],
  ["versions", "Configuration versions"],
] as const;
export type ConfigSection = (typeof CONFIG_SECTIONS)[number][0];
export const DEFAULT_CONFIG_SECTION: ConfigSection = "prompts";

export function toConfigSection(value: string | null | undefined): ConfigSection {
  return CONFIG_SECTIONS.some(([key]) => key === value) ? (value as ConfigSection) : DEFAULT_CONFIG_SECTION;
}
