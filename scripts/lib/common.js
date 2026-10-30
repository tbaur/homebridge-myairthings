/**
 * Copyright (c) 2026 tbaur
 *
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file for full license text
 *
 * Shared plumbing for the maintenance scripts in this directory.
 *
 * These talk to a real Airthings account, so nothing here has a built-in
 * credential: the client comes from the environment or from a prompt.
 *
 * **A client secret must never be a command-line argument**: it would sit in
 * the shell history, and on most systems it is readable by any other process
 * on the machine for as long as the script runs.
 */
const readline = require('node:readline')
const path = require('node:path')

/** Print a message and exit non-zero. Scripts are tools, not libraries. */
function fail(message) {
  console.error(`error: ${message}`)
  process.exit(1)
}

/**
 * Parse `--key value` and `--flag` arguments into an object.
 *
 * Unknown keys are rejected rather than ignored, so a typo cannot silently
 * leave the default in place.
 */
function parseFlags(argv, known) {
  const flags = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      // The raw token is not echoed: a secret pasted as a positional argument
      // is the thing these scripts exist not to put on a command line.
      fail('unexpected argument (not a --flag). A client secret must not be a command-line argument')
    }
    const key = token.slice(2)
    if (!Object.prototype.hasOwnProperty.call(known, key)) {
      fail(`unknown option. Known options: ${Object.keys(known).map((name) => `--${name}`).join(', ')}`)
    }
    if (known[key] === 'boolean') {
      flags[key] = true
      continue
    }
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) {
      fail(`--${key} needs a value`)
    }
    flags[key] = value
    index += 1
  }
  return flags
}

/**
 * Load compiled modules from `dist/`.
 *
 * The scripts run the code the plugin ships rather than a reimplementation,
 * which is the only way a result says anything about the plugin.
 */
function requireBuild(modules) {
  const loaded = {}
  for (const name of modules) {
    const target = path.join(__dirname, '..', '..', 'dist', `${name}.js`)
    try {
      Object.assign(loaded, require(target))
    } catch (error) {
      fail(`could not load ${target}: ${error.message}\nRun "npm run build" first.`)
    }
  }
  return loaded
}

/** A PluginLogger the plugin's own classes accept, printing to the terminal. */
function consoleLogger({ verbose = false } = {}) {
  return {
    info: (message) => console.log(`  [info]  ${message}`),
    warn: (message) => console.log(`  [warn]  ${message}`),
    error: (message) => console.log(`  [error] ${message}`),
    debug: (message) => {
      if (verbose) {
        console.log(`  [debug] ${message}`)
      }
    },
  }
}

/** Ask a question on the terminal and return the answer. */
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

/**
 * Turn one stdin chunk into characters.
 *
 * After `readline` has asked for the client id, stdin is often left in utf8
 * mode, so `data` events carry strings. In raw mode they may still be
 * Buffers. Both must produce the same characters.
 */
function decodeHiddenChunk(chunk) {
  return typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
}

/** Fold one chunk into the hidden value so far. Returns `{ value, done, cancelled }`. */
function consumeHiddenChunk(value, chunk) {
  let next = value
  for (const character of decodeHiddenChunk(chunk)) {
    if (character === '\u0003') {
      return { value: next, done: true, cancelled: true }
    }
    if (character === '\r' || character === '\n') {
      return { value: next, done: true, cancelled: false }
    }
    if (character === '\u007f' || character === '\b') {
      next = next.slice(0, -1)
      continue
    }
    if (character < ' ') {
      continue
    }
    next += character
  }
  return { value: next, done: false, cancelled: false }
}

/**
 * Ask for a secret without echoing it.
 *
 * Raw mode keeps keystrokes off the screen. The terminal is restored on every
 * path, including Ctrl-C, which would otherwise leave the shell with echo off.
 */
function askHidden(question) {
  const { stdin, stdout } = process
  if (stdin.isTTY !== true) {
    return ask(question)
  }
  return new Promise((resolve, reject) => {
    stdout.write(question)
    let value = ''
    const wasRaw = stdin.isRaw === true

    const restore = () => {
      stdin.setRawMode(wasRaw)
      stdin.pause()
      stdin.removeListener('data', onData)
      stdout.write('\n')
    }
    const onData = (chunk) => {
      const outcome = consumeHiddenChunk(value, chunk)
      value = outcome.value
      if (!outcome.done) {
        return
      }
      restore()
      if (outcome.cancelled) {
        reject(new Error('cancelled'))
        return
      }
      resolve(value)
    }

    stdin.setRawMode(true)
    stdin.resume()
    stdin.on('data', onData)
  })
}

/**
 * Resolve the Airthings API client to use.
 *
 * The same environment variables the plugin reads, then a prompt. Never a
 * command-line flag for the secret: see the file header.
 */
async function resolveClient() {
  const clientId = process.env.AIRTHINGS_CLIENT_ID?.trim() || await ask('Airthings client id: ')
  if (clientId.length === 0) {
    fail('a client id is required')
  }
  const clientSecret = process.env.AIRTHINGS_CLIENT_SECRET?.trim() || await askHidden('Airthings client secret (hidden): ')
  if (clientSecret.length === 0) {
    fail('a client secret is required')
  }
  return { clientId, clientSecret }
}

/** Run a script's main function, reporting a failure without a stack wall. */
function run(main) {
  main().catch((error) => {
    console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}

module.exports = {
  ask,
  askHidden,
  consumeHiddenChunk,
  consoleLogger,
  fail,
  parseFlags,
  requireBuild,
  resolveClient,
  run,
}
