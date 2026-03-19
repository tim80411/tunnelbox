export function output(data: unknown, json: boolean): void {
  if (json) {
    console.log(JSON.stringify({ success: true, data }))
  } else if (typeof data === 'string') {
    console.log(data)
  } else if (Array.isArray(data)) {
    data.length === 0 ? console.log('No items found.') : console.table(data)
  } else {
    console.log(data)
  }
}
