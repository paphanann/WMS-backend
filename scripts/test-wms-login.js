const res = await fetch('http://127.0.0.1:3001/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'A01', password: '1234' })
});

console.log('status=', res.status);
console.log(await res.text());
