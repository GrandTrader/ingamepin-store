// Temporary, reproducible mitigation for braces 3.0.3 (GHSA-vfj7-8cjw-p6xm).
// Remove when upstream publishes a patched version. npm audit still reports the upstream version.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const patches = [
  {
    "file": "lib/compile.js",
    "beforeHash": "dc98f22eee3d511785d92a00758d5f0d48efed5f5813bdecc2de430c529b5c9f",
    "find": "const compile = (ast, options = {}) => {",
    "replace": "const compile = (ast, options = {}) => {\n  // Local mitigation for GHSA-vfj7-8cjw-p6xm until an upstream fix is published.\n  const pending = [[ast, 0]];\n  const seen = new WeakSet();\n  let count = 0;\n  while (pending.length) {\n    const [node, depth] = pending.pop();\n    if (!node || typeof node !== 'object') continue;\n    if (depth > 128 || ++count > 65536 || seen.has(node)) {\n      throw new SyntaxError('Brace pattern exceeds safe nesting limits');\n    }\n    seen.add(node);\n    if (Array.isArray(node.nodes)) {\n      for (const child of node.nodes) pending.push([child, depth + 1]);\n    }\n  }\n",
    "afterHash": "ec2df5a8f030a59bfc31c234424f4a439d1fc497586a594e70a1d463c0477ddb"
  },
  {
    "file": "lib/expand.js",
    "beforeHash": "41ccc196ebfa7b7781a634e721eb744e4e7bcb54cba427a7e3d6806a1b9e58f7",
    "find": "const expand = (ast, options = {}) => {",
    "replace": "const expand = (ast, options = {}) => {\n  // Local mitigation for GHSA-vfj7-8cjw-p6xm until an upstream fix is published.\n  const pending = [[ast, 0]];\n  const seen = new WeakSet();\n  let count = 0;\n  while (pending.length) {\n    const [node, depth] = pending.pop();\n    if (!node || typeof node !== 'object') continue;\n    if (depth > 128 || ++count > 65536 || seen.has(node)) {\n      throw new SyntaxError('Brace pattern exceeds safe nesting limits');\n    }\n    seen.add(node);\n    if (Array.isArray(node.nodes)) {\n      for (const child of node.nodes) pending.push([child, depth + 1]);\n    }\n  }\n",
    "afterHash": "75366e07aa18dba82db36a7184f5039a6cba490df954207728e421ecf0ee0ece"
  },
  {
    "file": "lib/stringify.js",
    "beforeHash": "379f22d77bfa1478341ccd49c5e4267464aabcbba03558bab332aac23fc6f23a",
    "find": "module.exports = (ast, options = {}) => {",
    "replace": "module.exports = (ast, options = {}) => {\n  // Local mitigation for GHSA-vfj7-8cjw-p6xm until an upstream fix is published.\n  const pending = [[ast, 0]];\n  const seen = new WeakSet();\n  let count = 0;\n  while (pending.length) {\n    const [node, depth] = pending.pop();\n    if (!node || typeof node !== 'object') continue;\n    if (depth > 128 || ++count > 65536 || seen.has(node)) {\n      throw new SyntaxError('Brace pattern exceeds safe nesting limits');\n    }\n    seen.add(node);\n    if (Array.isArray(node.nodes)) {\n      for (const child of node.nodes) pending.push([child, depth + 1]);\n    }\n  }\n",
    "afterHash": "0744f653864d380cbdbe51f2dc7dd4424978840f1252a7d66003e87737d9362e"
  },
  {
    "file": "lib/parse.js",
    "beforeHash": "e572166565f15fa6ad9865ae49d678218e32aabfd1b3720f6d0d43d39800d310",
    "find": "      stack.push(block);",
    "replace": "      if (stack.length >= 128) throw new SyntaxError('Brace pattern exceeds safe nesting limits');\n      stack.push(block);",
    "afterHash": "63a9136f76ee36340e7a4960e95e65efb1435d72b9f232f129d94c8d248746a8"
  }
];
const hash = text => createHash('sha256').update(text).digest('hex');
let installed = 0;
for (const entry of Object.keys(lock.packages).filter(p => /(^|\/)node_modules\/braces$/.test(p))) {
  const directory = path.join(root, entry);
  if (!fs.existsSync(directory)) continue; // Optional development dependencies may be omitted.
  if (JSON.parse(fs.readFileSync(path.join(directory, 'package.json'))).version !== '3.0.3') throw Error('Review braces security patch for the new version');
  for (const patch of patches) {
    const file = path.join(directory, patch.file);
    const original = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    if (hash(original) === patch.afterHash) continue;
    if (hash(original) !== patch.beforeHash) throw Error('Unexpected braces source: ' + patch.file);
    const fixed = original.split(patch.find).join(patch.replace);
    if (hash(fixed) !== patch.afterHash) throw Error('Unable to validate braces security patch');
    fs.writeFileSync(file, fixed);
  }
  installed++;
}
console.log('Braces nesting safeguard verified for ' + installed + ' installed copy/copies.');
