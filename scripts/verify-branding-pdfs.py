from pathlib import Path
from pypdf import PdfReader

root = Path('build/branding-qa')
readers = {p.name: PdfReader(p) for p in root.glob('*.pdf')}
texts = {name: '\n'.join(page.extract_text() for page in reader.pages) for name, reader in readers.items()}
assert len(readers) == 8
for name, reader in readers.items():
    assert str(reader.trailer['/Root']['/Version']) == '/1.4', name
    for number, page in enumerate(reader.pages, 1):
        content = page.extract_text()
        assert f'{number} / {len(reader.pages)}' in content, name
        if name != 'text-only.pdf':
            assert 'QA FOOTER' in content, name
            assert len(page.images) > 0, name
    print(f'{name}: {len(reader.pages)} pages; header/footer/page numbers verified')
for name in ['transparent-quote.pdf','client-materials.pdf','internal-materials.pdf','calculation-report.pdf','text-calculation-report.pdf','portrait-logo.pdf']:
    assert 'BANK_QA_ONLY' not in texts[name], name
    assert 'PAYMENT_QA_ONLY' not in texts[name], name
assert 'BANK_QA_ONLY' in texts['branded-estimate.pdf']
assert 'PAYMENT_QA_ONLY' in texts['branded-estimate.pdf']
assert 'PHONE_QA_ONLY' not in texts['branded-estimate.pdf']
assert 'office@example.com' not in texts['branded-estimate.pdf']
assert 'CUSTOMER_EMAIL_QA' not in texts['branded-estimate.pdf']
for field in ['PRIVATE_SUPPLIER','PRIVATE_LIST_NOTES','PRIVATE_ITEM_NOTES','Purchased']:
    assert field not in texts['client-materials.pdf'], field
    assert field in texts['internal-materials.pdf'], field
for field in ['PRIVATE_UID','PRIVATE_HISTORY_ID','PRIVATE_COST','PRIVATE_RESULT_NOTES','PRIVATE_PROJECT_NOTES']:
    assert field not in texts['calculation-report.pdf'], field
assert len(readers['text-only.pdf'].pages[0].images) == 0
assert 'Text Header Business' in texts['text-only.pdf']
logo = readers['transparent-quote.pdf'].pages[0].images[0].image
assert logo.mode == 'RGBA'
assert logo.getpixel((0, 0))[3] == 0
assert 'Circuit 35' in texts['transparent-quote.pdf']
assert '2,087.16' in texts['transparent-quote.pdf']
print('Privacy matrix, opt-in details, transparent logo alpha, final pricing and no-logo fallback verified.')
