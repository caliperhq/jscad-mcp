'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

const LEVELS = { debug: 0, info: 1, warn: 2, crit: 3 }

const logFile = process.env.JSCAD_LOG_FILE
  ? path.resolve(process.env.JSCAD_LOG_FILE)
  : path.join(os.homedir(), '.jscad-mcp', 'jscad-mcp.log')

const envLevel = process.env.JSCAD_LOG_LEVEL
const logLevel = Object.prototype.hasOwnProperty.call(LEVELS, envLevel)
  ? LEVELS[envLevel]
  : LEVELS.info

try {
  fs.mkdirSync(path.dirname(logFile), { recursive: true })
} catch { /* directory unavailable — writes will be silently dropped */ }

function write (level, msg, err) {
  if (LEVELS[level] < logLevel) return
  const ts = new Date().toISOString()
  let line = `${ts} [${level.toUpperCase()}] ${msg}\n`
  if (err instanceof Error && err.stack) {
    line += err.stack.split('\n').map(l => `  ${l}`).join('\n') + '\n'
  }
  try {
    fs.appendFileSync(logFile, line)
  } catch { /* cannot write log — don't crash the server */ }
  if (LEVELS[level] >= LEVELS.warn) {
    process.stderr.write(line)
  }
}

module.exports = {
  debug: (msg, err) => write('debug', msg, err),
  info:  (msg, err) => write('info',  msg, err),
  warn:  (msg, err) => write('warn',  msg, err),
  crit:  (msg, err) => write('crit',  msg, err),
  logFile
}
