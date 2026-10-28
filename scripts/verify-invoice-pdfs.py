from pathlib import Path
from pypdf import PdfReader

root = Path('build/invoice-qa')
texts = {}
for path in root.glob('*.pdf'):
    pdf = PdfReader(path)
    texts[path.name] = '\n'.join(p.extract_text() for p in pdf.pages)
    for number, page in enumerate(pdf.pages, 1):
        text = page.extract_text()
        assert f'{number} / {len(pdf.pages)}' in text
        assert 'QA INVOICE FOOTER' in text
    for secret in ['PRIVATE_COST', 'PRIVATE_PROJECT_NOTES', 'PRIVATE_PAYMENT_NOTE']:
        assert secret not in texts[path.name]
    print(f'{path.name}: {len(pdf.pages)} pages; privacy, footer and page counts checked')

assert 'DRAFT' in texts['non-vat-draft.pdf']
assert 'VAT INVOICE' not in texts['non-vat-draft.pdf']
assert 'No VAT charged' in texts['non-vat-draft.pdf']
assert 'VAT INVOICE INV-QA-0001' in texts['vat-invoice.pdf']
for text in ['Standard 20%', 'Reduced 5%', 'Zero-rated 0%', 'Exempt', 'Outside scope', 'BANK_OPT_IN', 'PAYMENT_OPT_IN', 'Different QA site address', 'Circuit 38']:
    assert text in texts['vat-invoice.pdf'], text
for name in ['non-vat-draft.pdf', 'balance-summary.pdf']:
    assert 'BANK_OPT_IN' not in texts[name]
    assert 'PAYMENT_OPT_IN' not in texts[name]
assert 'Original invoice: INV-QA-0001' in texts['credit-note.pdf']
assert 'CN-QA-0001' in texts['credit-note.pdf']
assert 'not verified bank receipts' in texts['balance-summary.pdf']
print('VAT treatment separation, draft/non-VAT labels, opt-in payment information and credit linkage checked.')
