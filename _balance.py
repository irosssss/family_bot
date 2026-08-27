import re
with open(r'C:/Users/poddu/Downloads/ассеты для бота/family_bot/src/components/ShopAndRewardsModal.tsx', 'rb') as f:
    data = f.read()
text = data.decode('utf-8')

# Remove strings and comments for accurate count
# Remove /* ... */ block comments
text_nc = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
# Remove // line comments
text_nc = re.sub(r'//[^\n]*', '', text_nc)
# Remove strings (single, double, backtick) - naive but OK
text_nc = re.sub(r"'(?:[^'\\]|\\.)*'", "''", text_nc)
text_nc = re.sub(r'"(?:[^"\\]|\\.)*"', '""', text_nc)
text_nc = re.sub(r"`(?:[^`\\]|\\.)*`", "``", text_nc, flags=re.DOTALL)
# Remove JSX text content (anything between > and < that doesn't contain { or })
# Not perfectly safe but for counting braces OK

print('Brace counts:')
print('  {:', text_nc.count('{'))
print('  }:', text_nc.count('}'))
print('  (:', text_nc.count('('))
print('  ):', text_nc.count(')'))
print('  [:', text_nc.count('['))
print('  ]:', text_nc.count(']'))
print('  <:', text_nc.count('<'))
print('  >:', text_nc.count('>'))
print('  ;:', text_nc.count(';'))

# Count <div vs </div specifically
divs_open = len(re.findall(r'<div[\s>]', text_nc))
divs_close = text_nc.count('</div>')
print('  <div open (approx):', divs_open)
print('  </div> close:', divs_close)

# Look for the specific problem: find any standalone ");" that doesn't have a corresponding opening
# Actually let's just find the offsets of ");" in line 67
lines = text.split('\n')
ln67 = lines[66]
print('\n";" positions in line 67:')
for m in re.finditer(r';', ln67):
    print(f'  col {m.start()}: context={ln67[max(0,m.start()-30):m.start()+30]!r}')
print('\n")" positions in line 67:')
for m in re.finditer(r'\)', ln67):
    pass  # too many
