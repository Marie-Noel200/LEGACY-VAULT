import glob, os

files = glob.glob('public/*.html')
total = 0
for f in files:
    c = open(f, encoding='utf-8', errors='ignore').read()
    orig = c
    # Fix score circle text - should be white not var(--bg)
    c = c.replace('color:var(--bg);line-height:1', 'color:#fff;line-height:1')
    c = c.replace('color:rgba(2,7,16,.7);font-weight:700', 'color:rgba(255,255,255,.7);font-weight:700')
    # Fix step circle text
    c = c.replace('color:var(--bg);font-size:.72rem;font-weight:800', 'color:#fff;font-size:.72rem;font-weight:800')
    # Fix avatar text on gradient
    c = c.replace('color:var(--bg);font-weight:800;font-size:1.1rem', 'color:#fff;font-weight:800;font-size:1.1rem')
    c = c.replace('color:var(--bg);font-weight:800;font-size:.8rem', 'color:#fff;font-weight:800;font-size:.8rem')
    # Fix filter button active text
    c = c.replace('color:var(--bg);border-color:transparent', 'color:#fff;border-color:transparent')
    if c != orig:
        open(f, 'w', encoding='utf-8').write(c)
        total += 1
        print('Fixed:', os.path.basename(f))
print('Total:', total)
