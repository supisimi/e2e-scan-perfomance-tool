export type BarcodeType = 'start' | 'parcel' | 'pallet' | 'ceiling' | 'unknown';

export interface BarcodePrefixRule {
  type: Exclude<BarcodeType, 'unknown'>;
  prefix: string;
  caseSensitive?: boolean;
}

export interface BarcodeRegexRule {
  type: Exclude<BarcodeType, 'unknown'>;
  pattern: RegExp;
}

export interface BarcodeClassificationSettings {
  prefixRules: BarcodePrefixRule[];
  regexRules: BarcodeRegexRule[];
  normalizeToUpperCase: boolean;
}

export interface BarcodeClassificationResult {
  type: BarcodeType;
  normalizedValue: string;
  characterCount: number;
  matchedBy: 'manual' | 'prefix' | 'regex' | 'unknown';
  matchedRule?: string;
}

export interface ClassifyBarcodeOptions {
  settings?: BarcodeClassificationSettings;
  manualOverride?: BarcodeType;
}

export const DEFAULT_BARCODE_CLASSIFICATION_SETTINGS: BarcodeClassificationSettings = {
  normalizeToUpperCase: true,
  prefixRules: [
    { type: 'start', prefix: 'START-' },
    { type: 'parcel', prefix: 'PARCEL-' },
    { type: 'pallet', prefix: 'PALLET-' },
    { type: 'ceiling', prefix: 'CEILING-' },
  ],
  regexRules: [
    { type: 'start', pattern: /^START[-_:/].+/i },
    { type: 'parcel', pattern: /^PARCEL[-_:/].+/i },
    { type: 'pallet', pattern: /^PALLET[-_:/].+/i },
    { type: 'ceiling', pattern: /^CEILING[-_:/].+/i },
  ],
};

function normalizeScannedValue(rawValue: string, normalizeToUpperCase: boolean) {
  const trimmed = rawValue.trim().replace(/[\r\n]+/g, '');
  return normalizeToUpperCase ? trimmed.toUpperCase() : trimmed;
}

function prefixMatches(value: string, rule: BarcodePrefixRule) {
  if (rule.caseSensitive) {
    return value.startsWith(rule.prefix);
  }

  return value.toUpperCase().startsWith(rule.prefix.toUpperCase());
}

export function classifyBarcodeType(
  rawValue: string,
  options: ClassifyBarcodeOptions = {}
): BarcodeClassificationResult {
  const settings = options.settings ?? DEFAULT_BARCODE_CLASSIFICATION_SETTINGS;
  const normalizedValue = normalizeScannedValue(rawValue, settings.normalizeToUpperCase);
  const characterCount = normalizedValue.length;

  if (options.manualOverride && options.manualOverride !== 'unknown') {
    return {
      type: options.manualOverride,
      normalizedValue,
      characterCount,
      matchedBy: 'manual',
      matchedRule: options.manualOverride,
    };
  }

  for (const prefixRule of settings.prefixRules) {
    if (prefixMatches(normalizedValue, prefixRule)) {
      return {
        type: prefixRule.type,
        normalizedValue,
        characterCount,
        matchedBy: 'prefix',
        matchedRule: prefixRule.prefix,
      };
    }
  }

  for (const regexRule of settings.regexRules) {
    if (regexRule.pattern.test(normalizedValue)) {
      return {
        type: regexRule.type,
        normalizedValue,
        characterCount,
        matchedBy: 'regex',
        matchedRule: regexRule.pattern.source,
      };
    }
  }

  return {
    type: 'unknown',
    normalizedValue,
    characterCount,
    matchedBy: 'unknown',
  };
}
