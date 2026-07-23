// Some models emit citations in their own internal annotation glyph style —
// e.g. "【1†source】" — instead of the plain "[1]" they were instructed to
// use, regardless of prompt wording (unreliable to fix with instructions
// alone). Normalize to "[n]" wherever citation text is parsed or rendered,
// so both old and newly-generated messages display correctly either way.
export function normalizeCitations(text: string): string {
  return text.replace(/【\s*(\d+)[^】]*】/g, "[$1]");
}
