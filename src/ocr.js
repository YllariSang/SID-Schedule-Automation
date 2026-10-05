/** Turn tesseract's TSV stream into the word boxes the watcher reasons about. */
export function parseTsv(value) {
  return value
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split("\t"))
    .filter((columns) => columns.length >= 12 && columns[11].trim())
    .map((columns) => ({
      left: Number(columns[6]),
      top: Number(columns[7]),
      width: Number(columns[8]),
      height: Number(columns[9]),
      confidence: Number(columns[10]),
      text: columns[11].trim(),
    }));
}
