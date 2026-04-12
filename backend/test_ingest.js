const http = require('http');

const body = JSON.stringify({
  text: "Meridian AI dropped price to $199 per month for all plans",
  competitor_name: "Meridian AI"
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/ingest',
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
    console.log('Response:', data);
  });
});

req.on('error', (err) => {
  console.error('Error:', err.message);
});

req.write(body);
req.end();
