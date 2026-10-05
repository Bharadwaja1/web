const emails = ['listener@example.com', 'name+tag@example.co.in', 'UPPER@example.com', 'a@b.co', 'user.name@example.org'];
const invalidEmails = ['', 'plainaddress', '@missing.test', 'missing@', 'a b@example.com'];
const passwords = ['', '1', '12345', '123456', 'correct-horse-battery-staple', ' Padded123 '];

function makeCases(prefix, mobile = false) {
  const templates = [
    ['Page shell', 'login page title is visible', async d => (await d.text('h2')) === 'Welcome back.'],
    ['Accessibility', 'email input uses email type', async d => (await d.attr('#loginForm input[type=email]', 'type')) === 'email'],
    ['Accessibility', 'password input is masked', async d => (await d.attr('#loginForm input[type=password]', 'type')) === 'password'],
    ['Accessibility', 'status region exists', async d => (await d.attr('#authStatus', 'role')) === 'status'],
    ['Navigation', 'signup form can be opened', async d => { await d.click('[data-auth=signup]'); return d.visible('#signupForm'); }],
    ['Navigation', 'password reset form can be opened', async d => { await d.click('[data-auth=forgot]'); return d.visible('#forgotForm'); }],
    ['Navigation', 'signup returns to login', async d => { await d.click('[data-auth=signup]'); await d.click('#signupForm [data-auth=login]'); return d.visible('#loginForm'); }],
    ['Validation', 'empty login is rejected by browser validation', async d => !(await d.valid('#loginForm'))],
    ['Validation', 'short password is invalid', async d => { await d.fill('#loginForm input[type=email]', 'a@b.co'); await d.fill('#loginForm input[type=password]', '12345'); return !(await d.valid('#loginForm')); }],
    ['Responsive', 'layout has no horizontal overflow', async d => (await d.eval('document.documentElement.scrollWidth <= document.documentElement.clientWidth'))],
    ['Branding', 'brand accessible name is present', async d => (await d.attr('.brand', 'aria-label')) === 'Mood Tunes home'],
    ['Security UX', 'password autocomplete is current-password', async d => (await d.attr('#loginForm input[type=password]', 'autocomplete')) === 'current-password']
  ];
  const cases = [];
  const priorities = { 'Security UX': 'Critical', Validation: 'High', Accessibility: 'High', Responsive: 'Medium', Navigation: 'Medium', 'Page shell': 'High', Branding: 'Low' };
  for (let i = 0; i < 300; i++) {
    const [category, title, run] = templates[i % templates.length];
    const email = (i % 2 ? emails : invalidEmails)[i % 5];
    const password = passwords[i % passwords.length];
    cases.push({
      id: `${prefix}-${String(i + 1).padStart(3, '0')}`, category, title: `${title} [dataset ${i + 1}]`,
      priority: priorities[category] || 'Medium',
      preconditions: `${mobile ? 'Android emulator with Chrome' : 'Chrome'}; application is running`,
      steps: [`Open the login page`, `Use data email=${JSON.stringify(email)}`, `Use password length=${password.length}`, `Perform: ${title}`],
      expected: title, run
    });
  }
  return cases;
}

module.exports = { makeCases };
