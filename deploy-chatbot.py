#!/usr/bin/env python3
import os

# Pages to add chatbot to (high priority first)
priority_pages = [
    'index.html',
    'about.html', 
    'contact.html',
    'blog.html',
    'resources.html',
    'marriage-education-cameroon.html',
    'marriage-education-africa.html',
    'marriage-education-for-men.html',
    'marriage-education-for-women.html',
    'why-marriages-fail.html',
    'sbd-campaign.html',
    'magazine.html',
    'rd-login.html',
    'rd-register.html',
    'rd-payment.html',
    'payment-success.html',
    'momo-manual-payment.html',
    'password-reset.html',
    'student-dashboard.html',
    'ambassador-dashboard.html',
    'rd-dashboard.html',
    'admin-dashboard.html',
    'enrollment.html',
    'checkout.html',
    'order-confirmation.html'
]

os.chdir('public')

added = []
skipped = []
errors = []

for page in priority_pages:
    if not os.path.exists(page):
        skipped.append(f'{page} (not found)')
        continue
    
    try:
        with open(page, 'r', encoding='utf-8') as f:
            content = f.read()
            
        if 'marriage-chatbot.js' in content:
            skipped.append(f'{page} (already has chatbot)')
            continue
            
        if '</body>' not in content:
            skipped.append(f'{page} (no </body> tag)')
            continue
        
        # Add chatbot before </body>
        inject = '\n  <!-- Marriage Education Chatbot -->\n  <script src="marriage-chatbot.js"></script>\n'
        content = content.replace('</body>', inject + '</body>', 1)
        
        with open(page, 'w', encoding='utf-8') as f:
            f.write(content)
            
        added.append(page)
    except Exception as e:
        errors.append(f'{page}: {str(e)}')

print(f'✅ Added chatbot to {len(added)} pages:')
for p in added:
    print(f'   - {p}')
    
if skipped:
    print(f'\n⏭️  Skipped {len(skipped)} pages:')
    for p in skipped[:10]:  # Show first 10
        print(f'   - {p}')
    if len(skipped) > 10:
        print(f'   ... and {len(skipped) - 10} more')
        
if errors:
    print(f'\n❌ Errors: {len(errors)}')
    for e in errors:
        print(f'   - {e}')

print(f'\n📊 Summary: {len(added)} added, {len(skipped)} skipped, {len(errors)} errors')
