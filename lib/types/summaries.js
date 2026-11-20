export function summarizeToolCall(name, args) {
    let value;
    try {
        value = JSON.parse(args);
    }
    catch {
        value = undefined;
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return `${name}()`;
    const keys = Object.keys(value);
    return keys.length === 0 ? `${name}()` : `${name}({ ${keys.map(key => `${key}: [redacted]`).join(', ')} })`;
}
export function summarizeToolResult(name, content, failed) {
    const text = content.filter((block) => block.type === 'text')
        .map(block => block.text).join('\n');
    const lines = text.split(/\r?\n/u).filter(Boolean);
    let summary;
    if (name === 'read')
        summary = `${lines.length} lines${lines[0] ? `; ${compact(lines[0])}` : ''}`;
    else if (name === 'grep')
        summary = `${lines.length} matches${lines[0] ? `; ${compact(lines[0])}` : ''}`;
    else if (name === 'find' || name === 'ls')
        summary = `${lines.length} entries${lines[0] ? `; ${compact(lines[0])}` : ''}`;
    else
        summary = text.length ? `${content.length} blocks; ${text.length} text chars` : `${content.length} content blocks`;
    return failed ? `error; ${summary}` : summary;
}
function compact(text) { return text.replace(/\s+/gu, ' ').trim().slice(0, 180); }
//# sourceMappingURL=summaries.js.map