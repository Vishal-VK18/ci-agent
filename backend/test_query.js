const http = require('http');

const body = JSON.stringify({
  question: "What did Meridian AI do?"
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/query',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    const parsed = JSON.parse(data);
    console.log('Response Answer:', parsed.answer);
    console.log('Signals Used:', parsed.signals_used);
  });
});

req.on('error', (err) => {
  console.error('Error:', err.message);
});

req.write(body);
req.end();
