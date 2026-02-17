#!/usr/bin/env node

import * as fs from 'node:fs'
import * as readline from 'node:readline'
import * as tty from 'node:tty'

if (!process.stdout.isTTY) process.exit(1)

const tableData = await getTableDataFromStdin()

// Reopen stdin for interactive keyboard input (platform-agnostic)
const ttyIn = new tty.ReadStream(
  fs.openSync(process.platform === 'win32' ? 'CONIN$' : '/dev/tty', 'r'),
)

ttyIn.setRawMode(true)

readline.emitKeypressEvents(ttyIn)

/** @type {{[index: number]: string}} */
const consoleTableStartChars = {
  0: '┌',
  2: '├',
}

const scrollbarEndChars = {
  up: '·',
  down: '·',
  left: '·',
  right: '·',
}

const consoleTableOutput = captureConsoleTableOutput(tableData)

const consoleTableOutputSplit = consoleTableOutput.split('\n')

let consoleWidth = process.stdout.columns
let consoleHeight = process.stdout.rows
let xOffset = 0
let yOffset = 0

if (!consoleTableOutputSplit.length) process.exit(0)

const consoleTableOutputWidth = consoleTableOutputSplit[0].length
const consoleTableOutputHeight = consoleTableOutputSplit.length

// Enter alternate screen buffer and hide cursor
process.stdout.write('\x1B[?1049h\x1B[?25l')

// Restore cursor and leave alternate screen buffer on exit
process.on('exit', () => {
  process.stdout.write('\x1B[?25h\x1B[?1049l')
})

process.stdout.on('resize', () => {
  consoleWidth = process.stdout.columns
  consoleHeight = process.stdout.rows

  console.clear()

  render()
})

let pendingG = false

ttyIn.on('keypress', (_str, key) => {
  // Ctrl+C or q to exit
  if ((key.ctrl && key.name === 'c') || key.name === 'q') {
    process.exit(0)
  }

  const { needsScrollbarX, needsScrollbarY } = computeScrollbarVisibility()

  const maxXOffset = Math.max(
    0,
    consoleTableOutputWidth - consoleWidth + (needsScrollbarY ? 1 : 0),
  )

  const maxYOffset = Math.max(
    0,
    consoleTableOutputHeight - consoleHeight + (needsScrollbarX ? 1 : 0),
  )

  const visibleHeight = consoleHeight - (needsScrollbarX ? 1 : 0)

  // Handle gg (go to top)
  if (key.name === 'g' && !key.ctrl && !key.shift) {
    if (pendingG) {
      pendingG = false
      yOffset = 0
      render()
      return
    }

    pendingG = true
    return
  }

  // G (shift+g) — go to bottom
  if (key.shift && key.name === 'g') {
    pendingG = false
    yOffset = maxYOffset

    render()
    return
  }

  pendingG = false

  // Vim motions
  switch (key.name) {
    // -- vertical movement --
    case 'k':
    case 'up':
      yOffset = Math.max(0, yOffset - (key.shift ? 10 : 5))
      break
    case 'j':
    case 'down':
      yOffset = Math.min(maxYOffset, yOffset + (key.shift ? 10 : 5))
      break

    // -- horizontal movement --
    case 'h':
    case 'left':
      xOffset = Math.max(0, xOffset - (key.shift ? 10 : 5))
      break
    case 'l':
    case 'right':
      xOffset = Math.min(maxXOffset, xOffset + (key.shift ? 10 : 5))
      break

    // Ctrl+d — half page down
    case 'd':
      if (key.ctrl) {
        yOffset = Math.min(maxYOffset, yOffset + Math.floor(visibleHeight / 2))
      } else return
      break
    // Ctrl+u — half page up
    case 'u':
      if (key.ctrl) {
        yOffset = Math.max(0, yOffset - Math.floor(visibleHeight / 2))
      } else {
        return
      }
      break
    // Ctrl+f — full page down
    case 'f':
      if (key.ctrl) {
        yOffset = Math.min(maxYOffset, yOffset + visibleHeight)
      } else {
        return
      }
      break
    // Ctrl+b — full page up
    case 'b':
      if (key.ctrl) {
        yOffset = Math.max(0, yOffset - visibleHeight)
      } else {
        return
      }
      break

    // 0 — scroll to leftmost
    case '0':
      xOffset = 0
      break
    // $ — scroll to rightmost
    case '4': // shift+4 = $
      if (key.shift) {
        xOffset = maxXOffset
      } else {
        return
      }
      break

    default:
      return
  }

  render()
})

render()

