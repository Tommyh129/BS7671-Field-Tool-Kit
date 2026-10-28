from pathlib import Path
from pypdf import PdfReader
import pdfplumber
import pypdfium2 as pdfium

root = Path('build/rams-qa')
for name in ['draft', 'issued', 'no-logo']:
    path = root / (name + '.pdf')
    reader = PdfReader(path)
    text = '\n'.join(page.extract_text() for page in reader.pages)
    assert 'PRIVATE_BANK_SENTINEL' not in text
    assert ('DRAFT' in text) == (name != 'issued')
    assert "Prepared using The Sparky's Mate" in text
    if name != 'no-logo':
        assert len(reader.pages) >= 10
        assert len(reader.pages[0].images) > 0
        assert 'QA briefing record' in text
        assert 'QA task 16' in text
        assert reader.pages[0].images[0].image.mode == 'RGBA'
    else:
        assert len(reader.pages[0].images) == 0
    with pdfplumber.open(path) as pdf:
        for index, page in enumerate(pdf.pages, 1):
            content = page.extract_text() or ''
            assert f'{index} / {len(pdf.pages)}' in content, (name, index)
            for char in page.chars:
                assert -1 <= char['x0'] <= char['x1'] <= page.width + 1, (name, index, char)
                assert -1 <= char['top'] <= char['bottom'] <= page.height + 1, (name, index, char)
            if 'QA user-provided assessment text' in content or 'QA user-authored control text.' in content:
                assert 'Assessment field' in content and 'User assessment' in content, (name, index)
    doc = pdfium.PdfDocument(str(path))
    for index in sorted({0, len(doc)//2, len(doc)-1}):
        doc[index].render(scale=1.3).to_pil().save(root / f'{name}-page-{index+1}.png')
    print(f'{name}: {len(reader.pages)} pages, page bounds, repeating headings, watermark, branding and privacy checked')
