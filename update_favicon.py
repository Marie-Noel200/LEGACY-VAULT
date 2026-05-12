import glob

pages = glob.glob('public/*.html') + glob.glob('public/admin/*.html')

favicon_tag = '<link rel="icon" type="image/svg+xml" href="/img/favicon.svg">'

count = 0
for f in pages:
    with open(f, encoding='utf-8', errors='ignore') as fh:
        content = fh.read()
    # Add favicon if not present
    if 'favicon' not in content and '<head>' in content:
        content = content.replace('<head>', '<head>\n' + favicon_tag)
        with open(f, 'w', encoding='utf-8') as fh:
            fh.write(content)
        count += 1
        print('Added favicon: ' + f.split('\\')[-1].split('/')[-1])

print('Total updated:', count)
