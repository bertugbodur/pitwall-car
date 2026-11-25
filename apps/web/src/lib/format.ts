import type { Language } from '../i18n/index.ts';

const locale = (language: Language) => (language === 'tr' ? 'tr-TR' : 'en-GB');

export function num(value: number | undefined, language: Language, digits = 0): string {
  if (value === undefined || !Number.isFinite(value)) return '–';
  return value.toLocaleString(locale(language), { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export const money = (value: number, currency: string, language: Language): string =>
  new Intl.NumberFormat(locale(language), { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);

export const dateTime = (at: number, language: Language): string =>
  new Intl.DateTimeFormat(locale(language), { dateStyle: 'medium', timeStyle: 'short' }).format(at);

export function duration(seconds: number, language: Language): string {
  const total = Math.round(seconds / 60);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const [h, m] = language === 'tr' ? ['sa', 'dk'] : ['h', 'min'];
  return hours > 0 ? `${hours} ${h} ${minutes} ${m}` : `${minutes} ${m}`;
}

export function download(filename: string, type: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
