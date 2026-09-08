from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium
from PIL import Image, ImageDraw
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / "output" / "pdf" / "StyledGenie_Implementation_Roadmap.pdf"
RENDER_DIR = ROOT / "tmp" / "pdfs" / "rendered"
RENDER_DIR.mkdir(parents=True, exist_ok=True)

reader = PdfReader(str(PDF))
assert len(reader.pages) >= 10, f"Unexpectedly short PDF: {len(reader.pages)} pages"
assert reader.metadata.title == "StyledGenie Complete Implementation Roadmap"

with pdfplumber.open(str(PDF)) as doc:
    extracted = "\n".join((page.extract_text() or "") for page in doc.pages)

required = [
    "72 implementation items",
    "Demo-ready",
    "Secure single-store production",
    "Public Shopify SaaS",
    "W1 - Release stabilization",
    "W8 - Privacy, commercial readiness, and launch",
    "Final definition of done",
]
missing = [phrase for phrase in required if phrase not in extracted]
assert not missing, f"Missing expected report text: {missing}"

pdf = pdfium.PdfDocument(str(PDF))
thumbs = []
for index in range(len(pdf)):
    page = pdf[index]
    image = page.render(scale=1.35).to_pil().convert("RGB")
    page_path = RENDER_DIR / f"page-{index + 1:02d}.png"
    image.save(page_path)
    thumb = image.copy()
    thumb.thumbnail((390, 550))
    thumbs.append((index + 1, thumb))

for start in range(0, len(thumbs), 4):
    group = thumbs[start:start + 4]
    sheet = Image.new("RGB", (820, 1160), "#D9DEEA")
    draw = ImageDraw.Draw(sheet)
    for offset, (page_num, thumb) in enumerate(group):
        x = 10 + (offset % 2) * 405
        y = 10 + (offset // 2) * 570
        sheet.paste(thumb, (x, y + 20))
        draw.text((x + 4, y + 3), f"Page {page_num}", fill="#17233C")
    sheet.save(RENDER_DIR / f"contact-{start + 1:02d}-{start + len(group):02d}.png")

print(f"pages={len(reader.pages)}")
print(f"characters={len(extracted)}")
print(f"rendered_pages={len(thumbs)}")
print(f"contact_sheets={(len(thumbs) + 3) // 4}")
