'use strict';

const http = require('http')
const fs = require('fs')

const server = http.createServer((req, res) => {
  let n = Math.floor((Math.random() * 1000) + 1);
  for (let i = 0; i < n; i++) res.write('a'.repeat(n));
  res.end();
});


server.listen(8000)
