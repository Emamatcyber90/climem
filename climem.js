#! /usr/bin/env node

'use strict'

const fs = require('fs')
const net = require('net')
const Readable = require('readable-stream').Readable
const inherits = require('inherits')
const minimist = require('minimist')
const split = require('split2')
const pump = require('pump')
const writer = require('flush-write-stream')
const blessed = require('blessed')
const contrib = require('blessed-contrib')
const { monitorEventLoopDelay } = require('perf_hooks');

function Monitor () {
  Readable.call(this)
  this.m = monitorEventLoopDelay();
  this.m.enable();
  var that = this
  this._timer = setInterval(() => {
    var data = {
      titles: [],
      data: []
    };
    this.m.percentiles.forEach((value,key) => {
      data.titles.push(`${key.toFixed(2)}`);
      data.data.push(value / 1e7);
    });
    that.push(JSON.stringify(data))
    that.push('\n')
  }, 500)
}

inherits(Monitor, Readable)

Monitor.prototype._read = function () {
  // nothing to do
}

Monitor.prototype.destroy = function () {
  if (this._timer) {
    this.m.disable();
    clearInterval(this._timer)
    this._timer = null
    this.push(null)
    this.emit('close')
  }
}

function monitor () {
  const server = net.createServer((stream) => {
    stream.unref()
    stream.resume()
    pump(new Monitor(), stream)
  })
  const file = process.env.CLIMEM || 'climem-' + process.pid

  server.unref()
  server.listen(file)

  const exit = () => {
    try {
      fs.unlinkSync(file)
    } catch (err) {}
  }

  process.on('SIGINT', () => {
    exit()
    if (process.listeners('SIGINT').length === 1) {
      process.exit(1)
    }
  })
  process.on('exit', exit)
}

function empty (num) {
  let result = new Array(num)

  for (let i = 0; i < num; i++) {
    result[i] = ' '
  }

  return result
}

function cli () {
  const argv = minimist(process.argv.splice(2), {
    boolean: 'data',
    alias: {
      help: 'h',
      data: 'd'
    }
  })

  let screen
  let bar

  if (argv.help || !argv._[0]) {
    console.log('Usage: climem FILE')
    console.log('       climem PORT HOST')
    console.log('to enable in any node process, use node -r climem')
    process.exit(1)
  }

  if (!argv.data) {
    screen = blessed.screen()
    bar = contrib.bar({
      label: 'Event Loop Delay',
      width: 120,
      height: 30,
      barWidth: 2,
      barSpacing: 4,
      xOffset: 0,
      maxHeight: 100
    })
    screen.append(bar)

    screen.key(['escape', 'q', 'C-c'], () => {
      return process.exit(0)
    })
  }

  pump(net.connect(argv._[0], argv._[1]),
       split(JSON.parse),
       writer.obj(argv.data ? write : plot), (err) => {
    if (err) {
      console.error(err.message)
    } else {
      console.error('stream closed')
    }

    try {
      fs.unlinkSync(argv._[0])
    } catch (err) {
      // nothing to do it might not be a file
    }
  })

  function write (chunk, enc, cb) {
    console.dir(chunk)
    cb()
  }

  function plot (chunk, enc, cb) {
    bar.setData(chunk);
    screen.render()
    cb()
  }
}

if (require.main === module) {
  cli()
} else {
  monitor()
}