function render() {
  console.clear()

  const { needsScrollbarX, needsScrollbarY } = computeScrollbarVisibility()

  if (!needsScrollbarX && !needsScrollbarY) {
    process.stdout.write(consoleTableOutput)

    return
  }

  const scrollbarX = renderScrollbarX(needsScrollbarX, needsScrollbarY)
  const scrollbarY = renderScrollbarY(needsScrollbarX, needsScrollbarY).split(
    '',
  )

  const consoleTableOutputSegment = consoleTableOutputSplit
    .slice(yOffset, yOffset + consoleHeight - (scrollbarX ? 1 : 0))
    .map(
      (line, index) =>
        line.slice(
          xOffset,
          xOffset + consoleWidth - (scrollbarY[index] ? 1 : 0),
        ) + (scrollbarY[index] || ''),
    )
    .join('\n')

  process.stdout.write(
    consoleTableOutputSegment + (scrollbarX ? '\n' + scrollbarX : ''),
  )
}

function computeScrollbarVisibility() {
  let needsScrollbarX = consoleTableOutputWidth > consoleWidth
  let needsScrollbarY = consoleTableOutputHeight > consoleHeight

  // A scrollbar takes 1 row/column of space, which may cause
  // the other scrollbar to become necessary
  if (needsScrollbarY && !needsScrollbarX) {
    needsScrollbarX = consoleTableOutputWidth > consoleWidth - 1
  }

  if (needsScrollbarX && !needsScrollbarY) {
    needsScrollbarY = consoleTableOutputHeight > consoleHeight - 1
  }

  return {
    needsScrollbarX,
    needsScrollbarY,
  }
}

/**
 * @param {boolean} needsScrollbarX
 * @param {boolean} needsScrollbarY
 * @returns {string}
 */
function renderScrollbarX(needsScrollbarX, needsScrollbarY) {
  if (!needsScrollbarX) return ''

  const visibleWidth = consoleWidth - (needsScrollbarY ? 1 : 0)
  const trackLength = visibleWidth - 2

  const thumbSize = Math.max(
    1,
    Math.floor((visibleWidth / consoleTableOutputWidth) * trackLength),
  )

  const maxThumbPos = trackLength - thumbSize

  const thumbPos =
    Math.floor(
      (xOffset / (consoleTableOutputWidth - visibleWidth)) * maxThumbPos,
    ) || 0

  return (
    scrollbarEndChars.left +
    '-'.repeat(thumbPos) +
    '═'.repeat(thumbSize) +
    '-'.repeat(trackLength - thumbPos - thumbSize) +
    scrollbarEndChars.right +
    (needsScrollbarY ? ' ' : '')
  )
}

/**
 * @param {boolean} needsScrollbarX
 * @param {boolean} needsScrollbarY
 * @returns {string}
 */
function renderScrollbarY(needsScrollbarX, needsScrollbarY) {
  if (!needsScrollbarY) return ''

  const visibleHeight = consoleHeight - (needsScrollbarX ? 1 : 0)
  const trackLength = visibleHeight - 2

  const thumbSize = Math.max(
    1,
    Math.floor((visibleHeight / consoleTableOutputHeight) * trackLength),
  )

  const maxThumbPos = trackLength - thumbSize

  const thumbPos =
    Math.floor(
      (yOffset / (consoleTableOutputHeight - visibleHeight)) * maxThumbPos,
    ) || 0

  return (
    scrollbarEndChars.up +
    '╎'.repeat(thumbPos) +
    '║'.repeat(thumbSize) +
    '╎'.repeat(trackLength - thumbPos - thumbSize) +
    scrollbarEndChars.down
  )
}

/**
 * @param {Parameters<typeof console.table>} args
 * @returns {string}
 */
function captureConsoleTableOutput(...args) {
  let consoleTableOutput = ''

  const originalWrite = process.stdout.write.bind(process.stdout)

  process.stdout.write = (chunk) => {
    consoleTableOutput += chunk

    return true
  }

  console.table(...args)

  process.stdout.write = originalWrite

  return removeIndexColumn(consoleTableOutput.replace(/\x1B\[[0-9;]*m/g, ''))
}

/**
 * Removes the `| (index) |` column from `console.table` output
 * @param {string} consoleTableOutput
 * @returns {string}
 */
function removeIndexColumn(consoleTableOutput) {
  const consoleTableOutputSplit = consoleTableOutput.trim().split('\n')

  const lastRowIndex = consoleTableOutputSplit.length - 1

  const secondPipeIndex = consoleTableOutputSplit[1].indexOf('│', 1)

  return consoleTableOutputSplit
    .map((row, rowIndex) => {
      const consoleTableStartChar =
        consoleTableStartChars[rowIndex] ||
        (rowIndex === lastRowIndex ? '└' : '')

      if (!consoleTableStartChar) {
        return row.slice(secondPipeIndex)
      }

      return `${consoleTableStartChar}${row.slice(secondPipeIndex + 1)}`
    })
    .join('\n')
}

/**
 * @returns {Promise<object[]>}
 */
async function getTableDataFromStdin() {
  let tableDataString = ''

  for await (const chunk of process.stdin) {
    tableDataString += chunk
  }

  try {
    return JSON.parse(tableDataString)
  } catch {
    console.error('Error: Invalid JSON input')
    process.exit(1)
  }
}
