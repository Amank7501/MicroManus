import "server-only";
import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";

const PAGE_WIDTH = 595.28; // A4 at 72dpi
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const TEXT_COLOR = rgb(0.1, 0.1, 0.1);

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function generateReportPdf(title: string, markdown: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function ensureSpace(lineHeight: number) {
    if (y - lineHeight < MARGIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  function drawParagraph(text: string, size: number, useFont: PDFFont, gapAfter: number) {
    const lines = wrapText(stripInlineMarkdown(text), useFont, size, CONTENT_WIDTH);
    for (const line of lines) {
      ensureSpace(size + 4);
      page.drawText(line, { x: MARGIN, y, size, font: useFont, color: TEXT_COLOR });
      y -= size + 4;
    }
    y -= gapAfter;
  }

  drawParagraph(title, 20, boldFont, 4);
  drawParagraph(new Date().toLocaleDateString(), 10, font, 14);

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trimEnd();

    if (line.trim() === "") {
      y -= 8;
      continue;
    }

    if (line.startsWith("### ")) {
      drawParagraph(line.slice(4), 12, boldFont, 5);
    } else if (line.startsWith("## ")) {
      drawParagraph(line.slice(3), 14, boldFont, 6);
    } else if (line.startsWith("# ")) {
      drawParagraph(line.slice(2), 16, boldFont, 8);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      const bulletLines = wrapText(stripInlineMarkdown(line.slice(2)), font, 11, CONTENT_WIDTH - 16);
      bulletLines.forEach((bulletLine, i) => {
        ensureSpace(15);
        if (i === 0) {
          page.drawText("•", { x: MARGIN, y, size: 11, font, color: TEXT_COLOR });
        }
        page.drawText(bulletLine, { x: MARGIN + 14, y, size: 11, font, color: TEXT_COLOR });
        y -= 15;
      });
      y -= 2;
    } else {
      drawParagraph(line, 11, font, 6);
    }
  }

  return doc.save();
}
