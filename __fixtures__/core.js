/**
 * Mock @actions/core for testing outside GitHub Actions environment.
 */

const inputs = {}
const outputs = {}
const errors = []
const summaryLines = []

export function setInputs(map) {
  Object.keys(inputs).forEach((k) => delete inputs[k])
  Object.assign(inputs, map)
}

export function getInput(name, options) {
  const val = inputs[name] || ''
  if (options?.required && !val) {
    throw new Error(`Input required and not supplied: ${name}`)
  }
  return val
}

export function setOutput(name, value) {
  outputs[name] = value
}

export function setFailed(message) {
  errors.push(message)
}

export function info(message) {
  // silent in tests
}

export function warning(message) {
  // silent in tests
}

export const summary = {
  _buffer: '',
  addHeading(text) {
    this._buffer += `# ${text}\n`
    return this
  },
  addRaw(text) {
    this._buffer += text
    return this
  },
  addTable() {
    return this
  },
  write() {
    summaryLines.push(this._buffer)
    this._buffer = ''
    return this
  },
}

export function getOutputs() {
  return { ...outputs }
}

export function getErrors() {
  return [...errors]
}

export function reset() {
  Object.keys(inputs).forEach((k) => delete inputs[k])
  Object.keys(outputs).forEach((k) => delete outputs[k])
  errors.length = 0
  summaryLines.length = 0
  summary._buffer = ''
}
