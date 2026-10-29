import requests, re

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
r = requests.get('https://www.apple.com/in/iphone-16-pro/', headers=headers, timeout=10)
matches = re.findall(r'(https://[^\s"\'<>]*(?:desert|titanium|16_pro|16pro)[^\s"\'<>]*(?:\.png|\.jpg|\.jpeg|fmt=[a-z]+))', r.text, re.IGNORECASE)

print(f"Total matches: {len(matches)}")
for m in set(matches[:20]):
    print("MATCH:", m)
