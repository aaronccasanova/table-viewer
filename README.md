# table-viewer

A keyboard-navigable terminal table viewer. Pipe in JSON, scroll through large datasets right in your terminal.

## Quick start

```sh
cat table-data.json | npx table-viewer
```

Pipe in any JSON that [`console.table`](https://developer.mozilla.org/en-US/docs/Web/API/console/table_static) can render — arrays of objects are the most common case:

```sh
node -e '
  const rows = 40
  const cols = 30
  const tableData = Array.from({length: rows}, () => Object.fromEntries(
    Array.from({length: cols}, (_, c) => [`col_${c}`, Math.random().toFixed(2)])
  ))
  console.log(JSON.stringify(tableData))
' | npx table-viewer
```

## How it works

`table-viewer` reads JSON from stdin, passes it to `console.table`, and renders the result as a scrollable, keyboard-navigable view. Navigate with arrow keys (or vim motions if that's your thing). The table stays interactive until you quit — no paging through `less`, no truncated output.

## Keybindings

### Navigation

| Key             | Action              |
| --------------- | ------------------- |
| `←` / `→`       | Scroll left / right |
| `↑` / `↓`       | Scroll up / down    |
| `Shift` + arrow | Scroll faster       |
| `q` / `Ctrl+c`  | Quit                |

### Page movement

| Key                 | Action              |
| ------------------- | ------------------- |
| `Ctrl+d` / `Ctrl+u` | Half page down / up |
| `Ctrl+f` / `Ctrl+b` | Full page down / up |

### Vim motions

| Key              | Action                |
| ---------------- | --------------------- |
| `h` `j` `k` `l`  | Left, down, up, right |
| `Shift` + motion | Scroll faster         |
| `gg`             | Jump to top           |
| `G`              | Jump to bottom        |
| `0`              | Scroll to leftmost    |
| `$`              | Scroll to rightmost   |
