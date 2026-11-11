/**
 * Robust YAML 1.2 Serializer
 * Zero-dependency, standards-compliant, produces clean, readable YAML for AI ingestion.
 */

(() => {
  if (typeof globalThis.stringifyYAML === 'function') {
    return;
  }

  function stringifyYAML(data, indent = 0) {
    const spaces = ' '.repeat(indent);

    if (data === null || data === undefined) {
      return 'null';
    }

    if (typeof data === 'boolean') {
      return data ? 'true' : 'false';
    }

    if (typeof data === 'number') {
      return Number.isFinite(data) ? String(data) : 'null';
    }

    if (typeof data === 'string') {
      return formatYAMLString(data, indent);
    }

    if (Array.isArray(data)) {
      if (data.length === 0) return '[]';

      // Compact single-line rendering for bounding boxes, table rows, and short scalar lists
      const isSingleLineCandidate = data.every(
        item => typeof item === 'number' || (typeof item === 'string' && !item.includes('\n'))
      );

      if (isSingleLineCandidate) {
        const inlineRepresentation = '[' + data.map(v => (typeof v === 'string' ? formatYAMLString(v, 0) : String(v))).join(', ') + ']';
        // Use compact inline format if it fits comfortably on a line or is short
        if (inlineRepresentation.length < 120 || data.length <= 6) {
          return inlineRepresentation;
        }
      }

      let out = '';
      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        if (typeof item === 'object' && item !== null) {
          if (Array.isArray(item)) {
            const rendered = stringifyYAML(item, indent + 2);
            if (rendered.startsWith('[')) {
              out += `${spaces}- ${rendered}\n`;
            } else {
              const lines = rendered.split('\n');
              out += `${spaces}-\n` + lines.map(l => `${spaces}    ${l}`).join('\n') + '\n';
            }
          } else {
            // Object item in list: '- key: value'
            const rendered = stringifyYAML(item, indent + 2);
            const lines = rendered.split('\n');
            const firstLineTrimmed = lines[0].replace(/^ +/, '');
            out += `${spaces}- ${firstLineTrimmed}\n`;
            for (let j = 1; j < lines.length; j++) {
              if (lines[j].trim().length > 0) {
                out += `${lines[j]}\n`;
              }
            }
          }
        } else {
          out += `${spaces}- ${stringifyYAML(item, indent + 2)}\n`;
        }
      }
      return out.trimEnd();
    }

    if (typeof data === 'object') {
      const keys = Object.keys(data).filter(k => data[k] !== undefined);
      if (keys.length === 0) return '{}';

      let out = '';
      for (const key of keys) {
        const val = data[key];
        const formattedKey = /^[a-zA-Z0-9_-]+$/.test(key) ? key : `"${escapeQuotes(key)}"`;

        if (val === null || val === undefined) {
          out += `${spaces}${formattedKey}: null\n`;
        } else if (typeof val === 'object' && val !== null) {
          if (Array.isArray(val)) {
            if (val.length === 0) {
              out += `${spaces}${formattedKey}: []\n`;
            } else {
              const isSingleLineCandidate = val.every(
                item => typeof item === 'number' || (typeof item === 'string' && !item.includes('\n'))
              );
              if (isSingleLineCandidate) {
                const inline = '[' + val.map(v => (typeof v === 'string' ? formatYAMLString(v, 0) : String(v))).join(', ') + ']';
                if (inline.length < 120 || val.length <= 6) {
                  out += `${spaces}${formattedKey}: ${inline}\n`;
                  continue;
                }
              }
              out += `${spaces}${formattedKey}:\n${stringifyYAML(val, indent + 2)}\n`;
            }
          } else {
            const subKeys = Object.keys(val).filter(k => val[k] !== undefined);
            if (subKeys.length === 0) {
              out += `${spaces}${formattedKey}: {}\n`;
            } else {
              out += `${spaces}${formattedKey}:\n${stringifyYAML(val, indent + 2)}\n`;
            }
          }
        } else {
          out += `${spaces}${formattedKey}: ${stringifyYAML(val, indent + 2)}\n`;
        }
      }
      return out.trimEnd();
    }

    return String(data);
  }

  function formatYAMLString(str, indent = 0) {
    if (str.includes('\n')) {
      const lines = str.split('\n');
      const childSpaces = ' '.repeat(indent + 2);
      return '|\n' + lines.map(line => childSpaces + line).join('\n');
    }

    const needsQuotes =
      str === '' ||
      /^(true|false|yes|no|null|on|off|[0-9]+(\.[0-9]+)?)$/i.test(str) ||
      /[:#\[\]{},&*?|<>=!%@`~]/.test(str) ||
      str.startsWith(' ') ||
      str.endsWith(' ') ||
      str.startsWith('- ') ||
      str.startsWith('? ');

    if (needsQuotes) {
      return `"${escapeQuotes(str)}"`;
    }

    return str;
  }

  function escapeQuotes(str) {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }

  globalThis.stringifyYAML = stringifyYAML;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { stringifyYAML };
  }
})();
